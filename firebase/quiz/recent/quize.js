const startButton = document.getElementById('start-btn');
const nextButton = document.getElementById('next-btn');
const questionContainer = document.getElementById('question-container');
const answerButtons = document.getElementById('answer-buttons');
const questionElement = document.getElementById('question');
const scoreIconContainer = document.getElementById('score-container');
const counterContainer = document.getElementById('counter-container');
const currentQuestionElement = document.getElementById('current-question');  // New counter element
// document.getElementById('category-btn').addEventListener('click', startQuizByCategory);

let shuffledQuestions, currentQuestionIndex;
let correctAnswers = 0;
let totalQuestions = 0;
let currentQuestionNumber = 1;  // Track the current question number


// Fetch Science Questions from Open Trivia Database (OpenTDB)
async function fetchScienceQuestions() {
//    const response = await fetch('https://opentdb.com/api.php?amount=20&category=18&type=multiple');
//    const data = await response.json();
//    return data.results.map(formatQuestion);
     const selectedCategory = document.getElementById('category-select').value;
  const apiURL = `https://opentdb.com/api.php?amount=10&category=${selectedCategory}&type=multiple`;

  try {
    console.log("Fetching questions from:", apiURL);

    const response = await fetch(apiURL);
    if (!response.ok) throw new Error("Failed to fetch questions");

    const data = await response.json();
    console.log("API Response:", data);

     return data.results.map(formatQuestion);
   
 //   if (!data.results || data.results.length === 0) {
 //     throw new Error("No questions available for the selected category");
    }

    // Proceed to load the quiz with the questions
 //   loadQuiz(data.results);
  } catch (error) {
    console.error("Error:", error.message);
    alert("Error loading quiz: " + error.message);
  }
}


// Format the API response into a readable format
function formatQuestion(questionData) {
    const formattedQuestion = {
        question: questionData.question,
        correctAnswer: questionData.correct_answer,
        answers: [...questionData.incorrect_answers, questionData.correct_answer]
    };
    // Shuffle the answer choices
    formattedQuestion.answers = formattedQuestion.answers.sort(() => Math.random() - 0.5);
    return formattedQuestion;
}

// Start the quiz
startButton.addEventListener('click', async () => {
    startButton.classList.add('hide');
    shuffledQuestions = await fetchScienceQuestions();
    currentQuestionIndex = 0;
    correctAnswers = 0;
    totalQuestions = 0;
    currentQuestionNumber = 1;  // Reset the question number
    questionContainer.classList.remove('hide');
    nextButton.classList.remove('hide');
    counterContainer.classList.remove('hide');  // Show the counter when the quiz starts
    scoreIconContainer.classList.add('hide');
    setNextQuestion();
});
