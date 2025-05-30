const { getRouter } = require("./router");

let transport = null; // Global transport reference

async function createWebRtcTransport() {
    try {
        const router = await getRouter();
        transport = await router.createWebRtcTransport({
            // Assign the transport to the global variable
            //listenIps: [{ ip: "0.0.0.0", announcedIp: "3.110.196.141" }],
            listenIps: [{ ip: "0.0.0.0", announcedIp: "192.168.26.167" }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            initialAvailableOutgoingBitrate: 1000000,
            maxIncomingBitrate: 1500000,
            iceServers: [
                {
                    urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
                },
                {
                    urls: ["stun:15.206.148.157:3478"],
                    username: "user",
                    credential: "root",
                },
            ],
        });

        transport.on("dtlsstatechange", (dtlsState) => {
            if (dtlsState === "closed") {
                transport.close();
                console.log("transport closed");
            }
        });

        return transport;
    } catch (error) {
        console.error("Error creating WebRTC Transport:", error);
        return { params: { error } };
    }
}

module.exports = { createWebRtcTransport };
