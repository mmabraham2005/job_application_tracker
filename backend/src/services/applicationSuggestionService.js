const Application = require("../models/Application");

const { listApplicationEmails } = require("./gmailService");

const { parseApplicationEmail } = require("./emailParser");

const { detectDuplicate } = require("./duplicateDetectionService");

function buildApplicationSuggestions(
  emails = [],
  existingApplications = [],
  preferences = {},
) {
  const suggestions = [];

  let alreadyImportedCount = 0;
  let possibleDuplicateCount = 0;
  let excludedCount = 0;

  for (const email of emails) {
    // Suggestions must have a valid source message ID.
    if (
      !email ||
      typeof email.messageId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,255}$/.test(email.messageId)
    ) {
      excludedCount++;
      continue;
    }

    // Check the source identifier before parsing.
    const sourceDuplicate = detectDuplicate(
      { messageId: email.messageId },
      existingApplications,
    );

    if (sourceDuplicate.reason === "already_imported") {
      alreadyImportedCount++;
      continue;
    }

    // Classify and extract application information.
    const suggestion = parseApplicationEmail(email, preferences);

    // Exclude non-eligible emails.
    if (!suggestion) {
      excludedCount++;
      continue;
    }

    // Compare extracted fields against existing applications.
    const duplicate = detectDuplicate(suggestion, existingApplications);

    // Preserve possible duplicates for user review.
    if (duplicate.reason === "matching_application") {
      possibleDuplicateCount++;
    }

    suggestions.push({
      ...suggestion,
      duplicate,
    });
  }

  return {
    scannedCount: emails.length,
    suggestionCount: suggestions.length,
    alreadyImportedCount,
    possibleDuplicateCount,
    excludedCount,
    suggestions,
  };
}

async function getApplicationSuggestions(req) {
  // Only use preferences belonging to the authenticated user.
  const preferences = {
    trustedSenders: req.user.emailDetectionPreferences?.trustedSenders ?? [],
    blockedSenders: req.user.emailDetectionPreferences?.blockedSenders ?? [],
  };

  // Only retrieve applications owned by the authenticated user.
  const existingApplications = await Application.find({
    userId: req.user._id,
  })
    .select("_id companyName jobTitle applicationDate sourceGmailMessageId")
    .lean();

  // Retrieve candidate emails from the connected Gmail account.
  const { emails, hasMore } = await listApplicationEmails(req);

  const result = buildApplicationSuggestions(
    emails,
    existingApplications,
    preferences,
  );

  return {
    ...result,
    hasMore,
  };
}

module.exports = {
  buildApplicationSuggestions,
  getApplicationSuggestions,
};
