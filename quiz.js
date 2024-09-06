const startButton = document.getElementById('start-btn');
const nextButton = document.getElementById('next-btn');
const questionContainer = document.getElementById('question-container');
const answerButtons = document.getElementById('answer-buttons');
const questionElement = document.getElementById('question');

let shuffledQuestions, currentQuestionIndex;

// Fetch Science Questions from Open Trivia Database (OpenTDB)
async function fetchScienceQuestions() {
    const response = await fetch('https://opentdb.com/api.php?amount=10&category=17&type=multiple');
    const data = await response.json();
    return data.results.map(formatQuestion);
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
    questionContainer.classList.remove('hide');
    nextButton.classList.remove('hide');
    setNextQuestion();
});

// Display the next question
function setNextQuestion() {
    resetState();
    showQuestion(shuffledQuestions[currentQuestionIndex]);
}

// Show question and answer buttons
function showQuestion(question) {
    questionElement.innerHTML = question.question;
    question.answers.forEach(answer => {
        const button = document.createElement('button');
        button.innerText = answer;
        button.classList.add('btn');
        button.addEventListener('click', selectAnswer);
        answerButtons.appendChild(button);
        if (answer === question.correctAnswer) {
            button.dataset.correct = true;
        }
    });
}

// Reset previous state (remove buttons)
function resetState() {
    nextButton.classList.add('hide');
    while (answerButtons.firstChild) {
        answerButtons.removeChild(answerButtons.firstChild);
    }
}

// Handle answer selection
function selectAnswer(e) {
    const selectedButton = e.target;
    const correct = selectedButton.dataset.correct;
    Array.from(answerButtons.children).forEach(button => {
        setStatusClass(button, button.dataset.correct);
    });
    nextButton.classList.remove('hide'); // Always show the Next button after selecting an answer
}

// Set color for correct or incorrect answer
function setStatusClass(element, correct) {
    clearStatusClass(element);
    if (correct) {
        element.style.backgroundColor = 'green';
    } else {
        element.style.backgroundColor = 'red';
    }
}

// Clear the previous status
function clearStatusClass(element) {
    element.style.backgroundColor = '';
}

// Move to the next question
nextButton.addEventListener('click', () => {
    currentQuestionIndex++;
    if (currentQuestionIndex < shuffledQuestions.length) {
        setNextQuestion();
    } else {
        startButton.innerText = 'Restart';
        startButton.classList.remove('hide');
        nextButton.classList.add('hide');
        questionContainer.classList.add('hide');
    }
});
