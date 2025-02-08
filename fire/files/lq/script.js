const socket = io();

// DOM Elements
const nameForm = document.getElementById("nameForm");
const waitingScreen = document.getElementById("waitingScreen");
const quizScreen = document.getElementById("quizScreen");
const nameInput = document.getElementById("nameInput");
const playerName = document.getElementById("playerName");
const status = document.getElementById("status");
const readyButton = document.getElementById("readyButton");

// Handle name submission
document.getElementById("submitName").addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (name) {
        socket.emit("submitName", name);
        playerName.textContent = name;
        nameForm.style.display = "none";
        waitingScreen.style.display = "block";
    }
});

// Handle readiness
readyButton.addEventListener("click", () => {
    socket.emit("ready");
    readyButton.disabled = true;
    status.textContent = "Waiting for other players to be ready...";
});

// Update status from the server
socket.on("updateStatus", (message) => {
    status.textContent = message;
});

// Start the quiz
socket.on("startQuiz", () => {
    waitingScreen.style.display = "none";
    quizScreen.style.display = "block";
});
