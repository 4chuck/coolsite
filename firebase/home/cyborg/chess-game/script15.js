/* script14.js
   Full game script: Firebase Auth + Lobby + Multiplayer + Chat + Local AI (Stockfish)
   Major fixes:
   - initStockfish(opts) supports { showLoader: true|false } so we can silently init
   - Loader only shown during explicit handshake init (not for every makeAIMove)
   - Signup UI hidden when signed in
   - Robust queueing of engine commands until ready
   - Defensive checks throughout
*/

(function () {
  const TAG = "[script14]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const err = (...a) => console.error(TAG, ...a);

  // ---------- CONFIG ----------
  const STOCKFISH_WORKER_PATH = "stockfish/stockfish-17.1-lite-single-03e3232.js"; // Your worker path
  const ENGINE_GO_DEPTH = 12;
  const ENGINE_INIT_TIMEOUT_MS = 12000; // 12s handshake timeout

  // ---------- FIREBASE CONFIG ----------
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

  // ---------- INIT FIREBASE (compat expected to be loaded) ----------
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      log("Firebase initialized");
    } else {
      log("Firebase already initialized");
    }
  } catch (e) {
    err("Firebase init failed:", e);
  }

  // Firestore compat APIs expected
  const auth = firebase.auth();
  const db = firebase.database();

  // ---------- PRE-FLIGHT: chess.js ----------
  if (!window.Chess) {
    err("chess.js not found. Load chess.js (UMD or set window.Chess) before script14.js");
    return;
  }

  // ---------- DOM refs ----------
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
  const undoBtn = document.getElementById("undo-btn");

  let customAlertDiv = document.getElementById("custom-alert");
  let gameOverModal = document.getElementById("game-over-modal");
  let gameOverMessage = document.getElementById("game-over-message");
  let stockfishOverlay = document.getElementById("stockfish-loader");

  // ---------- Ensure essential elements exist ----------
  if (!customAlertDiv) {
    customAlertDiv = document.createElement("div");
    customAlertDiv.id = "custom-alert";
    customAlertDiv.style.position = "fixed";
    customAlertDiv.style.left = "50%";
    customAlertDiv.style.top = "8%";
    customAlertDiv.style.transform = "translateX(-50%)";
    customAlertDiv.style.background = "#3498db";
    customAlertDiv.style.color = "#fff";
    customAlertDiv.style.padding = "10px 18px";
    customAlertDiv.style.borderRadius = "8px";
    customAlertDiv.style.display = "none";
    customAlertDiv.style.zIndex = "999999";
    document.body.appendChild(customAlertDiv);
  }

  if (!stockfishOverlay) {
    stockfishOverlay = document.createElement("div");
    stockfishOverlay.id = "stockfish-loader";
    stockfishOverlay.className = "loader-overlay hidden";
    stockfishOverlay.style.position = "fixed";
    stockfishOverlay.style.inset = "0";
    stockfishOverlay.style.display = "none";
    stockfishOverlay.style.alignItems = "center";
    stockfishOverlay.style.justifyContent = "center";
    stockfishOverlay.style.background = "rgba(0,0,0,0.75)";
    stockfishOverlay.style.zIndex = "99999";
    stockfishOverlay.innerHTML = `
      <div style="background:#1f2122;border:2px solid #ec6090;padding:18px;border-radius:10px;color:white;display:flex;flex-direction:column;align-items:center;">
        <div style="width:46px;height:46px;border-radius:50%;border:6px solid rgba(255,255,255,0.2);border-top-color:#ec6090;animation:sfspin 1s linear infinite;margin-bottom:12px"></div>
        <div>Loading Stockfish AI...</div>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = "@keyframes sfspin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
    document.body.appendChild(stockfishOverlay);
  }

  // ---------- small UI helpers ----------
  function calert(message, duration = 2200) {
    if (!customAlertDiv) { alert(message); return; }
    customAlertDiv.textContent = message;
    customAlertDiv.style.display = "block";
    customAlertDiv.style.opacity = "1";
    setTimeout(() => {
      customAlertDiv.style.opacity = "0";
      setTimeout(() => (customAlertDiv.style.display = "none"), 300);
    }, duration);
  }

  function showStockfishLoader() {
    const el = document.getElementById("stockfish-loader");
    if (!el) return;
    el.style.display = "flex";
    el.classList.remove("hidden");
    el.classList.add("show");
  }

  function hideStockfishLoader() {
    const el = document.getElementById("stockfish-loader");
    if (!el) return;
    el.style.display = "none";
    el.classList.remove("show");
    el.classList.add("hidden");
  }
  
  // ---------- Chess state ----------
  let chess = new window.Chess(); // single instance
  let selected = null; // {row,col}
  let possible = []; // verbose moves
  let lastMove = null; // {from,to}

  // ---------- App state ----------
  let currentUser = null;
  let currentGameId = null;
  let playerColor = null; // 'white'|'black'
  let unsubGameListener = null;
  let unsubChatListener = null;

  // ---------- Engine state ----------
  let engine = null; // Worker or worker-like
  let engineReady = false;
  let engineInitializing = false;
  let engineSearching = false;
  let engineQueue = [];
  let engineInitTimeoutHandle = null;

  // ---------- Engine helpers ----------
  function enginePost(cmd) {
    if (!engine) {
      engineQueue.push(cmd);
      return;
    }
    // queue non-init commands until handshake completes
    if (!engineReady && !/^(uci|isready|ucinewgame|setoption|quit)/.test(cmd)) {
      engineQueue.push(cmd);
      return;
    }
    try {
      engine.postMessage(cmd);
    } catch (e) {
      err("engine.postMessage failed — queuing", e);
      engineQueue.push(cmd);
    }
  }

  function flushEngineQueue() {
    if (!engine) return;
    while (engineQueue.length) {
      const cmd = engineQueue.shift();
      try {
        engine.postMessage(cmd);
      } catch (e) {
        err("flushEngineQueue post failed, requeueing", e);
        engineQueue.unshift(cmd);
        break;
      }
    }
  }

  /**
   * initStockfish(opts)
   * opts:
   *   - showLoader: boolean (default true) — whether to show the overlay during handshake
   *
   * Behavior:
   *   - If engine already exists or is initializing, will not re-create it.
   *   - If showLoader is true, overlay shown while waiting for handshake.
   *   - Engine messages 'readyok' or 'id/option' will mark engineReady and hide loader.
   */
  function initStockfish(opts = {}) {
    const showLoader = typeof opts.showLoader === "boolean" ? opts.showLoader : true;

    if (engine || engineInitializing) {
      log("initStockfish: engine already present or initializing — skipping.");
      return;
    }

    engineInitializing = true;
    engineReady = false;
    engineSearching = false;
    engineQueue = engineQueue || [];

    // Show loader for handshake only if requested
    if (showLoader) showStockfishLoader();

    let created = false;

    // Try creating a Worker
    try {
      if (typeof Worker === "function") {
        try {
          engine = new Worker(STOCKFISH_WORKER_PATH);
          created = true;
          log("initStockfish: worker created from", STOCKFISH_WORKER_PATH);
        } catch (we) {
          warn("initStockfish: worker creation failed", we);
          engine = null;
          created = false;
        }
      }
    } catch (e) {
      warn("initStockfish: Worker not available", e);
      engine = null;
    }

    // Fallback: some CDN builds expose a function window.STOCKFISH()
    if (!created && typeof window.STOCKFISH === "function") {
      try {
        engine = window.STOCKFISH();
        created = true;
        log("initStockfish: using global STOCKFISH() fallback.");
      } catch (e) {
        warn("initStockfish: STOCKFISH() fallback failed", e);
        engine = null;
        created = false;
      }
    }

    if (!created || !engine) {
      engineInitializing = false;
      engineReady = false;
      if (showLoader) hideStockfishLoader();
      calert("Could not start Stockfish engine (worker unavailable).");
      return;
    }

    // Setup message handler
    engine.onmessage = function (ev) {
      const data = ev?.data;
      const line = typeof data === "string" ? data : (data?.text ? data.text : String(data || ""));

      // Handshake flow
      if (/uciok/.test(line)) {
        enginePost("isready");
        return;
      }

      if (/readyok/.test(line)) {
        engineReady = true;
        engineInitializing = false;
        flushEngineQueue();
        // hide loader if we showed it
        if (showLoader) hideStockfishLoader();
        if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
        log("initStockfish: engine ready (readyok).");
        return;
      }

      // Some builds send id/option early — accept as "ready enough"
      if (/^(id |option )/.test(line)) {
        if (!engineReady) {
          engineReady = true;
          engineInitializing = false;
          flushEngineQueue();
          if (showLoader) hideStockfishLoader();
          if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
          log("initStockfish: engine reported id/option; treating as ready.");
        }
        return;
      }

      // bestmove arrives after go
      if (/^bestmove /.test(line)) {
        engineSearching = false;
        const parts = line.split(/\s+/);
        const best = parts[1];
        if (!best || best === "(none)") {
          log("initStockfish: bestmove none");
          return;
        }
        // Only apply bestmove in local mode
        if (!currentGameId) {
          try {
            const moveObj = { from: best.slice(0, 2), to: best.slice(2, 4), promotion: "q" };
            const res = chess.move(moveObj);
            if (res) {
              lastMove = { from: res.from, to: res.to };
              renderBoard();
              if (currentTurnSpan) currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
              checkForEndAndNotify();
            } else {
              warn("initStockfish: engine move rejected by chess.js", moveObj);
            }
          } catch (e) {
            err("initStockfish: applying bestmove failed", e);
          }
        }
        return;
      }

      // Other engine messages can be logged for debugging
      // log("[STOCKFISH]", line);
    };

    engine.onerror = function (e) {
      warn("initStockfish: engine error", e);
      engineInitializing = false;
      engineReady = false;
      engineSearching = false;
      if (showLoader) hideStockfishLoader();
      calert("Engine error (check console).");
    };

    // Safety timeout for handshake
    engineInitTimeoutHandle = setTimeout(() => {
      if (!engineReady) {
        warn("initStockfish: engine init timed out");
        engineInitializing = false;
        engineReady = false;
        engineSearching = false;
        if (showLoader) hideStockfishLoader();
        calert("Engine did not respond in time. Continuing without engine.");
      }
    }, ENGINE_INIT_TIMEOUT_MS);

    // Begin handshake
    try {
      engine.postMessage("uci");
      engine.postMessage("isready");
      engine.postMessage("ucinewgame");
    } catch (e) {
      err("initStockfish: handshake postMessage failed", e);
      engineInitializing = false;
      engineReady = false;
      if (showLoader) hideStockfishLoader();
      calert("Engine handshake failed");
    }
  } // initStockfish

  // Expose initStockfish globally for body onload if needed
  window.initStockfish = initStockfish;

  // ---------- makeAIMove: silent init if needed ----------
  function makeAIMove(depth = ENGINE_GO_DEPTH) {
    if (currentGameId) return; // only local AI
    if (chess.isGameOver()) { checkForEndAndNotify(); return; }

    // If engine absent: initialize silently (no loader)
    if (!engine && !engineInitializing) {
      initStockfish({ showLoader: false });
    }

    engineSearching = true;
    enginePost("position fen " + chess.fen());
    enginePost("go depth " + depth);
  }

  // ---------- Board rendering ----------
  function algebraicFromRC(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
  }
  function rcFromAlgebraic(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square[1], 10);
    return { row: rank, col: file };
  }
  function getPieceUnicode(type, color) {
    const map = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
    const white = map[type.toLowerCase()] || "";
    const blackMap = { "♔": "♚", "♕": "♛", "♖": "♜", "♗": "♝", "♘": "♞", "♙": "♟" };
    return color === "w" ? white : (blackMap[white] || white);
  }

  function statusTextFromGame() {
    if (chess.isGameOver()) {
      if (chess.isCheckmate()) return "Checkmate";
      if (chess.isStalemate()) return "Stalemate";
      if (chess.isInsufficientMaterial()) return "Draw: Insufficient material";
      if (chess.isThreefoldRepetition()) return "Draw: Repetition";
      if (chess.isDraw()) return "Draw";
      return "Game Over";
    }
    if (chess.inCheck()) return `${chess.turn() === "w" ? "White" : "Black"} is in check`;
    return "Playing";
  }

  function clearSelection() {
    selected = null;
    possible = [];
  }

  function clearHighlightClasses() {
    document.querySelectorAll(".square.selected").forEach(el => el.classList.remove("selected"));
    document.querySelectorAll(".square.possible-move").forEach(el => el.classList.remove("possible-move"));
    document.querySelectorAll(".square.last-move").forEach(el => el.classList.remove("last-move"));
    document.querySelectorAll(".square.in-check").forEach(el => el.classList.remove("in-check"));
  }

  function renderBoard() {
    if (!chessboardDiv) return;
    chessboardDiv.innerHTML = "";

    const board = chess.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        sq.classList.add("square", (r + c) % 2 === 0 ? "light" : "dark");
        sq.dataset.row = r;
        sq.dataset.col = c;
        const algebraic = algebraicFromRC(r, c);
        sq.dataset.square = algebraic;

        const piece = board[r][c];
        if (piece) {
          sq.innerHTML = getPieceUnicode(piece.type, piece.color);
          sq.classList.add("piece");
        }

        // lastMove highlight
        if (lastMove) {
          const a = rcFromAlgebraic(lastMove.from);
          const b = rcFromAlgebraic(lastMove.to);
          if ((a.row === r && a.col === c) || (b.row === r && b.col === c)) {
            sq.classList.add("last-move");
          }
        }

        sq.addEventListener("click", onSquareClick);

        chessboardDiv.appendChild(sq);
      }
    }

    if (selected) {
      const selEl = document.querySelector(`.square[data-row="${selected.row}"][data-col="${selected.col}"]`);
      if (selEl) selEl.classList.add("selected");
      possible.forEach(m => {
        const rc = rcFromAlgebraic(m.to);
        const el = document.querySelector(`.square[data-row="${rc.row}"][data-col="${rc.col}"]`);
        if (el) el.classList.add("possible-move");
      });
    }

    // in-check highlight
    if (chess.inCheck()) {
      const turn = chess.turn();
      const board2 = chess.board();
      for (let r2 = 0; r2 < 8; r2++) {
        for (let c2 = 0; c2 < 8; c2++) {
          const p = board2[r2][c2];
          if (p && p.type === "k" && p.color === turn) {
            const el = document.querySelector(`.square[data-row="${r2}"][data-col="${c2}"]`);
            if (el) el.classList.add("in-check");
            break;
          }
        }
      }
    }

    if (currentTurnSpan) currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
    if (gameStatusSpan) gameStatusSpan.textContent = statusTextFromGame();
  }

  // ---------- click handler ----------
  function onSquareClick(e) {
    const el = e.currentTarget;
    const row = parseInt(el.dataset.row, 10);
    const col = parseInt(el.dataset.col, 10);
    const square = algebraicFromRC(row, col);

    // Multiplayer: enforce turns & ownership
    if (currentGameId && playerColor) {
      const mySide = playerColor[0];
      if (mySide !== chess.turn()) { calert("It's not your turn."); return; }
    }

    // If a piece selected -> attempt move
    if (selected && possible && possible.length) {
      const from = algebraicFromRC(selected.row, selected.col);
      if (from === square) { clearSelection(); renderBoard(); return; }

      let mv = null;
      try { mv = chess.move({ from, to: square, promotion: "q" }); } catch (e) { mv = null; }
      clearSelection();

      if (mv) {
        lastMove = { from: mv.from, to: mv.to };
        renderBoard();
        if (chess.isGameOver()) handleGameEnd();

        if (currentGameId) {
          pushGameStateToFirebase(currentGameId);
        } else {
          // Local AI: ask engine to respond
          setTimeout(() => makeAIMove(ENGINE_GO_DEPTH), 260);
        }
        return;
      } else {
        calert("Invalid move");
        renderBoard();
        return;
      }
    }

    // Select piece if any
    const piece = chess.get(square);
    if (!piece) { clearSelection(); renderBoard(); return; }

    if (currentGameId && playerColor && piece.color !== playerColor[0]) {
      calert("That's your opponent's piece!");
      return;
    }

    selected = { row, col };
    possible = chess.moves({ square, verbose: true }) || [];
    renderBoard();
  }

  // ---------- undo ----------
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (chess.history().length === 0) { calert("No moves to undo"); return; }
      chess.undo(); // undo last ply
      if (!currentGameId && chess.history().length > 0) chess.undo(); // undo AI reply too
      lastMove = null;
      clearSelection();
      renderBoard();
    });
  }

  // ---------- game end ----------
  function handleGameEnd() {
    let msg = "Game over.";
    if (chess.isCheckmate()) msg = "Checkmate!";
    else if (chess.isStalemate()) msg = "Stalemate.";
    else if (chess.isInsufficientMaterial()) msg = "Draw: Insufficient material.";
    else if (chess.isThreefoldRepetition()) msg = "Draw: Repetition.";
    else if (chess.isDraw()) msg = "Draw.";

    if (gameStatusSpan) gameStatusSpan.textContent = msg;
    showGameOverModal(msg);

    if (currentGameId) {
      const updates = { status: msg.toLowerCase().replace(/\W+/g, "_") };
      if (chess.isCheckmate()) updates.winner = chess.turn() === "w" ? "Black" : "White";
      db.ref(`chess/${currentGameId}`).update(updates).catch(e => err("status update failed", e));
    }

    // Return to lobby after delay
    setTimeout(() => resetLocalState(), 5200);
  }

  function checkForEndAndNotify() {
    if (chess.isGameOver()) handleGameEnd();
  }

  function showGameOverModal(message) {
    if (!gameOverModal || !gameOverMessage) { calert(message, 3000); return; }
    gameOverMessage.textContent = message;
    gameOverModal.classList.remove("hidden");
    try { gameOverModal.style.display = "flex"; } catch (e) {}
    setTimeout(() => {
      gameOverModal.classList.add("hidden");
      try { gameOverModal.style.display = "none"; } catch (e) {}
    }, 5000);
  }

  // ---------- Lobby / Multiplayer ----------
  function listenForGames() {
  const gameList = document.getElementById("game-list");
  if (!gameList) {
    console.warn("Game list element not found!");
    return;
  }

  const ref = firebase.database().ref("chess");

  ref.on("value", (snapshot) => {
    const games = snapshot.val();
    gameList.innerHTML = "";

    if (!games) {
      const li = document.createElement("li");
      li.textContent = "No active games.";
      li.style.color = "whitesmoke";
      gameList.appendChild(li);
      return;
    }

    Object.entries(games).forEach(([gameId, gameData]) => {
      const li = document.createElement("li");
      li.style.color = "whitesmoke";

      // Status
      let status = "Waiting for opponent";
      if (gameData.playerWhite && gameData.playerBlack) status = "In Progress";
      if (gameData.status) {
        status = String(gameData.status)
          .replace(/_/g, " ")
          .replace(/\b\w/g, (ch) => ch.toUpperCase());
      }

      li.innerHTML = `Game ID: ${gameId} (${status})`;

      // Join as Black (only if currentUser exists)
      if (
        currentUser &&
        !gameData.playerBlack &&
        gameData.playerWhite !== currentUser.uid &&
        (!gameData.status || gameData.status === "waiting")
      ) {
        const joinBtn = document.createElement("button");
        joinBtn.textContent = "Join as Black";
        joinBtn.style.marginLeft = "8px";
        joinBtn.addEventListener("click", () => joinGame(gameId));
        li.appendChild(joinBtn);
      }

      // Rejoin button (if this user is part of game)
      if (
        currentUser &&
        (gameData.playerWhite === currentUser.uid ||
          gameData.playerBlack === currentUser.uid) &&
        gameData.status !== "completed" &&
        gameData.status !== "abandoned"
      ) {
        const rejoinBtn = document.createElement("button");
        rejoinBtn.textContent = "Rejoin";
        rejoinBtn.style.marginLeft = "8px";
        rejoinBtn.addEventListener("click", () => joinGame(gameId));
        li.appendChild(rejoinBtn);
      }

      gameList.appendChild(li);
    });
  });
}



  async function createGame() {
    if (!currentUser) { calert("Sign in first"); return; }
    try {
      const ref = db.ref("chess").push();
      const gid = ref.key;
      const payload = {
        playerWhite: currentUser.uid,
        playerBlack: null,
        board: chess.fen(),
        turn: chess.turn(),
        status: "waiting",
        chat: [],
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };
      await ref.set(payload);
      await joinGame(gid);
    } catch (e) {
      err("createGame failed", e);
      calert("Could not create game.");
    }
  }

  async function pushGameStateToFirebase(gid) {
    if (!gid) return;
    try {
      await db.ref(`chess/${gid}`).update({
        board: chess.fen(),
        turn: chess.turn(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (e) {
      err("pushGameStateToFirebase failed", e);
    }
  }

  function subscribeToGame(gid) {
    try {
      const gref = db.ref(`chess/${gid}`);
      if (unsubGameListener) try { gref.off("value", unsubGameListener); } catch (e) {}
      const handler = snap => {
        const data = snap.val();
        if (!data) {
          calert("Game removed");
          resetLocalState();
          return;
        }
        if (data.board && data.board !== chess.fen()) {
          try { chess.load(data.board); renderBoard(); } catch (e) { warn("Invalid FEN from server", e); chess.reset(); renderBoard(); }
        }
        if (data.status) {
          if (gameStatusSpan) gameStatusSpan.textContent = String(data.status).replace(/_/g, " ");
        }
      };
      gref.on("value", handler);
      unsubGameListener = handler;

      // chat
      const cref = db.ref(`chess/${gid}/chat`);
      if (unsubChatListener) try { cref.off("child_added", unsubChatListener); } catch (e) {}
      const chatHandler = snap => {
        const m = snap.val();
        if (!m) return;
        const p = document.createElement("p");
        p.textContent = `[${new Date(m.ts || Date.now()).toLocaleTimeString()}] ${m.user || "Anon"}: ${m.text}`;
        if (m.userId === currentUser?.uid) p.classList.add("user");
        messagesDiv.appendChild(p);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      };
      cref.on("child_added", chatHandler);
      unsubChatListener = chatHandler;
    } catch (e) {
      err("subscribeToGame failed", e);
    }
  }

  async function joinGame(gid) {
    if (!currentUser) { calert("Sign in first"); return; }
    if (!gid) { calert("No Game ID"); return; }
    try {
      const ref = db.ref(`chess/${gid}`);
      let assigned = null;
      const tx = await ref.transaction(current => {
        if (!current) return current;
        if (current.playerWhite === currentUser.uid) { assigned = "white"; return current; }
        if (current.playerBlack === currentUser.uid) { assigned = "black"; return current; }
        if (!current.playerWhite && current.status === "waiting") { current.playerWhite = currentUser.uid; assigned = "white"; }
        else if (!current.playerBlack && current.status === "waiting") { current.playerBlack = currentUser.uid; assigned = "black"; }
        else return;
        if (current.playerWhite && current.playerBlack && current.status === "waiting") current.status = "playing";
        return current;
      });

      if (!tx.committed || !assigned) { calert("Could not join (full/conflict)"); return; }

      currentGameId = gid;
      playerColor = assigned;
      if (gameTitle) gameTitle.textContent = `Game ${gid} (${playerColor})`;
      if (gameLobby) gameLobby.style.display = "none";
      if (chessGameDiv) chessGameDiv.style.display = "block";

      const snap = await ref.get();
      const data = snap.val();
      if (data?.board) {
        try { chess.load(data.board); } catch (e) { warn("Load FEN failed", e); chess.reset(); }
      } else {
        chess.reset();
      }
      renderBoard();
      if (currentTurnSpan) currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
      if (gameStatusSpan) gameStatusSpan.textContent = "Playing";
      subscribeToGame(gid);
    } catch (e) {
      err("joinGame failed", e);
      calert("Join failed");
    }
  }

  function leaveGame() {
    if (currentGameId && currentUser) {
      try {
        const ref = db.ref(`chess/${currentGameId}`);
        ref.transaction(g => {
          if (!g) return g;
          if (g.playerWhite === currentUser.uid) g.playerWhite = null;
          if (g.playerBlack === currentUser.uid) g.playerBlack = null;
          if (!g.playerWhite && !g.playerBlack) return null;
          if (g.status === "playing" && (!g.playerWhite || !g.playerBlack)) g.status = "abandoned";
          return g;
        }).then(() => {
          try { db.ref(`chess/${currentGameId}`).off("value", unsubGameListener || undefined); } catch (e) {}
          try { db.ref(`chess/${currentGameId}/chat`).off("child_added", unsubChatListener || undefined); } catch (e) {}
          unsubGameListener = null; unsubChatListener = null;
          resetLocalState();
        }).catch(e => { err("leaveGame tx failed", e); resetLocalState(); });
      } catch (e) { err("leaveGame error", e); resetLocalState(); }
    } else {
      resetLocalState();
    }
  }

  function resetLocalState() {
    currentGameId = null;
    playerColor = null;
    chess.reset();
    lastMove = null;
    clearSelection();
    renderBoard();

    // terminate engine only if we want to free memory; if you want persistence between AI sessions, remove termination
    if (engine) {
      try { engine.terminate?.(); } catch (e) { warn("engine terminate failed", e); }
    }
    engine = null;
    engineReady = false;
    engineInitializing = false;
    engineSearching = false;
    engineQueue = [];
    if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }

    if (chessGameDiv) chessGameDiv.style.display = "none";
    if (gameLobby) gameLobby.style.display = "block";
    if (messagesDiv) messagesDiv.innerHTML = "";
    if (currentTurnSpan) currentTurnSpan.textContent = "White";
    if (gameStatusSpan) gameStatusSpan.textContent = "Not started";
    hideStockfishLoader();
  }

  // ---------- Chat ----------
  function sendChat() {
    const txt = (chatInput?.value || "").trim();
    if (!txt) return;
    if (!currentGameId) { calert("Chat available in multiplayer only"); return; }
    const cref = db.ref(`chess/${currentGameId}/chat`);
    const payload = {
      text: txt,
      user: currentUser?.isAnonymous ? "Guest" : (currentUser?.email || "Player"),
      userId: currentUser?.uid || null,
      ts: firebase.database.ServerValue.TIMESTAMP
    };
    try {
      cref.push(payload).catch(e => err("chat push fail", e));
    } catch (e) {
      err("chat push outer fail", e);
    }
    if (chatInput) chatInput.value = "";
  }

  // ---------- AI Mode ----------
  function startAIGameRandomFirst() {
    currentGameId = null;
    chess.reset();
    lastMove = null;
    clearSelection();
    renderBoard();

    if (chessGameDiv) chessGameDiv.style.display = "block";
    if (gameLobby) gameLobby.style.display = "none";

    if (Math.random() < 0.5) {
      playerColor = "white";
      if (gameTitle) gameTitle.textContent = "Play vs AI (You are White)";
      calert("You play first (White)");
      // do nothing — player moves
    } else {
      playerColor = "black";
      if (gameTitle) gameTitle.textContent = "Play vs AI (You are Black)";
      calert("AI plays first (White)");
      // initialize engine silently, then make AI move
      if (!engine && !engineInitializing) initStockfish({ showLoader: false });
      setTimeout(() => makeAIMove(ENGINE_GO_DEPTH), 420);
    }

    if (messagesDiv && messagesDiv.parentElement) messagesDiv.parentElement.style.display = "none";
    if (gameStatusSpan) gameStatusSpan.textContent = "Playing vs AI";
  }

  // ---------- UI wiring ----------
  if (createGameBtn) createGameBtn.addEventListener("click", createGame);
  if (joinGameBtn) joinGameBtn.addEventListener("click", () => {
    const gid = (gameIdInput?.value || "").trim();
    if (!gid) return calert("Enter Game ID");
    joinGame(gid);
  });
  if (playVsAIBtn) playVsAIBtn.addEventListener("click", startAIGameRandomFirst);
  if (sendChatBtn) sendChatBtn.addEventListener("click", sendChat);
  if (chatInput) chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
  if (leaveGameBtn) leaveGameBtn.addEventListener("click", leaveGame);

  // ---------- Inject compact auth UI and hide when signed-in ----------
  function injectAuthMiniUI() {
    if (document.getElementById("auth-container")) return;
    const holder = document.createElement("div");
    holder.id = "auth-container";
    holder.style.margin = "18px auto";
    holder.style.maxWidth = "520px";
    holder.style.padding = "12px";
    holder.style.display = "flex";
    holder.style.flexDirection = "column";
    holder.style.gap = "8px";
    holder.style.alignItems = "center";
    holder.innerHTML = `
      <h3 style="color:whitesmoke;margin:0">Sign In</h3>
      <input id="auth-email" type="email" placeholder="Email" style="padding:8px;width:80%;border-radius:6px;background:#4a4a4a;color:white;border:1px solid #333;">
      <input id="auth-pass" type="password" placeholder="Password" style="padding:8px;width:80%;border-radius:6px;background:#4a4a4a;color:white;border:1px solid #333;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px">
        <button id="btn-signup">Sign Up</button>
        <button id="btn-signin">Sign In</button>
        <button id="btn-guest">Continue as Guest</button>
        <button id="btn-signout" style="display:none;background:#e74c3c">Sign Out</button>
      </div>
    `;
    const pageContent = document.querySelector(".page-content") || document.body;
    pageContent.insertBefore(holder, pageContent.firstChild);

    const emailEl = holder.querySelector("#auth-email");
    const passEl = holder.querySelector("#auth-pass");
    const btnSignUp = holder.querySelector("#btn-signup");
    const btnSignIn = holder.querySelector("#btn-signin");
    const btnGuest = holder.querySelector("#btn-guest");
    const btnSignOut = holder.querySelector("#btn-signout");

    btnSignUp.addEventListener("click", async () => {
      try {
        const email = (emailEl.value || "").trim();
        const pass = passEl.value || "";
        if (!email || !pass) return calert("Enter email & password");
        await auth.createUserWithEmailAndPassword(email, pass);
        calert("Account created & signed in!");
      } catch (e) {
        err("signup", e);
        calert(e.message || "Sign up failed");
      }
    });
    btnSignIn.addEventListener("click", async () => {
      try {
        const email = (emailEl.value || "").trim();
        const pass = passEl.value || "";
        if (!email || !pass) return calert("Enter email & password");
        await auth.signInWithEmailAndPassword(email, pass);
        calert("Signed in!");
      } catch (e) {
        err("signin", e);
        calert(e.message || "Sign in failed");
      }
    });
    btnGuest.addEventListener("click", async () => {
      try {
        await auth.signInAnonymously();
        calert("Signed in as guest");
      } catch (e) {
        err("anon", e);
        calert(e.message || "Guest sign-in failed");
      }
    });
    btnSignOut.addEventListener("click", async () => {
      try {
        await auth.signOut();
        calert("Signed out");
      } catch (e) {
        err("signout", e);
        calert(e.message || "Sign out failed");
      }
    });

    // toggle signout button based on auth state and hide container when signed in
    auth.onAuthStateChanged(u => {
      btnSignOut.style.display = u ? "inline-block" : "none";
      holder.style.display = u ? "none" : "flex";
    });
  }
  injectAuthMiniUI();

  // ---------- AUTH listener ----------
  auth.onAuthStateChanged(user => {
    currentUser = user || null;
    if (authStatus) {
      if (user) {
        const name = user.isAnonymous ? "Guest" : (user.email || "User");
        authStatus.textContent = `Signed in as: ${name}`;
        authStatus.style.color = "#2ecc71";
        if (gameLobby) gameLobby.style.display = "block";
        // hide injected sign-in UI if present
        const authContainer = document.getElementById("auth-container");
        if (authContainer) authContainer.style.display = "none";
        listenForGames();
      } else {
        authStatus.textContent = "Not signed in";
        authStatus.style.color = "#e74c3c";
        if (gameLobby) gameLobby.style.display = "none";
        const authContainer = document.getElementById("auth-container");
        if (authContainer) authContainer.style.display = "flex";
      }
    }
  });

  // ---------- initial render ----------
  try { chess.reset(); renderBoard(); } catch (e) { warn("initial render failed", e); }

  // Expose debug helpers
  window.__script14 = {
    chess, renderBoard, initStockfish, makeAIMove, startAIGameRandomFirst, resetLocalState, listenForGames, joinGame, createGame
  };

  log("script14 ready.");
})(); // IIFE end
