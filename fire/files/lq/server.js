const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let clients = [];
let readyClients = 0;

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("[DEBUG] A client connected:", socket.id);

    // When a client submits their name
    socket.on("submitName", (name) => {
        clients.push({ id: socket.id, name, score: 0 });
        console.log("[DEBUG] Received name:", name);

        // Notify all clients about the waiting status
        io.emit("updateStatus", `${clients.length} player(s) connected. Waiting for others...`);
    });

    // When a client is ready
    socket.on("ready", () => {
        readyClients++;
        console.log("[DEBUG] Clients ready:", readyClients);

        // Start the quiz when all connected clients are ready
        if (readyClients === clients.length) {
            io.emit("startQuiz");
        }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        clients = clients.filter((client) => client.id !== socket.id);
        console.log("[DEBUG] A client disconnected:", socket.id);
    });
});

server.listen(8080, () => {
    console.log("[DEBUG] Server is running on http://localhost:8080");
});
