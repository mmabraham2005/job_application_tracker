const mongoose = require("mongoose");

const emailDeliverySchema = new mongoose.Schema({
  nextAttemptAt: Date,
  attempts: { type: Number, default: 0 },
  sentAt: Date,
  failedAt: Date,
  message: { type: mongoose.Schema.Types.Mixed, select: false },
});

const reminderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    type: {
      type: String,
      enum: ["status_check", "follow_up"],
      required: true,
    },
    dueAt: {
      type: Date,
      required: true,
    },
    remindAt: {
      type: Date,
      required: true,
    },
    channels: {
      googleCalendar: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
    },
    emailDelivery: emailDeliverySchema,
    state: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    googleEventId: {
    type: String,
    },
    googleEventUrl: {
    type: String,
    },
    calendarSyncError: {
    type: String,
    },
  },
  { timestamps: true },
);

reminderSchema.index({ userId: 1, dueAt: 1 });
reminderSchema.index({ state: 1, "channels.email": 1, "emailDelivery.nextAttemptAt": 1 });

module.exports = mongoose.model("Reminder", reminderSchema);
