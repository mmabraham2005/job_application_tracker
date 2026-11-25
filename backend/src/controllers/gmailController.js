const Application = require("../models/Application");
const { getApplicationEmailById } = require("../services/gmailService");
const { classifyEmail, EMAIL_TYPES } = require("../services/emailParser");
const {
  getApplicationSuggestions,
} = require("../services/applicationSuggestionService");

const ALLOWED_IMPORT_FIELDS = [
  "messageId",
  "companyName",
  "jobTitle",
  "applicationDate",
  "status",
];

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(value);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const importApplication = async (req, res) => {
  res.set("Cache-Control", "no-store");

  // 1. Require a Google account.
  if (req.user.authProvider !== "google") {
    return res.status(403).json({
      message: "Sign in with Google first.",
    });
  }

  // 2. Require an active Gmail connection.
  if (!req.session.googleGmail?.access_token) {
    return res.status(403).json({
      message: "Connect Gmail first.",
    });
  }

  // 3. Validate the request body.
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({
      message: "Request body must be a JSON object.",
    });
  }

  if (
    Object.keys(req.body).some(
      (field) => !ALLOWED_IMPORT_FIELDS.includes(field),
    )
  ) {
    return res.status(400).json({
      message: "Invalid import fields.",
    });
  }

  const { messageId, companyName, jobTitle, applicationDate, status } =
    req.body;

  if (
    typeof messageId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,255}$/.test(messageId)
  ) {
    return res.status(400).json({
      message: "Invalid Gmail message ID.",
    });
  }

  if (
    typeof companyName !== "string" ||
    !companyName.trim() ||
    typeof jobTitle !== "string" ||
    !jobTitle.trim() ||
    !isValidDate(applicationDate) ||
    typeof status !== "string" ||
    !status.trim()
  ) {
    return res.status(400).json({
      message: "Valid application information is required.",
    });
  }

  const userId = req.user._id;

  try {
    // 4. Prevent importing the same email again.
    const existingApplication = await Application.findOne({
      userId,
      sourceGmailMessageId: messageId,
    });

    if (existingApplication) {
      return res.status(409).json({
        message: "This Gmail message has already been imported.",
        applicationId: String(existingApplication._id),
      });
    }

    // 5. Reuse existing Application Model validation.
    const application = new Application({
      userId,
      companyName: companyName.trim(),
      jobTitle: jobTitle.trim(),
      applicationDate,
      status,
      sourceGmailMessageId: messageId,
    });

    await application.validate();

    // 6. Verify message ownership through Gmail.
    let email;

    try {
      email = await getApplicationEmailById(req, messageId);
    } catch (error) {
      const upstreamStatus = Number(error.response?.status || error.code);

      if (upstreamStatus === 404) {
        return res.status(404).json({
          message: "Gmail message not found.",
        });
      }

      if (
        upstreamStatus === 401 ||
        upstreamStatus === 403 ||
        error.code === "GMAIL_NOT_CONNECTED" ||
        error.response?.data?.error === "invalid_grant"
      ) {
        return res.status(403).json({
          message: "Gmail access failed. Reconnect Gmail and retry.",
        });
      }

      return res.status(502).json({
        message: "Failed to verify Gmail message.",
      });
    }

    if (!email || email.messageId !== messageId) {
      return res.status(404).json({
        message: "Gmail message could not be verified.",
      });
    }

    // 7. Respect the user's sender preferences.
    const preferences = {
      trustedSenders: req.user.emailDetectionPreferences?.trustedSenders ?? [],
      blockedSenders: req.user.emailDetectionPreferences?.blockedSenders ?? [],
    };

    const classification = classifyEmail(email, preferences);

    if (classification !== EMAIL_TYPES.APPLICATION_CONFIRMATION) {
      return res.status(400).json({
        message: "This email is not an eligible job application confirmation.",
      });
    }

    // 8. Save only the user-reviewed application.
    const savedApplication = await application.save();

    return res.status(201).json(savedApplication);
  } catch (error) {
    // Handle simultaneous imports of the same message.
    if (error.code === 11000) {
      return res.status(409).json({
        message: "This Gmail message has already been imported.",
      });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid application data.",
      });
    }

    console.error("Failed to import Gmail application");

    return res.status(500).json({
      message: "Failed to import application.",
    });
  }
};

const getSuggestions = async (req, res) => {
  res.set("Cache-Control", "no-store");

  // 1. Require a Google account.
  if (req.user.authProvider !== "google") {
    return res.status(403).json({
      message: "Sign in with Google first.",
    });
  }

  // 2. Require an active Gmail connection.
  if (!req.session.googleGmail?.access_token) {
    return res.status(403).json({
      message: "Connect Gmail first.",
    });
  }

  try {
    // 3. Generate suggestions for the authenticated user.
    const result = await getApplicationSuggestions(req);

    // 4. Return suggestions without saving applications.
    return res.status(200).json(result);
  } catch (error) {
    const upstreamStatus = Number(error.response?.status || error.code);

    // Handle expired or revoked Gmail authorization.
    if (
      upstreamStatus === 401 ||
      upstreamStatus === 403 ||
      error.code === "GMAIL_NOT_CONNECTED" ||
      error.response?.data?.error === "invalid_grant"
    ) {
      return res.status(403).json({
        message: "Gmail access failed. Reconnect Gmail and retry.",
      });
    }

    // Handle Gmail API failures.
    if (error.response) {
      return res.status(502).json({
        message: "Failed to scan Gmail emails.",
      });
    }

    // Handle unexpected database or internal failures.
    console.error("Failed to generate Gmail suggestions");

    return res.status(500).json({
      message: "Failed to generate application suggestions.",
    });
  }
};

module.exports = {
  importApplication,
  getSuggestions,
};
