const express = require("express");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

function createClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  );
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function redirectToFrontend(res, result) {
  const url = new URL(process.env.FRONTEND_URL);
  url.searchParams.set("calendar", result);
  return res.redirect(url.toString());
}

router.use(requireAuth);

// Reports whether this session has calendar authorization.
// It does not contact Google to verify that access is still valid.
router.get("/status", (req, res) => {
  res.json({
    connected: Boolean(req.session.googleCalendar?.access_token),
  });
});

router.post("/disconnect", async (req, res) => {
  try {
    // Remove Calendar credentials from this user's session.
    delete req.session.googleCalendar;

    // Cancel any unfinished Calendar authorization flow.
    delete req.session.calendarOAuth;

    await saveSession(req);

    return res.status(200).json({
      connected: false,
      message: "Google Calendar disconnected successfully",
    });
  } catch (error) {
    console.error("Calendar disconnect failed:", error.message);

    return res.status(500).json({
      message: "Could not disconnect Google Calendar",
    });
  }
});

// Start authorization using a full browser navigation.
router.get("/connect", async (req, res) => {
  try {
    if (req.user.authProvider !== "google") {
      return res.status(403).send("Sign in with Google first.");
    }

    const state = crypto.randomBytes(32).toString("hex");

    req.session.calendarOAuth = {
      state,
      userId: req.user._id.toString(),
      createdAt: Date.now(),
    };

    await saveSession(req);

    const url = createClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [CALENDAR_SCOPE],
      state,
      login_hint: req.user.email,
    });

    return res.redirect(url);
  } catch (error) {
    console.error("Calendar authorization could not start:", error.message);
    return res.status(500).send("Could not connect Google Calendar.");
  }
});

// Google redirects the browser here after authorization.
router.get("/callback", async (req, res) => {
  try {
    const pending = req.session.calendarOAuth;
    const state = req.query.state;

    const validState =
      pending &&
      typeof state === "string" &&
      state === pending.state &&
      pending.userId === req.user._id.toString() &&
      Date.now() - pending.createdAt < 10 * 60 * 1000;

    if (!validState) {
      return res
        .status(400)
        .send("Invalid or expired authorization. Try connecting again.");
    }

    // Consume the state so the callback cannot be reused.
    delete req.session.calendarOAuth;
    await saveSession(req);

    if (req.query.error) {
      return redirectToFrontend(res, "denied");
    }

    if (typeof req.query.code !== "string") {
      return res.status(400).send("Missing authorization code.");
    }

    const client = createClient();
    const { tokens } = await client.getToken(req.query.code);

    if (!tokens.access_token) {
      throw new Error("No access token returned");
    }

    // Verify the user actually granted Calendar access.
    const info = await client.getTokenInfo(tokens.access_token);

    if (!info.scopes.includes(CALENDAR_SCOPE)) {
      return redirectToFrontend(res, "missing_permission");
    }

    req.session.googleCalendar = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
    };

    await saveSession(req);

    return redirectToFrontend(res, "connected");
  } catch (error) {
    // Do not log tokens or the full Google error response.
    console.error("Calendar authorization failed:", error.message);
    return redirectToFrontend(res, "failed");
  }
});

module.exports = router;
