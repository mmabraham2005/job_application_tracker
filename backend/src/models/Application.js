const mongoose = require("mongoose");
const { STATUSES } = require("./ApplicationData");

const applicationSchema = new mongoose.Schema({
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
});

const Application = mongoose.model("Application", applicationSchema);

module.exports = Application;
