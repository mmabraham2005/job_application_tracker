const mongoose = require("mongoose");
const { STATUSES } = require("./ApplicationData");

const applicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  companyName: {
    type: String,
    required: true,
    trim: true,
  },
  jobTitle: {
    type: String,
    required: true,
    trim: true,
  },
  applicationDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: STATUSES,
    required: true,
  },
  sourceGmailMessageId: {
    type: String,
    trim: true,
    maxlength: 255,
    immutable: true,
  },
});

applicationSchema.index(
  {
    userId: 1,
    sourceGmailMessageId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      sourceGmailMessageId: {
        $type: "string",
        $gt: "",
      },
    },
    name: "unique_user_gmail_message",
  },
);

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;
