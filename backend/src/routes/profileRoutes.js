
const express = require("express");

const {
  getProfile,
  updateProfile,
} = require("../controllers/profileController");

const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.use(requireAuth);

router.get("/", getProfile);

router.put("/", updateProfile);

module.exports = router;
