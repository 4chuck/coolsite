// script2.js — updated: prevents errors when selecting pieces with no legal moves
// Make sure window.Chess is available (loaded via your HTML before this file)

(() => {
  console.log("[script2] [INIT] script loaded.");

  // ---------- Config ----------
  const STOCKFISH_PATH = "stockfish/stockfish-17.1-lite-single-03e3232.js"; // adjust if needed

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

  // ---------- App state ----------
  let currentUser = null;
  let currentGameId = null; // null => local/AI
  let playerColor = null; // 'white' or 'black'
  let selectedPiece = null; // { row, col, type, color }
  let lastPossibleMoves = []; // cached verbose moves for selectedPiece

  // ---------- small helpers ----------
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

  // ---------- Stockfish worker wrapper ----------
  let stockfish = null;
  let engineReady = false;
  let engineSearching = false;
  const engineQueue = [];

  function enginePost(cmd) {
    if (!stockfish) { engineQueue.push(cmd); return; }
    if (!engineReady && !/^(uci|isready|setoption|quit|debug)/.test(cmd)) {
      engineQueue.push(cmd);
      L("[ENGINE] queued until ready:", cmd);
    } else {
      L("[ENGINE] post ->", cmd);
      stockfish.postMessage(cmd);
    }
  }
  function flushEngineQueue() {
    if (!stockfish) return;
    while (engineQueue.length) {
      const c = engineQueue.shift();
      L("[ENGINE] flush ->", c);
      stockfish.postMessage(c);
    }
  }

  function initStockfish(path = STOCKFISH_PATH) {
    if (stockfish) { L("[INIT] Stockfish already inited."); return; }
    L("[INIT] Starting Stockfish worker from:", path);
    try {
      stockfish = new Worker(path);
    } catch (e) {
      console.error("[INIT] Worker creation failed:", e);
      calert("Stockfish worker failed to start. Serve files over HTTP and check path.");
      return;
    }

    stockfish.onmessage = (ev) => {
      const line = ev.data || "";
      L("[STOCKFISH MESSAGE]", line);
      if (typeof line !== "string") return;

      if (line.startsWith("uciok")) {
        enginePost("isready");
        return;
      }
      if (line.startsWith("readyok")) {
        if (!engineReady) {
          engineReady = true;
          L("[STOCKFISH] engineReady = true");
          flushEngineQueue();
        }
        return;
      }
      if (line.startsWith("bestmove")) {
        engineSearching = false;
        const mv = line.split(" ")[1];
        L("[STOCKFISH] bestmove", mv);
        if (mv && mv !== "(none)" && !currentGameId) {
          // apply locally
          const from = mv.slice(0,2), to = mv.slice(2,4);
          try {
            const mobj = chess.move({ from, to, promotion: "q" });
            if (mobj) {
              L("[STOCKFISH] applied:", mobj.san);
              renderBoard(chess.board());
              currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
              checkForEndAndNotify();
            } else {
              L("[STOCKFISH] engine move illegal:", mv);
            }
          } catch (e) {
            console.error("[STOCKFISH] error applying move:", e);
          }
        }
        return;
      }
      // ignore info lines (or log them if you want)
    };

    stockfish.onerror = (ev) => {
      console.error("[STOCKFISH ERROR EVENT]", ev);
      calert("Stockfish worker error (see console)");
    };

    engineReady = false;
    engineSearching = false;
    enginePost("uci");
    enginePost("isready");
    enginePost("ucinewgame");
    L("[INIT] Worker created and UCI handshake sent.");
  }

  function makeAIMove(depth = 12) {
    L("[AI] Requesting AI move; chess.isGameOver:", chess.isGameOver());
    if (chess.isGameOver()) { checkForEndAndNotify(); return; }
    initStockfish();
    const fen = chess.fen();
    L("[AI] position fen:", fen);
    enginePost("position fen " + fen);
    enginePost("go depth " + depth);
    engineSearching = true;
    L("[AI] go depth", depth, "posted");
  }

  // ---------- End detection ----------
  function checkForEndAndNotify() {
    if (!chess.isGameOver()) return;
    let msg = "Game over";
    if (chess.isCheckmate()) msg = "Checkmate!";
    else if (chess.isDraw()) msg = "Draw.";
    gameStatusSpan.textContent = msg;
    showGameOverModal(msg);
  }
  function showGameOverModal(msg) {
    if (gameOverModal && gameOverMessage) {
      gameOverMessage.textContent = msg;
      gameOverModal.classList.remove("hidden");
      setTimeout(()=>gameOverModal.classList.add("hidden"), 5000);
    } else {
      calert(msg);
    }
  }

  // ---------- Board rendering & helpers ----------
  function renderBoard(boardArray) {
    chessboardDiv.innerHTML = "";
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const sq = document.createElement("div");
        sq.classList.add("square");
        sq.classList.add((r + c) % 2 === 0 ? "light" : "dark");
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
    const highlighted = document.querySelectorAll(".square.possible-move");
    if (highlighted.length) {
      highlighted.forEach(s => s.classList.remove("possible-move"));
      L("[HIGHLIGHT] cleared", highlighted.length);
    }
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
    if (!moves || moves.length === 0) { L("[HIGHLIGHT] no moves to show"); return; }
    moves.forEach(mv => {
      const to = mv.to;
      const row = 8 - parseInt(to.charAt(1), 10);
      const col = to.charCodeAt(0) - 97;
      const el = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
      if (el) el.classList.add("possible-move");
      else L("[HIGHLIGHT] missing target square for", to);
    });
    L("[HIGHLIGHT] highlighted", moves.length, "moves");
  }

  // ---------- Click handler (fixed) ----------
  function handleSquareClick(ev) {
    const clicked = ev.target.closest(".square");
    if (!clicked) return;
    const row = parseInt(clicked.dataset.row, 10);
    const col = parseInt(clicked.dataset.col, 10);
    const algebraicSquare = `${String.fromCharCode(97 + col)}${8 - row}`;

    L("[CLICK] clicked", algebraicSquare);

    // If a piece is already selected and it has possible moves cached => attempt move
    if (selectedPiece && lastPossibleMoves && lastPossibleMoves.length > 0) {
      const fromSquare = `${String.fromCharCode(97 + selectedPiece.col)}${8 - selectedPiece.row}`;

      // clicking same square toggles deselect
      if (fromSquare === algebraicSquare) {
        L("[CLICK] clicked selected square again -> deselect");
        deselectPiece();
        return;
      }

      L("[MOVE] attempting", fromSquare, "->", algebraicSquare);
      let moveResult = null;
      try {
        moveResult = chess.move({ from: fromSquare, to: algebraicSquare, promotion: "q" });
      } catch (e) {
        // some chess.js versions throw on invalid moves; handle gracefully
        L("[MOVE] chess.move threw:", e);
        moveResult = null;
      }

      deselectPiece(); // clear visuals after attempt

      if (moveResult) {
        L("[MOVE] applied:", moveResult.san);
        renderBoard(chess.board());
        currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
        checkForEndAndNotify();

        if (currentGameId) {
          db.ref(`chess/${currentGameId}`).update({ board: chess.fen(), turn: chess.turn() })
            .catch(err => { console.error("[MULTI] failed to update:", err); calert("Failed to save move."); });
        } else {
          setTimeout(()=> makeAIMove(), 240);
        }
      } else {
        L("[MOVE] illegal or no-op move attempted:", fromSquare, "->", algebraicSquare);
        // If the clicked target is a piece of the same side, we may want to select it instead — handle below:
        const clickedPiece = chess.get(algebraicSquare);
        if (clickedPiece && clickedPiece.color === (playerColor ? playerColor.charAt(0) : chess.turn())) {
          // let selection flow continue: we'll treat this as selecting new piece
          L("[MOVE] clicked another own piece -> treat as select");
          // proceed to selection code below by falling through (selectedPiece was cleared by deselectPiece())
        } else {
          // just inform user and stop
          calert("Illegal move");
          return;
        }
      }
    }

    // If we reach here, either no piece was previously selected, or the previous selection had no legal moves
    // Try to select piece at clicked square
    const piece = chess.get(algebraicSquare);
    if (!piece) {
      L("[SELECT] clicked empty square -> nothing to select");
      deselectPiece();
      return;
    }

    // If multiplayer make sure it's the player's turn and piece belongs to them
    if (currentGameId && playerColor) {
      if (playerColor.charAt(0) !== chess.turn()) {
        calert("It's not your turn!");
        return;
      }
      if (piece.color !== playerColor.charAt(0)) {
        calert("That's your opponent's piece!");
        return;
      }
    }

    // compute possible moves BEFORE modifying DOM
    const possibleMoves = chess.moves({ square: algebraicSquare, verbose: true });
    L("[SELECT] selected at", algebraicSquare, { type: piece.type, color: piece.color }, "possibleMoves:", possibleMoves);

   /* if (!possibleMoves || possibleMoves.length === 0) {
      // **** FIX: do NOT keep the piece selected if it has no legal moves ****
      calert("No legal moves for that piece");
      deselectPiece();
      return;
    }  */

    // set visuals & cache moves
    deselectPiece();
    selectedPiece = { row, col, type: piece.type, color: piece.color };
    lastPossibleMoves = possibleMoves.slice();
    clicked.classList.add("selected");
    highlightPossibleMoves(possibleMoves);
  }

  // ---------- Firebase auth & lobby (kept minimal & robust) ----------
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = user;
      L("[AUTH] Signed in:", user.uid);
      authStatus.textContent = `Signed in: ${user.uid}`;
      if (gameLobby) gameLobby.style.display = "block";
      listenForGames();
    } else {
      L("[AUTH] signing in anonymously...");
      auth.signInAnonymously().catch(err => {
        console.error("[AUTH] anon failed:", err);
        authStatus.textContent = "Sign-in restricted (see console)";
      });
    }
  });

  function listenForGames() {
    const chessRef = db.ref("chess");
    chessRef.off();
    chessRef.on("value", snap => {
      gameList.innerHTML = "";
      const games = snap.val();
      if (!games) { gameList.appendChild(document.createTextNode("No games found.")); return; }
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

  createGameBtn && createGameBtn.addEventListener("click", () => {
    if (!currentUser) return calert("Sign in first");
    const newRef = db.ref("chess").push();
    const gid = newRef.key;
    newRef.set({
      playerWhite: currentUser.uid,
      playerBlack: null,
      board: chess.fen(),
      turn: chess.turn(),
      status: "waiting",
      chat: {}
    }).then(()=> joinGame(gid)).catch(err => { console.error(err); calert("Create failed"); });
  });

  joinGameBtn && joinGameBtn.addEventListener("click", () => {
    const gid = (gameIdInput && gameIdInput.value || "").trim();
    if (!gid) return calert("Enter Game ID");
    joinGame(gid);
  });

  function joinGame(gameId) {
    if (!currentUser) return calert("Sign in first");
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
        chessGameDiv.style.display = "block";
        gameLobby.style.display = "none";
        gameTitle.textContent = `Game ${gameId} (${playerColor})`;
        listenToGameChanges(gameId);
        listenToChat(gameId);
      } else calert("Unable to join game");
    }).catch(err => { console.error("[MULTI] join err", err); calert("Join error"); });
  }

  function listenToGameChanges(gameId) {
    const ref = db.ref(`chess/${gameId}`);
    ref.off();
    ref.on("value", snap => {
      const data = snap.val();
      if (!data) { calert("Game removed"); leaveGame(); return; }
      if (data.board && typeof data.board === "string") {
        try { chess.load(data.board); } catch (e) { console.warn("invalid FEN"); chess.reset(); }
      } else chess.reset();
      renderBoard(chess.board());
      currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
      gameStatusSpan.textContent = data.status || "Ongoing";
      if (chess.isGameOver()) checkForEndAndNotify();
    });
  }

  // chat
  sendChatBtn && sendChatBtn.addEventListener("click", () => {
    const msg = (chatInput && chatInput.value || "").trim();
    if (!msg || !currentGameId || !currentUser) return;
    db.ref(`chess/${currentGameId}/chat`).push({
      sender: currentUser.email ? currentUser.email.split("@")[0] : currentUser.uid.slice(0,6),
      message: msg,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(()=> chatInput.value = "").catch(e => { console.error(e); calert("Chat failed"); });
  });

  function listenToChat(gameId) {
    const ref = db.ref(`chess/${gameId}/chat`);
    ref.off();
    ref.on("child_added", snap => {
      const m = snap.val();
      if (!m) return;
      const p = document.createElement("p");
      p.textContent = `[${m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}] ${m.sender}: ${m.message}`;
      messagesDiv.appendChild(p);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  }

  leaveGameBtn && leaveGameBtn.addEventListener("click", leaveGame);
  function leaveGame() {
    if (!currentGameId || !currentUser) { calert("Not in a game"); return; }
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
    }).catch(e => { console.error(e); calert("Leave failed"); });
  }

  // local AI start
  playVsAIBtn && playVsAIBtn.addEventListener("click", () => {
    L("[LOCAL AI] Starting local AI game...");
    currentGameId = null;
    playerColor = "w";
    chess.reset();
    renderBoard(chess.board());
    gameLobby.style.display = "none";
    chessGameDiv.style.display = "block";
    gameTitle.textContent = "Playing vs AI";
    currentTurnSpan.textContent = "White";
    gameStatusSpan.textContent = "Playing vs Stockfish";
    initStockfish();
  });

  // ---------- initial render ----------
  renderBoard(chess.board());
  currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
  gameStatusSpan.textContent = "Idle";
  L("[INIT] initial render done.");

})();
