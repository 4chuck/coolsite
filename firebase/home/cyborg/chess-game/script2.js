// -----------------------------
// Firebase Initialization
// -----------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://login-b6382-default-rtdb.firebaseio.com", // update with your DB
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// -----------------------------
// Global Variables
// -----------------------------
let currentUser = null;
let currentGameId = null;
let playerColor = null;
let chess = new Chess();
let stockfish = null;
let selectedPiece = null;

// UI elements
const gameLobby = document.getElementById("game-lobby");
const chessGameDiv = document.getElementById("chess-game");
const gameTitle = document.getElementById("game-title");
const messagesDiv = document.getElementById("messages");

// -----------------------------
// AUTO LOGIN (Anonymous)
// -----------------------------
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    document.getElementById("auth-status").textContent = `Logged in as Guest (${user.uid})`;
    gameLobby.style.display = "block";
  } else {
    currentUser = null;
    document.getElementById("auth-status").textContent = "Not logged in";

    // Try anonymous login
    auth.signInAnonymously()
      .catch((error) => {
        console.error("Anonymous login failed:", error);
      });
  }
});

// -----------------------------
// Chessboard Rendering
// -----------------------------
function renderBoard(boardState) {
  const boardDiv = document.getElementById("chessboard");
  boardDiv.innerHTML = "";

  boardState.forEach((row, rowIndex) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "chess-row";

    row.forEach((square, colIndex) => {
      const squareDiv = document.createElement("div");
      squareDiv.className = "chess-square " +
        (((rowIndex + colIndex) % 2 === 0) ? "light" : "dark");

      if (square) {
        const piece = document.createElement("span");
        piece.textContent = square.type.toUpperCase();
        piece.className = `piece ${square.color}`;
        squareDiv.appendChild(piece);
      }

      squareDiv.addEventListener("click", () => onSquareClick(rowIndex, colIndex));
      rowDiv.appendChild(squareDiv);
    });

    boardDiv.appendChild(rowDiv);
  });
}

function onSquareClick(row, col) {
  console.log("Clicked square", row, col);
  // TODO: integrate move selection logic
}

// -----------------------------
// Multiplayer Functions
// -----------------------------
document.getElementById("create-game-btn").addEventListener("click", () => {
  if (!currentUser) return alert("Not logged in");
  const newGameRef = db.ref("chess").push();
  const gameData = {
    playerWhite: currentUser.uid,
    playerBlack: null,
    board: chess.fen(),
    turn: "w",
    status: "waiting",
    createdAt: Date.now()
  };
  newGameRef.set(gameData).then(() => {
    currentGameId = newGameRef.key;
    playerColor = "w";
    enterGame(currentGameId);
  });
});

document.getElementById("join-game-btn").addEventListener("click", () => {
  if (!currentUser) return alert("Not logged in");
  const gameId = document.getElementById("game-id-input").value.trim();
  if (!gameId) return alert("Enter game ID");

  const gameRef = db.ref(`chess/${gameId}`);
  gameRef.transaction((game) => {
    if (game && !game.playerBlack) {
      game.playerBlack = currentUser.uid;
      game.status = "playing";
    }
    return game;
  }).then((res) => {
    if (res.committed && res.snapshot.exists()) {
      currentGameId = gameId;
      playerColor = "b";
      enterGame(gameId);
    } else {
      alert("Unable to join game.");
    }
  });
});

function enterGame(gameId) {
  chessGameDiv.style.display = "block";
  gameLobby.style.display = "none";
  gameTitle.textContent = `Game ID: ${gameId}`;

  const gameRef = db.ref(`chess/${gameId}`);
  gameRef.on("value", (snap) => {
    const game = snap.val();
    if (!game) return;
    document.getElementById("current-turn").textContent = game.turn;
    document.getElementById("game-status").textContent = game.status;
    chess.load(game.board);
    renderBoard(chess.board());
  });

  const chatRef = db.ref(`chess/${gameId}/chat`);
  chatRef.on("child_added", (snap) => {
    const msg = snap.val();
    const p = document.createElement("p");
    p.textContent = `${msg.sender}: ${msg.message}`;
    messagesDiv.appendChild(p);
  });
}

document.getElementById("send-chat-btn").addEventListener("click", () => {
  if (!currentGameId || !currentUser) return;
  const msgInput = document.getElementById("chat-input");
  const text = msgInput.value.trim();
  if (!text) return;

  db.ref(`chess/${currentGameId}/chat`).push({
    sender: currentUser.uid,
    message: text,
    timestamp: Date.now()
  });
  msgInput.value = "";
});

document.getElementById("leave-game-btn").addEventListener("click", leaveGame);

function leaveGame() {
  if (currentGameId && currentUser) {
    const gameRef = db.ref(`chess/${currentGameId}`);
    gameRef.transaction((game) => {
      if (game) {
        if (game.playerWhite === currentUser.uid) game.playerWhite = null;
        if (game.playerBlack === currentUser.uid) game.playerBlack = null;

        if (!game.playerWhite && !game.playerBlack) {
          return null; // delete game
        } else if (game.status === "playing" && (!game.playerWhite || !game.playerBlack)) {
          game.status = "abandoned";
          game.expiresAt = Date.now() + 12 * 60 * 60 * 1000; // auto cleanup
        }
        return game;
      }
      return undefined;
    }).then(() => {
      db.ref(`chess/${currentGameId}`).off("value");
      db.ref(`chess/${currentGameId}/chat`).off("child_added");
      currentGameId = null;
      playerColor = null;
      chess.reset();
      chessGameDiv.style.display = "none";
      gameLobby.style.display = "block";
      gameTitle.textContent = "";
      messagesDiv.innerHTML = "";
      renderBoard(chess.board());
    }).catch(err => console.error("Error leaving game:", err));
  }
}

