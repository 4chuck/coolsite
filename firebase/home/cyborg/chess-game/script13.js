// script2.js — Full app: Firebase Auth + Lobby + Multiplayer + Chat + AI (Stockfish) + Chess UI
(() => {
  const TAG = "[script2]";
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);
  const err = (...a) => console.error(TAG, ...a);

  // --------------------------
  // Config
  // --------------------------
  const STOCKFISH_PATH = "stockfish/stockfish-17.1-lite-single-03e3232.js"; // fallback Worker path if no window.STOCKFISH()

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

  if (!window.Chess) throw new Error("Chess.js not found. The ESM loader must run before this script.");

  // --------------------------
  // DOM
  // --------------------------
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

  const customAlertDiv = document.getElementById("custom-alert");

  const gameOverModal = document.getElementById("game-over-modal");
  const gameOverMessage = document.getElementById("game-over-message");

  const stockfishOverlay = document.getElementById("stockfish-loader"); // already in your HTML

  // --------------------------
  // Auth mini-UI (injected)
  // --------------------------
  (function injectAuthMiniUI() {
    if (document.getElementById("auth-container")) return;

    const holder = document.createElement("div");
    holder.id = "auth-container";
    holder.innerHTML = `
      <h2>Sign In</h2>
      <input id="auth-email" type="email" placeholder="Email">
      <input id="auth-pass" type="password" placeholder="Password">
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
        <button id="btn-signup">Sign Up</button>
        <button id="btn-signin">Sign In</button>
        <button id="btn-guest">Continue as Guest</button>
        <button id="btn-signout" style="display:none;">Sign Out</button>
      </div>
    `;
    const pageContent = document.querySelector(".page-content");
    if (pageContent) pageContent.insertBefore(holder, pageContent.firstChild);

    const emailEl = holder.querySelector("#auth-email");
    const passEl = holder.querySelector("#auth-pass");
    const btnSignUp = holder.querySelector("#btn-signup");
    const btnSignIn = holder.querySelector("#btn-signin");
    const btnGuest = holder.querySelector("#btn-guest");
    const btnSignOut = holder.querySelector("#btn-signout");

    btnSignUp.addEventListener("click", async () => {
      try {
        const email = emailEl.value.trim();
        const pass = passEl.value;
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
        const email = emailEl.value.trim();
        const pass = passEl.value;
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

    // Show/Hide signout based on state
    auth.onAuthStateChanged(u => {
      btnSignOut.style.display = u ? "inline-block" : "none";
    });
  })();

  // --------------------------
  // Helpers
  // --------------------------
  function calert(message, duration = 2200) {
    if (!customAlertDiv) { alert(message); return; }
    customAlertDiv.textContent = message;
    customAlertDiv.style.display = "block";
    void customAlertDiv.offsetWidth;
    customAlertDiv.classList.add("show");
    setTimeout(() => {
      customAlertDiv.classList.remove("show");
      setTimeout(() => (customAlertDiv.style.display = "none"), 300);
    }, duration);
  }

  // --------------------------
  // Chess state
  // --------------------------
  let chess = new window.Chess();
  let selected = null;          // {row,col}
  let possible = [];            // verbose moves list
  let lastMove = null;          // {from,to}

  // --------------------------
  // App state
  // --------------------------
  let currentUser = null;
  let currentGameId = null;     // null => AI/local
  let playerColor = null;       // 'white' | 'black'
  let unsubGame = null;
  let unsubChat = null;

  // --------------------------
  // Stockfish
  // --------------------------
  let engine = null;
  let engineReady = false;
  let engineSearching = false;
  const engineQueue = [];

  function showLoader() {
    if (stockfishOverlay) {
      stockfishOverlay.classList.remove("hidden");
    }
  }
  function hideLoader() {
    if (stockfishOverlay) {
      stockfishOverlay.classList.add("hidden");
    }
  }

  function enginePost(cmd) {
    if (!engine) { engineQueue.push(cmd); return; }
    // allow uci, isready, setoption, ucinewgame, quit while not ready; queue others
    if (!engineReady && !/^(uci|isready|ucinewgame|setoption|quit)/.test(cmd)) {
      engineQueue.push(cmd);
    } else {
      engine.postMessage(cmd);
    }
  }
  function flushEngineQueue() {
    if (!engine) return;
    while (engineQueue.length) engine.postMessage(engineQueue.shift());
  }

  // Public: also used by body onload in your HTML
  function initStockfish(path = STOCKFISH_PATH) {
    if (engine) return;

    try {
      if (typeof window.STOCKFISH === "function") {
        // Using the CDN script, runs in main thread but exposes onmessage/postMessage
        engine = window.STOCKFISH();
        log("[INIT] STOCKFISH() created (CDN).");
      } else {
        engine = new Worker(path);
        log("[INIT] Worker created with path:", path);
      }
    } catch (e) {
      err("Stockfish init failed", e);
      return;
    }

    showLoader();

    engine.onmessage = (ev) => {
      const line = String(ev.data || "");
      // log("[ENGINE]", line);

      if (line.startsWith("uciok")) {
        enginePost("isready");
        return;
      }
      if (line.startsWith("readyok")) {
        engineReady = true;
        flushEngineQueue();
        hideLoader();
        return;
      }
      if (line.startsWith("id ") || line.startsWith("option ")) {
        if (!engineReady) {
          engineReady = true; flushEngineQueue(); hideLoader();
        }
        return;
      }

      if (line.startsWith("bestmove")) {
        engineSearching = false;
        hideLoader();
        const mv = line.split(/\s+/)[1];
        if (!mv || mv === "(none)") return;

        // in AI (local) mode only, make the move on board
        if (!currentGameId) {
          try {
            const res = chess.move({ from: mv.slice(0,2), to: mv.slice(2,4), promotion: "q" });
            if (res) {
              lastMove = { from: res.from, to: res.to };
              renderBoard();
              currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
              checkForEndAndNotify();
            }
          } catch (e) {
            err("AI move apply failed", e);
          }
        }
      }
    };

    engine.postMessage("uci");
    engine.postMessage("isready");
    engine.postMessage("ucinewgame");
  }

  function makeAIMove(depth = 12) {
    if (currentGameId) return;             // only local AI
    if (chess.isGameOver()) return checkForEndAndNotify();
    initStockfish();                       // ensure created
    showLoader();
    engineSearching = true;
    enginePost("position fen " + chess.fen());
    enginePost("go depth " + depth);
  }

  // Expose for <body onload="">
  window.initStockfish = initStockfish;
  window.STOCKFISH_PATH = STOCKFISH_PATH;

  // --------------------------
  // Board rendering & UI
  // --------------------------
  function algebraicFromRC(row, col) { return `${String.fromCharCode(97 + col)}${8 - row}`; }
  function rcFromAlgebraic(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - parseInt(square[1], 10);
    return { row: rank, col: file };
  }
  function getPieceUnicode(type, color) {
    const M = { k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙", K:"♚",Q:"♛",R:"♜",B:"♝",N:"♞",P:"♟" };
    return color === "w" ? M[type.toLowerCase()] : M[type.toUpperCase()];
  }

  function renderBoard() {
    chessboardDiv.innerHTML = "";
    const board = chess.board();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        sq.classList.add("square", (r + c) % 2 === 0 ? "light" : "dark");
        sq.dataset.row = r; sq.dataset.col = c;

        const piece = board[r][c];
        if (piece) {
          sq.innerHTML = getPieceUnicode(piece.type, piece.color);
          sq.classList.add("piece");
        }

        // last-move highlight
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

    // selection + possible moves highlight
    if (selected) {
      const selEl = document.querySelector(`.square[data-row="${selected.row}"][data-col="${selected.col}"]`);
      if (selEl) selEl.classList.add("selected");
      possible.forEach(m => {
        const rc = rcFromAlgebraic(m.to);
        const el = document.querySelector(`.square[data-row="${rc.row}"][data-col="${rc.col}"]`);
        if (el) el.classList.add("possible-move");
      });
    }

    currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
    gameStatusSpan.textContent = statusTextFromGame();
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
    selected = null; possible = [];
  }

  function onSquareClick(ev) {
    const el = ev.currentTarget;
    const row = parseInt(el.dataset.row, 10);
    const col = parseInt(el.dataset.col, 10);
    const sq = algebraicFromRC(row, col);

    // Enforce turns in multiplayer
    if (currentGameId && playerColor && playerColor[0] !== chess.turn()) {
      calert("It's not your turn.");
      return;
    }

    // If a piece is selected, try to move
    if (selected && possible.length) {
      const from = algebraicFromRC(selected.row, selected.col);
      if (from === sq) { clearSelection(); renderBoard(); return; }

      let result = null;
      try { result = chess.move({ from, to: sq, promotion: "q" }); } catch (e) { }
      clearSelection();

      if (result) {
        lastMove = { from: result.from, to: result.to };
        renderBoard();

        if (chess.isGameOver()) handleGameEnd();

        if (currentGameId) pushGameStateToFirebase(currentGameId);
        else setTimeout(() => makeAIMove(), 250);

        return;
      }
    }

    // Select a piece (must be yours in multiplayer)
    const piece = chess.get(sq);
    if (!piece) { clearSelection(); renderBoard(); return; }
    if (currentGameId && playerColor && piece.color !== playerColor[0]) {
      calert("That's your opponent's piece!");
      return;
    }

    selected = { row, col };
    possible = chess.moves({ square: sq, verbose: true });
    renderBoard();
  }

  // --------------------------
  // Game end + modal
  // --------------------------
  function handleGameEnd() {
    let msg = "Game over.";
    if (chess.isCheckmate()) msg = "Checkmate!";
    else if (chess.isStalemate()) msg = "Stalemate.";
    else if (chess.isInsufficientMaterial()) msg = "Draw: Insufficient material.";
    else if (chess.isThreefoldRepetition()) msg = "Draw: Repetition.";
    else if (chess.isDraw()) msg = "Draw.";

    gameStatusSpan.textContent = msg;
    showGameOverModal(msg);

    if (currentGameId) {
      const updates = { status: msg.toLowerCase().replace(/\W+/g, "_") };
      if (chess.isCheckmate()) updates.winner = chess.turn() === "w" ? "Black" : "White";
      db.ref(`chess/${currentGameId}`).update(updates).catch(e => err("status update", e));
    }
  }

  function checkForEndAndNotify() {
    if (!chess.isGameOver()) return;
    handleGameEnd();
    setTimeout(() => leaveGame(), 5200);
  }

  function showGameOverModal(message) {
    if (!gameOverModal || !gameOverMessage) { calert(message, 3000); return; }
    gameOverMessage.textContent = message;
    gameOverModal.classList.remove("hidden");
    setTimeout(() => gameOverModal.classList.add("hidden"), 5000);
  }

  // --------------------------
  // Undo
  // --------------------------
  undoBtn && undoBtn.addEventListener("click", () => {
    if (chess.history().length === 0) return calert("No moves to undo");
    chess.undo(); // player move
    if (!currentGameId && chess.history().length > 0) chess.undo(); // AI reply too
    lastMove = null;
    renderBoard();
  });

  // --------------------------
  // Firebase: Lobby, Games, Chat
  // --------------------------
  function listenForGames() {
    const ref = db.ref("chess");
    ref.on("value", (snap) => {
      gameList.innerHTML = "";
      const games = snap.val();
      if (!games) return;

      Object.entries(games).forEach(([gid, g]) => {
        const li = document.createElement("li");
        li.style.color = "whitesmoke";

        let status = "Waiting for opponent";
        if (g.playerWhite && g.playerBlack) status = "In Progress";
        if (g.status) status = g.status.replace(/_/g, " ").replace(/\b\w/g, m=>m.toUpperCase());

        li.innerHTML = `Game ID: ${gid} (${status}) `;

        // Join as Black if available
        if (!g.playerBlack && g.playerWhite !== currentUser?.uid && (g.status === "waiting" || !g.status)) {
          const joinBtn = document.createElement("button");
          joinBtn.textContent = "Join as Black";
          joinBtn.style.backgroundColor = "#ec6090";
          joinBtn.addEventListener("click", () => joinGame(gid));
          li.appendChild(joinBtn);
        }

        // Rejoin for existing players
        const youArePlayer = g.playerWhite === currentUser?.uid || g.playerBlack === currentUser?.uid;
        if (youArePlayer && g.status !== "completed" && g.status !== "abandoned") {
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
  window.listenForGames = listenForGames; // expose (your HTML had a global)

  function createGame() {
    if (!currentUser) return calert("Sign in first");
    const ref = db.ref("chess").push();
    const gid = ref.key;
    const init = {
      playerWhite: currentUser.uid,
      playerBlack: null,
      board: chess.fen(),
      turn: chess.turn(),
      status: "waiting",
      chat: [],
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    };
    ref.set(init)
      .then(() => joinGame(gid))
      .catch((e) => { err("createGame", e); calert("Error creating game."); });
  }

  function pushGameStateToFirebase(gid) {
    db.ref(`chess/${gid}`).update({
      board: chess.fen(),
      turn: chess.turn(),
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    }).catch((e) => err("db update", e));
  }

  function subscribeGame(gid) {
    // moves/board
    const gref = db.ref(`chess/${gid}`);
    unsubGame && gref.off();
    gref.on("value", (snap) => {
      const data = snap.val();
      if (!data) return;

      // sync board only if the FEN differs (avoid echo loops)
      const fen = data.board;
      if (fen && fen !== chess.fen()) {
        try {
          chess.load(fen);
          renderBoard();
        } catch (e) {
          err("Load FEN failed", e);
        }
      }

      // announce game over?
      if (data.status && /checkmate|draw|stalemate|completed/i.test(data.status)) {
        gameStatusSpan.textContent = data.status.replace(/_/g, " ");
      }
    });

    // chat
    const cref = db.ref(`chess/${gid}/chat`);
    unsubChat && cref.off();
    cref.on("value", (snap) => {
      messagesDiv.innerHTML = "";
      const arr = snap.val() || [];
      arr.forEach((m) => {
        const p = document.createElement("p");
        p.textContent = `${m.user || "Anon"}: ${m.text}`;
        p.classList.add(m.userId === currentUser?.uid ? "user" : "system");
        messagesDiv.appendChild(p);
      });
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
  }

  async function joinGame(gid) {
    if (!currentUser) return calert("Sign in first");
    const ref = db.ref(`chess/${gid}`);

    let assignedColor = null;
    await ref.transaction((g) => {
      if (!g) return g;
      // assign black if free and not white already
      if (!g.playerBlack && g.playerWhite !== currentUser.uid) {
        g.playerBlack = currentUser.uid;
        g.status = "in_progress";
        assignedColor = "black";
      } else if (g.playerWhite === currentUser.uid) {
        assignedColor = "white";
      } else if (g.playerBlack === currentUser.uid) {
        assignedColor = "black";
      }
      return g;
    });

    if (!assignedColor) return calert("Unable to join this game.");

    currentGameId = gid;
    playerColor = assignedColor;
    gameTitle.textContent = `Multiplayer — You are ${playerColor[0].toUpperCase() + playerColor.slice(1)}`;
    chessGameDiv.style.display = "block";
    gameLobby.style.display = "none";

  