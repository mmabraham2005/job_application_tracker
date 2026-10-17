const express = require("express");
const {
  googleLogin,
  getCurrentUser,
  guestLogin,
  logout,
} = require("../controllers/authController");

const router = express.Router();

router.post("/google", googleLogin);
router.get("/me", getCurrentUser);
router.post("/guest", guestLogin);
router.post("/logout", logout);

module.exports = router;
