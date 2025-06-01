// 1. Firebase Configuration (replace with your actual config)
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

// Initialize Chess.js
let chess = new Chess();

// DOM Elements
const authContainer = document.getElementById('auth-container');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const authStatus = document.getElementById('auth-status');

const gameLobby = document.getElementById('game-lobby');
const createGameBtn = document.getElementById('create-game-btn');
const gameList = document.getElementById('game-list');
const gameIdInput = document.getElementById('game-id-input');
const joinGameBtn = document.getElementById('join-game-btn');

const chessGameDiv = document.getElementById('chess-game');
const gameTitle = document.getElementById('game-title');
const chessboardDiv = document.getElementById('chessboard');
const currentTurnSpan = document.getElementById('current-turn');
const gameStatusSpan = document.getElementById('game-status');
const chatBox = document.getElementById('chat-box');
const messagesDiv = document.getElementById('messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');

const customAlertDiv = document.getElementById('custom-alert'); // Changed from customcalertDiv

let currentUser = null;
let currentGameId = null;
let playerColor = null; // 'white' or 'black'
let selectedPiece = null; // { row, col, piece }

// --- Custom Alert Function ---
function calert(message, duration = 3000) {
    if (!customAlertDiv) return;

    customAlertDiv.textContent = message;
    customAlertDiv.style.display = 'block'; // Make sure it's display:block to transition
    // Force reflow to ensure transition plays from initial state
    customAlertDiv.offsetHeight;
    customAlertDiv.classList.add('show');

    // Automatically hide after 'duration' milliseconds
    setTimeout(() => {
        customAlertDiv.classList.remove('show');
        // Hide fully after transition completes
        setTimeout(() => {
            customAlertDiv.style.display = 'none';
        }, 500); // Should match CSS transition duration
    }, duration);
}

// --- Chess Board Rendering ---
function renderBoard(board) {
    chessboardDiv.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = r;
            square.dataset.col = c;

            const piece = board[r][c]; // This will be a piece object from chess.board() or null
            if (piece) {
                square.innerHTML = getPieceUnicode(piece.type, piece.color);
                square.classList.add('piece');
            }
            square.addEventListener('click', handleSquareClick);
            chessboardDiv.appendChild(square);
        }
    }
}

// Function to get Unicode chess piece based on type and color from chess.js piece object
function getPieceUnicode(pieceType, color) {
    const pieces = {
        'k': '&#9812;', 'q': '&#9813;', 'r': '&#9814;', 'b': '&#9815;', 'n': '&#9816;', 'p': '&#9817;', // White
        'K': '&#9818;', 'Q': '&#9819;', 'R': '&#9820;', 'B': '&#9821;', 'N': '&#9822;', 'P': '&#9823;'  // Black (uppercase keys for black as per Unicode standard)
    };

    if (!pieceType || !color) {
        return '';
    }

    if (color === 'w') {
        return pieces[pieceType.toLowerCase()];
    } else if (color === 'b') {
        return pieces[pieceType.toUpperCase()];
    }
    return '';
}

// --- Highlighting Functions ---
function highlightPossibleMoves(moves) {
    clearHighlights(); // Clear any existing highlights first
    moves.forEach(move => {
        const row = 8 - parseInt(move.to.charAt(1));
        const col = move.to.charCodeAt(0) - 97;

        const square = document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
        if (square) {
            square.classList.add('possible-move');
        }
    });
}

function clearHighlights() {
    document.querySelectorAll('.square.possible-move').forEach(square => {
        square.classList.remove('possible-move');
    });
}

