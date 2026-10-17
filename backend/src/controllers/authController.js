const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body || {};

    if (typeof credential !== "string" || !credential) {
      return res.status(400).json({
        message: "Google credential is required",
      });
    }

    let payload;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      payload = ticket.getPayload();
    } catch (error) {
      console.error("Google token verification failed:", error.message);

      return res.status(401).json({
        message: "Invalid or expired Google credential",
      });
    }

    if (!payload?.sub || !payload.email_verified) {
      return res.status(401).json({
        message: "Invalid Google account",
      });
    }

    try {
      let user = await User.findOne({
        authProvider: "google",
        googleId: payload.sub,
      });

      if (!user) {
        user = await User.findOneAndUpdate(
          {
            authProvider: "google",
            googleId: payload.sub,
          },
          {
            $setOnInsert: {
              email: payload.email,
              displayName: payload.name,
              avatarUrl: payload.picture,
            },
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
          },
        );
      }

      await new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
          if (error) return reject(error);
          resolve();
        });
      });

      req.session.userId = user._id.toString();

      await new Promise((resolve, reject) => {
        req.session.save((error) => {
          if (error) return reject(error);
          resolve();
        });
      });

      return res.status(200).json({
        user: {
          id: user._id,
          authProvider: user.authProvider,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (error) {
      console.error("Google login failed:", error);

      return res.status(500).json({
        message: "Failed to complete Google login",
      });
    }
  } catch (error) {
    console.error("Google login failed:", error.message);

    return res.status(401).json({
      message: "Google authentication failed",
    });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Not authenticated",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        message: "Not authenticated",
      });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        authProvider: user.authProvider,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Failed to get current user:", error);

    return res.status(500).json({
      message: "Failed to retrieve current user",
    });
  }
};

module.exports = { googleLogin, getCurrentUser };
