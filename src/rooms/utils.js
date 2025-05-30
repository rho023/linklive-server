const { v4: uuidv4 } = require("uuid");

function generateID() {
    return uuidv4();
}

exports.getRoomID = () => {
    let roomId = generateID();
    return roomId;
};

exports.getPeerID = () => {
    let peerID = generateID();
    return peerID;
};
