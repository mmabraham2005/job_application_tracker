
const { serializeUser } = require("../utils/userSerializer");

const getProfile = async (req, res) => {
  try {
    return res.status(200).json({
      user: serializeUser(req.user),
    });
  } catch (error) {
    console.error("Failed to retrieve profile:", error);

    return res.status(500).json({
      message: "Failed to retrieve profile",
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        message: "Invalid request body",
      });
    }

    const updates = Object.keys(req.body);

    if (
      updates.length !== 1 ||
      !updates.includes("displayName")
    ) {
      return res.status(400).json({
        message: "Only displayName can be updated",
      });
    }

    const { displayName } = req.body;

    if (
      typeof displayName !== "string" ||
      !displayName.trim()
    ) {
      return res.status(400).json({
        message: "Display name is required",
      });
    }

    req.user.displayName = displayName.trim();

    const updatedUser = await req.user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user: serializeUser(updatedUser),
    });
  } catch (error) {
    console.error("Failed to update profile:", error);

    return res.status(500).json({
      message: "Failed to update profile",
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
