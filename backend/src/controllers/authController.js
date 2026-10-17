const { OAuth2Client } = require("google-auth-library");
const { User } = require("../models/User");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body || {};

    if (typeof credential !== "string" || !credential) {
      return res.status(400).json({
        message: "Google credential is required",
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email_verified) {
      return res.status(401).json({
        message: "Invalid Google account",
      });
    }

    let user = await User.findOne({
      authProvider: "google",
      googleId: payload.sub,
    });

    if (!user) {
      user = await User.create({
        authProvider: "google",
        googleId: payload.sub,
        email: payload.email,
        displayName: payload.name,
        avatarUrl: payload.picture,
      });
    }

    req.session.userId = user._id.toString();

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
    console.error("Google login failed:", error.message);

    return res.status(401).json({
      message: "Google authentication failed",
    });
  }
};

module.exports = { googleLogin };
