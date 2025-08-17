// ======================
// Firebase Initialization
// ======================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();

// ======================
// Global Variables
// ======================
let currentUser = null;
let currentGameId = null;
let playerColor = null;
let chess = new Chess();
let engine = null; // Stockfish instance for AI games
let isAIGame = false;

// ======================
// DOM Elements
// ======================
const gameLobby = document.getElementById("game-lobby");
const chessGameDiv = document.getElementById("chess-game");
const gameTitle = document.getElementById("game-title");
const messagesDiv = document.getElementById("messages");
const gameStatusSpan = document.getElementById("game-status");
const currentTurnSpan = document.getElementById("current-turn");

// ======================
// Auth State Listener
// ======================
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    document.getElementById("auth-status").textContent = `Logged in as ${user.email}`;
    gameLobby.style.display = "block";
  } else {
    currentUser = null;
    document.getElementById("auth-status").textContent = "Not logged in";
  }
});

// ======================
// AI GAME FUNCTIONS
// ======================
function initEngine() {
  if (!engine) {
    engine = Stockfish();
    engine.onmessage = (event) => {
      const line = event.data || event;
      if (line.startsWith("bestmove")) {
        const move = line.split(" ")[1];
        chess.move({ from: move.substring(0, 2), to: move.substring(2, 4), promotion: "q" });
        renderBoard(chess.board());
        updateStatus();
      }
    };
  }
}

function aiMove() {
  if (!engine) initEngine();
  engine.postMessage("uci");
  engine.postMessage("ucinewgame");
  engine.postMessage("position fen " + chess.fen());
  engine.postMessage("go depth 15");
}

function startAIGame() {
  isAIGame = true;
  currentGameId = null;
  playerColor = "w";
  chess.reset();

  renderBoard(chess.board());
  updateStatus();

  gameLobby.style.display = "none";
  chessGameDiv.style.display = "block";
  gameTitle.textContent = "Playing vs Stockfish AI";

  initEngine();
}

// ======================
// Multiplayer Functions
// ======================
document.getElementById("create-game-btn").addEventListener("click", () => {
  const gameRef = db.ref("chess").push();
  const newGame = {
    playerWhite: currentUser.uid,
    playerBlack: null,
    board: chess.fen(),
    turn: "w",
    status: "waiting",
    createdAt: Date.now()
  };
  gameRef.set(newGame).then(() => {
    joinGame(gameRef.key, "w");
  });
});

document.getElementById("join-game-btn").addEventListener("click", () => {
  const gameId = document.getElementById("game-id-input").value;
  joinGame(gameId, "b");
});

function joinGame(gameId, desiredColor) {
  const gameRef = db.ref(`chess/${gameId}`);
  gameRef.transaction((game) => {
    if (game) {
      if (desiredColor === "b" && !game.playerBlack) {
        game.playerBlack = currentUser.uid;
        game.status = "playing";
      } else if (desiredColor === "w" && !game.playerWhite) {
        game.playerWhite = currentUser.uid;
        game.status = "playing";
      }
    }
    return game;
  }).then((result) => {
    if (result.committed) {
      currentGameId = gameId;
      playerColor = desiredColor;
      isAIGame = false;
      listenToGame(gameId);
    } else {
      alert("Unable to join game.");
    }
  }).catch((err) => {
    console.error("Join game transaction failed:", err);
  });
}

function listenToGame(gameId) {
  const gameRef = db.ref(`chess/${gameId}`);
  gameRef.on("value", (snapshot) => {
    const game = snapshot.val();
    if (game) {
      chess.load(game.board);
      renderBoard(chess.board());
      updateStatus(game);
      gameLobby.style.display = "none";
      chessGameDiv.style.display = "block";
      gameTitle.textContent = `Game ${gameId}`;
    }
  });
}

// ======================
// Game Play Functions
// ======================
function handlePlayerMove(move) {
  if (isAIGame) {
    // Human moves
    if (chess.move(move)) {
      renderBoard(chess.board());
      updateStatus();
      setTimeout(aiMove, 500); // let AI respond
    }
    return;
  }

  // Multiplayer
  if (!currentGameId) return;
  const gameRef = db.ref(`chess/${currentGameId}`);
  gameRef.transaction((game) => {
    if (game && game.status === "playing") {
      const turnColor = game.turn === "w" ? "white" : "black";
      if ((playerColor === "w" && game.turn === "w") || (playerColor === "b" && game.turn === "b")) {
        const moveResult = chess.move(move);
        if (moveResult) {
          game.board = chess.fen();
          game.turn = (game.turn === "w") ? "b" : "w";
        }
      }
    }
    return game;
  });
}

function updateStatus(game = null) {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) {
      gameStatusSpan.textContent = "Checkmate!";
    } else if (chess.isDraw()) {
      gameStatusSpan.textContent = "Draw!";
    } else {
      gameStatusSpan.textContent = "Game Over";
    }
  } else {
    gameStatusSpan.textContent = "Playing";
  }
  currentTurnSpan.textContent = chess.turn() === "w" ? "White" : "Black";
}

// ======================
// Leave Game
// ======================
function leaveGame() {
  if (isAIGame) {
    // AI game: just reset
    isAIGame = false;
    currentGameId = null;
    playerColor = null;
    chess.reset();
    chessGameDiv.style.display = "none";
    gameLobby.style.display = "block";
    gameTitle.textContent = "";
    messagesDiv.innerHTML = "";
    renderBoard(chess.board());
    return;
  }

  if (currentGameId && currentUser) {
    const gameRef = db.ref(`chess/${currentGameId}`);
    gameRef.transaction((game) => {
      if (game) {
        if (game.playerWhite === currentUser.uid) game.playerWhite = null;
        if (game.playerBlack === currentUser.uid) game.playerBlack = null;

        if (!game.playerWhite && !game.playerBlack) {
          return null; // delete
        } else if (game.status === "playing" && (!game.playerWhite || !game.playerBlack)) {
          game.status = "abandoned";
        }
      }
      return game;
    }).then(() => {
      db.ref(`chess/${currentGameId}`).off("value");
      currentGameId = null;
      playerColor = null;
      chess.reset();
      chessGameDiv.style.display = "none";
      gameLobby.style.display = "block";
      gameTitle.textContent = "";
      messagesDiv.innerHTML = "";
      renderBoard(chess.board());
    });
  }
}
document.getElementById("leave-game-btn").addEventListener("click", leaveGame);

// ======================
// Render Board
// ======================
function renderBoard(boardState) {
  const boardDiv = document.getElementById("chessboard");
  boardDiv.innerHTML = "";
  boardState.forEach((row, rowIndex) => {
    const rowDiv = document.createElement("div");
    rowDiv.classList.add("board-row");
    row.forEach((square, colIndex) => {
      const squareDiv = document.createElement("div");
      squareDiv.classList.add("square");
      if ((rowIndex + colIndex) % 2 === 0) squareDiv.classList.add("light");
      else squareDiv.classList.add("dark");

      if (square) {
        squareDiv.textContent = square.type.toUpperCase();
      }

      squareDiv.addEventListener("click", () => {
        // Example: implement move input
        // For now just log
        console.log("Square clicked:", rowIndex, colIndex, square);
      });

      rowDiv.appendChild(squareDiv);
    });
    boardDiv.appendChild(rowDiv);
  });
}
