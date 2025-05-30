const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const https = require('https');
const {addRoomID, removeRoomID, getAllRoomIDs} = require('../controllers/roomController');

// Create an HTTPS agent that ignores SSL errors
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

exports.generateMeetingID = () => {
  return uuidv4();
}

exports.getRoomId = (req, res, next) => {
   let roomId = exports.generateMeetingID();
   addRoomID(roomId);
    res.json({ roomId });
};

exports.getRoom = (req, res, next) => {
  const { roomId } = req.params;
  res.redirect(`/?roomId=${roomId}&member=true`);
};

exports.getActiveRooms = async (req, res, next) => { 
  const roomIDs = await getAllRoomIDs();
  res.json({ activeRooms: roomIDs });
}

exports.removeRoom = async (req, res, next) => {
  const { roomId } = req.params;
  removeRoomID(roomId);
  res.json({ message : `Room ID ${roomId} removed from Redis` });
}

exports.createRoom = async (req, res, next) => {
  try {

    // Data received from the client
    const data = req.body;

    // Send POST request to the Python API
    const pythonApiResponse = await axios.post("https://rooms.joinmyworld.live/create_room", data);

    res.json({
      message: "Data forwarded to Python API",
      pythonApiResponse: pythonApiResponse.data,
    });

  } catch (error) {
    console.error("Error forwarding data:", error.message);
    res.status(500).json({ error: "Failed to forward data to Python API" });
  }
}


exports.getFollowing = async (req, res, next) => {
  try {
    // Get the userId from the request parameters
    const { userId } = req.params;

    // Send GET request to the Python API
    const pythonApiResponse = await axios.get(`https://auth.joinmyworld.live/api/following?id=${userId}`);

    res.json({
      message: "Data forwarded to Python API",
      pythonApiResponse: pythonApiResponse.data,
    });

  } catch (error) {
    console.error("Error forwarding data:", error.message);
    res.status(500).json({ error: "Failed to forward data to Python API" });
  }
}


exports.getFollowers = async (req, res, next) => {
  try {
    // Get the userId from the request parameters
    const { userId } = req.params;    

    // Send GET request to the Python API
    const pythonApiResponse = await axios.get(`https://auth.joinmyworld.live/api/follower?id=${userId}`);
    
    res.json({
      message: "Data forwarded to Python API",
      pythonApiResponse: pythonApiResponse.data,
    });
    
  } catch (error) {
    console.error("Error forwarding data:", error.message);
    res.status(500).json({ error: "Failed to forward data to Python API" });
  }
}



exports.getCategories = async (req, res) => {
  try {
    // Fetch all branches
    const branchesResponse = await axios.get('https://others.joinmyworld.live/cat', { httpsAgent });
    const branches = branchesResponse.data;
    
    // Prepare an array to store categories with subcategories
    const categoryList = [];

    for(const branch of branches) {
      const categoriesResponse = await axios.get(`https://others.joinmyworld.live/cat/${branch._id}`, { httpsAgent });
      const categories = categoriesResponse.data[0].category;
      

      for(const category of categories) {
        const subcategoriesResponse = await axios.get(`https://others.joinmyworld.live/cat/${branch._id}/${category._id}`, { httpsAgent });
        const subcategories = subcategoriesResponse.data.category[0].subs.map(sub => sub.name);
        
        categoryList.push({
          category: category.name,
          subcategories: subcategories
        });
      }
    }

    res.status(200).json(categoryList);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching categories and subcategories' });
  }
};
