const iceCandidateQueues = {};
class User {
    constructor(id, username, role, outgoingMedia) {
        this.id = id
        this.username = username
        this.role = role
        this.outgoingMedia = outgoingMedia
        this.incomingMedia = {}
    }
}

const getID = (baseid, role) => {
    if (role === "screen") {
        return `${baseid}_${role}`;
    }
    return baseid;
};

module.exports.getID = getID;

const addCandidateListner = (socket, endpoint, userID) => {
    endpoint.on("IceCandidateFound", (event) => {
        if (event.candidate) {
            socket.emit("signalling", {
                "action": "candidate",
                "userID": userID,
                "candidate": event.candidate,
            });
        }
    });
}

module.exports.addCandidateListner = addCandidateListner;

const clearCandidateQueue = (parentUser, queueID, endpoint) => {
    const parentQueue = iceCandidateQueues[parentUser.id];
    if (parentQueue) {
        const childQueue = parentQueue[queueID];
        if (childQueue) {
            while (childQueue.length) {
                const ice = childQueue.shift();
                endpoint.addIceCandidate(ice.candidate);
            }
        }
    }
}

module.exports.clearCandidateQueue = clearCandidateQueue;

module.exports.addCandidate = (forID, user, candidate) => {
    if (forID === user.id) {
        if (user.outgoingMedia) {
            user.outgoingMedia.addIceCandidate(candidate);
        } else {
            const parentQueue = iceCandidateQueues[user.id];
            if (parentQueue) {
                if (!parentQueue[user.id]) {
                    parentQueue[user.id] = [];
                }
                parentQueue[user.id].push({ candidate: candidate });
            } else {
                iceCandidateQueues[user.id] = []
                iceCandidateQueues[user.id][user.id] = [{ candidate: candidate }];
            }
        }
    } else {
        if (user.incomingMedia[forID]) {
            // console.log("incoming media: ", Object.keys(user.incomingMedia));
            user.incomingMedia[forID].addIceCandidate(candidate);
        } else {
            const parentQueue = iceCandidateQueues[user.id];
            if (parentQueue) {
                if (!parentQueue[forID]) {
                    parentQueue[forID] = [];
                }
                parentQueue[forID].push({ candidate: candidate });
            } else {
                iceCandidateQueues[user.id] = []
                iceCandidateQueues[user.id][forID] = [{ candidate: candidate }];
            }
        }
    }
}

module.exports.addUser = (io, socket, message) => {
    socket.join(message.roomName);
    console.log(`${socket.id} joined ${message.roomName} as ${message.role}`);
    const room = io.sockets.adapter.rooms.get(message.roomName);
    if (message.role === "host") {
        room.participants = {};
    }
    const user = new User(getID(socket.id, message.role), message.userName, message.role);
    return { user: user, room: room };
}

module.exports.createEndpoint = async (socket, user, room) => {
    user.outgoingMedia = await room.pipeline.create('WebRtcEndpoint');
    clearCandidateQueue(user, user.id, user.outgoingMedia);
    addCandidateListner(socket, user.outgoingMedia, user.id);
    console.log("endpoint created");
}