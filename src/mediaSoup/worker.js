const mediasoup = require("mediasoup");
require("dotenv").config();

let worker = null;

async function createWorker() {
    const minPort = parseInt(process.env.RTC_MIN_PORT, 10) || 10000;
    const maxPort = parseInt(process.env.RTC_MAX_PORT, 10) || 10100;

    console.log("Worker Min Port:", minPort);

    worker = await mediasoup.createWorker({
        rtcMinPort: minPort,
        rtcMaxPort: maxPort,
        logLevel: "debug",
        logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
    });
    console.log(`Worker PID: ${worker.pid}`);

    worker.on("died", (error) => {
        console.error("Mediasoup worker has died");
        process.exit(1);
    });
    return worker;
}

module.exports = { createWorker, getWorker: () => worker };
