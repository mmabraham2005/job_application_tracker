const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { createUserSession } = require("../utils/session.js");
const { serializeUser } = require("../utils/userSerializer.js");

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

      await createUserSession(req, user._id);

      return res.status(200).json({
        user: serializeUser(user),
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
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Failed to get current user:", error);

    return res.status(500).json({
      message: "Failed to retrieve current user",
    });
  }
};

const guestLogin = async (req, res) => {
  try {
    if (req.session?.userId) {
      const existingUser = await User.findById(req.session.userId);

      if (existingUser) {
        return res.status(200).json({
          user: serializeUser(existingUser),
        });
      }
    }

    const user = await User.create({
      authProvider: "guest",
      displayName: "Guest",
    });

    await createUserSession(req, user._id);

    return res.status(201).json({
      user: serializeUser(user),
    });
  } catch (error) {
    console.error("Guest login failed:", error);

    return res.status(500).json({
      message: "Failed to create guest session",
    });
  }
};

const logout = (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout failed:", error);

      return res.status(500).json({
        message: "Failed to log out",
      });
    }

    res.clearCookie("jobtracker.sid", {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    return res.status(200).json({
      message: "Logged out successfully",
    });
  });
};

module.exports = { googleLogin, getCurrentUser, guestLogin, logout };
