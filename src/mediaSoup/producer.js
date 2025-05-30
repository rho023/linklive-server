async function createProducer(transport, rtpParameters, kind) {
    try {
        const producer = await transport.produce({
            kind,
            rtpParameters,
            
        });

        console.log(`${kind} producer created with ID: ${producer.id}`);

        // Handle producer events
        producer.on("transportclose", () => {
            console.log(`${kind} producer transport closed`);
            producer.close();
        });

        producer.on("close", () => {
            console.log(`${kind} producer closed`);
        });

        return producer;
    } catch (error) {
        console.error("Error creating producer:", error);
        throw error;
    }
}

module.exports = { createProducer };
