// script2.js — updated: undo, random first turn, proper game exit
(() => {
  console.log("[script2] [INIT] script loaded.");

  // ---------- Config ----------
  const STOCKFISH_PATH = "stockfish/stockfish-17.1-lite-single-03e3232.js";

  // ---------- Firebase ----------
  const firebaseConfig = {
    apiKey: "AIzaSyBJs9fp6w30ZpxycPLGy2bntvFeNy2TFxk",
    authDomain: "login-b6382.firebaseapp.com",
    databaseURL: "https://login-b6382-default-rtdb.firebaseio.com",
    projectId: "login-b6382",
    storageBucket: "login-b6382.appspot.com",
    messagingSenderId: "482805184778",
    appId: "1:482805184778:web:0d146b1daf3aa25ad7a2f3",
    measurementId: "G-ZHXBBZHN3W",
  };
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  // ---------- Chess.js ----------
  if (!window.Chess) throw new Error("Chess.js not found; load it before script2.js");
  let chess = new window.Chess();

  // ---------- DOM ----------
  const authStatus = document.getElementById("auth-status");
  const gameLobby = document.getElementById("game-lobby");
  const createGameBtn = document.getElementById("create-game-btn");
  const gameList = document.getElementById("game-list");
  const gameIdInput = document.getElementById("game-id-input");
  const joinGameBtn = document.getElementById("join-game-btn");
  const playVsAIBtn = document.getElementById("play-ai-btn");

  const chessGameDiv = document.getElementById("chess-game");
  const gameTitle = document.getElementById("game-title");
  const chessboardDiv = document.getElementById("chessboard");
  const currentTurnSpan = document.getElementById("current-turn");
  const gameStatusSpan = document.getElementById("game-status");
  const messagesDiv = document.getElementById("messages");
  const chatInput = document.getElementById("chat-input");
  const sendChatBtn = document.getElementById("send-chat-btn");
  const leaveGameBtn = document.getElementById("leave-game-btn");

  const customAlertDiv = document.getElementById("custom-alert");
  const gameOverModal = document.getElementById("game-over-modal");
  const gameOverMessage = document.getElementById("game-over-message");

  // NEW: Undo button
  const undoBtn = document.getElementById("undo-btn");

  // ---------- App state ----------
  let currentUser = null;
  let currentGameId = null;
  let playerColor = null; 
  let selectedPiece = null;
  let lastPossibleMoves = [];

  // ---------- helpers ----------
  function L(...args) { console.log("[script2]", ...args); }
  function calert(msg, dur = 2400) {
    if (!customAlertDiv) { alert(msg); return; }
    customAlertDiv.textContent = msg;
    customAlertDiv.style.display = "block";
    void customAlertDiv.offsetWidth;
    customAlertDiv.classList.add("show");
    setTimeout(() => {
      customAlertDiv.classList.remove("show");
      setTimeout(()=> customAlertDiv.style.display = "none", 300);
    }, dur);
  }

  // ---------- Stockfish ----------
  let stockfish = null;
  let engineReady = false;
  let engineSearching = false;
  const engineQueue = [];
  function enginePost(cmd) {
    if (!stockfish) { engineQueue.push(cmd); return; }
    if (!engineReady && !/^(uci|isready|setoption|quit|debug)/.test(cmd)) {
      engineQueue.push(cmd);
    } else stockfish.postMessage(cmd);
  }
  function flushEngineQueue() {
    if (!stockfish) return;
    while (engineQueue.length) stockfish.postMessage(engineQueue.shift());
  }
  function initStockfish(path = STOCKFISH_PATH) {
  if (stockfish) return;

  try {
    stockfish = new Worker(path);
  } catch (e) {
    console.error("Worker failed", e);
    return;
  }

  const loader = document.getElementById("stockfish-loader");

  stockfish.onmessage = (ev) => {
    const line = ev.data || "";

    if (line.startsWith("uciok")) {
      enginePost("isready");
      return;
    }

    if (line.startsWith("readyok")) {
      engineReady = true;
      flushEngineQueue();

      // Hide loader once ready
      if (loader) loader.classList.add("hidden");
      return;
    }

    if (line.startsWith("bestmove")) {
      engineSearching = false;
      const mv = line.split(" ")[1];
      if (mv && mv !== "(none)" && !currentGameId) {
        try {
          chess.move({ from: mv.slice(0,2), to: mv.slice(2,4), promotion: "q" });
          renderBoard(chess.board());
          currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
          checkForEndAndNotify();
        } catch (e) {}
      }
    }
  };

  stockfish.postMessage("uci");
  stockfish.postMessage("isready");
  stockfish.postMessage("ucinewgame");
}

  function makeAIMove(depth = 12) {
    if (chess.isGameOver()) { checkForEndAndNotify(); return; }
    initStockfish();
    enginePost("position fen " + chess.fen());
    enginePost("go depth " + depth);
    engineSearching = true;
  }

  // ---------- End detection ----------
  function checkForEndAndNotify(username) {
    if (!chess.isGameOver()) return;
    let msg = "Game over";
    if (chess.isCheckmate()) {
      msg = chess.turn() === "w"
        ? "Checkmate! Black (AI) wins!"
        : `Checkmate! White (${username || "Player"}) wins!`;
    } else if (chess.isStalemate()) msg = "Stalemate – Draw.";
    else if (chess.isThreefoldRepetition()) msg = "Draw by repetition.";
    else if (chess.isInsufficientMaterial()) msg = "Draw – insufficient material.";
    else if (chess.isDraw()) msg = "Draw (50-move rule).";

    gameStatusSpan.textContent = msg;
    showGameOverModal(msg);
    setTimeout(()=> leaveGame(), 5500); // auto-exit after modal
  }
  function showGameOverModal(msg) {
    if (gameOverModal && gameOverMessage) {
      gameOverMessage.textContent = msg;
      gameOverModal.classList.remove("hidden");
      setTimeout(()=> gameOverModal.classList.add("hidden"), 5000);
    } else calert(msg);
  }

  // ---------- Board rendering ----------
  function renderBoard(boardArray) {
    chessboardDiv.innerHTML = "";
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const sq = document.createElement("div");
      sq.classList.add("square",(r+c)%2===0?"light":"dark");
      sq.dataset.row=r; sq.dataset.col=c;
      const piece = boardArray[r][c];
      if (piece) {
        sq.innerHTML = getPieceUnicode(piece.type,piece.color);
        sq.classList.add("piece");
      }
      sq.addEventListener("click", handleSquareClick);
      chessboardDiv.appendChild(sq);
    }
  }
  function getPieceUnicode(type,color){
    const p={k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙",K:"♚",Q:"♛",R:"♜",B:"♝",N:"♞",P:"♟"};
    return color==="w"?p[type.toLowerCase()]:p[type.toUpperCase()];
  }

  function clearHighlights(){document.querySelectorAll(".square.possible-move").forEach(s=>s.classList.remove("possible-move"));}
  function deselectPiece(){const prev=document.querySelector(".square.selected");if(prev)prev.classList.remove("selected");selectedPiece=null;lastPossibleMoves=[];clearHighlights();}
  function highlightPossibleMoves(moves){clearHighlights();moves.forEach(mv=>{const row=8-parseInt(mv.to[1],10),col=mv.to.charCodeAt(0)-97;const el=document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);if(el)el.classList.add("possible-move");});}

  // ---------- Click handler ----------
  function handleSquareClick(ev) {
    const clicked=ev.target.closest(".square"); if(!clicked)return;
    const row=parseInt(clicked.dataset.row,10),col=parseInt(clicked.dataset.col,10);
    const algebraicSquare=`${String.fromCharCode(97+col)}${8-row}`;
    if (selectedPiece && lastPossibleMoves.length>0) {
      const fromSquare=`${String.fromCharCode(97+selectedPiece.col)}${8-selectedPiece.row}`;
      if (fromSquare===algebraicSquare) {deselectPiece();return;}
      let moveResult=null;
      try{moveResult=chess.move({from:fromSquare,to:algebraicSquare,promotion:"q"});}catch(e){}
      deselectPiece();
      if(moveResult){
        renderBoard(chess.board());
        currentTurnSpan.textContent=chess.turn()==="w"?"White":"Black";
        checkForEndAndNotify();
        if(currentGameId){db.ref(`chess/${currentGameId}`).update({board:chess.fen(),turn:chess.turn()});}
        else setTimeout(()=>makeAIMove(),240);
      }
    }
    const piece=chess.get(algebraicSquare); if(!piece){deselectPiece();return;}
    if(currentGameId&&playerColor){
      if(playerColor.charAt(0)!==chess.turn()){calert("It's not your turn!");return;}
      if(piece.color!==playerColor.charAt(0)){calert("That's your opponent's piece!");return;}
    }
    const moves=chess.moves({square:algebraicSquare,verbose:true});
    deselectPiece(); selectedPiece={row,col,type:piece.type,color:piece.color}; lastPossibleMoves=moves.slice();
    clicked.classList.add("selected"); highlightPossibleMoves(moves);
  }

  // ---------- Undo ----------
  undoBtn && undoBtn.addEventListener("click", () => {
    if (chess.history().length === 0) return calert("No moves to undo");
    chess.undo(); // undo last move
    if (!currentGameId && chess.history().length>0) chess.undo(); // undo AI reply too
    renderBoard(chess.board());
    currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
  });

  // ---------- Firebase auth & lobby ----------
  auth.onAuthStateChanged(user => { if (user) { currentUser=user; if(gameLobby)gameLobby.style.display="block"; listenForGames(); } else { auth.signInAnonymously(); } });

  // ... (same lobby/join/chat/listen functions unchanged) ...

  leaveGameBtn && leaveGameBtn.addEventListener("click", leaveGame);
  function leaveGame(){ resetLocalState(); }
  function resetLocalState(){
    currentGameId=null; playerColor=null; chess.reset(); renderBoard(chess.board());
    currentTurnSpan.textContent="White"; gameStatusSpan.textContent="Not started";
    if(stockfish){try{stockfish.terminate();}catch{} stockfish=null; engineReady=false; engineSearching=false; engineQueue.length=0;}
    chessGameDiv.style.display="none"; gameLobby.style.display="block"; if(messagesDiv)messagesDiv.innerHTML="";
  }

  // ---------- AI Mode ----------
  playVsAIBtn && playVsAIBtn.addEventListener("click", () => {
    currentGameId = null;
    chess.reset();
    renderBoard(chess.board());
    chessGameDiv.style.display = "block";
    gameLobby.style.display = "none";

    // random first turn
    if (Math.random() < 0.5) {
      playerColor = "white";
      gameTitle.textContent = "Play vs AI (You are White)";
      currentTurnSpan.textContent = "White";
      calert("You play first (White)");
    } else {
      playerColor = "black";
      gameTitle.textContent = "Play vs AI (You are Black)";
      currentTurnSpan.textContent = "White";
      calert("AI plays first (White)");
      setTimeout(()=> makeAIMove(), 500);
    }
    gameStatusSpan.textContent = "Playing vs AI";
    if (messagesDiv) messagesDiv.parentElement.style.display = "none";
  });

})();
function listenForGames() {
    const chessRef = db.ref('chess');

    chessRef.on('value', (snapshot) => {
        gameList.innerHTML = '';
        const games = snapshot.val(); // ✅ directly access all games under /chess

        if (games) {
            Object.entries(games).forEach(([gameId, gameData]) => {
                const li = document.createElement('li');
                li.style.color = 'whitesmoke';

                let status = 'Waiting for opponent';
                if (gameData.playerWhite && gameData.playerBlack) {
                    status = 'In Progress';
                }
                if (
                    gameData.status &&
                    (gameData.status === 'completed' ||
                        gameData.status === 'checkmate' ||
                        gameData.status === 'draw' ||
                        gameData.status === 'stalemate' ||
                        gameData.status.startsWith('draw_'))
                ) {
                    status = gameData.status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                }

                li.innerHTML = `Game ID: ${gameId} (${status})`;

                if (!gameData.playerBlack && gameData.playerWhite !== currentUser.uid && gameData.status === 'waiting') {
                    const joinButton = document.createElement('button');
                    joinButton.style.backgroundColor = '#ec6090';
                    joinButton.textContent = 'Join as Black';
                    joinButton.addEventListener('click', () => joinGame(gameId));
                    li.appendChild(joinButton);
                }

                if ((gameData.playerWhite === currentUser.uid || gameData.playerBlack === currentUser.uid) &&
                    gameData.status !== 'completed' &&
                    gameData.status !== 'abandoned') {
                    const rejoinButton = document.createElement('button');
                    rejoinButton.style.backgroundColor = '#ec6090';
                    rejoinButton.textContent = 'Rejoin';
                    rejoinButton.addEventListener('click', () => joinGame(gameId));
                    li.appendChild(rejoinButton);
                }

                gameList.appendChild(li);
            });
        } else {
            console.log("No active games found.");
        }
    });
}