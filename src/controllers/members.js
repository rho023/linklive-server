const emitError = require("../socketHandlers/error.js");
const {
    addUser,
    createEndpoint,
} = require("./utils.js");

module.exports.joinRoom = async (io, socket, message) => {
    const { user, room } = addUser(io, socket, message);
    try {
        createEndpoint(socket, user, room);
        sendExisting(io, socket, message);
        newParticipant(socket, message);
        room.participants[user.id] = user;
    } catch (err) {
        console.log(err);
        emitError(socket, "Unable to create MediaElements (Pipeline/WebRtcEndpoint)");
    }
}

const sendExisting = (io, socket, message) => {
    const existingUsers = Object.values(io.sockets.adapter.rooms.get(message.roomName).participants);
    const usersConnected = []
    for (let element of existingUsers) {
        usersConnected.push({
            id: element.id,
            username: element.username,
        });
    }

    socket.emit("member", {
        action: "existingUsers",
        existingUsers: usersConnected,
    });
};

const newParticipant = (socket, message) => {
    if (message.role !== "viewer" && message.role !== "stream") {
        socket.to(message.roomName).emit("member", {
            action: "newMember",
            user: {
                id: socket.id,
                username: message.userName,
            },
        });
    }
};
