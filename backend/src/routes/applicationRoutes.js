const express = require("express");
const {
  createApplication,
  getApplications,
  updateApplication,
  updateApplicationStatus,
  deleteApplication,
} = require("../controllers/applicationController");

const router = express.Router();

router.post("/", createApplication);
router.get("/", getApplications);
router.patch("/:id/status", updateApplicationStatus);
router.patch("/:id", updateApplication);
router.delete("/:id", deleteApplication);

module.exports = router;
