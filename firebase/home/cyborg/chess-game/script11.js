/* --------------------------------------------------------------
   script2.js  —  Chess Game (Multiplayer + AI) with highlighting
   + Stockfish loader overlay (auto-created if missing)
----------------------------------------------------------------- */

(function () {
  const TAG = "[script2]";
  const log = (...args) => console.log(TAG, ...args);
  const warn = (...args) => console.warn(TAG, ...args);
  const err = (...args) => console.error(TAG, ...args);

  log("[INIT] script loaded. Ready.");

  /* =========================
     1) Firebase (compat SDK)
     ========================= */
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
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  /* =========================
     2) DOM ELEMENTS
     ========================= */
  // Lobby
  const gameLobby = document.getElementById("game-lobby");
  const createGameBtn = document.getElementById("create-game-btn");
  const gameList = document.getElementById("game-list");
  const gameIdInput = document.getElementById("game-id-input");
  const joinGameBtn = document.getElementById("join-game-btn");
  const playVsAIBtn = document.getElementById("play-ai-btn");

  // Game
  const chessGameDiv = document.getElementById("chess-game");
  const gameTitle = document.getElementById("game-title");
  const chessboardDiv = document.getElementById("chessboard");
  const currentTurnSpan = document.getElementById("current-turn");
  const gameStatusSpan = document.getElementById("game-status");

  // Chat
  const messagesDiv = document.getElementById("messages");
  const chatInput = document.getElementById("chat-input");
  const sendChatBtn = document.getElementById("send-chat-btn");
  const leaveGameBtn = document.getElementById("leave-game-btn");

  // Alerts / Modals
  const customAlertDiv = document.getElementById("custom-alert");
  const gameOverModal = document.getElementById("game-over-modal");
  const gameOverMessage = document.getElementById("game-over-message");

  // Optional controls
  const undoBtn = document.getElementById("undo-btn");

  /* =========================
     3) CHESS STATE (chess.js)
     ========================= */
  const game = new window.Chess();

  let selectedSquare = null;    // e.g., "e2"
  let selectedMoves = [];       // list of legal "to" squares for selectedSquare
  let lastMoveSquares = null;   // {from, to}
  const highlightStyle = {
    selected: "selected",
    legal: "legal-move",
    capture: "legal-capture",
    lastMove: "last-move",
    inCheck: "in-check",
  };

  /* ===================================
     4) APP STATE (Multiplayer / Local)
     =================================== */
  let currentUser = null;
  let currentGameId = null;     // null => local/AI mode
  let playerColor = null;       // 'white' | 'black' (multiplayer)
  let unsubGame = null;
  let unsubChat = null;

  /* =========================
     5) CUSTOM ALERT (Toast)
     ========================= */
  function calert(message, duration = 2000) {
    if (!customAlertDiv) { console.log("[ALERT]", message); return; }
    customAlertDiv.textContent = message;
    customAlertDiv.style.display = "block";
    // force reflow
    customAlertDiv.offsetHeight;
    customAlertDiv.classList.add("show");
    setTimeout(() => {
      customAlertDiv.classList.remove("show");
      setTimeout(() => (customAlertDiv.style.display = "none"), 350);
    }, duration);
  }

  /* =========================
     6) RENDERING THE BOARD
     ========================= */
  function getPieceHTML(pieceType, color) {
    const M = {
      k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙",
      K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟",
    };
    return color === "w" ? M[pieceType.toLowerCase()] : M[pieceType.toUpperCase()];
  }
  function algebraicFromRC(row, col) { return `${String.fromCharCode(97 + col)}${8 - row}`; }
  function rcFromAlgebraic(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square[1], 10);
    return { row: rank, col: file };
  }

  function renderBoard() {
    chessboardDiv.innerHTML = "";
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        sq.classList.add("square", (r + c) % 2 === 0 ? "light" : "dark");
        const algebraic = algebraicFromRC(r, c);
        sq.dataset.square = algebraic;

        const piece = board[r][c];
        if (piece) {
          sq.classList.add("piece-square");
          sq.innerHTML = `<span class="piece piece-${piece.color}-${piece.type}">${getPieceHTML(piece.type, piece.color)}</span>`;
        }

        sq.addEventListener("click", onSquareClick);
        chessboardDiv.appendChild(sq);
      }
    }

    applyLastMoveHighlight();
    applyInCheckHighlight();
    if (selectedSquare) applySelectionHighlight(selectedSquare, selectedMoves);

    currentTurnSpan.textContent = game.turn() === "w" ? "White" : "Black";
    gameStatusSpan.textContent = statusTextFromGame();
  }

  function statusTextFromGame() {
    if (game.isGameOver()) {
      if (game.isCheckmate()) return "Checkmate";
      if (game.isStalemate()) return "Stalemate";
      if (game.isInsufficientMaterial()) return "Draw: Insufficient material";
      if (game.isThreefoldRepetition()) return "Draw: Repetition";
      if (game.isDraw()) return "Draw";
      return "Game Over";
    }
    if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} is in check`;
    return "Playing";
  }

  function clearSelectionHighlights() {
    document
      .querySelectorAll(`.square.${highlightStyle.selected}, .square.${highlightStyle.legal}, .square.${highlightStyle.capture}`)
      .forEach((el) => el.classList.remove(highlightStyle.selected, highlightStyle.legal, highlightStyle.capture));
  }
  function applySelectionHighlight(square, legalTargets = []) {
    clearSelectionHighlights();
    const selEl = document.querySelector(`.square[data-square="${square}"]`);
    if (selEl) selEl.classList.add(highlightStyle.selected);
    legalTargets.forEach((dest) => {
      const el = document.querySelector(`.square[data-square="${dest}"]`);
      if (!el) return;
      const piece = game.get(dest);
      if (piece && piece.color !== game.get(square)?.color) el.classList.add(highlightStyle.capture);
      else el.classList.add(highlightStyle.legal);
    });
  }
  function applyLastMoveHighlight() {
    document.querySelectorAll(`.square.${highlightStyle.lastMove}`).forEach((el) => el.classList.remove(highlightStyle.lastMove));
    if (!lastMoveSquares) return;
    const { from, to } = lastMoveSquares;
    const a = document.querySelector(`.square[data-square="${from}"]`);
    const b = document.querySelector(`.square[data-square="${to}"]`);
    if (a) a.classList.add(highlightStyle.lastMove);
    if (b) b.classList.add(highlightStyle.lastMove);
  }
  function applyInCheckHighlight() {
    document.querySelectorAll(`.square.${highlightStyle.inCheck}`).forEach((el) => el.classList.remove(highlightStyle.inCheck));
    if (!game.inCheck()) return;
    const turn = game.turn();
    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === "k" && p.color === turn) {
          const sq = algebraicFromRC(r, c);
          const el = document.querySelector(`.square[data-square="${sq}"]`);
          if (el) el.classList.add(highlightStyle.inCheck);
          return;
        }
      }
    }
  }
  function deselectCurrent() { selectedSquare = null; selectedMoves = []; clearSelectionHighlights(); }

  /* =================================
     7) CLICK HANDLER / MOVE LOGIC
     ================================= */
  function onSquareClick(e) {
    const clicked = e.currentTarget?.dataset?.square;
    if (!clicked) return;

    // Enforce turns in multiplayer
    if (currentGameId) {
      if (!playerColor) return calert("You are not a player in this game.");
      if (playerColor[0] !== game.turn()) return calert("It's not your turn.");
    }

    const clickedPiece = game.get(clicked);

    // A) No selection yet: try to select your own piece
    if (!selectedSquare) {
      if (!clickedPiece) { deselectCurrent(); return; }
      if (currentGameId && clickedPiece.color !== playerColor[0]) { calert("That's your opponent's piece!"); return; }
      selectedSquare = clicked;
      selectedMoves = getLegalTargetsForSquare(clicked);
      applySelectionHighlight(selectedSquare, selectedMoves);
      return;
    }

    // B) There is a selection
    if (clicked === selectedSquare) { deselectCurrent(); return; }

    if (clickedPiece && clickedPiece.color === game.get(selectedSquare)?.color) {
      selectedSquare = clicked;
      selectedMoves = getLegalTargetsForSquare(clicked);
      applySelectionHighlight(selectedSquare, selectedMoves);
      return;
    }

    const legal = selectedMoves.includes(clicked);
    if (!legal) { calert("Illegal move."); return; }

    const moveObj = { from: selectedSquare, to: clicked, promotion: "q" };
    let result = null;
    try { result = game.move(moveObj); } catch (e1) { err("[MOVE] chess.js error", e1); }
    if (!result) { calert("Invalid move."); return; }

    lastMoveSquares = { from: result.from, to: result.to };
    deselectCurrent();
    renderBoard();

    if (game.isGameOver()) handleGameEnd();

    if (currentGameId) pushGameStateToFirebase(currentGameId);
    else scheduleAIMove(); // local vs AI
  }

  function getLegalTargetsForSquare(square) {
    const verbose = game.moves({ square, verbose: true });
    return verbose.map((m) => m.to);
  }

  /* =================================
     8) GAME END HANDLING
     ================================= */
  function handleGameEnd() {
    let msg = "Game over.";
    if (game.isCheckmate()) msg = "Checkmate!";
    else if (game.isStalemate()) msg = "Stalemate.";
    else if (game.isInsufficientMaterial()) msg = "Draw: Insufficient material.";
    else if (game.isThreefoldRepetition()) msg = "Draw: Repetition.";
    else if (game.isDraw()) msg = "Draw.";
    gameStatusSpan.textContent = msg;
    calert(msg, 3000);

    if (currentGameId) {
      const updates = { status: msg.toLowerCase() };
      if (game.isCheckmate()) updates.winner = game.turn() === "w" ? "Black" : "White";
      db.ref(`chess/${currentGameId}`).update(updates).catch((e) => err("[FIREBASE] status update fail", e));
      showGameOverModal(msg);
    }
  }
  function showGameOverModal(message) {
    if (!gameOverModal || !gameOverMessage) return;
    gameOverMessage.textContent = message;
    gameOverModal.classList.remove("hidden");
    setTimeout(() => {
      gameOverModal.classList.add("hidden");
      if (currentGameId) {
        db.ref(`chess/${currentGameId}`).remove()
          .then(() => { log("[CLEANUP] Game node removed."); leaveGame(); })
          .catch((e) => err("[CLEANUP] Could not remove game node:", e));
      }
    }, 5000);
  }

  /* =================================
     9) STOCKFISH + LOADER OVERLAY
     ================================= */
  const STOCKFISH_PATHS = [
    "stockfish/stockfish-17.1-lite-single-03e3232.js",
    "stockfish/stockfish.js",
  ];
  let engine = null;
  let engineReady = false;
  let engineSearching = false;
  let engineQueue = [];
  let stockfishPathInUse = null;

  // --- Loader creation (auto if missing) ---
  function ensureLoader() {
    let overlay = document.getElementById("stockfish-loader");
    if (overlay) return overlay;

    // Inject minimal CSS (once)
    if (!document.getElementById("stockfish-loader-style")) {
      const style = document.createElement("style");
      style.id = "stockfish-loader-style";
      style.textContent = `
        #stockfish-loader {
          position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.75); z-index: 99999; opacity: 0; pointer-events: none; transition: opacity .3s ease;
        }
        #stockfish-loader.show { opacity: 1; pointer-events: auto; }
        #stockfish-loader .loader-card {
          background: #1f2122; border: 2px solid #ec6090; border-radius: 12px; padding: 22px 28px; text-align: center;
          color: white; box-shadow: 0 0 12px #ec6090; min-width: 260px;
        }
        #stockfish-loader .spinner {
          width: 48px; height: 48px; border: 4px solid rgba(255,255,255,.25); border-top-color: #ec6090; border-radius: 50%;
          margin: 0 auto 12px; animation: sfspin 1s linear infinite;
        }
        @keyframes sfspin { to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(style);
    }

    overlay = document.createElement("div");
    overlay.id = "stockfish-loader";
    overlay.innerHTML = `
      <div class="loader-card">
        <div class="spinner"></div>
        <div>Loading chess engine…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }
  function showLoader() { ensureLoader().classList.add("show"); }
  function hideLoader() {
    const overlay = ensureLoader();
    overlay.classList.remove("show");
    // keep in DOM in case we need it again
  }

  function enginePost(cmd) {
    if (!engine) return;
    if (!engineReady && !/^uci|^isready|^setoption|^ucinewgame|^quit/.test(cmd)) {
      engineQueue.push(cmd);
    } else {
      engine.postMessage(cmd);
    }
  }
  function flushEngineQueue() {
    while (engineQueue.length) engine.postMessage(engineQueue.shift());
  }

  function initStockfish() {
    if (engine) { log("[INIT] Stockfish already initialized."); return; }

    showLoader(); // <-- show while starting/handshaking

    (function tryNextPath(i = 0) {
      if (i >= STOCKFISH_PATHS.length) {
        err("[INIT] No Stockfish worker could be loaded.");
        hideLoader();
        calert("Engine failed to load. Check console.");
        return;
      }
      const path = STOCKFISH_PATHS[i];
      log("[INIT] Starting Stockfish path:", path);

      try {
        engine = new Worker(path);
        stockfishPathInUse = path;
      } catch (e) {
        err("[INIT] Worker failed to construct", e);
        engine = null;
        return tryNextPath(i + 1);
      }

      engine.onmessage = onEngineMessage;
      engine.onerror = (ev) => {
        err("[ENGINE] Worker error", ev);
        calert("Engine worker error. See console.");
        hideLoader();
      };

      enginePost("uci");
      enginePost("isready");
      enginePost("ucinewgame");
    })();
  }

  function onEngineMessage(e) {
    const line = e?.data ?? "";
    if (typeof line !== "string") return;

    if (line === "uciok") { enginePost("isready"); return; }

    if (line === "readyok") {
      engineReady = true;
      flushEngineQueue();
      hideLoader(); // <-- hide once ready
      return;
    }

    if (line.startsWith("bestmove")) {
      engineSearching = false;
      const best = line.split(/\s+/)[1];
      if (!best || best === "(none)") return;
      const moveObj = { from: best.slice(0, 2), to: best.slice(2, 4), promotion: "q" };
      let result = null;
      try { result = game.move(moveObj); } catch (e1) { err("[AI MOVE] chess.js error:", e1); }
      if (!result) return;
      lastMoveSquares = { from: result.from, to: result.to };
      renderBoard();
      if (game.isGameOver()) handleGameEnd();
    }
  }

  function scheduleAIMove() {
    if (currentGameId) return;           // only local AI
    if (game.isGameOver()) return;
    initStockfish();                      // ensure engine
    if (game.turn() === "b") setTimeout(makeAIMove, 300);
  }

  function makeAIMove() {
    if (!engine) initStockfish();
    if (!engine) return;
    if (game.isGameOver()) return;

    engineSearching = true;
    enginePost("position fen " + game.fen());
    enginePost("go depth 12");
  }

  /* =================================
     10) MULTIPLAYER (Realtime DB)
     ================================= */
  function listenForGames() {
    const ref = db.ref("chess");
    ref.on("value", (snap) => {
      gameList.innerHTML = "";
      const games = snap.val();
      if (!games) return;

      Object.entries(games).forEach(([gid, gdata]) => {
        const li = document.createElement("li");
        li.style.color = "whitesmoke";

        let status = "Waiting for opponent";
        if (gdata.playerWhite && gdata.playerBlack) status = "In Progress";
        if (gdata.status) status = gdata.status;

        li.innerHTML = `Game ID: ${gid} (${status})`;

        // Join as Black if available (and you're not White already)
        if (!gdata.playerBlack && gdata.playerWhite !== currentUser?.uid && gdata.status === "waiting") {
          const joinBtn = document.createElement("button");
          joinBtn.textContent = "Join as Black";
          joinBtn.style.backgroundColor = "#ec6090";
          joinBtn.addEventListener("click", () => joinGame(gid));
          li.appendChild(joinBtn);
        }

        // Rejoin for existing players
        const youArePlayer = gdata.playerWhite === currentUser?.uid || gdata.playerBlack === currentUser?.uid;
        if (youArePlayer && gdata.status !== "completed" && gdata.status !== "abandoned") {
          const rejoinBtn = document.createElement("button");
          rejoinBtn.textContent = "Rejoin";
          rejoinBtn.style.backgroundColor = "#ec6090";
          rejoinBtn.addEventListener("click", () => joinGame(gid));
          li.appendChild(rejoinBtn);
        }

        gameList.appendChild(li);
      });
    });
  }

  function pushGameStateToFirebase(gid) {
    db.ref(`chess/${gid}`).update({
      board: game.fen(),
      turn: game.turn(),
    }).catch((e) => err("[FIREBASE] update failed:", e));
  }

  function createGame() {
    const ref = db.ref("chess").push();
    const gid = ref.key;
    const init = {
      playerWhite: currentUser.uid,
      playerBlack: null,
      board: game.fen(),
      turn: game.turn(),
      status: "waiting",
      chat: [],
    };
    ref.set(init)
      .then(() => joinGame(gid))
      .catch((e) => { err("[FIREBASE] createGame error:", e); calert("Error creating game."); });
  }

  function joinGame(gid) {
    const ref = db.ref(`chess/${gid}`);
    ref.transaction((g) => {
      if (!g) return;
      if (g.playerWhite === currentUser.uid) playerColor = "white";
      else if (g.playerBlack === currentUser.uid) playerColor = "black";
      else if (!g.playerWhite && g.status === "waiting") { g.playerWhite = currentUser.uid; playerColor = "white"; }
      else if (!g.playerBlack && g.status === "waiting") { g.playerBlack = currentUser.uid; playerColor = "black"; }
      else return;
      if (g.playerWhite && g.playerBlack && g.status === "waiting") g.status = "playing";
      return g;
    }).then((res) => {
      if (!res.committed) return calert("Could not join game. Full or not joinable.");
      currentGameId = gid;
      gameLobby.style.display = "none";
      chessGameDiv.style.display = "block";
      gameTitle.textContent = `Game ID: ${gid} (You are ${playerColor})`;
      attachGameListener(gid);
      attachChatListener(gid);
    }).catch((e) => { err("[FIREBASE] joinGame error:", e); calert("Join failed."); });
  }

  function attachGameListener(gid) {
    if (unsubGame) { db.ref(`chess/${gid}`).off("value", unsubGame); unsubGame = null; }
    const ref = db.ref(`chess/${gid}`);
    const handler = (snap) => {
      const g = snap.val();
      if (!g) { calert("Game ended or removed."); leaveGame(); return; }
      if (g.board && typeof g.board === "string") {
        try { game.load(g.board); } catch (e) { warn("[SYNC] Invalid FEN, resetting:", e); game.reset(); }
      }
      renderBoard();
      if (g.status && /checkmate|draw|stalemate|game over|completed|abandoned/i.test(g.status)) {
        gameStatusSpan.textContent = g.status;
      }
    };
    ref.on("value", handler);
    unsubGame = handler;
  }

  function attachChatListener(gid) {
    if (unsubChat) { db.ref(`chess/${gid}/chat`).off("child_added", unsubChat); unsubChat = null; }
    const ref = db.ref(`chess/${gid}/chat`);
    const h = (snap) => {
      const m = snap.val();
      if (!m) return;
      const p = document.createElement("p");
      const date = new Date(m.timestamp || Date.now());
      p.textContent = `[${date.toLocaleTimeString()}] ${m.sender}: ${m.message}`;
      messagesDiv.appendChild(p);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };
    ref.on("child_added", h);
    unsubChat = h;
  }

  function sendChatMessage() {
    const txt = (chatInput.value || "").trim();
    if (!txt || !currentGameId || !currentUser) return;
    const name = currentUser.email ? currentUser.email.split("@")[0] : "anon";
    db.ref(`chess/${currentGameId}/chat`).push({
      sender: name,
      message: txt,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
    }).catch((e) => err("[CHAT] push failed:", e));
    chatInput.value = "";
  }

  function leaveGame() {
    if (!currentGameId || !currentUser) return cleanupToLobby();
    const gid = currentGameId;
    const ref = db.ref(`chess/${gid}`);
    ref.transaction((g) => {
      if (!g) return;
      if (g.playerWhite === currentUser.uid) g.playerWhite = null;
      if (g.playerBlack === currentUser.uid) g.playerBlack = null;
      if (!g.playerWhite && !g.playerBlack) return null; // delete
      if (g.status === "playing" && (!g.playerWhite || !g.playerBlack)) g.status = "abandoned";
      return g;
    }).then(() => {
      db.ref(`chess/${gid}`).off("value", unsubGame || undefined);
      db.ref(`chess/${gid}/chat`).off("child_added", unsubChat || undefined);
      unsubGame = null; unsubChat = null;
      cleanupToLobby();
    }).catch((e) => { err("[FIREBASE] leaveGame error:", e); calert("Error leaving game."); cleanupToLobby(); });
  }

  function cleanupToLobby() {
    currentGameId = null;
    playerColor = null;
    selectedSquare = null;
    selectedMoves = [];
    lastMoveSquares = null;
    messagesDiv.innerHTML = "";
    game.reset();
    renderBoard();
    chessGameDiv.style.display = "none";
    gameLobby.style.display = "block";
    gameTitle.textContent = "";
    gameStatusSpan.textContent = "Idle";
  }

  /* =================================
     11) LOCAL vs AI MODE
     ================================= */
  function startAIGame() {
    currentGameId = null;
    playerColor = "white"; // user = White (AI = Black)
    selectedSquare = null;
    selectedMoves = [];
    lastMoveSquares = null;

    game.reset();
    renderBoard();

    gameLobby.style.display = "none";
    chessGameDiv.style.display = "block";
    gameTitle.textContent = "Playing vs AI";
    gameStatusSpan.textContent = "Playing vs Stockfish";
    currentTurnSpan.textContent = "White";

    initStockfish(); // loader shows until ready
  }

  /* =================================
     12) AUTHENTICATION
     ================================= */
  auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      log("[AUTH] Signed in:", user.uid);
      gameLobby.style.display = "block";
      chessGameDiv.style.display = "none";
      listenForGames();
      renderBoard();
      return;
    }
    warn("[AUTH] Not logged in. Redirecting to login page...");
    window.location.href = "../../../../login/fire-login.html";
  });

  /* =================================
     13) EVENT LISTENERS (UI)
     ================================= */
  createGameBtn && createGameBtn.addEventListener("click", createGame);
  joinGameBtn && joinGameBtn.addEventListener("click", () => {
    const gid = (gameIdInput?.value || "").trim();
    if (!gid) return calert("Enter a Game ID.");
    joinGame(gid);
  });
  playVsAIBtn && playVsAIBtn.addEventListener("click", startAIGame);
  sendChatBtn && sendChatBtn.addEventListener("click", sendChatMessage);
  leaveGameBtn && leaveGameBtn.addEventListener("click", leaveGame);
  chatInput && chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChatMessage(); });

  // Optional: Undo (works in local AI; in multiplayer it only undoes your latest move locally)
  undoBtn && undoBtn.addEventListener("click", () => {
    if (game.history().length === 0) return calert("No moves to undo");
    game.undo();
    if (!currentGameId && game.history().length > 0) game.undo(); // also undo AI reply
    renderBoard();
    currentTurnSpan.textContent = game.turn() === "w" ? "White" : "Black";
    if (currentGameId) pushGameStateToFirebase(currentGameId);
  });

  /* =================================
     14) FIRST RENDER / DEBUG
     ================================= */
  renderBoard();
  currentTurnSpan.textContent = game.turn() === "w" ? "White" : "Black";
  gameStatusSpan.textContent = "Idle";

  // Debug helpers
  window.__chess = {
    game,
    renderBoard,
    startAIGame,
    initStockfish,
    makeAIMove,
    get state() {
      return {
        currentGameId,
        playerColor,
        turn: game.turn(),
        fen: game.fen(),
        selectedSquare,
        selectedMoves,
        lastMoveSquares,
        engineReady,
        engineSearching,
        stockfishPathInUse,
      };
    },
  };
})();
