const peers = {};

function addPeer(peerId, socketId) {
    peers[peerId] = socketId;
}

function removePeer(peerId) {
    delete peers[peerId];
}

module.exports = { addPeer, removePeer, peers };
