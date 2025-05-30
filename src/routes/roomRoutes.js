const express = require("express");
const router = express.Router();

const roomControllers = require("../controllers/room");

router.get("/roomId", roomControllers.getRoomId);
router.post("/createRoom", roomControllers.createRoom);
router.delete("/deleteRoom/:roomId", roomControllers.removeRoom);
router.get("/activeRooms", roomControllers.getActiveRooms);
router.get("/following/:userId", roomControllers.getFollowing);
router.get("/followers/:userId", roomControllers.getFollowers);
router.get("/categories", roomControllers.getCategories);

module.exports = router;