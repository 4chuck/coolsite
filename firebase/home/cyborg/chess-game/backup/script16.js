/* script15.js
   Full game script (updated) — Firebase Auth + Lobby + Multiplayer + Chat + Local AI (Stockfish)
   ---------------------------------------------------------------------
   Key guarantees in this build:
   - Respects your Realtime DB security rules (no root `.update()` at /chess/$gameId).
   - Uses child-level `.set()` or transactions for writes (board/turn/status/winner/playerWhite/playerBlack/createdAt/updatedAt/chat).
   - Keeps createdAt / updatedAt writes (uses ServerValue.TIMESTAMP).
   - Robust Stockfish init with handshake, queueing, optional loader, engine keep-alive.
   - Chat uses fields expected by rules: { sender, message, timestamp }.
   - Auto-cleanup helpers provided (12 hours) but actual deletion attempts respect rules.
   - Defensive checks throughout.
   - Exported debug helpers under window.__script15
   ---------------------------------------------------------------------
   NOTE: replace firebaseConfig values with your real config if needed.
*/

(function () {
  const TAG = "[script15]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const err = (...a) => console.error(TAG, ...a);

  // -------------------------
  // CONFIG
  // -------------------------
  const STOCKFISH_WORKER_PATH = "stockfish/stockfish-17.1-lite-single-03e3232.js";
  const ENGINE_GO_DEPTH = 12;
  const ENGINE_INIT_TIMEOUT_MS = 12000;
  const CHAT_LISTEN_LIMIT = 50;
  const GAME_CLEANUP_HOURS = 12;
  const GAME_CLEANUP_CHECK_INTERVAL_MS = 1000 * 60 * 60; // hourly
  const GAME_CLEANUP_DELAY_AFTER_END_MS = 5000; // 5s before attempt to remove finished games
  const KEEP_ENGINE_ALIVE_BETWEEN_LOCAL_GAMES = true;

  // -------------------------
  // FIREBASE CONFIG (use your config)
  // -------------------------
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

  // -------------------------
  // INIT FIREBASE
  // -------------------------
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

  const auth = firebase.auth();
  const db = firebase.database();

  // -------------------------
  // PRE-FLIGHT: chess.js
  // -------------------------
  if (!window.Chess) {
    err("chess.js not found. Load chess.js (UMD or set window.Chess) before script15.js");
    return;
  }

  // -------------------------
  // DOM refs (graceful fallback creation)
  // -------------------------
  const getById = id => document.getElementById(id);
  const authStatus = getById("auth-status");
  const gameLobby = getById("game-lobby");
  const createGameBtn = getById("create-game-btn");
  const gameList = getById("game-list");
  const gameIdInput = getById("game-id-input");
  const joinGameBtn = getById("join-game-btn");
  const playVsAIBtn = getById("play-ai-btn");

  const chessGameDiv = getById("chess-game");
  const gameTitle = getById("game-title");
  const chessboardDiv = getById("chessboard");
  const currentTurnSpan = getById("current-turn");
  const gameStatusSpan = getById("game-status");

  const messagesDiv = getById("messages");
  const chatInput = getById("chat-input");
  const sendChatBtn = getById("send-chat-btn");

  const leaveGameBtn = getById("leave-game-btn");
  const undoBtn = getById("undo-btn");

  let customAlertDiv = getById("custom-alert");
  let gameOverModal = getById("game-over-modal");
  let gameOverMessage = getById("game-over-message");
  let stockfishOverlay = getById("stockfish-loader");

  // create minimal fallback elements when missing
  function ensureElement(id, tag = "div", styles = {}) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      Object.assign(el.style, styles);
      document.body.appendChild(el);
    }
    return el;
  }

  if (!customAlertDiv) {
    customAlertDiv = ensureElement("custom-alert", "div", {
      position: "fixed",
      left: "50%",
      top: "8%",
      transform: "translateX(-50%)",
      background: "#3498db",
      color: "#fff",
      padding: "10px 18px",
      borderRadius: "8px",
      display: "none",
      zIndex: "999999",
    });
  }

  if (!stockfishOverlay) {
    stockfishOverlay = ensureElement("stockfish-loader", "div", {
      position: "fixed",
      inset: "0",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.75)",
      zIndex: "99999"
    });
    stockfishOverlay.className = "loader-overlay hidden";
    stockfishOverlay.innerHTML = `
      <div style="background:#1f2122;border:2px solid #ec6090;padding:18px;border-radius:10px;color:white;display:flex;flex-direction:column;align-items:center;">
        <div style="width:46px;height:46px;border-radius:50%;border:6px solid rgba(255,255,255,0.2);border-top-color:#ec6090;animation:sfspin 1s linear infinite;margin-bottom:12px"></div>
        <div>Loading Stockfish AI...</div>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = "@keyframes sfspin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }

  // -------------------------
  // small UI helpers
  // -------------------------
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
    if (!stockfishOverlay) return;
    stockfishOverlay.style.display = "flex";
    stockfishOverlay.classList.remove("hidden");
    stockfishOverlay.classList.add("show");
  }

  function hideStockfishLoader() {
    if (!stockfishOverlay) return;
    stockfishOverlay.style.display = "none";
    stockfishOverlay.classList.remove("show");
    stockfishOverlay.classList.add("hidden");
  }

  // -------------------------
  // Chess state
  // -------------------------
  let chess = new window.Chess();
  let selected = null; // {row,col}
  let possible = []; // verbose moves
  let lastMove = null; // {from,to}

  // -------------------------
  // App state
  // -------------------------
  let currentUser = null;
  let currentGameId = null;
  let playerColor = null; // 'white' | 'black'
  let unsubGameListener = null;
  let unsubChatListener = null;

  // -------------------------
  // Engine (Stockfish) state
  // -------------------------
  let engine = null;
  let engineReady = false;
  let engineInitializing = false;
  let engineSearching = false;
  let engineQueue = [];
  let engineInitTimeoutHandle = null;

  // -------------------------
  // Engine helpers & queueing
  // -------------------------
  function enginePost(cmd) {
    if (!engine) {
      engineQueue.push(cmd);
      return;
    }
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

  function initStockfish(opts = {}) {
    const showLoader = typeof opts.showLoader === "boolean" ? opts.showLoader : true;
    const forceRestart = !!opts.forceRestart;

    if ((engine || engineInitializing) && !forceRestart) {
      log("initStockfish: engine already present or initializing — skipping.");
      return;
    }

    if (forceRestart && engine) {
      try { engine.terminate?.(); } catch (e) { warn("engine terminate failed", e); }
      engine = null;
      engineReady = false;
      engineInitializing = false;
      engineSearching = false;
      engineQueue = [];
      if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
    }

    engineInitializing = true;
    engineReady = false;
    engineSearching = false;
    engineQueue = engineQueue || [];

    if (showLoader) showStockfishLoader();

    let created = false;

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

    engine.onmessage = function (ev) {
      const data = ev?.data;
      const line = typeof data === "string" ? data : (data?.text ? data.text : String(data || ""));
      // handshake
      if (/uciok/.test(line)) {
        enginePost("isready");
        return;
      }
      if (/readyok/.test(line)) {
        engineReady = true;
        engineInitializing = false;
        flushEngineQueue();
        if (showLoader) hideStockfishLoader();
        if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
        log("initStockfish: engine ready (readyok).");
        return;
      }
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
      // bestmove
      if (/^bestmove /.test(line)) {
        engineSearching = false;
        const parts = line.split(/\s+/);
        const best = parts[1];
        if (!best || best === "(none)") {
          log("initStockfish: bestmove none");
          return;
        }
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
      // other engine messages (ignored by default)
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

  window.initStockfish = initStockfish; // expose

  function makeAIMove(depth = ENGINE_GO_DEPTH) {
    if (currentGameId) return;
    if (chess.isGameOver()) { checkForEndAndNotify(); return; }

    if (!engine && !engineInitializing) {
      initStockfish({ showLoader: false });
    }

    engineSearching = true;
    enginePost("position fen " + chess.fen());
    enginePost("go depth " + depth);
  }

  function terminateEngine() {
    if (engine) {
      try { engine.terminate?.(); } catch (e) { warn("engine terminate failed", e); }
    }
    engine = null;
    engineReady = false;
    engineInitializing = false;
    engineSearching = false;
    engineQueue = [];
    if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
  }

  // -------------------------
  // helpers: algebraic conversions & unicode
  // -------------------------
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

  // -------------------------
  // Board rendering
  // -------------------------
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

  // -------------------------
  // square click handler
  // -------------------------
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
          // push per-child writes (board, turn, updatedAt) using transaction to comply with rules
          pushGameStateToFirebase(currentGameId).catch(e => err("pushGameStateToFirebase failed", e));
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

  // -------------------------
  // Undo handler
  // -------------------------
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (chess.history().length === 0) { calert("No moves to undo"); return; }
      chess.undo();
      if (!currentGameId && chess.history().length > 0) chess.undo();
      lastMove = null;
      clearSelection();
      renderBoard();
    });
  }

  // -------------------------
  // Game end handling
  // -------------------------
  async function handleGameEnd() {
    let msg = "Game over.";
    if (chess.isCheckmate()) msg = "Checkmate!";
    else if (chess.isStalemate()) msg = "Stalemate.";
    else if (chess.isInsufficientMaterial()) msg = "Draw: Insufficient material.";
    else if (chess.isThreefoldRepetition()) msg = "Draw: Repetition.";
    else if (chess.isDraw()) msg = "Draw.";

    if (gameStatusSpan) gameStatusSpan.textContent = msg;
    showGameOverModal(msg);

    if (currentGameId) {
      const statusKey = msg.toLowerCase().replace(/\W+/g, "_");
      try {
        // set status and winner via child-level sets (not root update)
        await db.ref(`chess/${currentGameId}/status`).set(statusKey);
        if (chess.isCheckmate()) {
          const winner = chess.turn() === "w" ? "Black" : "White";
          await db.ref(`chess/${currentGameId}/winner`).set(winner);
        }
        await db.ref(`chess/${currentGameId}/updatedAt`).set(firebase.database.ServerValue.TIMESTAMP);
      } catch (e) {
        err("status update failed", e);
      }
    }

    // Return to lobby after delay (UI cleanup handled in subscription which may delete game)
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

  // -------------------------
  // Lobby / Multiplayer
  // -------------------------
  function listenForGames() {
    try {
      const ref = db.ref("chess");
      ref.off();
      ref.on("value", snap => {
        if (!gameList) return;
        gameList.innerHTML = "";
        const games = snap.val();
        if (!games) {
          const li = document.createElement("li");
          li.textContent = "No active games.";
          gameList.appendChild(li);
          return;
        }
        Object.entries(games).forEach(([gid, gdata]) => {
          const li = document.createElement("li");
          li.style.color = "whitesmoke";
          let status = gdata.status || (gdata.playerWhite && gdata.playerBlack ? "playing" : "waiting");
          status = String(status).replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
          li.innerHTML = `Game ID: ${gid} (${status})`;

          if (!gdata.playerBlack && gdata.playerWhite !== currentUser?.uid && (!gdata.status || gdata.status === "waiting")) {
            const btn = document.createElement("button");
            btn.textContent = "Join as Black";
            btn.style.marginLeft = "8px";
            btn.addEventListener("click", () => joinGame(gid));
            li.appendChild(btn);
          }

          if ((gdata.playerWhite === currentUser?.uid || gdata.playerBlack === currentUser?.uid) && gdata.status !== "completed" && gdata.status !== "abandoned") {
            const rejoin = document.createElement("button");
            rejoin.textContent = "Rejoin";
            rejoin.style.marginLeft = "8px";
            rejoin.addEventListener("click", () => joinGame(gid));
            li.appendChild(rejoin);
          }

          gameList.appendChild(li);
        });
      });
    } catch (e) {
      err("listenForGames failed", e);
    }
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
        chat: null, // start null; chat children will be pushed
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };
      // set at new node (rules allow new node writes)
      await ref.set(payload);
      await joinGame(gid);
    } catch (e) {
      err("createGame failed", e);
      calert("Could not create game.");
    }
  }

  // pushGameStateToFirebase: use transaction so rules that check existing turn/player are satisfied
  async function pushGameStateToFirebase(gid) {
    if (!gid) return;
    if (!currentUser) return;
    try {
      const ref = db.ref(`chess/${gid}`);

      // We'll attempt a transaction that:
      // - Verifies node exists
      // - Verifies current server-turn corresponds to the player who is making this move (i.e. before the move)
      // - Sets board to current chess.fen(), sets turn to chess.turn(), updates updatedAt
      // The server-side rules expect the board write only if the user is the correct player and the stored turn matches.
      const res = await ref.transaction(current => {
        if (!current) return; // abort if no game
        // Determine which side server thinks is to move right now (before this transaction)
        const serverTurn = current.turn || 'w'; // fallback
        // Our local chess.turn() AFTER move is the opponent turn; previousTurn is the side who moved
        // previousTurn should be the opposite of chess.turn()
        const previousTurn = (chess.turn() === 'w') ? 'b' : 'w';

        // check: the user must be that previousTurn player according to server data
        const isWhiteMover = (previousTurn === 'w' && current.playerWhite === currentUser.uid);
        const isBlackMover = (previousTurn === 'b' && current.playerBlack === currentUser.uid);

        // serverTurn should equal previousTurn (i.e. it was that player's turn on server)
        if (serverTurn !== previousTurn) {
          // abort: server's turn doesn't match our expected previousTurn
          return;
        }

        if (!(isWhiteMover || isBlackMover)) {
          // abort: we're not listed as the mover on server
          return;
        }

        // commit child changes (modify the object)
        current.board = chess.fen();
        current.turn = chess.turn();
        current.updatedAt = firebase.database.ServerValue.TIMESTAMP;
        return current;
      }, undefined, false); // no local events from transaction callback

      if (!res.committed) {
        warn("pushGameStateToFirebase: transaction aborted or not committed", res);
      } else {
        log("pushGameStateToFirebase: committed");
      }
    } catch (e) {
      err("pushGameStateToFirebase failed", e);
    }
  }

  function subscribeToGame(gid) {
    try {
      const gref = db.ref(`chess/${gid}`);

      // detach old listener if any
      if (unsubGameListener) {
        try { gref.off("value", unsubGameListener); } catch (e) {}
      }

      // main game handler
      const handler = snap => {
        const data = snap.val();
        if (!data) {
          calert("Game removed");
          resetLocalState();
          return;
        }

        // sync board state
        if (data.board && data.board !== chess.fen()) {
          try {
            chess.load(data.board);
            renderBoard();
          } catch (e) {
            warn("Invalid FEN from server", e);
            chess.reset();
            renderBoard();
          }
        }

        // update status text
        if (data.status) {
          if (gameStatusSpan) gameStatusSpan.textContent = String(data.status).replace(/_/g, " ");
        }

        // game over modal + auto cleanup
        if (data.status && (data.status === "checkmate" || data.status === "stalemate" || data.status.startsWith("draw"))) {
          showGameOverModal(`Game Over! ${data.winner ? data.winner + " wins!" : "It is a draw!"}`);
          setTimeout(() => {
            db.ref(`chess/${gid}`).remove().catch(e => warn("Failed to remove finished game:", e));
          }, GAME_CLEANUP_DELAY_AFTER_END_MS);
        }
      };

      gref.on("value", handler);
      unsubGameListener = handler;

      // chat listener (limit to last N)
      const cref = db.ref(`chess/${gid}/chat`).limitToLast(CHAT_LISTEN_LIMIT);

      if (unsubChatListener) {
        try { cref.off("child_added", unsubChatListener); } catch (e) {}
      }

      const chatHandler = snap => {
        const m = snap.val();
        if (!m) return;

        const p = document.createElement("p");
        const tsVal = (typeof m.timestamp === "number") ? m.timestamp : Date.now();
        const timeStr = new Date(tsVal).toLocaleTimeString();

        const senderUid = m.sender;
        let displayName = senderUid;

        // show "You" for current user
        if (senderUid === currentUser?.uid) {
          displayName = "You";
          p.classList.add("user");
          p.textContent = `[${timeStr}] ${displayName}: ${m.message || ""}`;
          messagesDiv.appendChild(p);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
          return;
        }

        // optional: resolve UID → user profile/email if you maintain `/users`
        db.ref(`users/${senderUid}/profile`).once("value").then(snapProf => {
          const prof = snapProf.val();
          if (prof?.name) {
            p.textContent = `[${timeStr}] ${prof.name}: ${m.message || ""}`;
          } else if (prof?.email) {
            p.textContent = `[${timeStr}] ${prof.email}: ${m.message || ""}`;
          } else {
            p.textContent = `[${timeStr}] ${senderUid}: ${m.message || ""}`;
          }
          messagesDiv.appendChild(p);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }).catch(() => {
          p.textContent = `[${timeStr}] ${senderUid}: ${m.message || ""}`;
          messagesDiv.appendChild(p);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
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

    if (!KEEP_ENGINE_ALIVE_BETWEEN_LOCAL_GAMES && engine) {
      try { engine.terminate?.(); } catch (e) { warn("engine terminate failed", e); }
      engine = null;
      engineReady = false;
      engineInitializing = false;
      engineSearching = false;
      engineQueue = [];
      if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
    }

    if (chessGameDiv) chessGameDiv.style.display = "none";
    if (gameLobby) gameLobby.style.display = "block";
    if (messagesDiv) messagesDiv.innerHTML = "";
    if (currentTurnSpan) currentTurnSpan.textContent = "White";
    if (gameStatusSpan) gameStatusSpan.textContent = "Not started";
    hideStockfishLoader();
  }

  // -------------------------
  // Chat (compliant with rules: sender, message, timestamp)
  // -------------------------
  function sendMessage(gid, text) {
    if (!currentUser) {
      calert("You must be logged in to chat");
      return;
    }
    if (!gid) {
      calert("No Game ID");
      return;
    }
    if (!text || !text.trim()) return;

    const msg = {
      sender: currentUser.uid,          // must equal auth.uid
      message: text.trim(),             // string
      timestamp: Date.now()             // number
    };

    db.ref(`chess/${gid}/chat`).push(msg)
      .catch(e => {
        warn("Failed to send message:", e);
        // optional UI feedback
        calert("Failed to send message (permission or network).");
      });
  }

  // Provide wrapper used by UI bindings so existing code calling sendChat still works
  function sendChat() {
    if (!currentGameId) { calert("Chat available in multiplayer only"); return; }
    const text = (chatInput?.value || "").trim();
    if (!text) return;
    sendMessage(currentGameId, text);
    if (chatInput) chatInput.value = "";
  }

  // -------------------------
  // AI Mode helpers
  // -------------------------
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
    } else {
      playerColor = "black";
      if (gameTitle) gameTitle.textContent = "Play vs AI (You are Black)";
      calert("AI plays first (White)");
      if (!engine && !engineInitializing) initStockfish({ showLoader: false });
      setTimeout(() => makeAIMove(ENGINE_GO_DEPTH), 420);
    }

    if (messagesDiv && messagesDiv.parentElement) messagesDiv.parentElement.style.display = "none";
    if (gameStatusSpan) gameStatusSpan.textContent = "Playing vs AI";
  }

  // -------------------------
  // UI wiring
  // -------------------------
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

  // -------------------------
  // Inject compact auth UI (optional) and hide when signed-in
  // -------------------------
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

  // -------------------------
  // AUTH listener
  // -------------------------
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

  // -------------------------
  // listenToGameChanges wrapper (keeps compatibility)
  // -------------------------
  function listenToGameChanges(gameId) {
    subscribeToGame(gameId);
  }

  // -------------------------
  // Chat listener shorthand
  // -------------------------
  function listenToChat(gameId) {
    // reuse subscribeToGame, which already attaches chat listener
    subscribeToGame(gameId);
  }

  // -------------------------
  // Game cleanup job (server-side or client attempt)
  // -------------------------
  async function cleanupOldGamesClient() {
    try {
      const cutoff = Date.now() - GAME_CLEANUP_HOURS * 3600 * 1000;
      const snap = await db.ref("chess").once("value");
      const games = snap.val();
      if (!games) return;
      Object.entries(games).forEach(([gid, g]) => {
        if (g && g.createdAt && typeof g.createdAt === "number" && g.createdAt < cutoff) {
          // attempt to remove; may be denied by rules if players present
          db.ref(`chess/${gid}`).remove().then(() => {
            log("Deleted old game", gid);
          }).catch(e => warn("Could not delete old game (may be rule-protected):", gid, e));
        }
      });
    } catch (e) {
      warn("cleanupOldGamesClient failed", e);
    }
  }
  setInterval(cleanupOldGamesClient, GAME_CLEANUP_CHECK_INTERVAL_MS);

  // -------------------------
  // Utilities: export PGN / FEN, debug helpers
  // -------------------------
  function exportFEN() {
    return chess.fen();
  }

  function exportPGN() {
    try {
      return chess.pgn();
    } catch (e) {
      warn("exportPGN failed", e);
      return "";
    }
  }

  function downloadText(filename, text) {
    try {
      const a = document.createElement("a");
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 250);
    } catch (e) {
      warn("downloadText failed", e);
    }
  }

  // -------------------------
  // Initial render
  // -------------------------
  try {
    chess.reset();
    renderBoard();
  } catch (e) {
    warn("initial render failed", e);
  }

  // Expose debug helpers
  window.__script15 = {
    chess,
    renderBoard,
    initStockfish,
    makeAIMove,
    startAIGameRandomFirst,
    resetLocalState,
    listenForGames,
    joinGame,
    createGame,
    terminateEngine,
    exportFEN,
    exportPGN,
    pushGameStateToFirebase: () => pushGameStateToFirebase(currentGameId),
    sendMessage: (gid, text) => sendMessage(gid, text),
    setEngineKeepAlive(value) { /* noop for compat; use constant above */ },
  };

  log("script15 ready.");
})(); // IIFE end
