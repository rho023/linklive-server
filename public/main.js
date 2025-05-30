const mediasoup = require("mediasoup-client");
const { io } = require("socket.io-client");
const users = require("../src/config/users");

// const socket = io("http://3.110.196.141:8080", {
//     transports: ["websocket", "polling"],
//     reconnectionAttempts: 5,
//     timeout: 10000,
// });

const socket = io("http://localhost:3000", {
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
    timeout: 10000,
});

// const liveSocket = io("http://65.2.63.198:8000", {
//     transports: ["websocket", "polling"],
//     reconnectionAttempts: 5,
//     timeout: 10000,
// });

const liveSocket = io("http://localhost:8000");

let device;
let producer;
let localStream;
let producerTransport;
screen;
let consumerTransport;
let streamerTransport;

const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get("roomId");

const screenBtn = document.getElementById("screen");
if (screenBtn) {
    screenBtn.addEventListener("click", shareScreen);
}

const conferenceDiv = document.getElementById("conference");
if (conferenceDiv) {
    joinRoom(roomId);
}

async function joinRoom(roomId) {
    socket.emit("join-room", { roomId });

    socket.on("room-joined", async ({ routerRtpCapabilities, producers, roomId, peerId , peers }) => {
        console.log("Room joined. Router RTP capabilities:", routerRtpCapabilities);
        console.log("Room ID:", roomId, "Peer ID:", peerId , "Peers",peers);
        async function goLive() {
            socket.emit("streamer-join");

            socket.on("streamer-joined", async ({ routerRtpCapabilities, roomId, peerId }) => {
                console.log("Room joined. Router RTP capabilities:", routerRtpCapabilities);
                console.log("Room ID:", roomId, "Peer ID:", peerId);

                device = new mediasoup.Device();
                await device.load({ routerRtpCapabilities });

                localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });
                document.getElementById("local-video").srcObject = localStream;

                producerTransport = await createSendTransport();
                await produceMedia(localStream);
            });
        }
        document.getElementById("roomID").innerText = roomId;

        device = new mediasoup.Device();
        await device.load({ routerRtpCapabilities });

        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById("local-video").srcObject = localStream;

        producerTransport = await createSendTransport();
        consumerTransport = await createRecvTransport();
        await produceMedia(localStream);

        console.log("Initial Producers:", producers);
        producers.forEach(async (producer) => await consumeMedia(producer.producerId));
    });

    socket.on("new-producer", async ({ producerId }) => {
        console.log("New producer available:", producerId);
        await consumeMedia(producerId);
    });
}
function createSendTransport() {
    return new Promise((resolve) => {
        let data;
        socket.emit("create-send-transport", async (transportInfo) => {
            console.log(transportInfo.iceCandidates);
            const { id, iceParameters, iceCandidates, dtlsParameters } = transportInfo;

            const transport = device.createSendTransport({
                id,
                iceParameters,
                iceCandidates,
                dtlsParameters,
                iceServers: [
                    {
                        urls: ["stun:15.206.148.157:3478"],
                        username: "user",
                        credential: "root",
                    },
                    {
                        urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
                    },
                ],
            });
            console.log("Producer transport initialized:", transport);

            transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
                console.log("Transport connect event triggered.", dtlsParameters);
                socket.emit("connect-send-transport", { dtlsParameters }, (response) => {
                    if (response.error) {
                        console.error("Error connecting transport:", error);
                        return errback(error);
                    }
                    console.log("Transport status:", response);
                    callback();
                });
            });

            transport.on("connectionstatechange", async (state) => {
                console.log("Transport connection state:", state);

                if (state === "connected") {
                    console.log("Transport is connected. Ready to produce.");
                } else if (state === "connecting") {
                    console.log("Connecting transport");
                } else if (state === "failed") {
                    console.error("Transport connection failed.");
                }
            });

            transport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
                console.log(`Produce event triggered for ${kind}`);

                console.log(`Producing ${kind} with rtpParameters:`, rtpParameters);

                socket.emit(
                    "produce",
                    { kind, rtpParameters, transportId: transport.id },
                    (response) => {
                        if (response.error) {
                            console.error("Error in producing media:", response.error);
                            return errback(response.error);
                        }
                        console.log("Produced track ID:", response.id);
                        callback({ id: response.id });
                    }
                );
            });

            resolve(transport);
        });
    });
}