// -----------------------------
// AI MODE
// -----------------------------
document.getElementById("play-ai-btn").addEventListener("click", () => {
  startAIGame();
});

function initEngine() {
  stockfish = new Worker("https://cdn.jsdelivr.net/npm/stockfish/stockfish.js");
  stockfish.onmessage = (event) => {
    const line = event.data.toString();
    if (line.startsWith("bestmove")) {
      const move = line.split(" ")[1];
      chess.move({ from: move.substring(0, 2), to: move.substring(2, 4), promotion: "q" });
      renderBoard(chess.board());
      document.getElementById("current-turn").textContent = chess.turn();
    }
  };
}

function aiMove() {
  if (!stockfish) initEngine();
  stockfish.postMessage("position fen " + chess.fen());
  stockfish.postMessage("go depth 15");
}

function startAIGame() {
  chess.reset();
  renderBoard(chess.board());
  gameLobby.style.display = "none";
  chessGameDiv.style.display = "block";
  gameTitle.textContent = "Playing vs AI";
  playerColor = "w";
  document.getElementById("game-status").textContent = "playing";
  document.getElementById("current-turn").textContent = "w";

  // No database listeners here, AI mode is offline
}
/****************************************************
 * LEAVE GAME (multiplayer)
 ****************************************************/
function leaveGame() {
  if (currentGameId && currentUser) {
    const gameRef = db.ref(`chess/${currentGameId}`);
    gameRef.transaction(game => {
      if (game) {
        if (game.playerWhite === currentUser.uid) game.playerWhite = null;
        if (game.playerBlack === currentUser.uid) game.playerBlack = null;

        if (!game.playerWhite && !game.playerBlack) {
          return null; // delete game
        } else if (game.status === "playing" && (!game.playerWhite || !game.playerBlack)) {
          game.status = "abandoned";
        }
      }
      return game;
    }).then(() => {
      db.ref(`chess/${currentGameId}`).off("value");
      db.ref(`chess/${currentGameId}/chat`).off("child_added");

      currentGameId = null;
      playerColor = null;
      chess.reset();

      chessGameDiv.style.display = "none";
      gameLobby.style.display = "block";
      gameTitle.textContent = "";
      messagesDiv.innerHTML = "";
      renderBoard(chess.board());
    }).catch(err => {
      console.error("Error leaving game:", err);
      alert("Error leaving game.");
    });
  }
}
document.getElementById("leave-game-btn").addEventListener("click", leaveGame);

/****************************************************
 * CHAT
 ****************************************************/
document.getElementById("send-chat-btn").addEventListener("click", () => {
  const input = document.getElementById("chat-input");
  const message = input.value.trim();
  if (!message || !currentGameId) return;

  const chatRef = db.ref(`chess/${currentGameId}/chat`).push();
  chatRef.set({
    sender: currentUser.email,
    message: message,
    timestamp: Date.now()
  });
  input.value = "";
});

/****************************************************
 * RENDER BOARD
 ****************************************************/
function renderBoard(board) {
  const chessboard = document.getElementById("chessboard");
  chessboard.innerHTML = "";
  board.forEach((row, r) => {
    row.forEach((piece, c) => {
      const square = document.createElement("div");
      square.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.textContent = piece.type.toUpperCase();
        pieceEl.classList.add(piece.color === "w" ? "white" : "black");
        square.appendChild(pieceEl);
      }
      chessboard.appendChild(square);
    });
  });
}

function updateStatus() {
  if (chess.in_checkmate()) {
    gameStatusSpan.textContent = "Checkmate!";
  } else if (chess.in_draw()) {
    gameStatusSpan.textContent = "Draw";
  } else {
    gameStatusSpan.textContent = "Turn: " + (chess.turn() === "w" ? "White" : "Black");
  }
}

/****************************************************
 * AI GAME (Play vs Stockfish)
 ****************************************************/
function initEngine() {
  engine = STOCKFISH();
  engine.postMessage("uci");
}
initEngine();

document.getElementById("play-ai-btn").addEventListener("click", () => {
  startAIGame();
});

function startAIGame() {
  currentGameId = null;
  playerColor = "w"; // player always White for now
  chess.reset();
  renderBoard(chess.board());

  gameLobby.style.display = "none";
  chessGameDiv.style.display = "block";
  gameTitle.textContent = "Playing vs Stockfish AI";
}

function aiMove() {
  return new Promise(resolve => {
    const fen = chess.fen();
    engine.postMessage("position fen " + fen);
    engine.postMessage("go depth 12");

    engine.onmessage = function(line) {
      if (typeof line === "string" && line.startsWith("bestmove")) {
        const move = line.split(" ")[1];
        resolve(move);
      }
    };
  });
}

// Hook into player move handler
async function handlePlayerMove(from, to) {
  const move = chess.move({ from, to, promotion: "q" });
  if (move === null) return false;

  renderBoard(chess.board());
  updateStatus();

  if (!chess.game_over() && currentGameId === null) {
    // AI only in local games
    setTimeout(async () => {
      const bestMove = await aiMove();
      if (bestMove) {
        chess.move(bestMove, { sloppy: true });
        renderBoard(chess.board());
        updateStatus();
      }
    }, 500);
  }
  return true;
}
