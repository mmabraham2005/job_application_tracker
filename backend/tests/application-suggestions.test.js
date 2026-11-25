const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildApplicationSuggestions,
} = require("../src/services/applicationSuggestionService");

// ===============================
// Test Fixtures
// ===============================

function createSuggestionEmail(overrides = {}) {
  return {
    messageId: "message-001",
    subject:
      "Application received for the role of Software Engineer at Example Company",
    from: "careers@example.com",
    receivedAt: "2026-06-15T12:00:00.000Z",
    snippet: "Thank you for applying.",
    body: "Thank you for applying for the Software Engineer position at Example Company.",
    ...overrides,
  };
}

function createExistingApplication(overrides = {}) {
  return {
    _id: "application-001",
    companyName: "Example Company",
    jobTitle: "Software Engineer",
    applicationDate: new Date("2026-06-15"),
    ...overrides,
  };
}

function assertCounterConsistency(result) {
  assert.equal(
    result.scannedCount,
    result.suggestionCount + result.alreadyImportedCount + result.excludedCount,
  );

  assert.equal(result.suggestionCount, result.suggestions.length);

  assert.ok(result.possibleDuplicateCount <= result.suggestionCount);

  assert.equal(
    result.possibleDuplicateCount,
    result.suggestions.filter(
      (suggestion) => suggestion.duplicate.reason === "matching_application",
    ).length,
  );
}

// ===============================
// Basic Suggestion Tests
// ===============================

test("Returns empty results when no emails are available", () => {
  const result = buildApplicationSuggestions();

  assert.deepEqual(result, {
    scannedCount: 0,
    suggestionCount: 0,
    alreadyImportedCount: 0,
    possibleDuplicateCount: 0,
    excludedCount: 0,
    suggestions: [],
  });

  assertCounterConsistency(result);
});

test("Builds a complete application suggestion", () => {
  const result = buildApplicationSuggestions([createSuggestionEmail()]);

  assert.equal(result.scannedCount, 1);
  assert.equal(result.suggestionCount, 1);

  const suggestion = result.suggestions[0];

  assert.equal(suggestion.messageId, "message-001");
  assert.equal(suggestion.companyName, "Example Company");
  assert.equal(suggestion.jobTitle, "Software Engineer");
  assert.equal(suggestion.applicationDate, "2026-06-15");
  assert.equal(suggestion.status, "Applied");
  assert.equal(suggestion.confidence, "high");

  assert.deepEqual(suggestion.duplicate, {
    duplicate: false,
    reason: null,
    applicationId: null,
  });

  assert.ok(suggestion.warnings.includes("estimated_application_date"));

  assertCounterConsistency(result);
});

test("Preserves incomplete suggestions for user review", () => {
  const result = buildApplicationSuggestions([
    createSuggestionEmail({
      subject: "Thank you for applying to Example Company",
      body: "Thank you for applying to Example Company.",
      snippet: "",
    }),
  ]);

  assert.equal(result.suggestionCount, 1);

  const suggestion = result.suggestions[0];

  assert.equal(suggestion.companyName, "Example Company");
  assert.equal(suggestion.jobTitle, "");
  assert.equal(suggestion.confidence, "low");

  assert.ok(suggestion.warnings.includes("missing_job_title"));

  assertCounterConsistency(result);
});

// ===============================
// Classification & Preferences
// ===============================

test("Excludes scholarship applications", () => {
  const result = buildApplicationSuggestions([
    createSuggestionEmail({
      subject: "Scholarship Application Received",
      from: "scholarship@example.org",
      body: "Thank you for your scholarship application.",
      snippet: "",
    }),
  ]);

  assert.equal(result.suggestionCount, 0);
  assert.equal(result.excludedCount, 1);

  assertCounterConsistency(result);
});

test("Excludes job application follow-up emails", () => {
  const result = buildApplicationSuggestions([
    createSuggestionEmail({
      subject: "First Round Interview",
      body: "We invite you to an interview.",
      snippet: "",
    }),
  ]);

  assert.equal(result.suggestionCount, 0);
  assert.equal(result.excludedCount, 1);

  assertCounterConsistency(result);
});

test("Excludes unrelated or unknown emails", () => {
  const result = buildApplicationSuggestions([
    createSuggestionEmail({
      subject: "Monthly Newsletter",
      from: "newsletter@example.org",
      body: "Here is our monthly newsletter.",
      snippet: "",
    }),
  ]);

  assert.equal(result.suggestionCount, 0);
  assert.equal(result.excludedCount, 1);

  assertCounterConsistency(result);
});