async function produceMedia(stream) {
    try {
        let videoTrack = stream.getVideoTracks()[0];
        let audioTrack = stream.getAudioTracks()[0];

        console.log("Video track selected:", videoTrack);
        console.log("Audio track selected:", audioTrack);

        console.log("Transport state:", producerTransport.connectionState);

        if (videoTrack) {
            const videoEncodings = [
                { maxBitrate: 200000 },
                { maxBitrate: 500000 },
                { maxBitrate: 1000000 },
            ];
            const codecOptions = {
                videoGoogleStartBitrate: 1000,
            };
            await producerTransport.produce({
                track: videoTrack,
                encodings: videoEncodings,
                codecOptions,
            });
        }
        if (audioTrack) {
            const audioEncodings = [{ maxBitrate: 64000 }];
            const codecOptions = {
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2,
            };

            audioTrack.applyConstraints({
                advanced: [
                    { echoCancellation: true },
                    { noiseSuppression: true },
                    { autoGainControl: true },
                ],
            });

            await producerTransport.produce({
                track: audioTrack,
                encodings: audioEncodings,
                codecOptions,
            });
        }
    } catch (error) {
        console.log("Error producing track:", error);
    }
}

async function shareScreen() {
    let stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenVideo = document.createElement("video");
    screenVideo.id = "screen";
    screenVideo.srcObject = stream;
    screenVideo.autoplay = true;
    screenVideo.playsInline = true;
    document.getElementById("video-container").appendChild(screenVideo);
    produceMedia(stream);
}

// Function to consume media from a producer
async function consumeMedia(producerId) {
    console.log("Attempting to consume");
    socket.emit(
        "consume",
        { producerId, rtpCapabilities: device.rtpCapabilities },
        async (response) => {
            if (response.error) {
                console.error("Error in consuming media:", response.error);
                return;
            }

            const { id, producerId, kind, rtpParameters, peerId } = response;
            console.log(`Consumer from peer ${peerId} received`);

            const consumer = await consumerTransport.consume({
                id,
                producerId,
                kind,
                rtpParameters,
            });

            socket.emit("consumer-resume");
            consumerTransport.on("connectionstatechange", (state) => {
                console.log("Receive Transport connection state:", state);
                if (state === "failed") {
                    console.error("ICE connection failed.");
                } else if (state === "connected") {
                    console.log("Connection verified");
                }
            });

            consumer.track.muted = false;
            console.log(consumer.track);
            console.log("Consumer paused:", consumer.paused); // Should be `false`
            console.log("Track ready state:", consumer.track.readyState);
            console.log("Is track enabled:", consumer.track.enabled);
            console.log("Track frame rate:", consumer.track.getSettings());
            console.log("Device capabilities:", device.rtpCapabilities);

            if (consumer.track.kind === "video") {
                const stream = new MediaStream([consumer.track]);

                if (stream.getVideoTracks().length === 0) {
                    console.error("No video tracks available in the stream.");
                }

                const remoteVideo = document.createElement("video");

                remoteVideo.id = peerId;
                remoteVideo.srcObject = stream;
                remoteVideo.autoplay = true;
                remoteVideo.playsInline = true;

                console.log("Remote video:", remoteVideo);

                document.getElementById("video-container").appendChild(remoteVideo);
            } else if (consumer.track.kind === "audio") {
                console.log("Adding audio");
                const audioElement = document.createElement("audio");
                audioElement.style.display = "none";
                audioElement.srcObject = new MediaStream([consumer.track]);
                audioElement.play();
                document.body.appendChild(audioElement);

                console.log("Audio Element:", consumer.track.muted);
            }
        }
    );
}

