document.getElementById('category-btn').addEventListener('click', startQuizByCategory);

async function startQuizByCategory() {
  const selectedCategory = document.getElementById('category-select').value;
  const apiURL = `https://opentdb.com/api.php?amount=10&category=${selectedCategory}&type=multiple`;

  try {
    console.log("Fetching questions from:", apiURL);

    const response = await fetch(apiURL);
    if (!response.ok) throw new Error("Failed to fetch questions");

    const data = await response.json();
    console.log("API Response:", data);

    if (!data.results || data.results.length === 0) {
      throw new Error("No questions available for the selected category");
    }

    // Proceed to load the quiz with the questions
    loadQuiz(data.results);
  } catch (error) {
    console.error("Error:", error.message);
    alert("Error loading quiz: " + error.message);
  }
}

function loadQuiz(questions) {
  // Example setup for loading the quiz
  document.getElementById('category-container').classList.add('d-none');
  document.getElementById('quiz-interface').classList.remove('d-none');

  document.getElementById('total-questions').textContent = questions.length;
  document.getElementById('current-question').textContent = 1;

  // Add logic to display questions and answers
  displayQuestion(questions[0]);
}

function displayQuestion(question) {
  document.getElementById('question').textContent = question.question;

  const answerButtons = document.getElementById('answer-buttons');
  answerButtons.innerHTML = '';

  const answers = [...question.incorrect_answers, question.correct_answer];
  answers.sort(() => Math.random() - 0.5);

  answers.forEach(answer => {
    const button = document.createElement('button');
    button.classList.add('btn', 'btn-secondary', 'mb-2');
    button.textContent = answer;
    button.onclick = () => checkAnswer(answer, question.correct_answer);
    answerButtons.appendChild(button);
  });
}

function checkAnswer(selectedAnswer, correctAnswer) {
  if (selectedAnswer === correctAnswer) {
    alert("Correct!");
  } else {
    alert(`Wrong! Correct answer is: ${correctAnswer}`);
  }
}