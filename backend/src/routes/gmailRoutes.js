const express = require("express");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const requireAuth = require("../middleware/requireAuth");
const { listApplicationEmails } = require("../services/gmailService");
const User = require("../models/User");
const {
  validateEmailDetectionPreferences,
} = require("../utils/emailDetectionPreferences");
const {
  importApplication,
  getSuggestions,
} = require("../controllers/gmailController");

const router = express.Router();

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const OAUTH_TIMEOUT_MS = 10 * 60 * 1000;

function createClient() {
  return new OAuth2Client(
    process.env.GOOGLE_GMAIL_CLIENT_ID,
    process.env.GOOGLE_GMAIL_CLIENT_SECRET,
    process.env.GOOGLE_GMAIL_REDIRECT_URI,
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
  const url = new URL(process.env.FRONTEND_URL || "http://localhost:5173");
  url.pathname = "/profile";

  url.searchParams.set("gmail", result);

  return res.redirect(url.toString());
}

router.use(requireAuth);

// Report the Gmail connection stored in the current session.
router.get("/status", (req, res) => {
  res.json({
    connected: Boolean(req.session.googleGmail?.access_token),
  });
});

// Remove Gmail credentials without affecting the user session.
router.post("/disconnect", async (req, res) => {
  try {
    delete req.session.googleGmail;
    delete req.session.gmailOAuth;

    await saveSession(req);

    return res.status(200).json({
      connected: false,
      message: "Gmail disconnected successfully",
    });
  } catch {
    return res.status(500).json({
      message: "Could not disconnect Gmail",
    });
  }
});

// Start Gmail authorization.
router.get("/connect", async (req, res) => {
  try {
    if (req.user.authProvider !== "google") {
      return res.status(403).send("Sign in with Google first.");
    }

    const state = crypto.randomBytes(32).toString("hex");

    req.session.gmailOAuth = {
      state,
      userId: req.user._id.toString(),
      createdAt: Date.now(),
    };

    await saveSession(req);

    const url = createClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [GMAIL_SCOPE, "openid", "email"],
      state,
      login_hint: req.user.email,
    });

    return res.redirect(url);
  } catch {
    console.error("Gmail authorization could not start");

    return res.status(500).send("Could not connect Gmail.");
  }
});

// Handle Google's OAuth callback.
router.get("/callback", async (req, res) => {
  try {
    const pending = req.session.gmailOAuth;
    const state = req.query.state;

    const validState =
      req.user.authProvider === "google" &&
      pending &&
      typeof state === "string" &&
      state === pending.state &&
      pending.userId === req.user._id.toString() &&
      Date.now() - pending.createdAt < OAUTH_TIMEOUT_MS;

    if (!validState) {
      return res
        .status(400)
        .send("Invalid or expired authorization. Try connecting again.");
    }

    // Consume the state to prevent callback reuse.
    delete req.session.gmailOAuth;
    await saveSession(req);

    if (req.query.error) {
      return redirectToFrontend(res, "denied");
    }

    if (typeof req.query.code !== "string") {
      return res.status(400).send("Missing authorization code.");
    }

    const client = createClient();
    const { tokens } = await client.getToken(req.query.code);

    if (!tokens.access_token || !tokens.id_token) {
      throw new Error("Required Google tokens were not returned");
    }

    const info = await client.getTokenInfo(tokens.access_token);

    if (!info.scopes.includes(GMAIL_SCOPE)) {
      return redirectToFrontend(res, "missing_permission");
    }

    // Ensure the connected Gmail account belongs to the signed-in user.
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_GMAIL_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email_verified || payload.sub !== req.user.googleId) {
      return redirectToFrontend(res, "account_mismatch");
    }

    // Store Gmail credentials separately from Calendar credentials.
    req.session.googleGmail = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
    };

    await saveSession(req);

    return redirectToFrontend(res, "connected");
  } catch {
    // Never log OAuth tokens or authorization codes.
    console.error("Gmail authorization failed");

    return redirectToFrontend(res, "failed");
  }
});

// Retrieve potential application confirmation emails.
router.get("/emails", async (req, res) => {
  try {
    if (req.user.authProvider !== "google") {
      return res.status(403).json({
        message: "Sign in with Google first.",
      });
    }

    if (!req.session.googleGmail?.access_token) {
      return res.status(400).json({
        message: "Connect Gmail first.",
      });
    }

    const { emails, hasMore } = await listApplicationEmails(req);

    // Do not expose raw email bodies to the frontend.
    const results = emails.map((email) => ({
      messageId: email.messageId,
      subject: email.subject,
      from: email.from,
      receivedAt: email.receivedAt,
    }));

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      count: results.length,
      hasMore,
      emails: results,
    });
  } catch (error) {
    const status = Number(error.response?.status || error.code);

    if (
      status === 401 ||
      status === 403 ||
      error.response?.data?.error === "invalid_grant"
    ) {
      return res.status(403).json({
        message: "Gmail access failed. Reconnect Gmail and retry.",
      });
    }

    console.error("Gmail email retrieval failed");

    return res.status(502).json({
      message: "Failed to retrieve application emails.",
    });
  }
});

// Retrieve the signed-in user's email detection preferences.
router.get("/preferences", (req, res) => {
  if (req.user.authProvider !== "google") {
    return res.status(403).json({
      message: "Sign in with Google first.",
    });
  }

  const preferences = req.user.emailDetectionPreferences;

  res.set("Cache-Control", "no-store");

  return res.status(200).json({
    trustedSenders: preferences?.trustedSenders ?? [],
    blockedSenders: preferences?.blockedSenders ?? [],
  });
});

// Update the signed-in user's email detection preferences.
router.put("/preferences", async (req, res) => {
  if (req.user.authProvider !== "google") {
    return res.status(403).json({
      message: "Sign in with Google first.",
    });
  }

  let preferences;

  try {
    preferences = validateEmailDetectionPreferences(req.body);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          "emailDetectionPreferences.trustedSenders":
            preferences.trustedSenders,
          "emailDetectionPreferences.blockedSenders":
            preferences.blockedSenders,
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      trustedSenders:
        updatedUser.emailDetectionPreferences?.trustedSenders ?? [],
      blockedSenders:
        updatedUser.emailDetectionPreferences?.blockedSenders ?? [],
    });
  } catch {
    console.error("Failed to update email detection preferences");

    return res.status(500).json({
      message: "Could not update email detection preferences.",
    });
  }
});

// Scan Gmail and generate application suggestions.
router.get("/suggestions", getSuggestions);

// Import a reviewed application from Gmail.
router.post("/import", importApplication);

module.exports = router;
