/* script19.js
   Chess: Firebase Auth + Lobby + Multiplayer + Chat + Local AI (Stockfish)
   Includes:
   (3) Per-move 30s timer for each player. If timer runs out, turn switches and timer resets.
   (4) AI difficulty (easy/medium/hard) via styled modal
   (6) Game list / lobby browser
   (7) Player profiles + Elo rating in Firebase
   (8) Rematch button in game-over modal

   Notes:
   - Uses chess.js public API: isCheckmate(), isStalemate(), isInsufficientMaterial(), isThreefoldRepetition(), isDraw(), inCheck()
   - Multiplayer clock is authoritative via Firebase (transaction).
   - Local vs AI clock is purely local.
   - Only the active player's timer is *ticking* and visible.
*/

(function () {
  const TAG = "[script19]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const err = (...a) => console.error(TAG, ...a);

  // ---------- CONFIG ----------
  const STOCKFISH_WORKER_PATH = window.STOCKFISH_PATH || "stockfish/stockfish-17.1-lite-single-03e3232.js";
  const ENGINE_INIT_TIMEOUT_MS = 12000;

  const DEFAULT_AI_DEPTHS = { easy: 3, medium: 8, hard: 15 };
  const DEFAULT_AI_LEVEL = "medium";

  // Per-move timer config
  const MOVE_TIME_MS = 30 * 1000;
  let activeColor = "w";
  let moveTimerMs = MOVE_TIME_MS;
  let moveTimerHandle = null;
  let moveTimerLastTs = 0;

  // Elo config
  const ELO_K = 32;
  const ELO_START = 1200;

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

  // ---------- INIT FIREBASE ----------
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      log("Firebase initialized");
    }
  } catch (e) {
    err("Firebase init failed:", e);
  }

  const auth = firebase.auth();
  const db = firebase.database();

  // ---------- chess.js presence ----------
  if (!window.Chess) {
    err("chess.js not found. Load chess.js before this file.");
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

  // ---------- Timer visibility helpers ----------
  function showTimers() {
    if (whiteTimerBox) whiteTimerBox.style.display = "block";
    if (blackTimerBox) blackTimerBox.style.display = "block";
  }
  function hideTimers() {
    if (whiteTimerBox) whiteTimerBox.style.display = "none";
    if (blackTimerBox) blackTimerBox.style.display = "none";
  }

  // ---------- Small UI helpers ----------
  function calert(message, duration = 2000) {
    if (!customAlertDiv) {
      alert(message);
      return;
    }
    customAlertDiv.textContent = message;
    customAlertDiv.classList.remove("hidden");
    customAlertDiv.style.display = "block";
    customAlertDiv.style.opacity = "1";
    setTimeout(() => {
      customAlertDiv.style.opacity = "0";
      setTimeout(() => {
        customAlertDiv.style.display = "none";
        customAlertDiv.classList.add("hidden");
      }, 220);
    }, duration);
  }

  function showStockfishLoader() {
    if (stockfishOverlay) {
      stockfishOverlay.style.display = "flex";
      stockfishOverlay.classList.remove("hidden");
    }
  }
  function hideStockfishLoader() {
    if (stockfishOverlay) {
      stockfishOverlay.style.display = "none";
      stockfishOverlay.classList.add("hidden");
    }
  }

  // ---------- Game + App state ----------
  let chess = new window.Chess();
  let selected = null;
  let possible = [];
  let lastMove = null;

  let currentUser = null;
  let currentGameId = null;
  let playerColor = null; // "white" | "black"
  let unsubGameValue = null;
  let unsubChatChildAdded = null;

  // ---------- Engine state ----------
  let engine = null;
  let engineReady = false;
  let engineInitializing = false;
  let engineSearching = false;
  let engineQueue = [];
  let engineInitTimeoutHandle = null;
  let aiLevel = DEFAULT_AI_LEVEL;
  let aiDepth = DEFAULT_AI_DEPTHS[aiLevel];

  // ---------- Timer helpers ----------
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

  // Show only active player's timer
  function updateMoveTimerDisplay(ms, color) {
    if (whiteTimerSpan) whiteTimerSpan.textContent = color === "w" ? formatMs(ms) : "";
    if (blackTimerSpan) blackTimerSpan.textContent = color === "b" ? formatMs(ms) : "";
    setActiveTimerDisplay(color);
  }

  // Start per-move timer for color
  function startMoveTimer(color = "w") {
    stopMoveTimer();
    activeColor = color;
    moveTimerMs = MOVE_TIME_MS;
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
        // End the game when time runs out
        handleGameEnd(`Time out! ${activeColor === "w" ? "White" : "Black"} loses.`);
        stopMoveTimer();
        renderBoard();
      }
    }, 250);
  }

  function stopMoveTimer() {
    if (moveTimerHandle) { clearInterval(moveTimerHandle); moveTimerHandle = null; }
  }

  // Call this after every move
  function onMoveApplied() {
    activeColor = activeColor === "w" ? "b" : "w";
    startMoveTimer(activeColor);
  }

  // ---------- Board rendering ----------
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

  function clearSelection() { selected = null; possible = []; }
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
  }

  // ---------- Click handler ----------
  function onSquareClick(e) {
    const el = e.currentTarget;
    const row = parseInt(el.dataset.row, 10);
    const col = parseInt(el.dataset.col, 10);
    const square = algebraicFromRC(row, col);

    // Multiplayer: must move only on your turn
    if (currentGameId && playerColor) {
      const mySide = playerColor[0]; // 'w' or 'b'
      if (mySide !== chess.turn()) { calert("It's not your turn."); return; }
    }

    // If a piece was selected -> attempt move
    if (selected && possible && possible.length) {
      const from = algebraicFromRC(selected.row, selected.col);
      if (from === square) { clearSelection(); renderBoard(); return; }

      let mv = null;
      try { mv = chess.move({ from, to: square, promotion: "q" }); } catch { mv = null; }
      clearSelection();

      if (mv) {
        lastMove = { from: mv.from, to: mv.to };
        onMoveApplied();
        renderBoard();
        // Multiplayer: update board and turn in Firebase
        if (currentGameId) {
          db.ref(`chess/${currentGameId}`).update({
            board: chess.fen(),
            turn: chess.turn()
          });
        }
        if (!chess.isGameOver()) setTimeout(() => makeAIMove(aiDepth), 300);
        checkForEndAndNotify();
        return;
      } else {
        calert("Invalid move");
        renderBoard();
        return;
      }
    }

    // Select piece (only your color in multiplayer)
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

  // ---------- Undo ----------
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (currentGameId) { calert("Undo is only available in AI games."); return; }
      if (chess.history().length === 0) { calert("No moves to undo"); return; }
      chess.undo();
      if (!currentGameId && chess.history().length > 0) chess.undo(); // undo AI reply too
      lastMove = null;
      clearSelection();
      renderBoard();
    });
  }

  // ---------- Game end / modal / rematch ----------
  function showGameOverModal(message, showRematch = false) {
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
    let msg = "Game over.";
    if (chess.isCheckmate()) msg = "Checkmate!";
    else if (chess.isStalemate()) msg = "Stalemate.";
    else if (chess.isInsufficientMaterial()) msg = "Draw: Insufficient material.";
    else if (chess.isThreefoldRepetition()) msg = "Draw: Repetition.";
    else if (chess.isDraw()) msg = "Draw.";
    if (endReason) msg += " " + endReason;

    // Unsubscribe value listener before updating to prevent recursion
    if (currentGameId && unsubGameValue) {
      try {
        db.ref(`chess/${currentGameId}`).off("value", unsubGameValue);
        unsubGameValue = null;
      } catch (e) { /* ignore */ }
    }

    if (currentGameId) {
      const winnerColor =
        chess.isCheckmate()
          ? (chess.turn() === "w" ? "black" : "white")
          : (endReason.startsWith("Time out") ? (endReason.includes("White") ? "black" : "white") : null);

      const updates = { status: "completed", completedAt: firebase.database.ServerValue.TIMESTAMP };
      if (winnerColor) updates.winner = winnerColor;

      db.ref(`chess/${currentGameId}`).update(updates).catch(e => warn("status update failed", e));
      if (winnerColor) {
        try {
          updateEloForGame(currentGameId, winnerColor);
        } catch (e) {
          warn("Elo update failed", e);
        }
      }
    }

    showGameOverModal(msg, !!currentGameId);
    stopMoveTimer();
    setTimeout(() => resetLocalState(), 5200);
  }

  function checkForEndAndNotify() {
    if (chess.isGameOver()) handleGameEnd();
  }

  // ---------- Lobby ----------
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
        Object.entries(games).forEach(([gid, g]) => {
          const li = document.createElement("li");
          li.className = "lobby-item";

          let status = g.status || (g.playerWhite && g.playerBlack ? "playing" : "waiting");
          status = String(status).replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
          li.innerHTML = `<span class="gid">Game: ${gid}</span> <span class="status">(${status})</span>`;

          if (!g.playerBlack && g.playerWhite !== currentUser?.uid && (!g.status || g.status === "waiting")) {
            const btn = document.createElement("button");
            btn.textContent = "Join as Black";
            btn.className = "btn";
            btn.addEventListener("click", () => joinGame(gid));
            li.appendChild(btn);
          }
          if ((g.playerWhite === currentUser?.uid || g.playerBlack === currentUser?.uid) &&
              g.status !== "completed" && g.status !== "abandoned") {
            const rejoin = document.createElement("button");
            rejoin.textContent = "Rejoin";
            rejoin.className = "btn secondary";
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

  async function joinGame(gid) {
    if (undoBtn) undoBtn.style.display = "none"; // hide in multiplayer
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
        else return; // conflict
        if (current.playerWhite && current.playerBlack && current.status === "waiting") current.status = "playing";
        return current;
      });

      if (!tx.committed || !assigned) { calert("Could not join (full/conflict)"); return; }

      currentGameId = gid;
      playerColor = assigned;
      if (gameTitle) gameTitle.textContent = `Game ${gid} (${playerColor})`;
      if (gameLobby) gameLobby.style.display = "none";
      if (chessGameDiv) chessGameDiv.style.display = "block";
      showTimers();

      const snap = await ref.get();
      const data = snap.val();
      if (data?.board) { try { chess.load(data.board); } catch { chess.reset(); } }
      else { chess.reset(); }

      if (document.getElementById("player-elo")) {
    document.getElementById("player-elo").style.display = "block";
      }

      renderBoard();
      updateTurnAndStatusText();
      updateEloDisplay(gid);
      subscribeToGame(gid);
    } catch (e) {
      err("joinGame failed", e);
      calert("Join failed");
    }
  }