// Function to create a transport for receiving media
function createRecvTransport() {
    return new Promise((resolve) => {
        socket.emit(
            "create-recv-transport",
            ({ id, iceParameters, iceCandidates, dtlsParameters }) => {
                const transport = device.createRecvTransport({
                    id,
                    iceParameters,
                    iceCandidates,
                    dtlsParameters,
                    iceServers: [
                        {
                            urls: ["stun:15.206.148.157:3478"],
                            username: "user",
                            credential: "root",
                        },
                        {
                            urls: [
                                "stun:stun1.l.google.com:19302",
                                "stun:stun2.l.google.com:19302",
                            ],
                        },
                    ],
                });

                // Handle transport connection
                transport.on("connect", ({ dtlsParameters }, callback, errback) => {
                    socket.emit("connect-recv-transport", { dtlsParameters }, (response) => {
                        if (response.error) return errback(error);
                        console.log("Consumer transport status:", response);
                        callback();
                    });
                });

                resolve(transport);
            }
        );
    });
}

//--------------------------------------- Calling & UI -------------------------------------------

function showModal(modalId) {
    document.getElementById(modalId).style.display = "block";
}
function hideModal(modalId) {
    document.getElementById(modalId).style.display = "none";
}

const loginBtn = document.getElementById("login-btn");
if (loginBtn) {
    console.log("Login button found");
    loginBtn.addEventListener("click", (event) => {
        //event.preventDefault();
        const username = document.getElementById("username").value;
        console.log("Attempting to login");

        // Emit login event to server
        socket.emit("login", { username }, (response) => {
            if (response.success) {
                // Redirect to friends.html with username as query param
                handleFriendsPage();
            } else {
                alert(response.error || "Login failed. Please try again.");
            }
        });
    });
}

// Function to handle friends fetching logic
async function handleFriendsPage() {
    //const urlParams = new URLSearchParams(window.location.search);
    const username = document.getElementById("username").value;

    if (!username) {
        alert("Username is missing. Redirecting to login...");
        hideModal("friends-page");
        showModal("login-page");
        return;
    }

    try {
        // Fetch friends list from the server
        const response = await axios.get(`http://localhost:3000/api/friends/${username}`);
        const friends = response.data;
        console.log(friends);

        const list = document.getElementById("friendsList");

        friends.forEach((friend) => {
            const listItem = document.createElement("li");
            listItem.dataset.username = friend.username;
            listItem.textContent = `${friend.name}`;

            const statusSpan = document.createElement("span");
            statusSpan.className = "status";
            statusSpan.textContent = friend.online ? " (Online)" : " (Offline)";
            listItem.appendChild(statusSpan);

            if (friend.online) {
                const callButton = document.createElement("button");
                callButton.className = "call-button";
                callButton.textContent = "Call";
                callButton.onclick = () => initiateCall(friend.username, friend.name);
                listItem.appendChild(callButton);
            }

            friendsList.appendChild(listItem);
        });
    } catch (error) {
        console.error("Error fetching friends:", error);
        alert("Failed to load friends list.");
    }
}

function initiateCall(recipientUsername, recipientName) {
    const outgoingModal = document.getElementById("outgoing-call-modal");
    const callerNameDisplay = document.getElementById("outgoing-caller-name");
    const callStatus = document.getElementById("outgoing-status");
    const cancelCallButton = document.getElementById("cancel-call");

    // Update modal content
    callerNameDisplay.textContent = `Calling ${recipientName}...`;
    showModal("outgoing-call-modal");

    // Emit the call-user event
    socket.emit("call-user", { to: recipientUsername }, (response) => {
        if (response.success) {
            callStatus.textContent = "Waiting for the recipient to respond...";
        } else {
            outgoingModal.classList.add("hidden");
            alert(response.error || "Call failed.");
        }
    });

    // Handle cancel button
    cancelCallButton.onclick = () => {
        hideModal("outgoing-call-modal");
        socket.emit("call-ended", { to: recipientUsername });
        alert("Call canceled.");
    };

    // Handle server responses
    socket.on("call-rejected", () => {
        hideModal("outgoing-call-modal");
        alert(`${recipientName} has rejected your call.`);
    });

    socket.on("call-accepted", () => {
        hideModal("outgoing-call-modal");
        alert("Call accepted. Starting WebRTC (to be implemented).");
    });

    socket.on("call-missed", () => {
        hideModal("outgoing-call-modal");
        alert(`${recipientName} did not respond to your call.`);
    });
}

