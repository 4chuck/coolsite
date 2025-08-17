/****************************************************
 * Chess Master Script (Multiplayer + AI mode)
 ****************************************************/

// Firebase initialization (already configured in HTML)
const db = firebase.database();
let currentUser = null;
let currentGameId = null;
let playerColor = null;
let selectedPiece = null;
let chess = new Chess(); // chess.js instance

// UI Elements
const authStatus = document.getElementById("auth-status");
const gameLobby = document.getElementById("game-lobby");
const chessGameDiv = document.getElementById("chess-game");
const gameTitle = document.getElementById("game-title");
const messagesDiv = document.getElementById("messages");
const currentTurnSpan = document.getElementById("current-turn");
const gameStatusSpan = document.getElementById("game-status");

// AI Engine
let engine = null;

/****************************************************
 * AUTH
 ****************************************************/
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    authStatus.textContent = `Logged in as: ${user.email}`;
    gameLobby.style.display = "block";
  } else {
    authStatus.textContent = "Not logged in.";
    gameLobby.style.display = "none";
    chessGameDiv.style.display = "none";
  }
});

/****************************************************
 * MULTIPLAYER GAME CREATION / JOIN
 ****************************************************/
document.getElementById("create-game-btn").addEventListener("click", () => {
  const newGameRef = db.ref("chess").push();
  const gameId = newGameRef.key;

  const gameData = {
    playerWhite: currentUser.uid,
    playerBlack: null,
    board: chess.fen(),
    turn: "w",
    status: "waiting",
    createdAt: firebase.database.ServerValue.TIMESTAMP
  };

  newGameRef.set(gameData).then(() => {
    joinGame(gameId, "w");
  });
});

document.getElementById("join-game-btn").addEventListener("click", () => {
  const gameId = document.getElementById("game-id-input").value.trim();
  if (gameId) joinGame(gameId, "b");
});

function joinGame(gameId, color) {
  const gameRef = db.ref(`chess/${gameId}`);
  gameRef.transaction(game => {
    if (game) {
      if (!game.playerWhite) {
        game.playerWhite = currentUser.uid;
        color = "w";
      } else if (!game.playerBlack) {
        game.playerBlack = currentUser.uid;
        color = "b";
      }
      if (game.playerWhite && game.playerBlack) {
        game.status = "playing";
      }
    }
    return game;
  }).then(res => {
    if (!res.committed) {
      console.error("Join game transaction failed: ", res);
      alert("Failed to join game.");
      return;
    }
    currentGameId = gameId;
    playerColor = color;

    gameLobby.style.display = "none";
    chessGameDiv.style.display = "block";
    gameTitle.textContent = `Game ID: ${gameId}`;

    subscribeToGame(gameId);
  }).catch(err => {
    console.error("Join game error:", err);
    alert("Error joining game.");
  });
}

/****************************************************
 * SUBSCRIBE TO GAME UPDATES
 ****************************************************/
function subscribeToGame(gameId) {
  const gameRef = db.ref(`chess/${gameId}`);
  gameRef.on("value", snap => {
    const game = snap.val();
    if (!game) return;

    if (game.board) chess.load(game.board);
    renderBoard(chess.board());

    currentTurnSpan.textContent = game.turn;
    gameStatusSpan.textContent = game.status;
  });

  const chatRef = db.ref(`chess/${gameId}/chat`);
  chatRef.on("child_added", snap => {
    const msg = snap.val();
    const p = document.createElement("p");
    p.textContent = `${msg.sender}: ${msg.message}`;
    messagesDiv.appendChild(p);
  });
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
