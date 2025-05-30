async function createConsumer(router, transport, producer, rtpCapabilities) {
    if (!producer) {
        console.error("Producer not found");
        return null;
    }

    try {
        if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
            console.error("Cannot consume the producer with the given RTP capabilities");
            return null;
        }

        const consumer = await transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: true,
        });

        console.log(`Consumer created for producer ID: ${producer.id}`);

        // Handle consumer events
        consumer.on("transportclose", () => {
            console.log("Consumer transport closed");
            consumer.close();
        });

        consumer.on("producerclose", () => {
            console.log("Consumer producer closed");
            consumer.close();
        });

        // Initially pause the consumer to save bandwidth until the client is ready
        await consumer.resume();

        return consumer;
    } catch (error) {
        console.error("Error creating consumer:", error);
        return null;
    }
}

module.exports = { createConsumer };
