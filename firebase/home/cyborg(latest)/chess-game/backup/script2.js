// script2.js - Updated with diagnostics, blob-worker fallback, and verbose logs

// === Config / filenames - CHANGE if your filenames differ ===
const STOCKFISH_FOLDER = "stockfish/";
const STOCKFISH_JS_NAME = "stockfish-17.1-lite-single-03e3232.js"; // change to your JS file name
const STOCKFISH_JS_PATH = STOCKFISH_FOLDER + STOCKFISH_JS_NAME;

// === Firebase config (unchanged) ===
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

// === Chess state ===
let chess = new Chess();

// === Engine state / queue ===
let stockfish = null;
let engineReady = false;
let engineSearching = false;
let engineQueue = [];

// Helper log prefix
function L(...args) { console.log("[script2]", ...args); }

// Engine posting with queue when not ready
function enginePost(cmd) {
  if (!stockfish) {
    L("[ENGINE] No worker yet - queuing:", cmd);
    engineQueue.push(cmd);
    return;
  }
  if (!engineReady && !/^(uci|isready|setoption|quit|ucinewgame)/i.test(cmd)) {
    L("[ENGINE] Not ready - queueing:", cmd);
    engineQueue.push(cmd);
    return;
  }
  L("[ENGINE] Posting ->", cmd);
  stockfish.postMessage(cmd);
}

function flushEngineQueue() {
  L("[ENGINE] Flushing queue length:", engineQueue.length);
  while (engineQueue.length) {
    const c = engineQueue.shift();
    L("[ENGINE] flush ->", c);
    try { stockfish.postMessage(c); } catch (e) { L("[ENGINE] flush post failed:", e); engineQueue.unshift(c); break; }
  }
}

// Try to detect referenced wasm filename by scanning JS content (best-effort)
async function detectWasmFilename(jsPath) {
  try {
    const resp = await fetch(jsPath);
    if (!resp.ok) {
      L("[DETECT] Failed to fetch JS file:", jsPath, resp.status);
      return null;
    }
    const txt = await resp.text();
    // find a ".wasm" filename occurrence
    const m = txt.match(/([A-Za-z0-9_\-\.]+\.wasm)/i);
    if (m && m[1]) {
      L("[DETECT] Detected wasm file name in JS:", m[1]);
      return m[1];
    }
    L("[DETECT] No wasm filename found by regex in JS; script may build wasm via other names.");
    return null;
  } catch (err) {
    L("[DETECT] Exception fetching JS:", err);
    return null;
  }
}

