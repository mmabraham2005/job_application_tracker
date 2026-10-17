const User = require("../models/User");

const requireAuth = async (req, res, next) => {
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

    req.user = user;

    next();
  } catch (error) {
    console.error("Authentication middleware failed:", error);

    return res.status(500).json({
      message: "Failed to authenticate request",
    });
  }
};

module.exports = requireAuth;
