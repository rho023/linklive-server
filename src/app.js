const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");
const http = require("http");
const socketio = require("socket.io");
const { Server } = require("socket.io");
const socketHandlers = require("./socketHandlers/socketHandler");
const session = require("express-session");
const passport = require("passport");
const { createWorker } = require("./mediaSoup/worker");
const { createRouter } = require("./mediaSoup/router");
const bodyParser = require("body-parser");
const authRoutes = require("./routes/authRoutes");
const roomRoutes = require("./routes/roomRoutes");
dotenv.config();

const users = require("./config/users");

const PORT = process.env.PORT || 3000;

// session middleware
app.use(
    session({
        resave: false,
        saveUninitialized: true,
        secret: "SECRET",
    })
);
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something broke!");
});
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());
app.use(express.json());
app.use(cors());

const httpServer = http.createServer(app);
const io = socketio(httpServer, {
    cors: {
        origins: "*",
        methods: ["GET", "POST"],
    },
    transports: ["polling", "websocket"],
});

createWorker().then(() => {
    createRouter();
    socketHandlers(io);
});

//ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/room", roomRoutes);

app.get("/", (req, res) => {
    res.send({ status: "OK", statusCode: 200 });
});

// Endpoint to get user's friends
app.get("/api/friends/:username", (req, res) => {
    const username = req.params.username;
    const user = users.find((u) => u.username === username);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    const friends = user.friends
        .map((friendUsername) => {
            const friend = users.find((u) => u.username === friendUsername);
            return friend
                ? {
                      username: friend.username,
                      name: friend.name,
                      online: !!friend.socketId,
                      socketId: friend.socketId,
                  }
                : null;
        })
        .filter(Boolean);

    res.json(friends);
});

httpServer.listen(PORT, () => {
    console.log(`Group Conference server is running on : ${PORT}`);
});
