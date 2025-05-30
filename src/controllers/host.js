const getKurentoClient = require("../kurento.js")
const emitError = require("../socketHandlers/error.js");
const { addUser, createEndpoint } = require("./utils.js");

module.exports.createRoom = async (io, socket, message) => {
    if (message.role !== "host") {
        emitError(socket, "Only host role can create a new room")
        return;
    }
    const { user, room } = addUser(io, socket, message);
    try {
        const kurentoClient = await getKurentoClient();
        room.pipeline = await kurentoClient.create("MediaPipeline");
        console.log("pipeline created");
        createEndpoint(socket, user, room);
        room.participants[user.id] = user;
    } catch (err) {
        console.log(err);
        emitError(socket, "Unable to create MediaElements (Pipeline/WebRtcEndpoint)");
    }
}