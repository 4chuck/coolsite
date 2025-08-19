// script2.js — Full Chess + Firebase Email/Password Auth + Multiplayer + Stockfish AI

(() => {
  console.log("[script2] [INIT] script loaded.");

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

  // ---------- Stockfish ----------
  let stockfish = null;
  let aiMode = false;

  function initStockfish() {
    if (stockfish) return;
    stockfish = new Worker("https://cdn.jsdelivr.net/npm/stockfish/stockfish.js");
    stockfish.onmessage = e => {
      const line = (e.data || "").toString();
      if (line.startsWith("bestmove")) {
        const parts = line.split(" ");
        const move = parts[1];
        if (move && move.length >= 4) {
          const from = move.substring(0, 2);
          const to = move.substring(2, 4);
          try {
            chess.move({ from, to, promotion: "q" });
            renderBoard(chess.board());
            currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
            gameStatusSpan.textContent = "Your move";
          } catch (err) {
            console.warn("[Stockfish] invalid move:", move, err);
          }
        }
      }
    };
  }

  function aiMakeMove() {
    if (!aiMode || chess.turn() !== "b") return;
    stockfish.postMessage("position fen " + chess.fen());
    stockfish.postMessage("go depth 15");
  }

  // ---------- DOM ----------
  const authContainer = document.getElementById("auth-container");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("login-btn");
  const registerBtn = document.getElementById("register-btn");
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

  // ---------- App state ----------
  let currentUser = null;
  let currentGameId = null;
  let playerColor = null;
  let selectedPiece = null;
  let lastPossibleMoves = [];

  // ---------- helpers ----------
  function L(...args) { console.log("[script2]", ...args); }
  function calert(msg, dur = 2500) {
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

  // ---------- Auth ----------
  loginBtn.addEventListener("click", () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) return calert("Enter email & password");
    auth.signInWithEmailAndPassword(email, pass)
      .catch(err => calert("Login failed: " + err.message));
  });

  registerBtn.addEventListener("click", () => {
    const email = emailInput.value.trim();
    const pass = passwordInput.value.trim();
    if (!email || !pass) return calert("Enter email & password");
    auth.createUserWithEmailAndPassword(email, pass)
      .catch(err => calert("Register failed: " + err.message));
  });

  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      L("[AUTH] Signed in:", user.email || user.uid);
      authStatus.textContent = `Signed in: ${user.email || user.uid}`;
      authContainer.style.display = "none";
      gameLobby.style.display = "block";
      listenForGames();
    } else {
      currentUser = null;
      gameLobby.style.display = "none";
      chessGameDiv.style.display = "none";
      authContainer.style.display = "block";
    }
  });

  // ---------- Chess board rendering ----------
  function renderBoard(boardArray) {
    chessboardDiv.innerHTML = "";
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const sq = document.createElement("div");
        sq.classList.add("square", (r + c) % 2 === 0 ? "light" : "dark");
        sq.dataset.row = r;
        sq.dataset.col = c;
        const piece = boardArray[r][c];
        if (piece) {
          sq.innerHTML = getPieceUnicode(piece.type, piece.color);
          sq.classList.add("piece");
        }
        sq.addEventListener("click", handleSquareClick);
        chessboardDiv.appendChild(sq);
      }
    }
  }
  function getPieceUnicode(pieceType, color) {
    const pieces = {
      k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙",
      K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟",
    };
    if (!pieceType || !color) return "";
    return (color === "w") ? pieces[pieceType.toLowerCase()] : pieces[pieceType.toUpperCase()];
  }

  function clearHighlights() {
    document.querySelectorAll(".square.possible-move").forEach(s => s.classList.remove("possible-move"));
  }
  function deselectPiece() {
    const prev = document.querySelector(".square.selected");
    if (prev) prev.classList.remove("selected");
    selectedPiece = null;
    lastPossibleMoves = [];
    clearHighlights();
  }
  function highlightPossibleMoves(moves) {
    clearHighlights();
    moves.forEach(mv => {
      const row = 8 - parseInt(mv.to.charAt(1), 10);
      const col = mv.to.charCodeAt(0) - 97;
      const el = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
      if (el) el.classList.add("possible-move");
    });
  }

  // ---------- Click handler ----------
  function handleSquareClick(ev) {
    const clicked = ev.target.closest(".square");
    if (!clicked) return;
    const row = parseInt(clicked.dataset.row, 10);
    const col = parseInt(clicked.dataset.col, 10);
    const algebraicSquare = `${String.fromCharCode(97 + col)}${8 - row}`;

    if (selectedPiece && lastPossibleMoves.length > 0) {
      const fromSquare = `${String.fromCharCode(97 + selectedPiece.col)}${8 - selectedPiece.row}`;
      if (fromSquare === algebraicSquare) { deselectPiece(); return; }
      const moveResult = chess.move({ from: fromSquare, to: algebraicSquare, promotion: "q" });
      deselectPiece();
      if (moveResult) {
        renderBoard(chess.board());
        currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";

        if (aiMode) {
          gameStatusSpan.textContent = "AI thinking...";
          aiMakeMove();
        } else if (currentGameId) {
          db.ref(`chess/${currentGameId}`).update({ board: chess.fen(), turn: chess.turn() });
        }
      }
      return;
    }

    const piece = chess.get(algebraicSquare);
    if (!piece) { deselectPiece(); return; }
    if (currentGameId && playerColor) {
      if (playerColor.charAt(0) !== chess.turn()) return calert("Not your turn");
      if (piece.color !== playerColor.charAt(0)) return calert("Opponent's piece");
    }
    const possibleMoves = chess.moves({ square: algebraicSquare, verbose: true });
    deselectPiece();
    selectedPiece = { row, col, type: piece.type, color: piece.color };
    lastPossibleMoves = possibleMoves.slice();
    clicked.classList.add("selected");
    highlightPossibleMoves(possibleMoves);
  }

  // ---------- Lobby ----------
  function listenForGames() {
    const chessRef = db.ref("chess");
    chessRef.off();
    chessRef.on("value", snap => {
      gameList.innerHTML = "";
      const games = snap.val();
      if (!games) return gameList.append("No games.");
      Object.entries(games).forEach(([gid, gdata]) => {
        const li = document.createElement("li");
        li.style.color = "whitesmoke";
        let status = gdata.status || "waiting";
        li.textContent = `Game ${gid} (${status})`;
        if (!gdata.playerBlack && gdata.playerWhite !== currentUser.uid && status === "waiting") {
          const btn = document.createElement("button");
          btn.textContent = "Join as Black";
          btn.addEventListener("click", () => joinGame(gid));
          li.appendChild(btn);
        }
        if ((gdata.playerWhite === currentUser.uid || gdata.playerBlack === currentUser.uid) && status !== "completed") {
          const btn = document.createElement("button");
          btn.textContent = "Rejoin";
          btn.addEventListener("click", () => joinGame(gid));
          li.appendChild(btn);
        }
        gameList.appendChild(li);
      });
    });
  }

  createGameBtn.addEventListener("click", () => {
    if (!currentUser) return calert("Sign in first");
    aiMode = false;
    const newRef = db.ref("chess").push();
    newRef.set({
      playerWhite: currentUser.uid,
      playerBlack: null,
      board: chess.fen(),
      turn: chess.turn(),
      status: "waiting",
      chat: {}
    }).then(()=> joinGame(newRef.key));
  });

  joinGameBtn.addEventListener("click", () => {
    const gid = (gameIdInput.value || "").trim();
    if (!gid) return calert("Enter Game ID");
    aiMode = false;
    joinGame(gid);
  });

  playVsAIBtn.addEventListener("click", () => {
    aiMode = true;
    initStockfish();
    currentGameId = null;
    playerColor = "white";
    chess.reset();
    renderBoard(chess.board());
    currentTurnSpan.textContent = "White";
    gameStatusSpan.textContent = "Your move";
    gameLobby.style.display = "none";
    chessGameDiv.style.display = "block";
    gameTitle.textContent = "AI Game (White vs Stockfish)";
  });

  function joinGame(gameId) {
    const ref = db.ref(`chess/${gameId}`);
    ref.transaction(game => {
      if (!game) return;
      if (game.playerWhite === currentUser.uid) playerColor = "white";
      else if (game.playerBlack === currentUser.uid) playerColor = "black";
      else if (!game.playerWhite && game.status === "waiting") { game.playerWhite = currentUser.uid; playerColor = "white"; }
      else if (!game.playerBlack && game.status === "waiting") { game.playerBlack = currentUser.uid; playerColor = "black"; }
      else return;
      if (game.playerWhite && game.playerBlack && game.status === "waiting") game.status = "playing";
      return game;
    }).then(result => {
      if (result.committed) {
        currentGameId = gameId;
        gameLobby.style.display = "none";
        chessGameDiv.style.display = "block";
        gameTitle.textContent = `Game ${gameId} (${playerColor})`;
        listenToGameChanges(gameId);
        listenToChat(gameId);
      }
    });
  }

  function listenToGameChanges(gameId) {
    const ref = db.ref(`chess/${gameId}`);
    ref.off();
    ref.on("value", snap => {
      const data = snap.val();
      if (!data) { calert("Game removed"); leaveGame(); return; }
      try { chess.load(data.board); } catch { chess.reset(); }
      renderBoard(chess.board());
      currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
      gameStatusSpan.textContent = data.status || "Ongoing";
    });
  }

  // ---------- Chat ----------
  sendChatBtn.addEventListener("click", () => {
    if (aiMode) return calert("Chat disabled in AI mode");
    const msg = chatInput.value.trim();
    if (!msg || !currentGameId || !currentUser) return;
    db.ref(`chess/${currentGameId}/chat`).push({
      sender: currentUser.email.split("@")[0],
      message: msg,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(()=> chatInput.value = "");
  });
  function listenToChat(gameId) {
    const ref = db.ref(`chess/${gameId}/chat`);
    ref.off();
    ref.on("child_added", snap => {
      const m = snap.val();
      if (!m) return;
      const p = document.createElement("p");
      p.textContent = `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.sender}: ${m.message}`;
      messagesDiv.appendChild(p);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  }

  leaveGameBtn.addEventListener("click", leaveGame);
  function leaveGame() {
    if (aiMode) {
      aiMode = false;
      chess.reset();
      renderBoard(chess.board());
      chessGameDiv.style.display = "none";
      gameLobby.style.display = "block";
      return;
    }
    if (!currentGameId) return;
    const ref = db.ref(`chess/${currentGameId}`);
    ref.transaction(game => {
      if (!game) return;
      if (game.playerWhite === currentUser.uid) game.playerWhite = null;
      else if (game.playerBlack === currentUser.uid) game.playerBlack = null;
      if (!game.playerWhite && !game.playerBlack) return null;
      if (game.status === "playing" && (!game.playerWhite || !game.playerBlack)) game.status = "abandoned";
      return game;
    }).then(()=> {
      db.ref(`chess/${currentGameId}`).off();
      db.ref(`chess/${currentGameId}/chat`).off();
      currentGameId = null; playerColor = null; selectedPiece = null; lastPossibleMoves = [];
      chess.reset();
      renderBoard(chess.board());
      chessGameDiv.style.display = "none";
      gameLobby.style.display = "block";
      messagesDiv.innerHTML = "";
    });
  }

  // ---------- initial render ----------
  renderBoard(chess.board());
  currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
  gameStatusSpan.textContent = "Idle";
})();