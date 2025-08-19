/* --------------------------------------------------------------
   script2.js  —  Chess Game (Multiplayer + AI) with move highlighting
   --------------------------------------------------------------
   - Firebase Multiplayer (lobby, join, rejoin, chat, game lifecycle)
   - Local vs Stockfish AI mode (Web Worker, UCI handshake)
   - Legal move highlighting (always accurate after each move)
   - Robust click/selection logic (no crashes when piece has no moves)
   - Generous logging for debugging
----------------------------------------------------------------- */

/* =========================
   0) GLOBAL GUARD / LOGGING
   ========================= */
(function () {
  const TAG = "[script2]";
  const log = (...args) => console.log(TAG, ...args);
  const warn = (...args) => console.warn(TAG, ...args);
  const err = (...args) => console.error(TAG, ...args);

  log("[INIT] script loaded. Ready.");

  /* =========================
     1) Firebase (compat SDK)
     ========================= */
  // NOTE: Your HTML already includes firebase compat scripts.
  // Keys are expected to be the same as the page that loaded this script.

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

  // Avoid re-initialization if script reloaded
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

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

  /* =========================
     3) CHESS STATE (chess.js)
     ========================= */
  // chess.js is injected by HTML via ESM (window.Chess)
  const game = new window.Chess(); // single game instance used for both modes

  // Selection / highlighting state
  let selectedSquare = null;            // e.g., "e2"
  let selectedMoves = [];               // legal destination squares for selectedSquare (strings)
  let lastMoveSquares = null;           // {from, to} of the last executed move (for styling)
  let hoverSquare = null;               // for optional hover highlight (not required)
  let highlightStyle = {
    selected: "selected",               // CSS class for selected square
    legal: "legal-move",                // CSS for legal move destination
    capture: "legal-capture",           // CSS for legal capture destination (optional)
    lastMove: "last-move",              // CSS for squares involved in last move
    inCheck: "in-check",                // CSS for king in check
  };

  /* ===================================
     4) APP STATE (Multiplayer / Local)
     =================================== */
  let currentUser = null;               // Firebase user object
  let currentGameId = null;             // Realtime Database node key (null => local/AI mode)
  let playerColor = null;               // 'white' | 'black' in multiplayer; 'w' for white in AI mode
  let unsubGame = null;                 // function to detach game listener
  let unsubChat = null;                 // function to detach chat listener

  /* =========================
     5) CUSTOM ALERT (Toast)
     ========================= */
  function calert(message, duration = 2000) {
    if (!customAlertDiv) return;
    customAlertDiv.textContent = message;
    customAlertDiv.style.display = "block";
    // force reflow to trigger CSS transition
    customAlertDiv.offsetHeight;
    customAlertDiv.classList.add("show");
    setTimeout(() => {
      customAlertDiv.classList.remove("show");
      setTimeout(() => {
        customAlertDiv.style.display = "none";
      }, 350);
    }, duration);
  }

  /* =========================
     6) RENDERING THE BOARD
     ========================= */
  function getPieceHTML(pieceType, color) {
    // Unicode mapping
    const M = {
      k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙",
      K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟",
    };
    return color === "w" ? M[pieceType.toLowerCase()] : M[pieceType.toUpperCase()];
  }

  function algebraicFromRC(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
    // col: 0->'a', 1->'b' ... ; row: 0 is rank 8
  }

  function rcFromAlgebraic(square) {
    const file = square.charCodeAt(0) - 97;    // a->0, b->1,...
    const rank = 8 - parseInt(square[1], 10);  // '8'->0 ... '1'->7
    return { row: rank, col: file };
  }

  function renderBoard() {
    // Clear board
    chessboardDiv.innerHTML = "";

    const board = game.board(); // 8x8 array from chess.js
    // board[0] is rank 8, board[7] is rank 1

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        sq.classList.add("square");
        sq.classList.add((r + c) % 2 === 0 ? "light" : "dark");
        const algebraic = algebraicFromRC(r, c);
        sq.dataset.square = algebraic;

        // piece
        const piece = board[r][c];
        if (piece) {
          sq.classList.add("piece-square");
          sq.innerHTML = `<span class="piece piece-${piece.color}-${piece.type}">${getPieceHTML(
            piece.type,
            piece.color
          )}</span>`;
        }

        // click handler
        sq.addEventListener("click", onSquareClick);

        chessboardDiv.appendChild(sq);
      }
    }

    // Re-apply stateful highlights after re-render
    applyLastMoveHighlight();
    applyInCheckHighlight();
    if (selectedSquare) {
      applySelectionHighlight(selectedSquare, selectedMoves);
    }

    // Update UI labels
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
    if (game.inCheck()) {
      return `${game.turn() === "w" ? "White" : "Black"} is in check`;
    }
    return "Playing";
  }

  /* =================================
     7) HIGHLIGHTS (selected / legal)
     ================================= */

  // Clear ALL highlight classes from the board
  function clearAllHighlights() {
    document
      .querySelectorAll(
        `.square.${highlightStyle.selected},` +
          `.square.${highlightStyle.legal},` +
          `.square.${highlightStyle.capture},` +
          `.square.${highlightStyle.lastMove},` +
          `.square.${highlightStyle.inCheck}`
      )
      .forEach((el) => {
        el.classList.remove(
          highlightStyle.selected,
          highlightStyle.legal,
          highlightStyle.capture,
          highlightStyle.lastMove,
          highlightStyle.inCheck
        );
      });
  }

  function applySelectionHighlight(square, legalTargets = []) {
    // remove previous selection/candidate highlights
    document
      .querySelectorAll(`.square.${highlightStyle.selected}, .square.${highlightStyle.legal}, .square.${highlightStyle.capture}`)
      .forEach((el) => {
        el.classList.remove(highlightStyle.selected, highlightStyle.legal, highlightStyle.capture);
      });

    // mark selected square
    const selEl = document.querySelector(`.square[data-square="${square}"]`);
    if (selEl) selEl.classList.add(highlightStyle.selected);

    // mark destinations
    legalTargets.forEach((dest) => {
      const toEl = document.querySelector(`.square[data-square="${dest}"]`);
      if (toEl) {
        // Basic rule: if there's an enemy piece on 'dest', mark capture style
        const piece = game.get(dest);
        if (piece && piece.color !== game.get(square)?.color) {
          toEl.classList.add(highlightStyle.capture);
        } else {
          toEl.classList.add(highlightStyle.legal);
        }
      }
    });
  }

  function applyLastMoveHighlight() {
    // Remove old last-move highlight first
    document.querySelectorAll(`.square.${highlightStyle.lastMove}`).forEach((el) => {
      el.classList.remove(highlightStyle.lastMove);
    });

    if (!lastMoveSquares) return;
    const { from, to } = lastMoveSquares;
    const fromEl = document.querySelector(`.square[data-square="${from}"]`);
    const toEl = document.querySelector(`.square[data-square="${to}"]`);
    if (fromEl) fromEl.classList.add(highlightStyle.lastMove);
    if (toEl) toEl.classList.add(highlightStyle.lastMove);
  }

  function applyInCheckHighlight() {
    // Remove old in-check highlights
    document.querySelectorAll(`.square.${highlightStyle.inCheck}`).forEach((el) => {
      el.classList.remove(highlightStyle.inCheck);
    });

    if (game.inCheck()) {
      const turn = game.turn(); // side that is to move and in check
      // find king square of 'turn'
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
  }

  function deselectCurrent() {
    selectedSquare = null;
    selectedMoves = [];
    // remove selection candidates (keep last-move and check highlights)
    document
      .querySelectorAll(`.square.${highlightStyle.selected}, .square.${highlightStyle.legal}, .square.${highlightStyle.capture}`)
      .forEach((el) => el.classList.remove(highlightStyle.selected, highlightStyle.legal, highlightStyle.capture));
  }

  /* =================================
     8) CLICK HANDLER / MOVE LOGIC
     ================================= */
  function onSquareClick(e) {
    const clicked = e.currentTarget?.dataset?.square;
    if (!clicked) return;

    log("[CLICK] clicked", { clicked, turn: game.turn() });

    // Multiplayer: enforce turns & ownership
    if (currentGameId) {
      if (!playerColor) {
        calert("You are not a player in this game.");
        return;
      }
      const mySide = playerColor[0]; // 'w' or 'b'
      if (mySide !== game.turn()) {
        calert("It's not your turn.");
        return;
      }
    }

    const clickedPiece = game.get(clicked); // null or { type, color }

    // CASE A) No selection yet -> try to select your own piece
    if (!selectedSquare) {
      if (!clickedPiece) {
        // Empty square; nothing to select
        log("[SELECT] empty square; nothing to select");
        deselectCurrent();
        return;
      }

      // If multiplayer, ensure you don't select opponent's piece
      if (currentGameId && clickedPiece.color !== playerColor[0]) {
        calert("That's your opponent's piece!");
        deselectCurrent();
        return;
      }

      // Select this piece
      selectedSquare = clicked;
      selectedMoves = getLegalTargetsForSquare(clicked);
      log("[SELECT] selected", clicked, "legalTargets:", selectedMoves);

      // If no legal moves for this piece, keep it selected visually (so user can reselect another piece)
      // OR auto-deselect? We'll keep selected so user sees feedback, but they can click another square to change selection.
      applySelectionHighlight(selectedSquare, selectedMoves);
      return;
    }

    // CASE B) There is an active selection
    // 1) Clicking the same square -> deselect
    if (clicked === selectedSquare) {
      log("[SELECT] clicked selected square again -> deselect");
      deselectCurrent();
      return;
    }

    // 2) Clicking another own piece -> switch selection to that piece
    if (clickedPiece && clickedPiece.color === game.get(selectedSquare)?.color) {
      selectedSquare = clicked;
      selectedMoves = getLegalTargetsForSquare(clicked);
      log("[SELECT] switched selection to", clicked, "legalTargets:", selectedMoves);
      applySelectionHighlight(selectedSquare, selectedMoves);
      return;
    }

    // 3) Attempt to move from selectedSquare -> clicked
    const legal = selectedMoves.includes(clicked);
    log("[MOVE] trying", selectedSquare, "->", clicked, "legal?", legal);

    if (!legal) {
      // Not a legal destination; keep the selection (user can choose another square)
      calert("Illegal move.");
      // keep highlight and selection as-is
      return;
    }

    // Make the move
    const moveObj = { from: selectedSquare, to: clicked, promotion: "q" };
    let result = null;
    try {
      result = game.move(moveObj);
      log("[MOVE] applied:", result);
    } catch (e1) {
      err("[MOVE] chess.js threw error:", e1);
      calert("Move error.");
      return;
    }

    if (!result) {
      calert("Invalid move.");
      return;
    }

    // Record last move squares for highlight
    lastMoveSquares = { from: result.from, to: result.to };

    // Clear selection after move
    deselectCurrent();

    // Update board visuals
    renderBoard();

    // Check end states
    if (game.isGameOver()) {
      handleGameEnd();
    }

    // Sync (multiplayer vs local AI)
    if (currentGameId) {
      // multiplayer: push FEN/turn to Firebase
      pushGameStateToFirebase(currentGameId);
    } else {
      // Local vs AI: ask the engine to move
      scheduleAIMove();
    }
  }

  function getLegalTargetsForSquare(square) {
    const verbose = game.moves({ square, verbose: true });
    const targets = verbose.map((m) => m.to);
    // helpful debug
    if (targets.length === 0) {
      log("[HIGHLIGHT] no legal moves for", square);
    }
    return targets;
  }

  /* =================================
     9) GAME END HANDLING
     ================================= */
  function handleGameEnd() {
    let msg = "Game over.";
    if (game.isCheckmate()) {
      msg = "Checkmate!";
    } else if (game.isStalemate()) {
      msg = "Stalemate.";
    } else if (game.isInsufficientMaterial()) {
      msg = "Draw: Insufficient material.";
    } else if (game.isThreefoldRepetition()) {
      msg = "Draw: Repetition.";
    } else if (game.isDraw()) {
      msg = "Draw.";
    }
    gameStatusSpan.textContent = msg;
    calert(msg, 3000);

    // Multiplayer: persist status & maybe clean up
    if (currentGameId) {
      const updates = { status: msg.toLowerCase() };
      if (game.isCheckmate()) {
        updates.winner = game.turn() === "w" ? "Black" : "White";
      }
      db.ref(`chess/${currentGameId}`).update(updates).catch((e) => err("[FIREBASE] status update fail", e));

      // Optional: show modal and remove game after a short delay
      showGameOverModal(msg);
    }
  }

  function showGameOverModal(message) {
    if (!gameOverModal || !gameOverMessage) return;
    gameOverMessage.textContent = message;
    gameOverModal.classList.remove("hidden");
    setTimeout(() => {
      gameOverModal.classList.add("hidden");
      // Optionally delete the game after showing modal
      if (currentGameId) {
        db.ref(`chess/${currentGameId}`)
          .remove()
          .then(() => {
            log("[CLEANUP] Game node removed after completion.");
            leaveGame();
          })
          .catch((e) => err("[CLEANUP] Could not remove game node:", e));
      }
    }, 5000);
  }

  /* =================================
     10) STOCKFISH (Web Worker)
     ================================= */
  const STOCKFISH_PATHS = [
    "stockfish/stockfish-17.1-lite-single-03e3232.js", // your local lite build
    "stockfish/stockfish.js",                           // fallback local
  ];

  let engine = null;
  let engineReady = false;
  let engineSearching = false;
  let engineQueue = [];
  let stockfishPathInUse = null;

  function enginePost(cmd) {
    if (!engine) return;
    if (!engineReady && !/^uci|^isready|^setoption|^ucinewgame|^quit/.test(cmd)) {
      log("[ENGINE] Queue (waiting ready):", cmd);
      engineQueue.push(cmd);
    } else {
      log("[ENGINE] Posting ->", cmd);
      engine.postMessage(cmd);
    }
  }

  function flushEngineQueue() {
    log("[ENGINE] Flushing queue length:", engineQueue.length);
    while (engineQueue.length) {
      engine.postMessage(engineQueue.shift());
    }
  }

  function initStockfish() {
    if (engine) {
      log("[INIT] Stockfish already initialized.");
      return;
    }
    // Try paths one by one
    (function tryNextPath(index = 0) {
      if (index >= STOCKFISH_PATHS.length) {
        err("[INIT] No Stockfish worker could be loaded.");
        calert("Engine failed to load. Check console.");
        return;
      }
      const path = STOCKFISH_PATHS[index];
      log("[INIT] Starting Stockfish. JS path:", path);

      let created = false;
      try {
        engine = new Worker(path);
        stockfishPathInUse = path;
        created = true;
      } catch (e) {
        err("[INIT] Worker failed to construct for path", path, e);
        engine = null;
      }

      if (!created || !engine) {
        // try next
        tryNextPath(index + 1);
        return;
      }

      // Attach handlers
      engine.onmessage = onEngineMessage;
      engine.onerror = (ev) => {
        err("[ENGINE] Worker error event", ev);
        calert("Engine worker error. Check path/wasm.");
      };

      log("[WORKER] Handlers attached.");

      // UCI handshake
      enginePost("uci");
      enginePost("isready");
      enginePost("ucinewgame");
    })();
  }

  function onEngineMessage(e) {
    const line = e?.data ?? "";
    if (typeof line !== "string") return;

    log("[STOCKFISH MESSAGE]", line);

    if (line === "uciok") {
      // ask ready again for good measure
      enginePost("isready");
      return;
    }

    if (line === "readyok") {
      engineReady = true;
      flushEngineQueue();
      return;
    }

    if (line.startsWith("bestmove")) {
      engineSearching = false;
      const parts = line.split(/\s+/);
      const best = parts[1];
      if (!best || best === "(none)") {
        log("[ENGINE] No best move. Possibly game over.");
        return;
      }
      const moveObj = { from: best.slice(0, 2), to: best.slice(2, 4), promotion: "q" };
      let result = null;
      try {
        result = game.move(moveObj);
      } catch (e1) {
        err("[AI MOVE] chess.js error:", e1);
      }
      if (!result) {
        warn("[AI MOVE] Engine move rejected by chess.js:", moveObj);
        return;
      }

      lastMoveSquares = { from: result.from, to: result.to };
      renderBoard();

      if (game.isGameOver()) {
        handleGameEnd();
      }
    }
  }

  function scheduleAIMove() {
    // Local AI only (no multiplayer)
    if (currentGameId) return;

    // Ensure engine initialized
    initStockfish();

    // If game already over, do nothing
    if (game.isGameOver()) return;

    // If it's AI's turn (you play white by default)
    // For now: user always = White in local mode
    if (game.turn() === "b") {
      setTimeout(makeAIMove, 300); // small delay for UX
    }
  }

  function makeAIMove() {
    if (!engine) initStockfish();
    if (!engine) return;

    if (game.isGameOver()) {
      log("[AI] Skipping; game over.");
      return;
    }

    const fen = game.fen();
    log("[AI] makeAIMove called. fen:", fen);

    engineSearching = true;
    enginePost("position fen " + fen);
    enginePost("go depth 12");
  }

  /* =================================
     11) MULTIPLAYER (Realtime DB)
     ================================= */
  function listenForGames() {
    log("[MULTI] listening for games...");
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

        // Join button (if slot available)
        if (!gdata.playerBlack && gdata.playerWhite !== currentUser?.uid && gdata.status === "waiting") {
          const joinBtn = document.createElement("button");
          joinBtn.textContent = "Join as Black";
          joinBtn.style.backgroundColor = "#ec6090";
          joinBtn.addEventListener("click", () => joinGame(gid));
          li.appendChild(joinBtn);
        }

        // Rejoin if you are a player and not finished/abandoned
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
    const payload = {
      board: game.fen(),
      turn: game.turn(),
    };
    db.ref(`chess/${gid}`).update(payload).catch((e) => err("[FIREBASE] update failed:", e));
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
    ref
      .set(init)
      .then(() => joinGame(gid))
      .catch((e) => {
        err("[FIREBASE] createGame error:", e);
        calert("Error creating game.");
      });
  }

  function joinGame(gid) {
    const ref = db.ref(`chess/${gid}`);
    ref
      .transaction((g) => {
        if (!g) return;
        // if already a player, keep color
        if (g.playerWhite === currentUser.uid) {
          playerColor = "white";
        } else if (g.playerBlack === currentUser.uid) {
          playerColor = "black";
        } else if (!g.playerWhite && g.status === "waiting") {
          // take white slot
          g.playerWhite = currentUser.uid;
          playerColor = "white";
        } else if (!g.playerBlack && g.status === "waiting") {
          // take black slot
          g.playerBlack = currentUser.uid;
          playerColor = "black";
        } else {
          // game full or not joinable
          return;
        }
        if (g.playerWhite && g.playerBlack && g.status === "waiting") {
          g.status = "playing";
        }
        return g;
      })
      .then((res) => {
        if (!res.committed) {
          calert("Could not join game. Full or not joinable.");
          return;
        }
        currentGameId = gid;
        gameLobby.style.display = "none";
        chessGameDiv.style.display = "block";
        gameTitle.textContent = `Game ID: ${gid} (You are ${playerColor})`;

        // set local board to server board
        attachGameListener(gid);
        attachChatListener(gid);
      })
      .catch((e) => {
        err("[FIREBASE] joinGame error:", e);
        calert("Join failed.");
      });
  }

  function attachGameListener(gid) {
    if (unsubGame) {
      // detach previous
      db.ref(`chess/${gid}`).off("value", unsubGame);
      unsubGame = null;
    }
    const ref = db.ref(`chess/${gid}`);
    const handler = (snap) => {
      const g = snap.val();
      if (!g) {
        calert("Game ended or removed.");
        leaveGame();
        return;
      }
      // Sync local chess.js with server FEN
      if (g.board && typeof g.board === "string") {
        try {
          game.load(g.board);
        } catch (e) {
          warn("[SYNC] Invalid FEN from server, resetting:", e);
          game.reset();
        }
      }
      renderBoard();

      // end state UI (server-written statuses are respected)
      if (g.status && /checkmate|draw|stalemate|game over|completed|abandoned/i.test(g.status)) {
        gameStatusSpan.textContent = g.status;
      }
    };
    ref.on("value", handler);
    unsubGame = handler;
  }

  function attachChatListener(gid) {
    if (unsubChat) {
      db.ref(`chess/${gid}/chat`).off("child_added", unsubChat);
      unsubChat = null;
    }
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
    if (!txt) return;
    if (!currentGameId || !currentUser) return;

    const name = currentUser.email ? currentUser.email.split("@")[0] : "anon";
    db.ref(`chess/${currentGameId}/chat`)
      .push({
        sender: name,
        message: txt,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
      })
      .catch((e) => err("[CHAT] push failed:", e));
    chatInput.value = "";
  }

  function leaveGame() {
    if (!currentGameId || !currentUser) {
      // already not in any game
      cleanupToLobby();
      return;
    }

    const gid = currentGameId;
    const ref = db.ref(`chess/${gid}`);
    ref
      .transaction((g) => {
        if (!g) return;
        if (g.playerWhite === currentUser.uid) g.playerWhite = null;
        if (g.playerBlack === currentUser.uid) g.playerBlack = null;
        if (!g.playerWhite && !g.playerBlack) return null; // delete node
        if (g.status === "playing" && (!g.playerWhite || !g.playerBlack)) g.status = "abandoned";
        return g;
      })
      .then(() => {
        // detach listeners
        db.ref(`chess/${gid}`).off("value", unsubGame || undefined);
        db.ref(`chess/${gid}/chat`).off("child_added", unsubChat || undefined);
        unsubGame = null;
        unsubChat = null;
        cleanupToLobby();
      })
      .catch((e) => {
        err("[FIREBASE] leaveGame error:", e);
        calert("Error leaving game.");
        cleanupToLobby(); // still reset UI locally
      });
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
     12) LOCAL vs AI MODE
     ================================= */
  function startAIGame() {
    log("[LOCAL AI] startAIGame called");
    currentGameId = null; // ensure local mode
    playerColor = "white"; // user plays White
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

    // Prepare engine
    initStockfish();
  }

  /* =================================
     13) AUTHENTICATION
     ================================= */
  auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      log("[AUTH] Signed in:", user.uid);
      // Show lobby, listen for games
      gameLobby.style.display = "block";
      chessGameDiv.style.display = "none";
      listenForGames();
      renderBoard();
      return;
    }
    // If not signed in, redirect to login page (per your code)
    warn("[AUTH] Not logged in. Redirecting to login page...");
    window.location.href = "../../../../login/fire-login.html";
  });

  /* =================================
     14) EVENT LISTENERS (UI)
     ================================= */
  if (createGameBtn) {
    createGameBtn.addEventListener("click", createGame);
  }
  if (joinGameBtn) {
    joinGameBtn.addEventListener("click", () => {
      const gid = (gameIdInput.value || "").trim();
      if (!gid) {
        calert("Enter a Game ID.");
        return;
      }
      joinGame(gid);
    });
  }
  if (playVsAIBtn) {
    playVsAIBtn.addEventListener("click", startAIGame);
  }
  if (sendChatBtn) {
    sendChatBtn.addEventListener("click", sendChatMessage);
  }
  if (leaveGameBtn) {
    leaveGameBtn.addEventListener("click", leaveGame);
  }
  // Optional: send with Enter key
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatMessage();
    });
  }

  /* =================================
     15) START / FIRST RENDER
     ================================= */
  renderBoard();
  currentTurnSpan.textContent = game.turn() === "w" ? "White" : "Black";
  gameStatusSpan.textContent = "Idle";

  /* =================================
     16) EXTRA: Utility & Safety
     ================================= */

  // (Optional) Make some helpers globally accessible for quick debugging in console
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

  /* --------------------------------------------------------------
     17) STYLE HINTS (for your CSS, not JS logic)
     --------------------------------------------------------------
     Ensure your CSS defines classes used above, e.g.:

     .square { width: 12.5%; padding-bottom: 12.5%; position: relative; }
     .light { background: #eafed1; }
     .dark  { background: #ff6aa0; }
     .piece { position: absolute; inset: 0; display: grid; place-items: center;
              font-size: min(8vw, 64px); line-height: 1; user-select: none; }
     .selected { outline: 3px solid #20d6ff; box-shadow: 0 0 0 4px rgba(32,214,255,.3) inset; }
     .legal-move { box-shadow: inset 0 0 0 6px rgba(0,255,150,.45); }
     .legal-capture { box-shadow: inset 0 0 0 6px rgba(255,0,0,.45); }
     .last-move { outline: 3px solid rgba(255,255,0,.65); }
     .in-check { outline: 3px solid rgba(255,80,0,.85); }

     .piece-square .piece { pointer-events: none; } // so clicks hit the square, not the <span>
     -------------------------------------------------------------- */

})();