socket.on("incoming-call", ({ from }) => {
    const ringtone = document.getElementById("ringtone");
    const callerName = document.getElementById("caller-name");

    // Display the modal
    const name = users.find((user) => user.socketId === from)?.username || "Unknown";
    callerName.textContent = `Incoming call from ${name}...`;
    showModal("incoming-call-modal");
    ringtone.play();

    // Handle accept call
    document.getElementById("accept-call").onclick = () => {
        ringtone.pause();
        hideModal("incoming-call-modal");

        socket.emit("call-accepted", { to: from });
        console.log("Call accepted. Starting WebRTC (to be implemented).");
    };

    // Handle reject call
    document.getElementById("reject-call").onclick = () => {
        ringtone.pause();
        hideModal("incoming-call-modal");

        socket.emit("call-rejected", { to: from });
        console.log("Call rejected.");
    };

    // Auto-reject after 20 seconds if no action is taken
    setTimeout(() => {
        if (document.getElementById("incoming-call-modal").style.display === "block") {
            ringtone.pause();
            hideModal("incoming-call-modal");

            socket.emit("call-missed", { to: from });
            console.log("Missed call.");
        }
    }, 20000);
});

// Listen for a friend coming online
socket.on("friend-online", ({ username, name }) => {
    console.log(`${username} is online now`);
    const friendsList = document.getElementById("friendsList");
    const friendItem = Array.from(friendsList.children).find(
        (item) => item.dataset.username === username
    );

    if (friendItem) {
        // Update the online status
        const statusSpan = friendItem.querySelector(".status");
        if (statusSpan) {
            statusSpan.textContent = "(Online)";
        } else {
            const onlineText = document.createElement("span");
            onlineText.className = "status";
            onlineText.textContent = " (Online)";
            friendItem.appendChild(onlineText);
        }

        // Add the call button if it doesn't exist
        let callButton = friendItem.querySelector(".call-button");
        if (!callButton) {
            callButton = document.createElement("button");
            callButton.className = "call-button";
            callButton.textContent = "Call";
            callButton.onclick = () => initiateCall(username, name);
            friendItem.appendChild(callButton);
        }
    }
});

// Listen for a friend going offline
socket.on("friend-offline", ({ username }) => {
    console.log(`${username} is offline now`);
    const friendsList = document.getElementById("friendsList");
    const friendItem = Array.from(friendsList.children).find(
        (item) => item.dataset.username === username
    );

    if (friendItem) {
        // Update the status
        const statusSpan = friendItem.querySelector(".status");
        if (statusSpan) {
            statusSpan.textContent = "(Offline)";
        }

        // Remove the call button
        const callButton = friendItem.querySelector(".call-button");
        if (callButton) {
            callButton.remove();
        }
    }
});

//-----------------------------------------Live Streaming-------------------------------------------

const liveBtn = document.getElementById("go-live");
if (liveBtn) {
    liveBtn.addEventListener("click", goLive);
}
let streamingDevice;

liveSocket.on("connect", async () => {
    console.log("Live streaming server connected");
    liveSocket.on("message", async ({ message }) => {
        console.log("Got a message:", message);
    });

    liveSocket.emit("message", { message: "Hello from client" });
    //await goLive();
});

async function goLive() {
    console.log("Attemting to go live");
    liveSocket.emit("streamer-join");

    liveSocket.on("streamer-joined", async ({ routerRtpCapabilities, roomId, peerId }) => {
        console.log("Room joined. Router RTP capabilities:", routerRtpCapabilities);
        console.log("Room ID:", roomId, "Peer ID:", peerId);

        streamingDevice = new mediasoup.Device();
        await streamingDevice.load({ routerRtpCapabilities });

        // Capture the screen stream
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                displaySurface: "browser",
                logicalSurface: true,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30, max: 60 },
            },
            audio: {
                sampleRate: 48000,
                channelCount: 2,
            },
        });

        // Capture the microphone stream
        const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 48000,
                channelCount: 2,
            },
        });

        // Create an AudioContext and create a channel merger to mix audio streams
        const audioContext = new AudioContext();

        const screenAudioSource = audioContext.createMediaStreamSource(screenStream);
        const micAudioSource = audioContext.createMediaStreamSource(micStream);

        const audioMerger = audioContext.createChannelMerger(2);

        // Apply audio processing to the screen audio source
        const screenGainNode = audioContext.createGain();
        screenGainNode.gain.value = 1.0;

        const screenFilter = audioContext.createBiquadFilter();
        screenFilter.type = "highpass";
        screenFilter.frequency.setValueAtTime(200, audioContext.currentTime);

        screenAudioSource.connect(screenFilter).connect(screenGainNode).connect(audioMerger, 0, 0);

        // Apply audio processing to the mic audio source
        const micGainNode = audioContext.createGain();
        micGainNode.gain.value = 1.0;

        const micFilter = audioContext.createBiquadFilter();
        micFilter.type = "highpass";
        micFilter.frequency.setValueAtTime(200, audioContext.currentTime);

        micAudioSource.connect(micFilter).connect(micGainNode).connect(audioMerger, 0, 1);

        // Create a destination node for the processed audio
        const destination = audioContext.createMediaStreamDestination();
        audioMerger.connect(destination);

        // Combine the video track from screenStream and processed audio tracks
        const liveStream = new MediaStream([
            ...screenStream.getVideoTracks(),
            ...destination.stream.getAudioTracks(),
        ]);

        streamerTransport = await createStreamerSendTransport();
        await produceStreamerMedia(liveStream);
    });
}

