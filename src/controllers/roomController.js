const redisClient = require('../config/redisClient');

// Function to add a room ID to Redis
const addRoomID = async (roomID) => {
  try {
    await redisClient.sadd('activeRooms', roomID); 
    console.log(`Room ID ${roomID} added to Redis`);
  } catch (error) {
    console.error('Error adding Room ID to Redis:', error);
  }
};

// Function to remove a room ID from Redis
const removeRoomID = async (roomID) => {
  try {
    await redisClient.srem('activeRooms', roomID); 
    console.log(`Room ID ${roomID} removed from Redis`);
  } catch (error) {
    console.error('Error removing Room ID from Redis:', error);
  }
};

// Function to fetch all active room IDs
const getAllRoomIDs = async () => {
  try {
    const roomIDs = await redisClient.smembers('activeRooms'); // Fetches all from the Redis set
    console.log('Active Room IDs:', roomIDs);
    return roomIDs;
  } catch (error) {
    console.error('Error fetching Room IDs from Redis:', error);
    return [];
  }
};

module.exports = {
  addRoomID,
  removeRoomID,
  getAllRoomIDs,
};