// Add this function to your JS (e.g. after joinGame or subscribeToGame)
async function updateEloDisplay(gid) {
  try {
    const gref = db.ref(`chess/${gid}`);
    const snap = await gref.get();
    const g = snap.val();
    if (!g) return;

    const wUID = g.playerWhite;
    const bUID = g.playerBlack;
    if (!wUID || !bUID) return;

    const wRef = db.ref(`users/${wUID}`);
    const bRef = db.ref(`users/${bUID}`);
    const [wSnap, bSnap] = await Promise.all([wRef.get(), bRef.get()]);

    const wElo = wSnap.val()?.rating ?? ELO_START;
    const bElo = bSnap.val()?.rating ?? ELO_START;

    if (document.getElementById("white-elo")) {
      document.getElementById("white-elo").textContent = `White Elo: ${wElo}`;
      console.log('white-elo')
    }
    if (document.getElementById("black-elo")) {
      document.getElementById("black-elo").textContent = `Black Elo: ${bElo}`;
      console.log('black-elo')
    }
  } catch (e) {
    warn("Failed to fetch Elo", e);
    console.log('elo fetching failed')
  }
}

  function subscribeToGame(gid) {
    try {
      const gref = db.ref(`chess/${gid}`);
      gref.off();
      const handler = snap => {
        const data = snap.val();
        if (!data) {
          calert("Game removed");
          resetLocalState();
          return;
        }
        // Always reload board if changed
        if (data.board && data.board !== chess.fen()) {
          try { chess.load(data.board); renderBoard(); } catch (e) { warn("Invalid FEN from server", e); chess.reset(); renderBoard(); }
        }
        if (data.status === "completed") {
          handleGameEnd();
        }
      };
      gref.on("value", handler);
      unsubGameValue = handler;

      const cref = db.ref(`chess/${gid}/chat`);
      cref.off();
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
      unsubChatChildAdded = chatHandler;
    } catch (e) {
      err("subscribeToGame failed", e);
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
          try { db.ref(`chess/${currentGameId}`).off("value", unsubGameValue || undefined); } catch {}
          try { db.ref(`chess/${currentGameId}/chat`).off("child_added", unsubChatChildAdded || undefined); } catch {}
          unsubGameValue = null; unsubChatChildAdded = null;
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

    if (document.getElementById("player-elo")) {
    document.getElementById("player-elo").style.display = "none";
  }

    if (engine) {
      try {
        if (typeof engine.terminate === "function") engine.terminate();
        else if (typeof engine.kill === "function") engine.kill();
        else if (typeof engine.close === "function") engine.close();
      } catch {}
    }
    engine = null; engineReady = false; engineInitializing = false; engineSearching = false;
    engineQueue = [];
    if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
    hideStockfishLoader();

    stopMoveTimer();
    hideTimers();

    if (chessGameDiv) chessGameDiv.style.display = "none";
    if (gameLobby) gameLobby.style.display = "block";
    if (messagesDiv) messagesDiv.innerHTML = "";
    if (currentTurnSpan) currentTurnSpan.textContent = "White";
    if (gameStatusSpan) gameStatusSpan.textContent = "Not started";
  }

  // ---------- Chat ----------
  function sendChat() {
    const txt = (chatInput?.value || "").trim();
    if (!txt) return;
    if (!currentGameId) { calert("Chat is multiplayer only"); return; }
    const safeTxt = txt.replace(/[<>]/g, "");
    const cref = db.ref(`chess/${currentGameId}/chat`);
    const payload = {
      text: safeTxt,
      user: currentUser?.isAnonymous ? "Guest" : (currentUser?.email || "Player"),
      userId: currentUser?.uid || null,
      ts: firebase.database.ServerValue.TIMESTAMP
    };
    try { cref.push(payload).catch(e => err("chat push fail", e)); } catch (e) { err("chat push outer fail", e); }
    if (chatInput) chatInput.value = "";
  }

  // ---------- Difficulty modal & AI starts ----------
  function openDifficultyModal(onPick) {
    if (!difficultyModal) {
      aiLevel = DEFAULT_AI_LEVEL;
      aiDepth = DEFAULT_AI_DEPTHS[aiLevel];
      onPick?.(aiLevel);
      return;
    }
    difficultyModal.classList.remove("hidden");
    difficultyModal.style.display = "flex";

    const handler = (level) => {
      difficultyModal.classList.add("hidden");
      difficultyModal.style.display = "none";
      aiLevel = level;
      aiDepth = DEFAULT_AI_DEPTHS[aiLevel] || DEFAULT_AI_DEPTHS[DEFAULT_AI_LEVEL];
      onPick?.(aiLevel);
    };

    difficultyButtons.forEach(btn => {
      btn.onclick = () => handler(btn.dataset.diff);
    });
  }

  function startAIGameRandomFirst() {
    if (undoBtn) undoBtn.style.display = "inline-block"; // show in local AI mode
    currentGameId = null;
    chess.reset();
    lastMove = null;
    clearSelection();

    openDifficultyModal((level) => {
      if (chessGameDiv) chessGameDiv.style.display = "block";
      if (gameLobby) gameLobby.style.display = "none";
      showTimers();

    if (document.getElementById("player-elo")) {
    document.getElementById("player-elo").style.display = "none";
  }

      if (Math.random() < 0.5) {
        playerColor = "white";
        if (gameTitle) gameTitle.textContent = `Play vs AI (You: White, ${level.toUpperCase()})`;
        calert("You play first (White)");
        activeColor = "w";
        startMoveTimer("w");
        renderBoard();
      } else {
        playerColor = "black";
        if (gameTitle) gameTitle.textContent = `Play vs AI (You: Black, ${level.toUpperCase()})`;
        calert("AI plays first (White)");
        activeColor = "w";
        startMoveTimer("w");
        renderBoard();
        if (!engine && !engineInitializing) initStockfish({ showLoader: false });
        setTimeout(() => makeAIMove(aiDepth), 420);
      }

      if (messagesDiv && messagesDiv.parentElement) messagesDiv.parentElement.style.display = "none";
      updateTurnAndStatusText();
    });
  }

  // ---------- Engine helpers ----------
  function enginePost(cmd) {
    if (!engine) { engineQueue.push(cmd); return; }
    if (!engineReady && !/^(uci|isready|ucinewgame|setoption|quit)/.test(cmd)) {
      engineQueue.push(cmd); return;
    }
    try { engine.postMessage(cmd); } catch { engineQueue.push(cmd); }
  }
  function flushEngineQueue() {
    if (!engine) return;
    while (engineQueue.length) {
      const cmd = engineQueue.shift();
      try { engine.postMessage(cmd); } catch { engineQueue.unshift(cmd); break; }
    }
  }

  function initStockfish(opts = {}) {
    const showLoader = opts.showLoader !== false;
    if (engine || engineInitializing) return;

    engineInitializing = true;
    engineReady = false;
    engineSearching = false;
    engineQueue = [];

    if (showLoader) showStockfishLoader();

    let created = false;
    try {
      if (typeof Worker === "function") {
        try {
          engine = new Worker(STOCKFISH_WORKER_PATH);
          created = true;
        } catch (we) {
          warn("Worker creation failed", we);
          engine = null;
        }
      }
    } catch (e) {
      warn("Worker not available", e);
    }

    if (!created && typeof window.STOCKFISH === "function") {
      try {
        engine = window.STOCKFISH();
        created = true;
      } catch (e) {
        warn("window.STOCKFISH fallback failed", e);
        engine = null;
      }
    }

    if (!created || !engine) {
      engineInitializing = false;
      engineReady = false;
      if (showLoader) hideStockfishLoader();
      calert("Could not start AI engine");
      return;
    }

    engine.onmessage = function (ev) {
      const line = typeof ev?.data === "string" ? ev.data : String(ev?.data?.text || ev?.data || "");

      if (/uciok/.test(line)) { enginePost("isready"); return; }
      if (/readyok/.test(line)) {
        engineReady = true;
        engineInitializing = false;
        flushEngineQueue();
        if (showLoader) hideStockfishLoader();
        if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
        return;
      }
      if (/^(id |option )/.test(line)) {
        if (!engineReady) {
          engineReady = true;
          engineInitializing = false;
          flushEngineQueue();
          if (showLoader) hideStockfishLoader();
          if (engineInitTimeoutHandle) { clearTimeout(engineInitTimeoutHandle); engineInitTimeoutHandle = null; }
        }
        return;
      }

      if (/^bestmove /.test(line)) {
        engineSearching = false;
        const parts = line.split(/\s+/);
        const best = parts[1];
        if (!best || best === "(none)") return;

        if (!currentGameId) {
          const moveObj = { from: best.slice(0, 2), to: best.slice(2, 4), promotion: "q" };
          const res = chess.move(moveObj);
          if (res) {
            lastMove = { from: res.from, to: res.to };
            onMoveApplied();
            renderBoard();
            checkForEndAndNotify();
          }
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
    };

    engineInitTimeoutHandle = setTimeout(() => {
      if (!engineReady) {
        warn("Engine init timed out");
        engineInitializing = false;
        engineReady = false;
        engineSearching = false;
        if (showLoader) hideStockfishLoader();
        calert("Engine timeout; continuing without AI.");
      }
    }, ENGINE_INIT_TIMEOUT_MS);

    try {
      engine.postMessage("uci");
      engine.postMessage("isready");
      engine.postMessage("ucinewgame");
    } catch (e) {
      err("Engine handshake failed", e);
      engineInitializing = false;
      engineReady = false;
      if (showLoader) hideStockfishLoader();
      calert("Engine handshake failed");
    }
  }

  function makeAIMove(depth) {
    if (currentGameId) return; // multiplayer: no AI
    if (chess.isGameOver()) { checkForEndAndNotify(); return; }
    if (!engine && !engineInitializing) initStockfish({ showLoader: false });
    engineSearching = true;
    enginePost("position fen " + chess.fen());
    enginePost("go depth " + (depth || aiDepth));
  }

  // ---------- Profiles & Elo ----------
  async function ensureUserProfile(uid, email, isAnon) {
    if (!uid) return;
    const pref = db.ref(`users/${uid}`);
    const snap = await pref.get();
    if (snap.exists()) return;
    const username = isAnon ? "Guest" : (email ? email.split("@")[0] : "Player");
    await pref.set({
      username,
      rating: ELO_START,
      wins: 0,
      losses: 0,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

async function updateEloForGame(gid, winnerColor /* "white" | "black" */) {
  try {
    const gref = db.ref(`chess/${gid}`);
    const snap = await gref.get();
    const g = snap.val();
    if (!g) return;

    const wUID = g.playerWhite;
    const bUID = g.playerBlack;
    if (!wUID || !bUID) return;

    const wRef = db.ref(`users/${wUID}`);
    const bRef = db.ref(`users/${bUID}`);
    const [wSnap, bSnap] = await Promise.all([wRef.get(), bRef.get()]);

    const w = wSnap.val() || { rating: ELO_START, wins: 0, losses: 0 };
    const b = bSnap.val() || { rating: ELO_START, wins: 0, losses: 0 };

    const Ra = w.rating ?? ELO_START;
    const Rb = b.rating ?? ELO_START;

    const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
    const Eb = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));

    let Sa, Sb;
    if (winnerColor === "white") { Sa = 1; Sb = 0; }
    else if (winnerColor === "black") { Sa = 0; Sb = 1; }
    else { Sa = 0.5; Sb = 0.5; }

    const newRa = Math.round(Ra + ELO_K * (Sa - Ea));
    const newRb = Math.round(Rb + ELO_K * (Sb - Eb));

    const wWins = w.wins ?? 0;
    const wLosses = w.losses ?? 0;
    const bWins = b.wins ?? 0;
    const bLosses = b.losses ?? 0;

    if (winnerColor === "white") {
      await Promise.all([
        wRef.update({ rating: newRa, wins: wWins + 1 }),
        bRef.update({ rating: newRb, losses: bLosses + 1 }),
      ]);
    } else if (winnerColor === "black") {
      await Promise.all([
        wRef.update({ rating: newRa, losses: wLosses + 1 }),
        bRef.update({ rating: newRb, wins: bWins + 1 }),
      ]);
    } else {
      await Promise.all([
        wRef.update({ rating: newRa }),
        bRef.update({ rating: newRb }),
      ]);
    }

    // Optionally update Elo in UI if elements exist
    if (document.getElementById("white-elo")) {
      document.getElementById("white-elo").textContent = `White Elo: ${newRa}`;
    }
    if (document.getElementById("black-elo")) {
      document.getElementById("black-elo").textContent = `Black Elo: ${newRb}`;
    }
  } catch (e) {
    warn("Elo update failed", e);
    calert("Elo update failed. Please check your permissions.");
  }
}

  // ---------- Rematch ----------
  async function createRematch() {
    if (!currentGameId) return;
    const oldSnap = await db.ref(`chess/${currentGameId}`).get();
    const g = oldSnap.val();
    if (!g) return;
    if (!g.playerWhite || !g.playerBlack) return;

    chess.reset();

    const ref = db.ref("chess").push();
    const gid = ref.key;
    const payload = {
      playerWhite: g.playerBlack, // swap colors
      playerBlack: g.playerWhite,
      board: chess.fen(),
      turn: chess.turn(),
      status: "waiting",
      chat: [],
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      rematchOf: currentGameId
    };
    await ref.set(payload);
    await joinGame(gid);
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

  // ---------- Auth listener ----------
  auth.onAuthStateChanged(async (user) => {
  currentUser = user || null;

  if (authStatus) {
    if (user) {
      const name = user.isAnonymous ? "Guest" : (user.email || "User");
      authStatus.textContent = `Signed in as: ${name}`;
      authStatus.style.color = "#2ecc71";

      if (gameLobby) gameLobby.style.display = "block";

      // ✅ Ensure user profile exists in /users
      try {
        const userRef = db.ref(`users/${user.uid}`);
        const snap = await userRef.get();

        if (!snap.exists()) {
          await userRef.set({
            rating: 1200,
            wins: 0,
            losses: 0,
            createdAt: Date.now()
          });
          console.log("[auth] New user profile created:", user.uid);
        } else {
          console.log("[auth] Existing user profile loaded:", user.uid);
        }
      } catch (e) {
        console.error("[auth] Failed to ensure user profile:", e);
      }

      listenForGames();
    } else {
      authStatus.textContent = "Not signed in";
      authStatus.style.color = "#e74c3c";
      if (gameLobby) gameLobby.style.display = "none";

      resetLocalState();
    }
  }
});

  // ---------- Initial render ----------
  try { chess.reset(); renderBoard(); hideTimers(); } catch (e) { warn("initial render failed", e); }

  // Expose debug helpers
  window.__script19 = {
    chess, renderBoard, initStockfish, makeAIMove, startAIGameRandomFirst,
    resetLocalState, listenForGames, joinGame, createGame, createRematch
  };

  log("script19 ready.");
})();
// 