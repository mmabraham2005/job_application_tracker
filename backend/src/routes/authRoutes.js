const express = require("express");
const {
  googleLogin,
  getCurrentUser,
} = require("../controllers/authController");

const router = express.Router();

router.post("/google", googleLogin);
router.get("/me", getCurrentUser);

module.exports = router;
