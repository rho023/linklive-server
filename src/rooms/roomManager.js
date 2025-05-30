const rooms = {};

function joinRoom(roomId, peerId) {
    if (!rooms[roomId]) {
        rooms[roomId] = { peers: {} };
    }
    rooms[roomId].peers[peerId] = true;
}

function leaveRoom(roomId, peerId) {
    if (rooms[roomId]) {
        delete rooms[roomId].peers[peerId];
        if (Object.keys(rooms[roomId].peers).length === 0) {
            delete rooms[roomId];
        }
    }
}

module.exports = { joinRoom, leaveRoom, rooms };