function createStreamerSendTransport() {
    return new Promise((resolve) => {
        let data;
        liveSocket.emit("create-send-transport", async (transportInfo) => {
            console.log(transportInfo.iceCandidates);
            const { id, iceParameters, iceCandidates, dtlsParameters } = transportInfo;

            const transport = streamingDevice.createSendTransport({
                id,
                iceParameters,
                iceCandidates,
                dtlsParameters,
                iceServers: [
                    {
                        urls: ["stun:15.206.148.157:3478"],
                        username: "user",
                        credential: "root",
                    },
                    {
                        urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
                    },
                ],
            });
            console.log("Producer transport initialized:", transport);

            transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
                console.log("Transport connect event triggered.", dtlsParameters);
                liveSocket.emit("connect-send-transport", { dtlsParameters }, (response) => {
                    if (response.error) {
                        console.error("Error connecting transport:", error);
                        return errback(error);
                    }
                    console.log("Transport status:", response);
                    callback();
                });
            });

            transport.on("connectionstatechange", async (state) => {
                console.log("Transport connection state:", state);

                if (state === "connected") {
                    console.log("Transport is connected. Ready to produce.");
                } else if (state === "connecting") {
                    console.log("Connecting transport");
                } else if (state === "failed") {
                    console.error("Transport connection failed.");
                }
            });

            transport.on("produce", async ({ kind, rtpParameters }, callback, errback) => {
                console.log(`Produce event triggered for ${kind}`);

                console.log(`Producing ${kind} with rtpParameters:`, rtpParameters);

                liveSocket.emit(
                    "produce",
                    { kind, rtpParameters, transportId: transport.id, camera: false },
                    (response) => {
                        if (response.error) {
                            console.error("Error in producing media:", response.error);
                            return errback(response.error);
                        }
                        console.log("Produced track ID:", response.id);
                        callback({ id: response.id });
                    }
                );
            });

            resolve(transport);
        });
    });
}

async function produceStreamerMedia(stream) {
    try {
        let videoTrack = stream.getVideoTracks()[0];
        let audioTrack = stream.getAudioTracks()[0];
        console.log("Video track selected:", videoTrack);
        console.log("Audio track selected:", audioTrack);

        console.log("Transport state:", producerTransport.connectionState);
        if (videoTrack) {
            const videoEncodings = [{ maxBitrate: 500000, scaleResolutionDownBy: 1 }];
            const codecOptions = {
                videoGoogleStartBitrate: 3000,
                videoGoogleMinxBitrate: 1000,
                videoGoogleMaxBitrate: 5000,
            };
            await streamerTransport.produce({
                track: videoTrack,
                encodings: videoEncodings,
                codecOptions,
            });
        }
        if (audioTrack) {
            const audioEncodings = [{ maxBitrate: 128000 }];
            const codecOptions = {
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2,
            };
            await streamerTransport.produce({
                track: audioTrack,
                encodings: audioEncodings,
                codecOptions,
            });
        }
    } catch (error) {
        console.log("Error producing track:", error);
    }
}

window.socket = socket;