// Create worker via blob that importScripts the JS file (often more reliable)
async function createWorkerViaBlob(jsPath) {
  L("[WORKER] Creating worker via blob import of:", jsPath);
  try {
    const blobScript = `importScripts("${jsPath}");`;
    const blob = new Blob([blobScript], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const w = new Worker(blobUrl);
    L("[WORKER] Worker created from blob.");
    return w;
  } catch (err) {
    L("[WORKER] Blob worker creation failed:", err);
    throw err;
  }
}

// Attach engine handlers (message/error)
function attachEngineHandlers(w) {
  stockfish = w;
  stockfish.onmessage = (ev) => {
    const raw = ev.data;
    const line = (typeof raw === "string") ? raw : String(raw);
    L("[STOCKFISH MESSAGE]", line);

    // handshake
    if (/^uciok$/i.test(line)) {
      L("[STOCKFISH] uciok -> send isready");
      stockfish.postMessage("isready");
      return;
    }
    if (/^readyok$/i.test(line)) {
      engineReady = true;
      L("[STOCKFISH] readyok -> engineReady = true");
      flushEngineQueue();
      return;
    }

    // info... you can parse for UI
    if (line.startsWith("info")) {
      // L("[STOCKFISH INFO]", line);
      return;
    }

    if (line.startsWith("bestmove")) {
      engineSearching = false;
      const parts = line.split(" ");
      const best = parts[1];
      L("[STOCKFISH] bestmove ->", best);
      if (!best || best === "(none)") {
        L("[STOCKFISH] bestmove empty -> check game over");
        checkGameOver();
        return;
      }
      const from = best.slice(0, 2), to = best.slice(2, 4), promo = best.length > 4 ? best.slice(4) : "q";
      const mv = chess.move({ from, to, promotion: promo });
      if (!mv) {
        L("[STOCKFISH] Failed to apply bestmove to chess.js:", best);
      } else {
        L("[ENGINE] Applied bestmove:", mv.san);
        renderBoard(chess.board());
        currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
        checkGameOver();
      }
    }
  };

  stockfish.onerror = (ev) => {
    L("[STOCKFISH ERROR EVENT]", ev);
    L("[STOCKFISH ERROR] Worker runtime error or wasm failed to load. Check network tab for .wasm requests and ensure file(s) exist and are accessible.");
    gameStatusSpan.textContent = "⚠️ Stockfish worker runtime error — check console/network.";
  };

  L("[WORKER] Handlers attached.");
}

// Init engine with best-effort methods and diagnostics
async function initStockfish() {
  if (stockfish) { L("[INIT] Stockfish already initialized."); return; }
  L("[INIT] Starting Stockfish. JS path:", STOCKFISH_JS_PATH);

  // 1) Try direct Worker() with the JS path (most common)
  try {
    const w = new Worker(STOCKFISH_JS_PATH);
    attachEngineHandlers(w);
    L("[INIT] Worker created with new Worker(path). Sent UCI handshake next.");
    engineReady = false; engineSearching = false; engineQueue = [];
    // kick handshake
    enginePost("uci"); enginePost("isready"); enginePost("ucinewgame");
    return;
  } catch (err) {
    L("[INIT] new Worker(path) failed:", err);
  }

  // 2) Try blob-import fallback
  try {
    // detect wasm name for diagnostics
    const wasmCandidate = await detectWasmFilename(STOCKFISH_JS_PATH);
    if (wasmCandidate) {
      const wasmUrl = STOCKFISH_FOLDER + wasmCandidate;
      try {
        const r = await fetch(wasmUrl, { method: "HEAD" });
        L("[DETECT] wasm HEAD", wasmUrl, "status:", r.status);
      } catch (e) {
        L("[DETECT] wasm HEAD check failed (network):", e);
      }
    }

    const w2 = await createWorkerViaBlob(STOCKFISH_JS_PATH);
    attachEngineHandlers(w2);
    engineReady = false; engineSearching = false; engineQueue = [];
    enginePost("uci"); enginePost("isready"); enginePost("ucinewgame");
    L("[INIT] Blob-worker created and handshake posted.");
    return;
  } catch (err) {
    L("[INIT] Blob-worker fallback failed:", err);
  }

  // 3) Last resort: try fetch the JS, then create blob with full content (embedding)
  try {
    L("[INIT] Attempting to fetch JS and create full inline worker (last resort).");
    const r = await fetch(STOCKFISH_JS_PATH);
    if (!r.ok) throw new Error("Fetch of stockfish JS failed: " + r.status);
    const jsText = await r.text();
    const blob = new Blob([jsText], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const w3 = new Worker(blobUrl);
    attachEngineHandlers(w3);
    engineReady = false; engineSearching = false; engineQueue = [];
    enginePost("uci"); enginePost("isready"); enginePost("ucinewgame");
    L("[INIT] Inline-worker (fetched JS) created and handshake posted.");
    return;
  } catch (err) {
    L("[INIT] Inline fetch-worker failed too:", err);
  }

  L("[INIT] All attempts failed. Ensure the JS and wasm files are present under /stockfish and accessible by the browser.");
  gameStatusSpan.textContent = "⚠️ Stockfish init failed. Check console and Network tab.";
}

// Request AI move (safe: queues if engine not ready)
function makeAIMove() {
  L("[AI] makeAIMove called. chess.isGameOver:", chess.isGameOver());
  initStockfish();
  if (!stockfish) { L("[AI] no worker available; aborting makeAIMove"); return; }
  if (chess.isGameOver()) { checkGameOver(); return; }

  const fen = chess.fen();
  L("[AI] Sending position fen:", fen);
  enginePost("position fen " + fen);
  engineSearching = true;
  enginePost("go depth 12");
  L("[AI] Posted go depth 12.");
}

function checkGameOver() {
  if (chess.isGameOver()) {
    let msg = "Game over";
    if (chess.isCheckmate()) msg = "Checkmate!";
    else if (chess.isDraw()) msg = "Draw.";
    gameStatusSpan.textContent = msg;
    L("[GAME] " + msg);
  }
}

// ----------------- UI / board code -----------------
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

let currentUser = null;
let currentGameId = null;
let playerColor = null;
let selectedPiece = null;

function renderBoard(boardArray) {
  chessboardDiv.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement("div");
      square.classList.add("square");
      square.classList.add((r + c) % 2 === 0 ? "light" : "dark");
      square.dataset.row = r;
      square.dataset.col = c;

      const piece = boardArray[r][c];
      if (piece) {
        square.innerHTML = getPieceUnicode(piece.type, piece.color);
        square.classList.add("piece");
      }
      square.addEventListener("click", handleSquareClickEvent);
      chessboardDiv.appendChild(square);
    }
  }
}

function getPieceUnicode(pieceType, color) {
  const pieces = {
    k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙",
    K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟",
  };
  return color === "w" ? pieces[pieceType.toLowerCase()] : pieces[pieceType.toUpperCase()];
}