test("Respects user-defined blocked sender preferences", () => {
  const result = buildApplicationSuggestions([createSuggestionEmail()], [], {
    trustedSenders: [],
    blockedSenders: ["example.com"],
  });

  assert.equal(result.suggestionCount, 0);
  assert.equal(result.excludedCount, 1);

  assertCounterConsistency(result);
});

test("Blocked sender takes priority over trusted sender", () => {
  const result = buildApplicationSuggestions([createSuggestionEmail()], [], {
    trustedSenders: ["example.com"],
    blockedSenders: ["example.com"],
  });

  assert.equal(result.suggestionCount, 0);
  assert.equal(result.excludedCount, 1);

  assertCounterConsistency(result);
});

test("Supports user-defined trusted senders", () => {
  const email = createSuggestionEmail({
    subject: "Application received",
    from: "notifications@example.org",
    body: "Thank you for applying.",
    snippet: "",
  });

  const withoutPreferences = buildApplicationSuggestions([email]);

  assert.equal(withoutPreferences.suggestionCount, 0);

  const withPreferences = buildApplicationSuggestions([email], [], {
    trustedSenders: ["example.org"],
    blockedSenders: [],
  });

  assert.equal(withPreferences.suggestionCount, 1);

  assertCounterConsistency(withoutPreferences);
  assertCounterConsistency(withPreferences);
});

test("Unlisted senders remain eligible for suggestions", () => {
  const result = buildApplicationSuggestions([createSuggestionEmail()], [], {
    trustedSenders: ["another-company.com"],
    blockedSenders: [],
  });

  assert.equal(result.suggestionCount, 1);

  assertCounterConsistency(result);
});

// ===============================
// Duplicate Filtering Tests
// ===============================

test("Excludes previously imported Gmail messages", () => {
  const result = buildApplicationSuggestions(
    [createSuggestionEmail()],
    [
      createExistingApplication({
        sourceGmailMessageId: "message-001",
      }),
    ],
  );

  assert.equal(result.suggestionCount, 0);
  assert.equal(result.alreadyImportedCount, 1);
  assert.equal(result.excludedCount, 0);

  assertCounterConsistency(result);
});

test("Recognizes imported messages after application details change", () => {
  const result = buildApplicationSuggestions(
    [createSuggestionEmail()],
    [
      createExistingApplication({
        sourceGmailMessageId: "message-001",
        companyName: "Updated Company",
        jobTitle: "Updated Position",
        applicationDate: new Date("2026-06-20"),
      }),
    ],
  );

  assert.equal(result.suggestionCount, 0);
  assert.equal(result.alreadyImportedCount, 1);

  assertCounterConsistency(result);
});

test("Counts imported messages before blocked sender filtering", () => {
  const result = buildApplicationSuggestions(
    [createSuggestionEmail()],
    [
      createExistingApplication({
        sourceGmailMessageId: "message-001",
      }),
    ],
    {
      trustedSenders: [],
      blockedSenders: ["example.com"],
    },
  );

  assert.equal(result.alreadyImportedCount, 1);
  assert.equal(result.excludedCount, 0);
  assert.equal(result.suggestionCount, 0);

  assertCounterConsistency(result);
});

test("Preserves possible duplicates for user review", () => {
  const result = buildApplicationSuggestions(
    [createSuggestionEmail()],
    [createExistingApplication()],
  );

  assert.equal(result.suggestionCount, 1);
  assert.equal(result.possibleDuplicateCount, 1);
  assert.equal(result.alreadyImportedCount, 0);

  assert.deepEqual(result.suggestions[0].duplicate, {
    duplicate: true,
    reason: "matching_application",
    applicationId: "application-001",
  });

  assertCounterConsistency(result);
});

test("Allows reapplications on different dates", () => {
  const result = buildApplicationSuggestions(
    [createSuggestionEmail()],
    [
      createExistingApplication({
        applicationDate: new Date("2026-02-22"),
      }),
    ],
  );

  assert.equal(result.suggestionCount, 1);
  assert.equal(result.possibleDuplicateCount, 0);
  assert.equal(result.suggestions[0].duplicate.duplicate, false);

  assertCounterConsistency(result);
});

