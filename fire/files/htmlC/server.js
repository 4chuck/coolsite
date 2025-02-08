const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Trivia Questions
const questions = [
    {
        question: "What is the capital of France?",
        options: ["Berlin", "Madrid", "Paris", "Rome"],
        answer: 3,
    },
    {
        question: "Which planet is known as the Red Planet?",
        options: ["Earth", "Mars", "Jupiter", "Venus"],
        answer: 2,
    },
    // Add more questions as needed
];

let currentQuestionIndex = 0;
let clients = [];

// Serve the HTML page
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// WebSocket server for client communication
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client connected.');
    clients.push(ws);

    // Send the current question to the newly connected client
    if (currentQuestionIndex < questions.length) {
        sendQuestion(ws, currentQuestionIndex);
    } else {
        ws.send('Game Over! No more questions.');
    }

    ws.on('message', (message) => {
        console.log('Received:', message);
        const clientResponse = JSON.parse(message);
        const correct = clientResponse.answer === questions[currentQuestionIndex].answer;
        ws.send(correct ? 'Correct!' : 'Incorrect!');

        // Move to the next question
        currentQuestionIndex++;
        broadcastNextQuestion();
    });

    ws.on('close', () => {
        console.log('Client disconnected.');
        clients = clients.filter((client) => client !== ws);
    });
});

function sendQuestion(ws, index) {
    const question = questions[index];
    ws.send(JSON.stringify({ type: 'question', question }));
}

function broadcastNextQuestion() {
    if (currentQuestionIndex < questions.length) {
        clients.forEach((client) => sendQuestion(client, currentQuestionIndex));
    } else {
        clients.forEach((client) => client.send('Game Over! No more questions.'));
    }
}

server.listen(8080, () => {
    console.log('Server running at http://localhost:8080');
});
