alert("Script is running...");
// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/9.17.2/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBJs9fp6w30ZpxycPLGy2TFxk",
  authDomain: "login-b6382.firebaseapp.com",
  databaseURL: "https://login-b6382-default-rtdb.firebaseio.com",
  projectId: "login-b6382",
  storageBucket: "login-b6382.appspot.com",
  messagingSenderId: "482805184778",
  appId: "1:482805184778:web:5dfba2587a438a5ed7a2f3",
  measurementId: "G-S55NBV7G1T"
};

// Initialize Firebase
let db;
try {
  console.log("Initializing Firebase...");
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("Error initializing Firebase:", error.message);
}

// DOM Elements
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const timerEl = document.getElementById("time");
const scoreEl = document.getElementById("current-score");
const leaderboardEl = document.getElementById("leaderboard-list");
const startBtn = document.getElementById("start-btn");
const categoryDropdown = document.createElement("select");
document.body.insertBefore(
  categoryDropdown,
  document.getElementById("game-container")
);

let currentScore = 0;
let timer;
let questionIndex = 0;
let questions = [];

// Fetch Categories
async function fetchCategories() {
  alert("Fetching categories...");
  alert("Fetching categories...");
  try {
    const res = await fetch(
      "https://opentdb.com/api_category.php"
    );
    const data = await res.json();
    alert("Categories fetched successfully:", data);
    alert("Categories fetched successfully.");

    data.trivia_categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      categoryDropdown.appendChild(option);
    });
  } catch (error) {
    alert("Error fetching categories:", error.message);
    alert("Error fetching categories: " + error.message);
  }
}

// Fetch Questions
async function fetchQuestions(categoryId) {
  alert(`Fetching questions for category ${categoryId}...`);
  alert(`Fetching questions for category ${categoryId}...`);
  try {
    const url =
      `https://opentdb.com/api.php` +
      `?amount=10&category=${categoryId}&type=multiple`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.results.length === 0) {
      alert("No questions found for this category.");
      return;
    }

    alert("Questions fetched successfully:", data);
    alert("Questions fetched successfully.");
    questions = data.results.map((q) => ({
      question: q.question,
      answers: shuffle([q.correct_answer, ...q.incorrect_answers]),
      correct: q.correct_answer,
    }));
  } catch (error) {
    alert("Error fetching questions:", error.message);
    alert("Error fetching questions: " + error.message);
  }
}

// Shuffle Answers
function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Display Question
function displayQuestion() {
  if (questionIndex >= questions.length) {
    endGame();
    return;
  }

  const { question, answers } = questions[questionIndex];
  questionEl.innerHTML = question;
  answersEl.innerHTML = "";
  answers.forEach((answer) => {
    const btn = document.createElement("button");
    btn.textContent = answer;
    btn.onclick = () => checkAnswer(answer);
    answersEl.appendChild(btn);
  });

  alert(`Displaying question ${questionIndex + 1}`);
  alert(`Displaying question ${questionIndex + 1}`);
  startTimer();
}

// Check Answer
function checkAnswer(selected) {
  stopTimer();
  const correct = questions[questionIndex].correct;

  if (selected === correct) {
    currentScore += 10;
    scoreEl.textContent = currentScore;
    alert("Correct answer! Score:", currentScore);
    alert("Correct answer!");
  } else {
    alert("Wrong answer! Correct was:", correct);
    alert("Wrong answer! Correct was: " + correct);
  }

  questionIndex++;
  displayQuestion();
}

// Timer
function startTimer() {
  let time = 10;
  timerEl.textContent = time;
  timer = setInterval(() => {
    time--;
    timerEl.textContent = time;

    if (time <= 0) {
      clearInterval(timer);
      alert("Time's up!");
      questionIndex++;
      displayQuestion();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timer);
}

// End Game
function endGame() {
  alert(`Game Over! Your score: ${currentScore}`);
  saveScore(currentScore);
  displayLeaderboard();
}

// Save Score to Firebase
function saveScore(score) {
  const playerName = prompt("Enter your name:");
  if (!playerName) return;

  const scoresRef = db.ref(`leaderboard/${playerName}`);
  scoresRef.set({ name: playerName, score }).then(() => {
    alert("Score saved successfully.");
    alert("Score saved successfully!");
  });
}

// Start Game
startBtn.addEventListener("click", async () => {
  const selectedCategory = categoryDropdown.value;
  currentScore = 0;
  questionIndex = 0;
  scoreEl.textContent = currentScore;

  alert("Starting game...");
  await fetchQuestions(selectedCategory);
  displayQuestion();
});

// Load Categories
fetchCategories();
