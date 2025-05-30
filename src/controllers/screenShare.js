const emitError = require("../socketHandlers/error.js");
const {
  User,
  addUser,
  addCandidateListner,
  clearCandidateQueue,
  createEndpoint,
} = require("./utils.js");

module.exports.startScreenShare = async (io, socket, message) => {
  const { user, room } = addUser(io, socket, message);
  try {
    createEndpoint(socket, user, room);
    newParticipant(socket, message);
    room.participants[user.id] = user;
    console.log(`ID: ${user.id}`);
  } catch (err) {
    emitError(socket, "Unable to create MediaElements (Pipeline/WebRtcEndpoint)");
  }
};

const newParticipant = (socket, message) => {
  if (message.role !== "viewer" && message.role !== "stream") {
    socket.to(message.roomName).emit("member", {
      action: "newScreen",
      user: {
        id: socket.id + "_screen",
        username: message.userName,
      },
    });
  }
};

module.exports.stopScreenShare = async (io, socket, message) => {
  console.log(`Disconnecting: ${socket.id}_screen`);
  const rooms = socket.rooms;
  Array.from(rooms).forEach((element) => {
    const participants = io.sockets.adapter.rooms.get(element).participants;
    if (participants) {
      delete participants[`${socket.id}_screen`];

      socket.to(element).emit("member", {
        action: "screenDisconnect",
        userid: socket.id + "_screen",
      });
      socket.emit("member", {
        action: "screenDisconnect",
        userid: socket.id + "_screen",
      });
    }
  });
};
