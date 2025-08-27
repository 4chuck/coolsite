/* script21.js
   Chess: Firebase Auth + Lobby + Multiplayer + Chat + Local AI (Stockfish)
   Includes:
   - Auth
   - Lobby
   - Multiplayer sync (board, moves, timers)
   - Chat
   - Local AI fallback
   - Timer synced via Firebase (Realtime DB)
*/

(function () {
  const TAG = "[script21]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const err = (...a) => console.error(TAG, ...a);

  // Firebase setup
  const db = firebase.database();
  const auth = firebase.auth();

  // Chess.js + Stockfish
  const chess = new Chess();
  let engine = null;
  let engineReady = false;
  let engineInitializing = false;

  // UI refs
  const boardEl = document.getElementById("board");
  const loaderEl = document.getElementById("loader");
  const chatEl = document.getElementById("chat");
  const moveListEl = document.getElementById("moves");
  const lobbyEl = document.getElementById("lobby");
  const gameUIEl = document.getElementById("game");
  const statusEl = document.getElementById("status");
  const timerWhiteEl = document.getElementById("timerWhite");
  const timerBlackEl = document.getElementById("timerBlack");

  // Current state
  let currentGameId = null;
  let currentUser = null;
  let isWhite = false;
  let unsubscribeGame = null;

  // ---------------------------
  // Stockfish Loader
  // ---------------------------
  function initStockfish({ showLoader = false } = {}) {
    if (engine || engineInitializing) return;
    engineInitializing = true;

    if (showLoader) loaderEl.style.display = "block";

    engine = new Worker("https://cdn.jsdelivr.net/npm/stockfish/stockfish.js");
    engine.onmessage = (e) => {
      const line = ("" + e.data).trim();
      if (line === "uciok") {
        engineReady = true;
        engineInitializing = false;
        loaderEl.style.display = "none";
        log("Stockfish ready");
      }
    };

    engine.postMessage("uci");
  }

  // ---------------------------
  // Timer Management (Firebase synced)
  // ---------------------------
  let whiteTimer = null;
  let blackTimer = null;
  let lastTick = Date.now();

  function startTimers(gameId, turn) {
    stopTimers();
    lastTick = Date.now();

    if (turn === "w") {
      whiteTimer = setInterval(() => updateTimer(gameId, "white"), 1000);
    } else {
      blackTimer = setInterval(() => updateTimer(gameId, "black"), 1000);
    }
  }

  function stopTimers() {
    if (whiteTimer) clearInterval(whiteTimer);
    if (blackTimer) clearInterval(blackTimer);
    whiteTimer = null;
    blackTimer = null;
  }

  function updateTimer(gameId, color) {
    const now = Date.now();
    const delta = now - lastTick;
    lastTick = now;

    const ref = db.ref(`chess/${gameId}`);
    ref.transaction((game) => {
      if (!game) return game;
      if (color === "white") {
        game.timeWhiteMs = Math.max(0, (game.timeWhiteMs || 0) - delta);
      } else {
        game.timeBlackMs = Math.max(0, (game.timeBlackMs || 0) - delta);
      }
      game.updatedAt = Date.now();
      return game;
    });
  }

  function renderTimers(game) {
    timerWhiteEl.textContent = msToClock(game.timeWhiteMs || 0);
    timerBlackEl.textContent = msToClock(game.timeBlackMs || 0);
  }

  function msToClock(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  // ---------------------------
  // Auth
  // ---------------------------
  auth.onAuthStateChanged((user) => {
    if (user) {
      currentUser = user;
      log("Signed in", user.uid);
      loadLobby();
    } else {
      currentUser = null;
      auth.signInAnonymously();
    }
  });

  // ---------------------------
  // Lobby
  // ---------------------------
  function loadLobby() {
    lobbyEl.style.display = "block";
    gameUIEl.style.display = "none";

    db.ref("chess")
      .limitToLast(20)
      .on("value", (snap) => {
        const games = snap.val() || {};
        renderLobby(games);
      });
  }

  function renderLobby(games) {
    const listEl = document.getElementById("games");
    listEl.innerHTML = "";

    Object.entries(games).forEach(([id, game]) => {
      const li = document.createElement("li");
      li.textContent = `Game ${id} - ${game.status}`;
      li.onclick = () => joinGame(id);
      listEl.appendChild(li);
    });
  }

  async function createGame() {
    const gameRef = db.ref("chess").push();
    const payload = {
      playerWhite: currentUser.uid,
      playerBlack: null,
      board: chess.fen(),
      turn: chess.turn(),
      status: "waiting",
      winner: null,
      timeWhiteMs: 5 * 60 * 1000,
      timeBlackMs: 5 * 60 * 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
    };

    await gameRef.set(payload);
    joinGame(gameRef.key);
  }

  async function joinGame(gameId) {
    const ref = db.ref(`chess/${gameId}`);
    await ref.transaction((game) => {
      if (!game) return game;
      if (!game.playerBlack && game.playerWhite !== currentUser.uid) {
        game.playerBlack = currentUser.uid;
        game.status = "ongoing";
      }
      return game;
    });

    enterGame(gameId);
  }

  // ---------------------------
  // Game
  // ---------------------------
  function enterGame(gameId) {
    currentGameId = gameId;
    lobbyEl.style.display = "none";
    gameUIEl.style.display = "block";

    if (unsubscribeGame) unsubscribeGame();
    unsubscribeGame = db.ref(`chess/${gameId}`).on("value", (snap) => {
      const game = snap.val();
      if (!game) return;
      renderGame(game);
    });
  }

  function renderGame(game) {
    // timers
    renderTimers(game);
    if (game.status === "ongoing") {
      startTimers(currentGameId, game.turn);
    } else {
      stopTimers();
    }

    // board
    statusEl.textContent = `Turn: ${game.turn === "w" ? "White" : "Black"}`;
    // TODO: integrate chessboard.js to render board
  }

  // ---------------------------
  // Chat
  // ---------------------------
  function sendChat(gameId, text) {
    const msgRef = db.ref(`chess/${gameId}/chat`).push();
    msgRef.set({
      user: currentUser.displayName || "anon",
      text,
      userId: currentUser.uid,
      ts: Date.now(),
    });
  }

  // ---------------------------
  // Expose
  // ---------------------------
  window.createGame = createGame;
  window.joinGame = joinGame;
  window.sendChat = sendChat;
})();