test("Allows different job titles at the same company", () => {
  const result = buildApplicationSuggestions(
    [createSuggestionEmail()],
    [
      createExistingApplication({
        jobTitle: "Data Analyst",
      }),
    ],
  );

  assert.equal(result.suggestionCount, 1);
  assert.equal(result.possibleDuplicateCount, 0);

  assertCounterConsistency(result);
});

test("Does not mark incomplete suggestions as matching applications", () => {
  const result = buildApplicationSuggestions(
    [
      createSuggestionEmail({
        subject: "Thank you for applying to Example Company",
        body: "Thank you for applying to Example Company.",
        snippet: "",
      }),
    ],
    [createExistingApplication()],
  );

  assert.equal(result.suggestionCount, 1);
  assert.equal(result.possibleDuplicateCount, 0);
  assert.equal(result.suggestions[0].confidence, "low");

  assertCounterConsistency(result);
});

// ===============================
// Invalid Message ID Tests
// ===============================

test("Excludes invalid Gmail message identifiers", () => {
  const invalidIds = [
    null,
    undefined,
    "",
    " ",
    "../message-001",
    "message/001",
    12345,
    "a".repeat(256),
  ];

  const emails = invalidIds.map((messageId) =>
    createSuggestionEmail({ messageId }),
  );

  const result = buildApplicationSuggestions(emails);

  assert.equal(result.scannedCount, invalidIds.length);
  assert.equal(result.excludedCount, invalidIds.length);
  assert.equal(result.suggestionCount, 0);

  assertCounterConsistency(result);
});

test("Handles null email entries safely", () => {
  const result = buildApplicationSuggestions([null, undefined, {}]);

  assert.equal(result.scannedCount, 3);
  assert.equal(result.excludedCount, 3);
  assert.equal(result.suggestionCount, 0);

  assertCounterConsistency(result);
});

// ===============================
// Combined Processing Tests
// ===============================

test("Maintains correct counters for mixed email scan results", () => {
  const emails = [
    createSuggestionEmail({
      messageId: "new-message",
      receivedAt: "2026-06-16T12:00:00.000Z",
    }),

    createSuggestionEmail({
      messageId: "possible-duplicate",
    }),

    createSuggestionEmail({
      messageId: "already-imported",
    }),

    createSuggestionEmail({
      messageId: "scholarship-message",
      subject: "Scholarship Application Received",
      body: "Thank you for your scholarship application.",
      snippet: "",
    }),

    createSuggestionEmail({
      messageId: "blocked-message",
      from: "careers@blocked.example",
    }),
  ];

  const existingApplications = [
    createExistingApplication(),
    createExistingApplication({
      _id: "application-002",
      sourceGmailMessageId: "already-imported",
    }),
  ];

  const result = buildApplicationSuggestions(emails, existingApplications, {
    trustedSenders: [],
    blockedSenders: ["blocked.example"],
  });

  assert.equal(result.scannedCount, 5);
  assert.equal(result.suggestionCount, 2);
  assert.equal(result.alreadyImportedCount, 1);
  assert.equal(result.possibleDuplicateCount, 1);
  assert.equal(result.excludedCount, 2);

  assert.deepEqual(
    result.suggestions.map((suggestion) => suggestion.messageId),
    ["new-message", "possible-duplicate"],
  );

  assertCounterConsistency(result);
});

test("Does not expose raw email contents or OAuth tokens", () => {
  const result = buildApplicationSuggestions([
    createSuggestionEmail({
      access_token: "private-access-token",
      refresh_token: "private-refresh-token",
    }),
  ]);

  assert.equal(result.suggestionCount, 1);

  const suggestion = result.suggestions[0];

  const privateFields = [
    "body",
    "snippet",
    "subject",
    "from",
    "access_token",
    "refresh_token",
  ];

  for (const field of privateFields) {
    assert.equal(Object.hasOwn(suggestion, field), false);
  }

  assertCounterConsistency(result);
});

test("Does not mutate email or application input objects", () => {
  const emails = [createSuggestionEmail()];

  const applications = [createExistingApplication()];

  const preferences = {
    trustedSenders: ["example.com"],
    blockedSenders: [],
  };

  const originalEmails = structuredClone(emails);
  const originalApplications = structuredClone(applications);
  const originalPreferences = structuredClone(preferences);

  buildApplicationSuggestions(emails, applications, preferences);

  assert.deepEqual(emails, originalEmails);

  assert.deepEqual(applications, originalApplications);

  assert.deepEqual(preferences, originalPreferences);
});
