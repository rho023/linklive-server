const express = require("express");
const router = express.Router();
const authControllers = require("../controllers/auth");

// router.get("/success", authControllers.getSuccess);
// router.get("/error", authControllers.getError);
// router.get("/google/signIn", authControllers.getSignin);
// router.get("/google/callback", authControllers.getCallback);

router.post("/refresh", authControllers.refreshToken);
router.post("/google", authControllers.googleAuth);
module.exports = router;
