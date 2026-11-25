function normalizeValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeDate(value) {
  if (
    !(value instanceof Date) &&
    (typeof value !== "string" || !value.trim())
  ) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function createApplicationKey(application = {}) {
  const companyName = normalizeValue(application.companyName);

  const jobTitle = normalizeValue(application.jobTitle);

  const applicationDate = normalizeDate(application.applicationDate);

  // Incomplete applications cannot be reliably matched.
  if (!companyName || !jobTitle || !applicationDate) {
    return null;
  }

  return JSON.stringify([companyName, jobTitle, applicationDate]);
}

function detectDuplicate(suggestion = {}, existingApplications = []) {
  // 1. Check whether the same Gmail message was imported.
  if (suggestion.messageId) {
    const importedApplication = existingApplications.find(
      (application) =>
        application.sourceGmailMessageId === suggestion.messageId,
    );

    if (importedApplication) {
      return {
        duplicate: true,
        reason: "already_imported",
        applicationId: String(importedApplication._id),
      };
    }
  }

  // 2. Compare company, job title, and application date.
  const suggestionKey = createApplicationKey(suggestion);

  if (suggestionKey) {
    const matchingApplication = existingApplications.find(
      (application) => createApplicationKey(application) === suggestionKey,
    );

    if (matchingApplication) {
      return {
        duplicate: true,
        reason: "matching_application",
        applicationId: String(matchingApplication._id),
      };
    }
  }

  // 3. No duplicate detected.
  return {
    duplicate: false,
    reason: null,
    applicationId: null,
  };
}

module.exports = {
  normalizeValue,
  normalizeDate,
  createApplicationKey,
  detectDuplicate,
};
