const { OAuth2Client } = require("google-auth-library");
const dotenv = require("dotenv");
dotenv.config();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleAuth = async (req, res) => {
  const { token } = req.body;

  if (!token) {
      return res.status(400).json({ message: "Token is required." });
  }

  try {
      // Verify the token with Google
      const ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const { sub, email, name, picture } = payload;

      // Example user data to store in DB or session
      const user = {
          id: sub,
          email,
          name,
          picture,
      };

      // Here you can handle your user logic, like saving to DB
      res.status(200).json({
          message: "Authentication successful!",
          user,
      });
  } catch (error) {
      console.error("Error verifying token:", error);
      res.status(401).json({ message: "Invalid token." });
  }
};


exports.refreshToken = async (req, res) => {
  const { token } = req.body;

  if (!token) {
      return res.status(400).json({ message: "Token is required." });
  }

  try {
      // Verify the token with Google
      const ticket = await client.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const { sub, email, name, picture } = payload;

      // Example user data to store in DB or session
      const user = {
          id: sub,
          email,
          name,
          picture,
      };

      res.status(200).json({
          message: "Token refreshed!",
          user,
      });
  } catch (error) {
      console.error("Error verifying token:", error);
      res.status(401).json({ message: "Invalid token." });
  }
}