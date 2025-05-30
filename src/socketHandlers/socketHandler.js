const { createWebRtcTransport } = require("../mediaSoup/transport");
const { joinRoom, leaveRoom, rooms } = require("../rooms/roomManager");
const { addPeer, removePeer, peers } = require("../rooms/peerManager");
const { createProducer } = require("../mediaSoup/producer");
const { createConsumer } = require("../mediaSoup/consumer");
const { getRoomID, getPeerID } = require("../rooms/utils");
const { getRouter } = require("../mediaSoup/router");
const users = require("../config/users");
const uploadToS3 = require("../config/s3Bucket");

const callTimers = {};

module.exports = (io) => {
    io.on("connection", (socket) => {
        console.log(`Client connected: ${socket.id}`);

        socket.on("join-room", async ({ roomId, peerId ,isHost }) => {
            if (!roomId) roomId = getRoomID();
            if (!peerId) peerId = getPeerID();

            const router = await getRouter();

            // Get current peers in the room
            const peersInRoom = rooms[roomId]?.peers || {};
            const peerIds = Object.keys(peersInRoom);

            socket.roomId = roomId;
            socket.peerId = peerId;

            // === Auto-approve if first peer or screen-share ===
            if (isHost || peerId.endsWith("share")) {
                joinRoom(roomId, peerId);
                addPeer(peerId, socket.id);
                socket.join(roomId);

                socket.emit("join-approved", { approved: true });
                socket.emit("room-joined", {
                    routerRtpCapabilities: router.rtpCapabilities,
                    producers: [],
                    roomId,
                    peerId,
                    peers: {}
                });
                return;
            }

            // === Ask host for approval ===
            const hostPeerId = peerIds[0];
            const hostSocketId = peersInRoom[hostPeerId];

            console.log("Requesting join approval from host:", hostPeerId, hostSocketId);

            socket.broadcast.emit("ask-to-join", {
                requesterPeerId: peerId,
                requesterSocketId: socket.id,
            });

            // Store pending join for lookup when host replies
            socket.pendingJoin = {
                roomId,
                peerId,
                router,
                peersInRoom
            };
        });

        // === Handle host approval/rejection ===
        socket.on("ask-to-join-response", ({ approved, to }) => {
            // Forward approval to the requester
            io.to(to).emit("join-approved", { approved });

            if (!approved) return;

            // Get the socket of the requester
            const requesterSocket = io.sockets.sockets.get(to);
            if (!requesterSocket || !requesterSocket.pendingJoin) return;

            const {
                roomId,
                peerId,
                router,
                peersInRoom
            } = requesterSocket.pendingJoin;

            joinRoom(roomId, peerId);
            addPeer(peerId, requesterSocket.id);

            requesterSocket.join(roomId);
            requesterSocket.roomId = roomId;
            requesterSocket.peerId = peerId;
            const existingProducers = rooms[roomId].producers || {};

            const producers = [];
            for (const producerId in existingProducers) {
                const producer = existingProducers[producerId];
                producers.push({ producerId: producer.id, kind: producer.kind });
            }
            console.log(`producers =${producers} `)

            requesterSocket.emit("room-joined", {
                routerRtpCapabilities: router.rtpCapabilities,
                producers: producers,
                roomId,
                peerId,
                peers: peersInRoom
            });

            delete requesterSocket.pendingJoin;
        
    });

        socket.on("getRouterRtpCapabilities", async (callback) => {
            const router = await getRouter();
            const rtpCapabilities = router.rtpCapabilities;
            callback({ rtpCapabilities });
        });

        socket.on("create-send-transport", async (callback) => {
            const transport = await createWebRtcTransport();
            console.log(
                `Producer transport for peer ${socket.peerId} created with id:${transport.id}`
            );

            // Add these lines here:
            if (!rooms[socket.roomId].sendTransports) rooms[socket.roomId].sendTransports = {};
            rooms[socket.roomId].sendTransports[socket.peerId] = transport;

            socket.sendTransportId = transport.id; // Associate transport with socket

            console.log(
                `Callback details id:${transport.id} iceParam: ${transport.iceParameters} iceCandidates: ${transport.iceCandidates} dtlsParams: ${transport.dtlsParameters}`
            );
            callback({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        });

        socket.on("connect-send-transport", async ({ dtlsParameters }, callback) => {
            const transport = rooms[socket.roomId].sendTransports[socket.peerId];
            console.log(`Producer transport ${transport.id} attempting to connect`);

            if (!transport) {
                return callback({ error: "Transport not found" });
            }
            console.log("DTLS PARAMS...After Producer Transport connects to the server ", {
                dtlsParameters,
            });
            await transport.connect({ dtlsParameters });
            callback("Producer transport successfully connected");
        });

        socket.on("produce", async ({ kind, rtpParameters, transportId }, callback) => {
            const transport = rooms[socket.roomId].sendTransports[socket.peerId];
            if (!transport) {
                return callback({ error: "Producer Transport not found" });
            }
            const producer = await createProducer(transport, rtpParameters, kind);

             // Store producer with peerId
            if (!rooms[socket.roomId].producers) rooms[socket.roomId].producers = {};
            rooms[socket.roomId].producers[producer.id] = {
                id: producer.id,
                kind: producer.kind,
                peerId: socket.peerId,
                instance: producer
            };
            console.log("Producer stored:", rooms[socket.roomId].producers[producer.id]);
            callback({ id: producer.id });

            // Inform other peers about the new producer
            socket.to(socket.roomId).emit("new-producer", { producerId: producer.id, peerId: socket.peerId});
        });

        socket.on("create-recv-transport", async (callback) => {
            const transport = await createWebRtcTransport();
            console.log(
                `Consumer transport for peer ${socket.peerId} created with id:${transport.id}`
            );

            // Save transport to the peer
            if (!rooms[socket.roomId].recvTransports) rooms[socket.roomId].recvTransports = {};
            rooms[socket.roomId].recvTransports[socket.peerId] = transport;

            socket.recvTransportId = transport.id; // Associate transport with socket
            callback({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        });

        socket.on("connect-recv-transport", async ({ dtlsParameters }, callback) => {
            const transport = rooms[socket.roomId].recvTransports[socket.peerId];
            console.log(`Consumer transport ${transport.id} attempting to connect`);

            if (!transport) {
                return callback({ error: "Consumer Transport not found" });
            }
            console.log("DTLS PARAMS...After Consumer Transport connects to the server ", {
                dtlsParameters,
            });
            await transport.connect({ dtlsParameters });
            callback("Consumer transport successfully connected");
        });

        socket.on("consume", async ({ producerId, rtpCapabilities }, callback) => {
            const router = await getRouter();
            const producer = Object.values(rooms[socket.roomId].producers).find(
                (p) => p.id === producerId
            );
            console.log(`consume producerId = ${producerId}, rtp =  ${rtpCapabilities}`);
            const transport = rooms[socket.roomId].recvTransports[socket.peerId];

            if (!producer) {
                return callback({ error: "Producer not found" });
            }
            if (!transport) {
                return callback({ error: "Transport not found" });
            }

            const consumer = await createConsumer(router, transport, producer, rtpCapabilities);

            if (!consumer) {
                return callback({ error: "Failed to create consumer" });
            }

            // Store consumer
            if (!rooms[socket.roomId].consumers) rooms[socket.roomId].consumers = {};
            rooms[socket.roomId].consumers[consumer.id] = {
                id: consumer.id,
                kind: consumer.kind,
                peerId: socket.peerId,
                instance: consumer
            };

            callback({
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                peerId: producer.peerId,
            });

        });

        // Pause a producer and notify others
        socket.on("pause-producer", async ({ producerId }) => {
            const producerObj = rooms[socket.roomId].producers[producerId];
            if (producerObj && producerObj.instance && !producerObj.instance.paused) {
                await producerObj.instance.pause();
                // Notify all other peers in the room
                socket.to(socket.roomId).emit("producer-paused", {
                    peerId: producerObj.peerId,
                    kind: producerObj.kind,
              
                });
            }
        });

        // Resume a producer and notify others
        socket.on("resume-producer", async ({ producerId }) => {
            const producerObj = rooms[socket.roomId].producers[producerId];
            if (producerObj && producerObj.instance && producerObj.instance.paused) {
                await producerObj.instance.resume();
                socket.to(socket.roomId).emit("producer-resumed", {
                    peerId: producerObj.peerId,
                    kind: producerObj.kind,
                 
                });
            }
        });

        // Pause a consumer and respond with peerId in the callback
        socket.on("pause-consumer", async ({ consumerId }) => {
            const consumerObj = rooms[socket.roomId].consumers[consumerId];
            if (consumerObj && consumerObj.instance && !consumerObj.instance.paused) {
                await consumerObj.instance.pause();
               
            } 
        });

        // Resume a consumer and respond with peerId in the callback
        socket.on("resume-consumer", async ({ consumerId }) => {
            const consumerObj = rooms[socket.roomId].consumers[consumerId];
            if (consumerObj && consumerObj.instance && consumerObj.instance.paused) {
                await consumerObj.instance.resume();
             
            }
        });

        // Send a message to all other sockets in the room
        socket.on("message", ({ text }) => {
            // Broadcast to all other sockets in the room except the sender
            socket.broadcast.emit("receive-message", {
                peerId: socket.peerId,
                text : text
            });
        });

        // User login
        socket.on("login", ({ username }, callback) => {
            const user = users.find((u) => u.username === username);
            if (!user) {
                return callback({ error: "User not found" });
            }
            user.socketId = socket.id; // Update socketId
            console.log(`${username} logged in with socket ID: ${socket.id}`);

            // Notify all friends that the user is online
            user.friends.forEach((friendUsername) => {
                const friend = users.find((u) => u.username === friendUsername);
                if (friend && friend.socketId) {
                    io.to(friend.socketId).emit("friend-online", {
                        username: user.username,
                        name: user.name,
                    });
                }
            });

            callback({ success: true });

            // Handle socket disconnection
            socket.on("disconnect", () => {
                user.socketId = null;
                user.friends.forEach((friendUsername) => {
                    const friend = users.find((u) => u.username === friendUsername);
                    if (friend && friend.socketId) {
                        io.to(friend.socketId).emit("friend-offline", { username: user.username });
                    }
                });
            });
        });

        // Call a user
        socket.on("call-user", ({ to }, callback) => {
            const recipient = users.find((u) => u.username === to);

            if (!recipient) {
                return callback({ error: "Recipient not found" });
            }

            if (!recipient.socketId) {
                return callback({ error: "User is offline" });
            }

            // Emit the incoming call event to the recipient
            io.to(recipient.socketId).emit("incoming-call", { from: socket.id });

            // Start a timeout for 20 seconds
            const timerId = setTimeout(() => {
                io.to(socket.id).emit("call-missed", { to });
                callTimers[socket.id] = null; // Clear the reference
            }, 20000);

            callTimers[socket.id] = timerId;

            // Acknowledge the call initiation
            callback({ success: true });
        });

        socket.on("call-accepted", ({ to }) => {
            if (callTimers[to]) {
                clearTimeout(callTimers[to]);
                callTimers[to] = null;
            }
            io.to(to).emit("call-accepted", { from: socket.id });
            console.log(`Call accepted by ${socket.id}`);

            const roomId = getRoomID();
            socket.join(roomId);

            // Notify both participants to start the WebRTC process
            io.to(to).emit("start-webrtc", { roomId });
            io.to(socket.id).emit("start-webrtc", { roomId });
        });

        socket.on("call-rejected", ({ to }) => {
            if (callTimers[to]) {
                clearTimeout(callTimers[to]);
                callTimers[to] = null;
            }
            io.to(to).emit("call-rejected", { from: socket.id });
            console.log(`Call rejected by ${socket.id}`);
        });

        socket.on("call-ended", ({ to }) => {
            io.to(to).emit("call-ended", { from: socket.id });
            console.log(`Call ended by ${socket.id}`);
        })
        

        socket.on("disconnect", () => {
            const user = users.find((u) => u.socketId === socket.id);
            if (user) {
                user.socketId = null;
                console.log(`${user.username} disconnected`);
            }
            console.log(`Client disconnected: ${socket.id}`);
            // Notify others in the room
            if (socket.roomId && socket.peerId) {
                socket.to(socket.roomId).emit("peer-disconnected", { peerId: socket.peerId });
            }
            leaveRoom(socket.roomId, socket.peerId);
            removePeer(socket.peerId);
        });

        socket.on("thumbnailScreenshot", async ({ image }) => { 
            try {
                // console.log("thumbnailScreenshot data:", image);
                const filename = `Video_Thumbnails/${Date.now()}.png`;        
                await uploadToS3(image, filename); // Use "image" directly
                console.log(`Thumbnail uploaded successfully in S3 Bucket: ${filename}`);
            } catch (error) {
                console.error("Error uploading thumbnail:", error);
            }
        });
        
    });
};