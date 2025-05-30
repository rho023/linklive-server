const emitError = require("../socketHandlers/error.js");
const { User, addCandidateListner, clearCandidateQueue } = require("./utils.js");


module.exports.watch = async (io, socket, message) => {
    const roomName = message.roomName;
    const room = io.sockets.adapter.rooms.get(roomName);
    console.log(message);
    const user = new User(socket.id, message.userName, message.role, null);
    const stream = Object.values(room.participants).find(el => el.role === "stream");
    room.participants[user.id] = user;
    try {
        user.outgoingMedia = await room.pipeline.create('WebRtcEndpoint');
        clearCandidateQueue(user, user.id, user.outgoingMedia);
        addCandidateListner(socket, user.outgoingMedia, user.id);
    } catch (err) {
        console.log(err);
        emitError(socket, "Unable to create MediaElements (Pipeline/WebRtcEndpoint)");
    }
    socket.emit("viewer", {
        action: "stream",
        stream: {
            id: stream.id,
            username: stream.username
        }
    })
}

module.exports.checkStream = (io, socket, message) => {
    const roomName = message.roomId;
    const room = io.sockets.adapter.rooms.get(roomName);
    console.log(roomName, room);
    socket.emit("viewer", {
        action: "streamActive",
        active: room.liveStream
    });
};