// --- Handle User Interaction (Piece Selection & Move Attempt) ---
function handleSquareClick(event) {
    if (!currentGameId) { // Ensure a game is loaded
        calert("Please join or create a game first.");
        return;
    }

    const clickedSquare = event.target.closest('.square');
    if (!clickedSquare) return;

    const row = parseInt(clickedSquare.dataset.row);
    const col = parseInt(clickedSquare.dataset.col);

    const algebraicSquare = `${String.fromCharCode(97 + col)}${8 - row}`;

    const previouslySelectedPiece = selectedPiece;
    deselectPiece(); // Always clear previous selection/highlights first

    if (previouslySelectedPiece) { // Check if a piece was previously selected
        const fromSquare = `${String.fromCharCode(97 + previouslySelectedPiece.col)}${8 - previouslySelectedPiece.row}`;

        const pieceAtFrom = chess.get(fromSquare);
        if (!pieceAtFrom) {
            console.warn("No piece found at selected 'from' square. This shouldn't happen.");
            return;
        }

        // --- Core Turn and Piece Ownership Validation ---
        if (playerColor.charAt(0) !== chess.turn()) {
            calert("It's not your turn!");
            return;
        }

        if (pieceAtFrom.color !== playerColor.charAt(0)) {
            calert("That's your opponent's piece!");
            return;
        }

        try {
            const moveResult = chess.move({
                from: fromSquare,
                to: algebraicSquare,
                promotion: 'q' // default promotion to queen, you could add a UI for this later
            });

            if (moveResult) {
                db.ref(`chess/games/${currentGameId}`).update({ // UPDATED PATH
                    board: chess.fen(),
                    turn: chess.turn()
                }).then(() => {
                    console.log("Move updated in Firebase:", moveResult);
                }).catch(error => {
                    console.error("Error updating game state in Firebase:", error);
                    chess.undo(); // Revert local state if Firebase fails
                    renderBoard(chess.board()); // Re-render local state
                    calert("Failed to update game state. Please try again.");
                });

            } else {
                calert("Invalid chess move for this piece or position!");
            }
        } catch (e) {
            console.error("Chess.js move error:", e);
            calert("An error occurred during the move validation.");
        }

    } else {
        // No piece selected, try to select the clicked piece
        const pieceAtSquare = chess.get(algebraicSquare);

        if (pieceAtSquare) {
            if (playerColor.charAt(0) === chess.turn() && pieceAtSquare.color === playerColor.charAt(0)) {
                selectedPiece = { row, col, type: pieceAtSquare.type };
                clickedSquare.classList.add('selected');
                const possibleMoves = chess.moves({ square: algebraicSquare, verbose: true });
                highlightPossibleMoves(possibleMoves);
            } else if (pieceAtSquare.color !== playerColor.charAt(0)) {
                calert("That's your opponent's piece!");
            } else if (playerColor.charAt(0) !== chess.turn()) {
                calert("It's not your turn!");
            }
        }
    }
}

function deselectPiece() {
    const previouslySelectedSquare = document.querySelector('.square.selected');
    if (previouslySelectedSquare) {
        previouslySelectedSquare.classList.remove('selected');
    }
    selectedPiece = null;
    clearHighlights(); // Ensure highlights are cleared on deselect
}


// --- Firebase Authentication ---

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        // authContainer.style.display = 'none'; // No authContainer anymore, no need to hide
        gameLobby.style.display = 'block';
        listenForGames();
    } else {
        // Redirect to login page if user is not logged in
        console.log("User not logged in. Redirecting to login page...");
        window.location.href = "../../../../login/fire-login.html"; // Redirect to your dedicated login page
        // No need to hide elements or reset chess here as we are leaving the page
    }
});
// --- Firebase Game Lobby ---
function listenForGames() {
    const gamesRef = db.ref('chess/games'); // UPDATED PATH
    gamesRef.on('value', (snapshot) => {
        gameList.innerHTML = '';
        const games = snapshot.val();
        if (games) {
            Object.entries(games).forEach(([gameId, gameData]) => {
                const li = document.createElement('li');
                li.style.color = 'whitesmoke'; // or any valid CSS color

                let status = 'Waiting for opponent';
                if (gameData.playerWhite && gameData.playerBlack) {
                    status = 'In Progress';
                }
                if (gameData.status && (gameData.status === 'completed' || gameData.status === 'checkmate' || gameData.status === 'draw' || gameData.status === 'stalemate' || gameData.status.startsWith('draw_'))) {
                    status = gameData.status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); // Format status for display
                }

                li.innerHTML = `Game ID: ${gameId} (${status})`;

                // Allow joining if black slot is open and not self, and game is still waiting
                if (!gameData.playerBlack && gameData.playerWhite !== currentUser.uid && gameData.status === 'waiting') {
                    const joinButton = document.createElement('button');
                    joinButton.style.backgroundColor = '#ec6090';
                    joinButton.textContent = 'Join as Black';
                    joinButton.addEventListener('click', () => joinGame(gameId));
                    li.appendChild(joinButton);
                }
                // Allow rejoining if you are already a player and game is not completed/abandoned
                if ((gameData.playerWhite === currentUser.uid || gameData.playerBlack === currentUser.uid) && gameData.status !== 'completed' && gameData.status !== 'abandoned') {
                     const rejoinButton = document.createElement('button');
                     rejoinButton.style.backgroundColor = '#ec6090';
                     rejoinButton.textContent = 'Rejoin';
                     rejoinButton.addEventListener('click', () => joinGame(gameId));
                     li.appendChild(rejoinButton);
                }

                gameList.appendChild(li);
            });
        }
    });
}

