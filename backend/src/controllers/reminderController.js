//routes for reminder
const mongoose = require("mongoose");
const Reminder = require("../models/Reminder");
const Application = require("../models/Application");
const {
  syncAndSaveCalendar,
  removeCalendarEvent,
} = require("../services/calendarService");

const validBody = (body) =>
  body !== null && typeof body === "object" && !Array.isArray(body);

function validateDetails(body) {
  const allowed = ["title", "type", "dueAt", "remindAt", "channels"];

  if (
    !validBody(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  ) {
    return "Invalid reminder fields";
  }

  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > 200
  ) {
    return "A title of 1–200 characters is required";
  }

  if (!["status_check", "follow_up"].includes(body.type)) {
    return "Invalid reminder type";
  }

  const dueAt = new Date(body.dueAt);
  const remindAt = new Date(body.remindAt);

  if (
    typeof body.dueAt !== "string" ||
    typeof body.remindAt !== "string" ||
    Number.isNaN(dueAt.getTime()) ||
    Number.isNaN(remindAt.getTime())
  ) {
    return "Valid scheduled and reminder times are required";
  }

  if (remindAt.getTime() <= Date.now()) {
    return "Reminder time must be in the future";
  }

  if (remindAt > dueAt) {
    return "Reminder time cannot be after the scheduled time";
  }

  const channels = body.channels;

  if (
    !validBody(channels) ||
    Object.keys(channels).some(
      (key) => !["googleCalendar", "email"].includes(key),
    ) ||
    typeof channels.googleCalendar !== "boolean" ||
    typeof channels.email !== "boolean"
  ) {
    return "Invalid delivery channels";
  }

  return null;
}

function reminderDetails(body) {
  return {
    title: body.title.trim(),
    type: body.type,
    dueAt: new Date(body.dueAt),
    remindAt: new Date(body.remindAt),
    channels: {
      googleCalendar: body.channels.googleCalendar,
      email: body.channels.email,
    },
  };
}

function handleError(res, error) {
  console.error("Reminder request failed:", error);

  const invalid =
    error.name === "ValidationError" || error.name === "CastError";

  return res.status(invalid ? 400 : 500).json({
    message: invalid ? "Invalid reminder data" : "Reminder request failed",
  });
}

const createReminder = async (req, res) => {
  try {
    if (!validBody(req.body)) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    const { applicationId, ...details } = req.body;

    if (
      typeof applicationId !== "string" ||
      !mongoose.isValidObjectId(applicationId)
    ) {
      return res.status(400).json({ message: "Invalid application ID" });
    }

    const validationError = validateDetails(details);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    if (details.channels.email && !req.user.email) {
      return res.status(400).json({
        message: "Sign in with Google to select email reminders",
      });
    }

    const application = await Application.findOne({
      _id: applicationId,
      userId: req.user._id,
    });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    const reminder = await Reminder.create({
      userId: req.user._id,
      applicationId,
      ...reminderDetails(details),
    });
    await syncAndSaveCalendar(req, reminder);
    await reminder.populate("applicationId", "companyName jobTitle");

    return res.status(201).json(reminder);
  } catch (error) {
    return handleError(res, error);
  }
};

const getReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find({
      userId: req.user._id,
    })
      .populate("applicationId", "companyName jobTitle")
      .sort({ dueAt: 1 });

    return res.json(reminders);
  } catch (error) {
    return handleError(res, error);
  }
};

const updateReminder = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid reminder ID" });
    }

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found" });
    }

    const body = req.body;

    // A state-only request completes or reopens a reminder.
    if (
      validBody(body) &&
      Object.keys(body).length === 1 &&
      Object.hasOwn(body, "state")
    ) {
      if (!["pending", "completed"].includes(body.state)) {
        return res.status(400).json({ message: "Invalid reminder state" });
      }

      reminder.state = body.state;
    } else {
      const validationError = validateDetails(body);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      if (body.channels.email && !req.user.email) {
        return res.status(400).json({
          message: "Sign in with Google to select email reminders",
        });
      }

      Object.assign(reminder, reminderDetails(body));
    }

// Persist the user's changes even if Google is temporarily unavailable.
    await reminder.save();

    await syncAndSaveCalendar(req, reminder);

    await reminder.populate("applicationId", "companyName jobTitle");
    return res.json(reminder);
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteReminder = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid reminder ID",
      });
    }

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        message: "Reminder not found",
      });
    }

    // Remove the Google event before deleting its database reference.
    try {
      await removeCalendarEvent(req, reminder);
    } catch {
      return res.status(502).json({
        message:
          "Could not remove the calendar event. Reconnect Google Calendar and try again.",
      });
    }

    await reminder.deleteOne();

    return res.json({
      message: "Reminder and linked calendar event deleted",
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const retryCalendarSync = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid reminder ID",
      });
    }

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        message: "Reminder not found",
      });
    }

    await syncAndSaveCalendar(req, reminder);
    await reminder.populate("applicationId", "companyName jobTitle");

    return res.json(reminder);
  } catch (error) {
    return handleError(res, error);
  }
};

module.exports = {
  createReminder,
  getReminders,
  updateReminder,
  deleteReminder,
  retryCalendarSync,
};