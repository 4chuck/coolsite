const questionEl = document.getElementById('question');
const answersEl = document.getElementById('answers');
const timerEl = document.getElementById('time');
const scoreEl = document.getElementById('current-score');
const leaderboardEl = document.getElementById('leaderboard-list');
const startBtn = document.getElementById('start-btn');
const categoryDropdown = document.createElement('select'); // Dropdown for categories
document.body.insertBefore(categoryDropdown, document.getElementById('game-container')); // Add dropdown

let currentScore = 0;
let timer;
let questionIndex = 0;
let questions = [];

// Fetch Categories from Open Trivia DB
async function fetchCategories() {
  const res = await fetch('https://opentdb.com/api_category.php');
  const data = await res.json();

  // Populate dropdown with categories
  data.trivia_categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    categoryDropdown.appendChild(option);
  });
}

// Fetch Questions from Open Trivia DB with Category
async function fetchQuestions(categoryId) {
  const url = `https://opentdb.com/api.php?amount=10&category=${categoryId}&type=multiple`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.results.length === 0) {
    alert('No questions found for this category. Please try another.');
    return;
  }

  questions = data.results.map(q => ({
    question: q.question,
    answers: shuffle([q.correct_answer, ...q.incorrect_answers]),
    correct: q.correct_answer
  }));
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
  answersEl.innerHTML = '';
  answers.forEach(answer => {
    const btn = document.createElement('button');
    btn.textContent = answer;
    btn.onclick = () => checkAnswer(answer);
    answersEl.appendChild(btn);
  });

  startTimer();
}

// Check Answer
function checkAnswer(selected) {
  stopTimer();
  const correct = questions[questionIndex].correct;

  if (selected === correct) {
    currentScore += 10;
    scoreEl.textContent = currentScore;
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
  const scoresRef = ref(db, `leaderboard/${playerName}`);
  set(scoresRef, { name: playerName, score });
}

// Display Leaderboard
function displayLeaderboard() {
  const leaderboardRef = ref(db, 'leaderboard');
  onValue(leaderboardRef, snapshot => {
    const data = snapshot.val();
    const sorted = Object.values(data || {}).sort((a, b) => b.score - a.score);
    leaderboardEl.innerHTML = sorted.map(s => `<li>${s.name}: ${s.score}</li>`).join('');
  });
}

// Start Game
startBtn.addEventListener('click', async () => {
  const selectedCategory = categoryDropdown.value;

  currentScore = 0;
  questionIndex = 0;
  scoreEl.textContent = currentScore;
  await fetchQuestions(selectedCategory);
  displayQuestion();
});

// Load Categories on Page Load
fetchCategories();