function handleSquareClickEvent(event) {
  const clickedSquare = event.target.closest(".square");
  if (!clickedSquare) return;
  const row = parseInt(clickedSquare.dataset.row, 10);
  const col = parseInt(clickedSquare.dataset.col, 10);
  const algebraicSquare = `${String.fromCharCode(97 + col)}${8 - row}`;
  L("[CLICK] clicked", { row, col, algebraicSquare });

  if (selectedPiece) {
    const fromSquare = `${String.fromCharCode(97 + selectedPiece.col)}${8 - selectedPiece.row}`;
    L("[MOVE] attempting", fromSquare, "->", algebraicSquare);
    const mv = chess.move({ from: fromSquare, to: algebraicSquare, promotion: "q" });
    deselectPiece();
    if (mv) {
      L("[MOVE] applied:", mv.san);
      renderBoard(chess.board());
      currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
      checkGameOver();
      if (currentGameId) {
        db.ref(`chess/${currentGameId}`).update({ board: chess.fen(), turn: chess.turn() });
      } else {
        if (!chess.isGameOver()) { L("[LOCAL AI] scheduling AI..."); setTimeout(makeAIMove, 250); }
      }
    } else {
      L("[MOVE] illegal move attempted:", fromSquare, "->", algebraicSquare);
    }
    return;
  }

  const pieceAt = chess.get(algebraicSquare);
  if (pieceAt) {
    selectedPiece = { row, col, type: pieceAt.type, color: pieceAt.color };
    clickedSquare.classList.add("selected");
    L("[SELECT] selected at", algebraicSquare, pieceAt);
  } else {
    L("[SELECT] clicked empty square");
  }
}

function deselectPiece() {
  const sq = document.querySelector(".square.selected");
  if (sq) sq.classList.remove("selected");
  selectedPiece = null;
}

// Firebase auth & multiplayer (same as before, with extra logs)
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    L("[AUTH] Signed in:", user.uid);
    gameLobby.style.display = "block";
    listenForGames();
  } else {
    L("[AUTH] Not signed in - trying anon sign-in...");
    auth.signInAnonymously()
      .then(() => L("[AUTH] Anonymous sign-in success"))
      .catch((err) => { L("[AUTH] Anonymous sign-in failed:", err); gameStatusSpan.textContent = "⚠️ Firebase anon sign-in restricted"; });
  }
});

function listenForGames() {
  L("[MULTI] listening for games...");
  const chessRef = db.ref("chess");
  chessRef.on("value", (snap) => {
    gameList.innerHTML = "";
    const games = snap.val();
    if (!games) return;
    Object.entries(games).forEach(([id, g]) => {
      const li = document.createElement("li");
      li.textContent = `Game ${id} (${g.status})`;
      if (!g.playerBlack && g.playerWhite !== currentUser.uid) {
        const btn = document.createElement("button");
        btn.textContent = "Join as Black";
        btn.onclick = () => joinGame(id);
        li.appendChild(btn);
      }
      gameList.appendChild(li);
    });
  });
}

createGameBtn.addEventListener("click", () => {
  const ref = db.ref("chess").push();
  const id = ref.key;
  L("[MULTI] create game:", id);
  ref.set({ playerWhite: currentUser.uid, playerBlack: null, board: chess.fen(), turn: chess.turn(), status: "waiting" })
    .then(() => joinGame(id))
    .catch((e) => L("[MULTI] create failed:", e));
});

joinGameBtn.addEventListener("click", () => {
  const id = gameIdInput.value.trim();
  if (!id) { L("[MULTI] join called with empty id"); return; }
  joinGame(id);
});

function joinGame(gameId) {
  L("[MULTI] joinGame attempt:", gameId);
  const ref = db.ref(`chess/${gameId}`);
  ref.transaction((g) => {
    if (!g) return;
    if (!g.playerBlack && g.status === "waiting") { g.playerBlack = currentUser.uid; g.status = "playing"; playerColor = "black"; }
    else if (g.playerWhite === currentUser.uid) playerColor = "white";
    else if (g.playerBlack === currentUser.uid) playerColor = "black";
    else return;
    return g;
  }).then((res) => {
    if (res.committed) {
      currentGameId = gameId;
      L("[MULTI] joined", gameId, "as", playerColor);
      gameLobby.style.display = "none";
      chessGameDiv.style.display = "block";
      listenToGameChanges(gameId);
    } else L("[MULTI] join transaction not committed");
  }).catch((e) => L("[MULTI] join error:", e));
}

function listenToGameChanges(gameId) {
  L("[MULTI] listenToGameChanges for", gameId);
  const ref = db.ref(`chess/${gameId}`);
  ref.on("value", (snap) => {
    const g = snap.val();
    if (!g) return;
    L("[MULTI] remote update", g);
    chess.load(g.board);
    renderBoard(chess.board());
    currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
    gameStatusSpan.textContent = g.status;
  });
}

// AI button
playVsAIBtn.addEventListener("click", () => {
  L("[LOCAL AI] startAIGame called");
  currentGameId = null;
  chess.reset();
  renderBoard(chess.board());
  gameLobby.style.display = "none";
  chessGameDiv.style.display = "block";
  gameTitle.textContent = "Playing vs AI";
  playerColor = "w";
  currentTurnSpan.textContent = "White";
  gameStatusSpan.textContent = "Playing vs Stockfish";
  initStockfish().catch(e => L("[INIT] initStockfish threw:", e));
});

// initial render
renderBoard(chess.board());
currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
gameStatusSpan.textContent = "Idle";
L("[INIT] script loaded. Ready.");