createGameBtn.addEventListener('click', () => {
    const newGameRef = db.ref('chess/games').push(); // UPDATED PATH
    const gameId = newGameRef.key;
    newGameRef.set({
        playerWhite: currentUser.uid,
        playerBlack: null,
        board: chess.fen(), // Store initial FEN string from chess.js
        turn: chess.turn(), // Chess.js uses 'w' for white, 'b' for black
        status: 'waiting',
        chat: []
    }).then(() => {
        joinGame(gameId); // Creator automatically joins as white
    }).catch(error => {
        console.error("Error creating game:", error);
        calert("Error creating game. Please try again.");
    });
});

joinGameBtn.addEventListener('click', () => {
    const gameId = gameIdInput.value.trim();
    if (gameId) {
        joinGame(gameId);
    } else {
        calert("Please enter a Game ID.");
    }
});

function joinGame(gameId) {
    const gameRef = db.ref(`chess/games/${gameId}`); // UPDATED PATH
    gameRef.transaction((game) => {
        if (game) {
            // If current user is already playerWhite or playerBlack, just confirm playerColor
            if (game.playerWhite === currentUser.uid) {
                playerColor = 'white';
            } else if (game.playerBlack === currentUser.uid) {
                playerColor = 'black';
            }
            // If not a player, try to join an available slot if the game is still waiting
            else if (!game.playerWhite && game.status === 'waiting') {
                game.playerWhite = currentUser.uid;
                playerColor = 'white';
            } else if (!game.playerBlack && game.status === 'waiting') {
                game.playerBlack = currentUser.uid;
                playerColor = 'black';
            } else {
                // Game is full or not in 'waiting' state to join a new slot, abort transaction
                return;
            }

            // Update status to 'playing' if both players are present and it was waiting
            if (game.playerWhite && game.playerBlack && game.status === 'waiting') {
                game.status = 'playing';
            }
            return game; // Commit the transaction
        }
        return undefined; // Game does not exist, abort transaction
    }).then((result) => {
        if (result.committed) {
            if (playerColor) { // Only proceed if playerColor was successfully set
                currentGameId = gameId;
                gameLobby.style.display = 'none';
                chessGameDiv.style.display = 'block';
                gameTitle.textContent = `Game ID: ${currentGameId} (You are ${playerColor.charAt(0).toUpperCase() + playerColor.slice(1)})`;
                listenToGameChanges(currentGameId);
                listenToChat(currentGameId);
            } else {
                // This case should ideally be caught by the 'else' in the transaction, but good to have a fallback
                calert("Could not join game. It might be full or an error occurred.");
            }
        } else if (result.snapshot.val() && !result.committed) {
             // Transaction aborted due to concurrent modification or explicit 'return' from transaction function
             calert("Could not join game. It might be full or you're already a player.");
        } else if (!result.snapshot.val()) { // This means `game` was null at the start of transaction
            calert("Game not found.");
        }
    }).catch(error => {
        console.error("Join game transaction failed:", error);
        calert("Error joining game. Please try again.");
    });
}


