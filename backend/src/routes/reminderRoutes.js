const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const {
  createReminder,
  getReminders,
  updateReminder,
  deleteReminder,
  retryCalendarSync,
} = require("../controllers/reminderController");

const router = express.Router();

router.use(requireAuth);

router.post("/", createReminder);
router.get("/", getReminders);
router.patch("/:id", updateReminder);
router.delete("/:id", deleteReminder);
router.post("/:id/calendar-sync", retryCalendarSync);

module.exports = router;