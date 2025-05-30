const { getWorker } = require("./worker");

let router = null;

async function createRouter() {
    const worker = await getWorker();
    if (!worker) {
        console.error("Worker is not initialized yet.");
        throw new Error("Worker not available.");
    }
    try {
        router = await worker.createRouter({
            mediaCodecs: [
                { kind: "audio", mimeType: "audio/opus", clockRate: 48000, channels: 2 },
                {
                    kind: "video",
                    mimeType: "video/VP8",
                    clockRate: 90000,
                    parameters: {
                        "x-google-start-bitrate": 1000,
                    },
                },
            ],
        });
        console.log("Router created");
    } catch (error) {
        console.error("Error creating router:", error);
    }
}

// Function to get the router, ensuring it has been initialized
async function getRouter() {
    if (!router) {
        await createRouter();
    }
    return router;
}

module.exports = { createRouter, getRouter };