function listenToGameChanges(gameId) {
    const gameRef = db.ref(`chess/games/${gameId}`); // UPDATED PATH
    gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (gameData) {
            // Load the FEN string from Firebase into chess.js
            if (gameData.board && typeof gameData.board === 'string') {
                chess.load(gameData.board);
                renderBoard(chess.board()); // Re-render the board using chess.js 2D array
            } else {
                console.warn("Firebase game data for board is malformed or missing (expected FEN string). Resetting chess.js.");
                chess.reset(); // Reset chess.js to initial state
                renderBoard(chess.board());
            }

            // Update UI based on chess.js state and Firebase data
            currentTurnSpan.textContent = chess.turn() === 'w' ? 'White' : 'Black';
            gameStatusSpan.textContent = gameData.status || 'Ongoing'; // Default status

            // Update game status in Firebase based on chess.js logic
            let newStatus = gameData.status;
            let winner = null;

            if (chess.isCheckmate()) {
                newStatus = 'checkmate';
                winner = chess.turn() === 'w' ? 'Black' : 'White'; // The side whose turn it is, is checkmated
            } else if (chess.isDraw()) {
                newStatus = 'draw';
            } else if (chess.isStalemate()) {
                newStatus = 'stalemate';
            } else if (chess.isThreefoldRepetition()) {
                newStatus = 'draw_repetition';
            } else if (chess.isInsufficientMaterial()) {
                newStatus = 'draw_insufficient_material';
            } else if (chess.isFiftyMoves()) {
                newStatus = 'draw_50_move';
            } else if (chess.inCheck()) {
                gameStatusSpan.textContent = (chess.turn() === 'w' ? 'White' : 'Black') + ' is in check!';
            }

            // Only update Firebase if the status has actually changed to an end state
            if (newStatus !== gameData.status && (newStatus === 'checkmate' || newStatus === 'draw' || newStatus === 'stalemate' || newStatus === 'draw_repetition' || newStatus === 'draw_insufficient_material' || newStatus === 'draw_50_move')) {
                const updates = { status: newStatus };
                if (winner) {
                    updates.winner = winner;
                }
                db.ref(`chess/games/${gameId}`).update(updates); // UPDATED PATH
            }

            // calert for game end conditions
            if (newStatus === 'checkmate' || newStatus === 'draw' || newStatus === 'stalemate' || newStatus === 'draw_repetition' || newStatus === 'draw_insufficient_material' || newStatus === 'draw_50_move') {
                calert(`Game Over! ${gameData.winner ? gameData.winner + ' wins!' : 'It\'s a draw!'}`);
                // Optionally disable board interaction or show a "Play Again" button
            }

        } else {
            // Game might have been deleted or doesn't exist anymore
            calert("Game ended or was deleted.");
            leaveGame(); // Automatically leave the game UI
        }
    });
}

// --- Chat Functionality ---
sendChatBtn.addEventListener('click', () => {
    const message = chatInput.value.trim();
    if (message && currentGameId && currentUser) {
        db.ref(`chess/games/${currentGameId}/chat`).push({ // UPDATED PATH
            sender: currentUser.email.split('@')[0], // Use part of email as username
            message: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        chatInput.value = '';
    }
});

function listenToChat(gameId) {
    const chatRef = db.ref(`chess/games/${gameId}/chat`); // UPDATED PATH
    chatRef.on('child_added', (snapshot) => {
        const chatMessage = snapshot.val();
        const p = document.createElement('p');
        const date = new Date(chatMessage.timestamp);
        p.textContent = `[${date.toLocaleTimeString()}] ${chatMessage.sender}: ${chatMessage.message}`;
        messagesDiv.appendChild(p);
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to bottom
    });
}

leaveGameBtn.addEventListener('click', leaveGame);

function leaveGame() {
    if (currentGameId && currentUser) {
        const gameRef = db.ref(`chess/games/${currentGameId}`); // UPDATED PATH
        gameRef.transaction((game) => {
            if (game) {
                if (game.playerWhite === currentUser.uid) {
                    game.playerWhite = null;
                } else if (game.playerBlack === currentUser.uid) {
                    game.playerBlack = null;
                }

                if (!game.playerWhite && !game.playerBlack) {
                    return null; // Delete the game node if both players leave
                } else if (game.status === 'playing' && (!game.playerWhite || !game.playerBlack)) {
                    game.status = 'abandoned'; // Mark as abandoned if one player leaves during play
                }
                return game;
            }
            return undefined; // Game does not exist
        }).then(() => {
            db.ref(`chess/games/${currentGameId}`).off('value'); // UPDATED PATH
            db.ref(`chess/games/${currentGameId}/chat`).off('child_added'); // UPDATED PATH

            currentGameId = null;
            playerColor = null;
            selectedPiece = null;
            chess.reset(); // Reset chess.js instance

            chessGameDiv.style.display = 'none';
            gameLobby.style.display = 'block';
            gameTitle.textContent = '';
            messagesDiv.innerHTML = '';
            renderBoard(chess.board()); // Render initial board state
        }).catch(error => {
            console.error("Error leaving game:", error);
            calert("Error leaving game.");
        });
    }
}

// Initial render (initial chess.js board)
renderBoard(chess.board());