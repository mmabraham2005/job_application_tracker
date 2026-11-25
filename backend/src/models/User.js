const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    authProvider: {
      type: String,
      enum: ["google", "guest"],
      required: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    emailDetectionPreferences: {
      trustedSenders: {
        type: [String],
        default: [],
      },
      blockedSenders: {
        type: [String],
        default: [],
      },
    },
    displayName: {
      type: String,
      trim: true,
    },
    avatarUrl: {
      type: String,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
