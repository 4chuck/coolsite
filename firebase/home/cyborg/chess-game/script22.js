// script19.js - production-clean (Elo removed)
(function () {
  const TAG = "[script19]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const err = (...a) => console.error(TAG, ...a);

  const STOCKFISH_WORKER_PATH = window.STOCKFISH_PATH || "stockfish/stockfish-17.1-lite-single-03e3232.js";
  const ENGINE_INIT_TIMEOUT_MS = 12000;
  const DEFAULT_AI_DEPTHS = { easy: 3, medium: 8, hard: 15 };
  const DEFAULT_AI_LEVEL = "medium";
  const MOVE_TIME_MS = 30 * 1000;

  let activeColor = "w";
  let moveTimerMs = MOVE_TIME_MS;
  let moveTimerHandle = null;
  let moveTimerLastTs = 0;

  const firebaseConfig = {
    apiKey: "AIzaSyBJs9fp6w30ZpxycPLGy2bntvFeNy2TFxk",
    authDomain: "login-b6382.firebaseapp.com",
    databaseURL: "https://login-b6382-default-rtdb.firebaseio.com",
    projectId: "login-b6382",
    storageBucket: "login-b6382.appspot.com",
    messagingSenderId: "482805184778",
    appId: "1:482805184778:web:0d146b1daf3aa25ad7a2f3",
    measurementId: "G-ZHXBBZHN3W"
  };

  try {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
  } catch (e) {
    err("Firebase init failed", e);
  }

  // --- App Check (compat) ---
try {
  if (firebase && typeof firebase.appCheck === 'function') {
    // replace with your public site key (you already used this earlier)
    firebase.appCheck().activate(
      '6LcRQjwsAAAAADdvmJvORK_-hWHEe9dNqe6ZXUFd', // reCAPTCHA v3 site key (public)
      true // enable auto-refresh
    );

    // optional, useful for debugging
    try {
      firebase.appCheck().onTokenChanged(tokenResult => {
        log('[AppCheck] token changed — length:', tokenResult?.token?.length ?? 'none');
      });
    } catch (e) {
      log('[AppCheck] onTokenChanged not available on this build:', e?.message ?? e);
    }
  } else {
    warn('[AppCheck] firebase.appCheck() not available — did you include firebase-app-check-compat.js?');
  }
} catch (e) {
  warn('[AppCheck] initialization failed:', e);
}

  const auth = firebase.auth();
  const db = firebase.database();

  if (!window.Chess) {
    err("chess.js missing");
    return;
  }

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

  const whiteTimerBox = document.getElementById("white-timer");
  const blackTimerBox = document.getElementById("black-timer");
  const whiteTimerSpan = whiteTimerBox ? whiteTimerBox.querySelector("span") : null;
  const blackTimerSpan = blackTimerBox ? blackTimerBox.querySelector("span") : null;

  const messagesDiv = document.getElementById("messages");
  const chatInput = document.getElementById("chat-input");
  const sendChatBtn = document.getElementById("send-chat-btn");

  const leaveGameBtn = document.getElementById("leave-game-btn");
  const undoBtn = document.getElementById("undo-btn");
  const gameOverModal = document.getElementById("game-over-modal");
  const gameOverMessage = document.getElementById("game-over-message");
  const stockfishOverlay = document.getElementById("stockfish-loader");
  const customAlertDiv = document.getElementById("custom-alert");
  const difficultyModal = document.getElementById("difficulty-modal");
  const difficultyButtons = document.querySelectorAll(".difficulty-btn");

  function calert(msg, duration = 2000) {
    if (!customAlertDiv) { alert(msg); return; }
    customAlertDiv.textContent = msg;
    customAlertDiv.classList.remove("hidden");
    customAlertDiv.style.display = "block";
    setTimeout(() => {
      customAlertDiv.style.opacity = "0";
      setTimeout(() => {
        customAlertDiv.style.display = "none";
        customAlertDiv.classList.add("hidden");
        customAlertDiv.style.opacity = "1";
      }, 220);
    }, duration);
  }

  function showStockfishLoader() {
    if (!stockfishOverlay) return;
    stockfishOverlay.style.display = "flex";
    stockfishOverlay.classList.remove("hidden");
  }
  function hideStockfishLoader() {
    if (!stockfishOverlay) return;
    stockfishOverlay.style.display = "none";
    stockfishOverlay.classList.add("hidden");
  }

  let chess = new window.Chess();
  let selected = null;
  let possible = [];
  let lastMove = null;

  let currentUser = null;
  let currentGameId = null;
  let playerColor = null; // "white" | "black"
  let unsubGameValue = null;
  let unsubChatChildAdded = null;

  let engine = null;
  let engineReady = false;
  let engineInitializing = false;
  let engineSearching = false;
  let engineQueue = [];
  let engineInitTimeoutHandle = null;
  let aiLevel = DEFAULT_AI_LEVEL;
  let aiDepth = DEFAULT_AI_DEPTHS[aiLevel];

  function formatMs(ms) {
    ms = Math.max(0, ms | 0);
    const s = Math.floor(ms / 1000);
    return `${s}s`;
  }

  function updateTurnAndStatusText(extra = "") {
    if (currentTurnSpan) currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
    let st = "Playing";
    if (chess.isGameOver()) {
      if (chess.isCheckmate()) st = "Checkmate";
      else if (chess.isStalemate()) st = "Stalemate";
      else if (chess.isInsufficientMaterial()) st = "Draw: Insufficient material";
      else if (chess.isThreefoldRepetition()) st = "Draw: Threefold repetition";
      else if (chess.isDraw()) st = "Draw";
      else st = "Game over";
    } else if (typeof chess.inCheck === "function" && chess.inCheck()) {
      st = `${chess.turn() === "w" ? "White" : "Black"} is in check`;
    }
    if (gameStatusSpan) gameStatusSpan.textContent = extra ? `${st} ${extra}` : st;
  }

  function setActiveTimerDisplay(active) {
    if (!whiteTimerBox || !blackTimerBox) return;
    whiteTimerBox.classList.toggle("active", active === "w");
    blackTimerBox.classList.toggle("active", active === "b");
  }

  function updateMoveTimerDisplay(ms, color) {
    if (whiteTimerSpan) whiteTimerSpan.textContent = color === "w" ? formatMs(ms) : "";
    if (blackTimerSpan) blackTimerSpan.textContent = color === "b" ? formatMs(ms) : "";
    setActiveTimerDisplay(color);
  }

  function startMoveTimer(color = "w") {
    log("startMoveTimer called for color:", color);
    stopMoveTimer();
    activeColor = color;
    moveTimerMs = MOVE_TIME_MS; // Reset to full time for the new turn
    moveTimerLastTs = Date.now();
    updateMoveTimerDisplay(moveTimerMs, color);
    moveTimerHandle = setInterval(() => {
      const now = Date.now();
      const elapsed = now - moveTimerLastTs;
      moveTimerMs -= elapsed;
      moveTimerLastTs = now;
      updateMoveTimerDisplay(moveTimerMs, activeColor);
      if (moveTimerMs <= 0) {
        moveTimerMs = 0;
        updateMoveTimerDisplay(moveTimerMs, activeColor);
        handleGameEnd(`Time out! ${activeColor === "w" ? "White" : "Black"} loses.`);
        stopMoveTimer();
        renderBoard();
      }
    }, 250);
  }

  function stopMoveTimer() {
    log("stopMoveTimer called.");
    if (moveTimerHandle) { clearInterval(moveTimerHandle); moveTimerHandle = null; }
  }

  function onMoveApplied() {
    log("onMoveApplied called.");
    // Determine next color
    const nextColor = activeColor === "w" ? "b" : "w";
    log("onMoveApplied: nextColor determined as", nextColor);
    activeColor = nextColor; // Update activeColor immediately

    // Only update Firebase if in multiplayer game
    if (currentGameId) {
      log("onMoveApplied: In multiplayer game, updating Firebase turnInfo.");
      const turnRef = db.ref(`chess/${currentGameId}/turnInfo`);
      turnRef.set({
        activeColor: nextColor,
        turnStart: firebase.database.ServerValue.TIMESTAMP
      }).then(() => {
        log("onMoveApplied: Firebase turnInfo updated successfully.");
      }).catch(e => warn("onMoveApplied: turnInfo update failed", e));
    } else {
      log("onMoveApplied: Not in multiplayer game, skipping Firebase turnInfo update.");
    }

    // Start local timer (will be synced from Firebase for both players if multiplayer)
    log("onMoveApplied: Calling startMoveTimer for", nextColor);
    startMoveTimer(nextColor);
  }


  function algebraicFromRC(row, col) { return `${String.fromCharCode(97 + col)}${8 - row}`; }
  function rcFromAlgebraic(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square[1], 10);
    return { row: rank, col: file };
  }
  function getPieceUnicode(type, color) {
    const wMap = { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" };
    const white = wMap[type.toLowerCase()] || "";
    const blackMap = { "♔": "♚", "♕": "♛", "♖": "♜", "♗": "♝", "♘": "♞", "♙": "♟" };
    return color === "w" ? white : (blackMap[white] || white);
  }

  function clearSelection() { selected = null; possible = []; log("Selection cleared."); }
  function clearHighlightClasses() {
    document.querySelectorAll(".square.selected").forEach(el => el.classList.remove("selected"));
    document.querySelectorAll(".square.possible-move").forEach(el => el.classList.remove("possible-move"));
    document.querySelectorAll(".square.last-move").forEach(el => el.classList.remove("last-move"));
    document.querySelectorAll(".square.in-check").forEach(el => el.classList.remove("in-check"));
    log("Highlight classes cleared.");
  }

  function renderBoard() {
    if (!chessboardDiv) { log("chessboardDiv not found, cannot render board."); return; }
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
    if (typeof chess.inCheck === "function" && chess.inCheck()) {
      const turn = chess.turn();
      const board2 = chess.board();
      outer: for (let r2 = 0; r2 < 8; r2++) {
        for (let c2 = 0; c2 < 8; c2++) {
          const p = board2[r2][c2];
          if (p && p.type === "k" && p.color === turn) {
            const el = document.querySelector(`.square[data-row="${r2}"][data-col="${c2}"]`);
            if (el) el.classList.add("in-check");
            break outer;
          }
        }
      }
    }
    updateMoveTimerDisplay(moveTimerMs, activeColor);
    updateTurnAndStatusText();
    log("Board rendered.");
  }

  function onSquareClick(e) {
    log("onSquareClick: Click detected.");
    const el = e.currentTarget;
    const row = parseInt(el.dataset.row, 10);
    const col = parseInt(el.dataset.col, 10);
    const square = algebraicFromRC(row, col);
    log(`onSquareClick: Clicked square: ${square} (row: ${row}, col: ${col})`);

    if (currentGameId && playerColor) {
      const mySide = playerColor[0];
      log(`onSquareClick: Multiplayer game. My side: ${mySide}, Chess turn: ${chess.turn()}`);
      if (mySide !== chess.turn()) {
        calert("It's not your turn.");
        log("onSquareClick: Not player's turn. Returning.");
        return;
      }
    }

    if (selected && possible && possible.length) {
      const from = algebraicFromRC(selected.row, selected.col);
      log(`onSquareClick: Piece previously selected: ${from}. Attempting to move to ${square}.`);
      if (from === square) {
        log("onSquareClick: Clicked same square as selected. Clearing selection.");
        clearSelection();
        renderBoard();
        return;
      }
      let mv = null;
      try {
        log(`onSquareClick: Attempting chess.move({ from: "${from}", to: "${square}", promotion: "q" })`);
        mv = chess.move({ from, to: square, promotion: "q" });
        log("onSquareClick: chess.move result:", mv);
      } catch (error) {
        warn("onSquareClick: Error during chess.move:", error);
        mv = null;
      }
      clearSelection();
      if (mv) {
        log("onSquareClick: Move successful.");
        lastMove = { from: mv.from, to: mv.to };

        // --- FIX: Update Firebase board state immediately after successful move ---
        if (currentGameId) {
          log("onSquareClick: In multiplayer game, updating Firebase board/turn/updatedAt.");
          // Use update to set multiple properties atomically
          db.ref(`chess/${currentGameId}`).update({
            board: chess.fen(),
            turn: chess.turn(),
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          }).then(() => {
            log("onSquareClick: Firebase board/turn/updatedAt updated successfully.");
          }).catch(e => warn("onSquareClick: Firebase board/turn/updatedAt update failed", e));
        }
        // --- END FIX ---

        onMoveApplied(); // This now handles Firebase turnInfo update and local timer start
        renderBoard(); // Render board with the new FEN from local chess object

        // Only make AI move if not in a multiplayer game and game is not over
        if (!currentGameId && !chess.isGameOver()) {
          log("onSquareClick: AI game, making AI move.");
          setTimeout(() => makeAIMove(aiDepth), 300);
        }
        checkForEndAndNotify();
        return;
      } else {
        calert("Invalid move");
        log("onSquareClick: Invalid move. Rendering board.");
        renderBoard();
        return;
      }
    }

    const piece = chess.get(square);
    log("onSquareClick: No piece previously selected. Checking clicked square for piece:", piece);
    if (!piece) {
      log("onSquareClick: No piece on clicked square. Clearing selection.");
      clearSelection();
      renderBoard();
      return;
    }
    if (currentGameId && playerColor && piece.color !== playerColor[0]) {
      calert("That's your opponent's piece!");
      log("onSquareClick: Clicked opponent's piece in multiplayer game. Returning.");
      return;
    }
    selected = { row, col };
    possible = chess.moves({ square, verbose: true }) || [];
    log(`onSquareClick: Piece selected: ${square}. Possible moves:`, possible);
    renderBoard();
  }

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      log("Undo button clicked.");
      if (currentGameId) { calert("Undo is only available in AI games."); log("Undo: Multiplayer game, not allowed."); return; }
      if (chess.history().length === 0) { calert("No moves to undo"); log("Undo: No moves in history."); return; }
      chess.undo();
      log("Undo: Player move undone.");
      // For AI games, undo the AI's move as well
      if (!currentGameId && chess.history().length > 0) {
        chess.undo();
        log("Undo: AI move undone.");
      }
      lastMove = null;
      clearSelection();
      renderBoard();
      // Restart timer for AI games after undo
      if (!currentGameId) {
        activeColor = chess.turn(); // Ensure activeColor matches current turn after undo
        log("Undo: AI game, restarting timer for", activeColor);
        startMoveTimer(activeColor);
      }
    });
  }

  function showGameOverModal(message, showRematch = false) {
    log("showGameOverModal called with message:", message, "showRematch:", showRematch);
    if (!gameOverModal || !gameOverMessage) { calert(message, 3500); return; }
    gameOverMessage.textContent = message;
    const box = gameOverModal.querySelector(".modal-content");
    if (box) {
      Array.from(box.querySelectorAll("button[data-role='rematch']")).forEach(b => b.remove());
      if (showRematch) {
        const btn = document.createElement("button");
        btn.dataset.role = "rematch";
        btn.textContent = "Rematch";
        btn.className = "btn";
        btn.addEventListener("click", () => {
          log("Rematch button clicked.");
          try { gameOverModal.classList.add("hidden"); gameOverModal.style.display = "none"; } catch {}
          createRematch();
        });
        box.appendChild(btn);
      }
    }
    gameOverModal.classList.remove("hidden");
    try { gameOverModal.style.display = "flex"; } catch {}
    let modalInteracted = false;
    if (showRematch && box) {
      box.querySelector("button[data-role='rematch']").addEventListener("click", () => { modalInteracted = true; });
    }
    setTimeout(() => {
      if (!modalInteracted) {
        gameOverModal.classList.add("hidden");
        try { gameOverModal.style.display = "none"; } catch {}
      }
    }, 5000);
  }

  function handleGameEnd(endReason = "") {
    log("handleGameEnd called with reason:", endReason);
    let msg = "Game over.";
    if (chess.isCheckmate()) msg = "Checkmate!";
    else if (chess.isStalemate()) msg = "Stalemate.";
    else if (chess.isInsufficientMaterial()) msg = "Draw: Insufficient material.";
    else if (chess.isThreefoldRepetition()) msg = "Draw: Repetition.";
    else if (chess.isDraw()) msg = "Draw.";
    if (endReason) msg += " " + endReason;
    log("handleGameEnd: Final message:", msg);

    if (currentGameId && unsubGameValue) {
      log("handleGameEnd: Unsubscribing from Firebase game value listener.");
      try { db.ref(`chess/${currentGameId}`).off("value", unsubGameValue); unsubGameValue = null; } catch {}
    }

    if (currentGameId) {
      const winnerColor = chess.isCheckmate() ? (chess.turn() === "w" ? "black" : "white") : (endReason.startsWith("Time out") ? (endReason.includes("White") ? "black" : "white") : null);
      const updates = { status: "completed", completedAt: firebase.database.ServerValue.TIMESTAMP };
      if (winnerColor) updates.winner = winnerColor;
      log("handleGameEnd: Updating Firebase game status to completed. Winner:", winnerColor);
      db.ref(`chess/${currentGameId}`).update(updates).catch(e => warn("status update failed", e));
    }

    showGameOverModal(msg, !!currentGameId);
    stopMoveTimer();
    setTimeout(() => resetLocalState(), 5200);
  }

  function checkForEndAndNotify() {
    log("checkForEndAndNotify called. Is game over?", chess.isGameOver());
    if (chess.isGameOver()) handleGameEnd();
  }

  function listenForGames() {
    log("listenForGames called.");
    try {
      const ref = db.ref("chess");
      ref.off();
      ref.on("value", snap => {
        log("listenForGames: Firebase games data received.");
        if (!gameList) { log("gameList element not found."); return; }
        gameList.innerHTML = "";
        const games = snap.val();
        if (!games) {
          const li = document.createElement("li"); li.textContent = "No active games."; gameList.appendChild(li); log("No active games found."); return;
        }
        Object.entries(games).forEach(([gid, g]) => {
          const li = document.createElement("li"); li.className = "lobby-item";
          let status = g.status || (g.playerWhite && g.playerBlack ? "playing" : "waiting");
          status = String(status).replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
          li.innerHTML = `<span class="gid">Game: ${gid}</span> <span class="status">(${status})</span>`;
          if (!g.playerBlack && g.playerWhite !== currentUser?.uid && (!g.status || g.status === "waiting")) {
            const btn = document.createElement("button"); btn.textContent = "Join as Black"; btn.className = "btn";
            btn.addEventListener("click", () => { log(`Joining game ${gid} as Black.`); joinGame(gid); });
            li.appendChild(btn);
          }
          if ((g.playerWhite === currentUser?.uid || g.playerBlack === currentUser?.uid) && g.status !== "completed" && g.status !== "abandoned") {
            const rejoin = document.createElement("button"); rejoin.textContent = "Rejoin"; rejoin.className = "btn secondary";
            rejoin.addEventListener("click", () => { log(`Rejoining game ${gid}.`); joinGame(gid); });
            li.appendChild(rejoin);
          }
          gameList.appendChild(li);
        });
      });
    } catch (e) { err("listenForGames failed", e); }
  }

  async function createGame() {
    log("createGame called.");
    if (!currentUser) { calert("Sign in first"); log("createGame: Not signed in."); return; }
    try {
      const ref = db.ref("chess").push();
      const gid = ref.key;
      const payload = {
        playerWhite: currentUser.uid,
        playerBlack: null,
        board: chess.fen(),
        turn: chess.turn(),
        status: "waiting",
        chat: null,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      };
      log("createGame: Creating new game with ID:", gid, "and payload:", payload);
      await ref.set(payload);
      await joinGame(gid);
      log("createGame: Game created and joined successfully.");
    } catch (e) { err("createGame failed", e); calert("Could not create game."); }
  }

  async function joinGame(gid) {
    log("joinGame called with ID:", gid);
    if (undoBtn) undoBtn.style.display = "none";
    if (!currentUser) { calert("Sign in first"); log("joinGame: Not signed in."); return; }
    if (!gid) { calert("No Game ID"); log("joinGame: No Game ID provided."); return; }
    try {
      const ref = db.ref(`chess/${gid}`);
      let assigned = null;
      log("joinGame: Attempting transaction to join game.");
      const tx = await ref.transaction(current => {
        if (!current) { log("joinGame transaction: Current game data is null."); return current; }
        if (current.playerWhite === currentUser.uid) { assigned = "white"; log("joinGame transaction: Already playerWhite."); return current; }
        if (current.playerBlack === currentUser.uid) { assigned = "black"; log("joinGame transaction: Already playerBlack."); return current; }
        if (!current.playerWhite && current.status === "waiting") { current.playerWhite = currentUser.uid; assigned = "white"; log("joinGame transaction: Assigned as playerWhite."); }
        else if (!current.playerBlack && current.status === "waiting") { current.playerBlack = currentUser.uid; assigned = "black"; }
        else { log("joinGame transaction: Game full or not waiting."); return; }
        if (current.playerWhite && current.playerBlack && current.status === "waiting") { current.status = "playing"; log("joinGame transaction: Game status changed to playing."); }
        return current;
      });
      if (!tx.committed || !assigned) { calert("Could not join (full/conflict)"); log("joinGame: Transaction failed or not assigned. Committed:", tx.committed, "Assigned:", assigned); return; }
      currentGameId = gid;
      playerColor = assigned;
      log(`joinGame: Successfully joined game ${gid} as ${playerColor}.`);
      if (gameTitle) gameTitle.textContent = `Game ${gid} (${playerColor})`;
      if (gameLobby) gameLobby.style.display = "none";
      if (chessGameDiv) chessGameDiv.style.display = "block";
      if (whiteTimerBox || blackTimerBox) { if (whiteTimerBox) whiteTimerBox.style.display = "block"; if (blackTimerBox) blackTimerBox.style.display = "block"; }
      const snap = await ref.get();
      const data = snap.val();
      if (data?.board) {
        try { chess.load(data.board); log("joinGame: Loaded board from Firebase."); } catch { chess.reset(); warn("joinGame: Invalid FEN from Firebase, resetting board."); }
      } else { chess.reset(); log("joinGame: No board data from Firebase, resetting board."); }
      renderBoard();
      updateTurnAndStatusText();
      subscribeToGame(gid);
      log("joinGame: Subscribed to game updates.");
    } catch (e) { err("joinGame failed", e); calert("Join failed"); }
  }

  function subscribeToGame(gid) {
    log("subscribeToGame called for ID:", gid);
    try {
      const gref = db.ref(`chess/${gid}`);
      gref.off();

      const handler = snap => {
        log("subscribeToGame: Firebase game data snapshot received.");
        const data = snap.val();
        if (!data) { calert("Game removed"); resetLocalState(); log("subscribeToGame: Game data is null, game removed."); return; }
        log("subscribeToGame: Received game data:", data);

        // Load board if changed
        if (data.board && data.board !== chess.fen()) {
          log("subscribeToGame: Board FEN changed. Loading new FEN:", data.board);
          try { chess.load(data.board); renderBoard(); log("subscribeToGame: Board loaded and rendered."); } catch (e) { warn("subscribeToGame: Invalid FEN", e); chess.reset(); renderBoard(); }
        } else {
          log("subscribeToGame: Board FEN is the same or not present. No board update needed from snapshot.");
        }

        // Check game over
        if (data.status === "completed") {
          log("subscribeToGame: Game status is completed. Handling game end.");
          handleGameEnd();
          return;
        }

        // ======= Sync timers using turnInfo =======
        if (data.turnInfo) {
          log("subscribeToGame: turnInfo received. Syncing timers.");
          const ts = data.turnInfo.turnStart; // Use the raw timestamp
          log("subscribeToGame: Raw turnStart timestamp from Firebase:", ts);
          const color = data.turnInfo.activeColor || "w";
          const elapsed = Date.now() - ts;
          moveTimerMs = MOVE_TIME_MS - elapsed;
          if (moveTimerMs < 0) moveTimerMs = 0;
          activeColor = color;
          log(`subscribeToGame: Timer sync - activeColor: ${activeColor}, moveTimerMs: ${moveTimerMs}ms (elapsed: ${elapsed}ms)`);
          startMoveTimer(color); // This will restart the timer with the synchronized time
        } else {
          log("subscribeToGame: No turnInfo received.");
        }

      };
      gref.on("value", handler);
      unsubGameValue = handler;
      log("subscribeToGame: Subscribed to game value changes.");

      // Chat listener
      const cref = db.ref(`chess/${gid}/chat`);
      cref.off();
      const chatHandler = snap => {
        log("subscribeToGame: Chat message received.");
        const m = snap.val();
        if (!m) return;
        const p = document.createElement("p");
        p.textContent = `[${new Date(m.ts || Date.now()).toLocaleTimeString()}] ${m.user || "Anon"}: ${m.text}`;
        if (m.userId === currentUser?.uid) p.classList.add("user");
        messagesDiv.appendChild(p);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      };
      cref.on("child_added", chatHandler);
      unsubChatChildAdded = chatHandler;
      log("subscribeToGame: Subscribed to chat messages.");

    } catch (e) { err("subscribeToGame failed", e); }
  }

  function leaveGame() {
    log("leaveGame called.");
    if (currentGameId && currentUser) {
      try {
        const ref = db.ref(`chess/${currentGameId}`);
        log("leaveGame: Attempting transaction to leave game.");
        ref.transaction(g => {
          if (!g) return g;
          if (g.playerWhite === currentUser.uid) { g.playerWhite = null; log("leaveGame transaction: Removed as playerWhite."); }
          if (g.playerBlack === currentUser.uid) { g.playerBlack = null; log("leaveGame transaction: Removed as playerBlack."); }
          if (!g.playerWhite && !g.playerBlack) { log("leaveGame transaction: Both players left, deleting game."); return null; }
          if (g.status === "playing" && (!g.playerWhite || !g.playerBlack)) { g.status = "abandoned"; log("leaveGame transaction: Game abandoned."); }
          return g;
        }).then(() => {
          log("leaveGame: Transaction completed. Unsubscribing from Firebase listeners.");
          try { db.ref(`chess/${currentGameId}`).off("value", unsubGameValue || undefined); } catch {}
          try { db.ref(`chess/${currentGameId}/chat`).off("child_added", unsubChatChildAdded || undefined); } catch {}
          unsubGameValue = null; unsubChatChildAdded = null;
          resetLocalState();
          log("leaveGame: Local state reset.");
        }).catch(e => { err("leaveGame tx failed", e); resetLocalState(); });
      } catch (e) { err("leaveGame error", e); resetLocalState(); }
    } else {
      log("leaveGame: Not in a game or not signed in. Resetting local state.");
      resetLocalState();
    }
  }

  function resetLocalState() {
    log("resetLocalState called.");
    currentGameId = null;
    playerColor = null;
    chess.reset();
    lastMove = null;
    clearSelection();
    renderBoard();
    if (engine) {
      log("resetLocalState: Terminating Stockfish engine.");
      try { if (typeof engine.terminate === "function") engine.terminate(); } catch {}
    }
    engine = null; engineReady = false; engineInitializing = false; engineSearching = false; engineQueue = [];
    if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
    hideStockfishLoader();
    stopMoveTimer();
    if (whiteTimerBox) whiteTimerBox.style.display = "none";
    if (blackTimerBox) blackTimerBox.style.display = "none";
    if (chessGameDiv) chessGameDiv.style.display = "none";
    if (gameLobby) gameLobby.style.display = "block";
    if (messagesDiv) messagesDiv.innerHTML = "";
    if (currentTurnSpan) currentTurnSpan.textContent = "White";
    if (gameStatusSpan) gameStatusSpan.textContent = "Not started";
    log("Local state reset complete.");
  }

  function sendChat() {
    log("sendChat called.");
    const txt = (chatInput?.value || "").trim();
    if (!txt) { log("sendChat: Chat input is empty."); return; }
    if (!currentGameId) { calert("Chat is multiplayer only"); log("sendChat: Not in multiplayer game."); return; }
    const safeTxt = txt.replace(/[<>]/g, "");
    const cref = db.ref(`chess/${currentGameId}/chat`);
    const payload = {
      text: safeTxt,
      user: currentUser?.isAnonymous ? "Guest" : (currentUser?.email || "Player"),
      userId: currentUser?.uid || null,
      ts: firebase.database.ServerValue.TIMESTAMP
    };
    log("sendChat: Sending chat message:", payload);
    try { cref.push(payload).catch(e => err("chat push fail", e)); } catch (e) { err("chat push outer fail", e); }
    if (chatInput) chatInput.value = "";
  }

  function openDifficultyModal(onPick) {
    log("openDifficultyModal called.");
    if (!difficultyModal) { aiLevel = DEFAULT_AI_LEVEL; aiDepth = DEFAULT_AI_DEPTHS[aiLevel]; onPick?.(aiLevel); log("difficultyModal not found, using default AI level."); return; }
    difficultyModal.classList.remove("hidden");
    difficultyModal.style.display = "flex";
    const handler = (level) => {
      log("Difficulty selected:", level);
      difficultyModal.classList.add("hidden"); difficultyModal.style.display = "none";
      aiLevel = level; aiDepth = DEFAULT_AI_DEPTHS[aiLevel] || DEFAULT_AI_DEPTHS[DEFAULT_AI_LEVEL];
      onPick?.(aiLevel);
    };
    difficultyButtons.forEach(btn => { btn.onclick = () => handler(btn.dataset.diff); });
  }

  function startAIGameRandomFirst() {
    log("startAIGameRandomFirst called.");
    if (undoBtn) undoBtn.style.display = "inline-block";
    currentGameId = null; // Ensure it's an AI game
    chess.reset();
    lastMove = null;
    clearSelection();
    openDifficultyModal((level) => {
      log("startAIGameRandomFirst: Difficulty modal closed. Level:", level);
      if (chessGameDiv) chessGameDiv.style.display = "block";
      if (gameLobby) gameLobby.style.display = "none";
      if (whiteTimerBox || blackTimerBox) { if (whiteTimerBox) whiteTimerBox.style.display = "block"; if (blackTimerBox) blackTimerBox.style.display = "block"; }
      if (Math.random() < 0.5) {
        playerColor = "white";
        if (gameTitle) gameTitle.textContent = `Play vs AI (You: White, ${level.toUpperCase()})`;
        calert("You play first (White)");
        activeColor = "w";
        startMoveTimer("w");
        renderBoard();
        log("startAIGameRandomFirst: Player is White, starts first.");
      } else {
        playerColor = "black";
        if (gameTitle) gameTitle.textContent = `Play vs AI (You: Black, ${level.toUpperCase()})`;
        calert("AI plays first (White)");
        activeColor = "w";
        startMoveTimer("w");
        renderBoard();
        if (!engine && !engineInitializing) {
          log("startAIGameRandomFirst: Player is Black, AI starts. Initializing Stockfish.");
          initStockfish({ showLoader: true });
        }
        setTimeout(() => makeAIMove(aiDepth), 420);
        log("startAIGameRandomFirst: Player is Black, AI will make first move.");
      }
      if (messagesDiv && messagesDiv.parentElement) messagesDiv.parentElement.style.display = "none";
      updateTurnAndStatusText();
    });
  }

  function enginePost(cmd) {
    log("enginePost: Sending command:", cmd);
    if (!engine) { engineQueue.push(cmd); log("enginePost: Engine not ready, queuing command."); return; }
    if (!engineReady && !/^(uci|isready|ucinewgame|setoption|quit)/.test(cmd)) { engineQueue.push(cmd); log("enginePost: Engine not ready for non-init command, queuing."); return; }
    try { engine.postMessage(cmd); } catch (e) { warn("enginePost: Failed to post message to engine, queuing.", e); engineQueue.push(cmd); }
  }
  function flushEngineQueue() {
    log("flushEngineQueue called.");
    if (!engine) { log("flushEngineQueue: Engine not available."); return; }
    while (engineQueue.length) {
      const cmd = engineQueue.shift();
      try { engine.postMessage(cmd); log("flushEngineQueue: Sent queued command:", cmd); } catch (e) { warn("flushEngineQueue: Failed to send queued command, re-queuing.", e); engineQueue.unshift(cmd); break; }
    }
  }

  function initStockfish(opts = {}) {
    log("initStockfish called.");
    const showLoader = opts.showLoader !== false;
    if (engine || engineInitializing) { log("initStockfish: Engine already initialized or initializing."); return; }

    engineInitializing = true;
    engineReady = false;
    engineSearching = false;
    engineQueue = [];

    if (showLoader) {
      showStockfishLoader();
    }

    let created = false;
    try {
      if (typeof Worker === "function") {
        try {
          engine = new Worker(STOCKFISH_WORKER_PATH);
          created = true;
          log("initStockfish: Web Worker created successfully.");
        } catch (we) {
          warn("initStockfish: Worker creation failed", we);
          engine = null;
        }
      }
    } catch (e) {
      warn("initStockfish: Worker not available", e);
    }

    if (!created && typeof window.STOCKFISH === "function") {
      try {
        engine = window.STOCKFISH();
        created = true;
        log("initStockfish: window.STOCKFISH fallback used successfully.");
      } catch (e) {
        warn("initStockfish: window.STOCKFISH fallback failed", e);
        engine = null;
      }
    }

    if (!created || !engine) {
      engineInitializing = false;
      engineReady = false;
      if (showLoader) hideStockfishLoader();
      calert("Could not start AI engine");
      log("initStockfish: Failed to create AI engine.");
      return;
    }

    engine.onmessage = function (ev) {
      const line = typeof ev?.data === "string" ? ev.data : String(ev?.data?.text || ev?.data || "");
      log("Engine message:", line);

      if (/uciok/.test(line)) {
        log("Engine: uciok received. Sending isready.");
        enginePost("isready");
        return;
      }

      if (/readyok/.test(line)) {
        log("Engine: readyok received. Engine is ready.");
        engineReady = true;
        engineInitializing = false;
        flushEngineQueue();
        if (showLoader) hideStockfishLoader();
        if (engineInitTimeoutHandle) {
          clearTimeout(engineInitTimeoutHandle);
          engineInitTimeoutHandle = null;
        }
        return;
      }

      if (/^(id |option )/.test(line)) {
        // These are usually sent before readyok, but ensure engineReady is set if somehow missed
        if (!engineReady) {
          log("Engine: id/option received, setting engineReady to true.");
          engineReady = true;
          engineInitializing = false;
          flushEngineQueue();
          if (showLoader) hideStockfishLoader();
          if (engineInitTimeoutHandle) {
            clearTimeout(engineInitTimeoutHandle);
            engineInitTimeoutHandle = null;
          }
        }
        return;
      }

      if (/^bestmove /.test(line)) {
        log("Engine: bestmove received:", line);
        engineSearching = false;
        const parts = line.split(/\s+/);
        const best = parts[1];
        if (!best || best === "(none)") { log("Engine: No best move or (none)."); return; }

        if (!currentGameId) { // Only apply AI move if not in a multiplayer game
          log("Engine: Applying AI move in single player game:", best);
          const moveObj = { from: best.slice(0, 2), to: best.slice(2, 4), promotion: "q" };
          const res = chess.move(moveObj);
          if (res) {
            lastMove = { from: res.from, to: res.to };
            onMoveApplied();
            renderBoard();
            checkForEndAndNotify();
            log("Engine: AI move applied successfully.");
          } else {
            warn("Engine: AI suggested invalid move:", moveObj);
          }
        } else {
          log("Engine: Best move received but in multiplayer game, not applying AI move.");
        }
        return;
      }
    };

    engine.onerror = function (e) {
      warn("Engine error", e);
      engineInitializing = false;
      engineReady = false;
      engineSearching = false;
      if (showLoader) hideStockfishLoader();
      calert("Engine error");
      log("initStockfish: Engine encountered an error.");
    };

    engineInitTimeoutHandle = setTimeout(() => {
      if (!engineReady) {
        warn("Engine init timed out");
        engineInitializing = false;
        engineReady = false;
        engineSearching = false;
        if (showLoader) hideStockfishLoader();
        calert("Engine timeout; continuing without AI.");
        log("initStockfish: Engine initialization timed out.");
      }
    }, ENGINE_INIT_TIMEOUT_MS);

    try {
      log("initStockfish: Sending UCI handshake commands.");
      engine.postMessage("uci");
      engine.postMessage("isready");
      engine.postMessage("ucinewgame");
    } catch (e) {
      err("Engine handshake failed", e);
      engineInitializing = false;
      engineReady = false;
      if (showLoader) hideStockfishLoader();
      calert("Engine handshake failed");
      log("initStockfish: Engine handshake failed during initial commands.");
    }
  }


  function makeAIMove(depth) {
    log("makeAIMove called with depth:", depth);
    if (currentGameId) { log("makeAIMove: In multiplayer game, not making AI move."); return; } // Do not make AI moves in multiplayer games
    if (chess.isGameOver()) { checkForEndAndNotify(); log("makeAIMove: Game is over, not making AI move."); return; }
    if (!engine && !engineInitializing) {
      log("makeAIMove: Engine not initialized, initializing now.");
      initStockfish({ showLoader: true });
    }
    engineSearching = true;
    log("makeAIMove: Sending FEN to engine:", chess.fen());
    enginePost("position fen " + chess.fen());
    log("makeAIMove: Requesting AI move with depth:", (depth || aiDepth));
    enginePost("go depth " + (depth || aiDepth));
  }

  async function createRematch() {
    log("createRematch called.");
    if (!currentGameId) { log("createRematch: Not in a game."); return; }
    const oldSnap = await db.ref(`chess/${currentGameId}`).get();
    const g = oldSnap.val();
    if (!g) { log("createRematch: Old game data not found."); return; }
    if (!g.playerWhite || !g.playerBlack) { log("createRematch: Old game did not have both players."); return; }
    chess.reset();
    const ref = db.ref("chess").push();
    const gid = ref.key;
    const payload = {
      playerWhite: g.playerBlack, // Swap colors for rematch
      playerBlack: g.playerWhite, // Swap colors for rematch
      board: chess.fen(),
      turn: chess.turn(),
      status: "waiting",
      chat: null,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      rematchOf: currentGameId
    };
    log("createRematch: Creating new rematch game with ID:", gid, "and payload:", payload);
    await ref.set(payload);
    await joinGame(gid);
    log("createRematch: Rematch created and joined successfully.");
  }

  if (createGameBtn) createGameBtn.addEventListener("click", createGame);
  if (joinGameBtn) joinGameBtn.addEventListener("click", () => {
    const gid = (gameIdInput?.value || "").trim(); if (!gid) { calert("Enter Game ID"); return; } log("Join Game button clicked for ID:", gid); joinGame(gid);
  });
  if (playVsAIBtn) playVsAIBtn.addEventListener("click", startAIGameRandomFirst);
  if (sendChatBtn) sendChatBtn.addEventListener("click", sendChat);
  if (chatInput) chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
  if (leaveGameBtn) leaveGameBtn.addEventListener("click", leaveGame);

  auth.onAuthStateChanged(async (user) => {
    log("Auth state changed. User:", user ? user.uid : "null");
    currentUser = user || null;
    if (authStatus) {
      if (user) {
        const name = user.isAnonymous ? "Guest" : (user.email || "User");
        authStatus.textContent = `Signed in as: ${name}`;
        authStatus.style.color = "#2ecc71";
        if (gameLobby) gameLobby.style.display = "block";

        try {
          const userRef = db.ref(`users/${user.uid}`);
          const snap = await userRef.get();
          if (!snap.exists()) {
            await userRef.set({ createdAt: firebase.database.ServerValue.TIMESTAMP });
            log("Auth: Created minimal profile for new user:", user.uid);
          } else {
            log("Auth: User profile exists for:", user.uid);
          }
        } catch (e) {
          console.error("[auth] ensure profile failed", e);
        }

        listenForGames();
      } else {
        authStatus.textContent = "Not signed in";
        authStatus.style.color = "#e74c3c";
        if (gameLobby) gameLobby.style.display = "none";
        resetLocalState();
        log("Auth: Not signed in. Redirecting to login page.");
        // 🚀 Redirect to login page
        window.location.href = "../../../../login/fire-login.html";
      }
    }
  });

  try { chess.reset(); renderBoard(); if (whiteTimerBox) whiteTimerBox.style.display = "none"; if (blackTimerBox) blackTimerBox.style.display = "none"; log("Initial board setup complete."); } catch (e) { warn("initial render failed", e); }

  window.__script19 = { chess, renderBoard, initStockfish, makeAIMove, startAIGameRandomFirst, resetLocalState, listenForGames, joinGame, createGame, createRematch };
  log("script19 ready.");
})();
