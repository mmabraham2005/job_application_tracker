const express = require("express");
const {
  createApplication,
  getApplications,
  updateApplication,
  updateApplicationStatus,
} = require("../controllers/applicationController");

const router = express.Router();

router.post("/", createApplication);
router.get("/", getApplications);
router.patch("/:id/status", updateApplicationStatus);
router.patch("/:id", updateApplication);

module.exports = router;
