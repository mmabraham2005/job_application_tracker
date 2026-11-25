import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SENDERS,
  MAX_SENDER_LENGTH,
  arePreferencesEqual,
  getOverlappingSenders,
  normalizeSender,
  reconcilePreferencesSave,
  validateNewSender,
  validatePreferencesResponse,
} from "../src/utils/emailDetectionPreferences.js";

import backendValidator from "../../backend/src/utils/emailDetectionPreferences.js";

import { getSenderConflicts } from "../src/utils/emailDetectionPreferences.js";

const { validateEmailDetectionPreferences } = backendValidator;

// ==================================================
// Helpers
// ==================================================

function normalizeBackendSender(value) {
  const result = validateEmailDetectionPreferences({
    trustedSenders: [value],
    blockedSenders: [],
  });

  return result.trustedSenders[0];
}

function assertAcceptedByBoth(value, expected) {
  assert.equal(normalizeSender(value), expected);
  assert.equal(normalizeBackendSender(value), expected);
}

function assertRejectedByBoth(value) {
  assert.throws(() => normalizeSender(value));

  assert.throws(() => normalizeBackendSender(value));
}

// ==================================================
// 1. Valid sender normalization (10 tests)
// ==================================================

const validCases = [
  ["careers@example.com", "careers@example.com"],
  ["example.com", "example.com"],
  ["@example.com", "example.com"],
  [" CAREERS@Example.COM ", "careers@example.com"],
  ["jobs+intern@example.com", "jobs+intern@example.com"],
  ["jobs.example.com", "jobs.example.com"],
  [" EXAMPLE.COM ", "example.com"],
  ["@Jobs.Example.COM", "jobs.example.com"],
  ["first.last@example.com", "first.last@example.com"],
  ["recruiting-team@example.com", "recruiting-team@example.com"],
];

for (const [input, expected] of validCases) {
  test(`Both validators accept: ${input}`, () => {
    assertAcceptedByBoth(input, expected);
  });
}

// ==================================================
// 2. Invalid sender rejection (15 tests)
// ==================================================

const invalidCases = [
  "",
  "   ",
  "example",
  "https://example.com",
  "*.example.com",
  "user@@example.com",
  ".user@example.com",
  "user..name@example.com",
  "user.@example.com",
  "-example.com",
  "example-.com",
  "example..com",
  "user name@example.com",
  null,
  123,
];

for (const input of invalidCases) {
  test(`Both validators reject: ${JSON.stringify(input)}`, () => {
    assertRejectedByBoth(input);
  });
}

// ==================================================
// 3. Boundary validation (6 tests)
// ==================================================

test("Domain label of 63 characters is accepted", () => {
  const sender = `${"a".repeat(63)}.com`;

  assertAcceptedByBoth(sender, sender);
});

test("Domain label of 64 characters is rejected", () => {
  const sender = `${"a".repeat(64)}.com`;

  assertRejectedByBoth(sender);
});

test("Email local part of 64 characters is accepted", () => {
  const sender = `${"a".repeat(64)}@example.com`;

  assertAcceptedByBoth(sender, sender);
});

test("Email local part of 65 characters is rejected", () => {
  const sender = `${"a".repeat(65)}@example.com`;

  assertRejectedByBoth(sender);
});

test("Email of exactly 254 characters is accepted", () => {
  const sender = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;

  assert.equal(sender.length, MAX_SENDER_LENGTH);

  assertAcceptedByBoth(sender, sender);
});

test("Email of 255 characters is rejected", () => {
  const sender = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(62)}`;

  assert.equal(sender.length, MAX_SENDER_LENGTH + 1);

  assertRejectedByBoth(sender);
});

// ==================================================
// 4. Duplicate and capacity validation (5 tests)
// ==================================================

test("New valid sender can be added", () => {
  assert.equal(
    validateNewSender("new@example.com", ["existing@example.com"]),
    "new@example.com",
  );
});

test("Exact duplicate sender is rejected by frontend", () => {
  assert.throws(
    () => validateNewSender("careers@example.com", ["careers@example.com"]),
    /already been added/i,
  );
});

test("Normalized duplicate sender is rejected by frontend", () => {
  assert.throws(
    () => validateNewSender(" @EXAMPLE.COM ", ["example.com"]),
    /already been added/i,
  );

  const result = validateEmailDetectionPreferences({
    trustedSenders: ["example.com", " @EXAMPLE.COM "],
    blockedSenders: [],
  });

  assert.deepEqual(result.trustedSenders, ["example.com"]);
});

test("Both validators allow the 100th unique sender", () => {
  const existingSenders = Array.from(
    { length: MAX_SENDERS - 1 },
    (_, index) => `sender${index}@example.com`,
  );

  const sender = validateNewSender("new@example.com", existingSenders);

  const result = validateEmailDetectionPreferences({
    trustedSenders: [...existingSenders, sender],
    blockedSenders: [],
  });

  assert.equal(result.trustedSenders.length, MAX_SENDERS);
});

test("Both validators reject the 101st sender", () => {
  const existingSenders = Array.from(
    { length: MAX_SENDERS },
    (_, index) => `sender${index}@example.com`,
  );

  assert.throws(
    () => validateNewSender("new@example.com", existingSenders),
    /up to 100/i,
  );

  assert.throws(() =>
    validateEmailDetectionPreferences({
      trustedSenders: [...existingSenders, "new@example.com"],
      blockedSenders: [],
    }),
  );
});

// ==================================================
// 5. Overlapping sender detection (4 tests)
// ==================================================

test("Empty sender lists have no overlaps", () => {
  assert.deepEqual(getOverlappingSenders([], []), []);
});

test("Different sender lists have no exact overlaps", () => {
  assert.deepEqual(
    getOverlappingSenders(["careers@example.com"], ["newsletter@example.com"]),
    [],
  );
});

test("Identical sender in both lists is detected", () => {
  assert.deepEqual(
    getOverlappingSenders(["careers@example.com"], ["careers@example.com"]),
    ["careers@example.com"],
  );
});

test("Multiple identical sender overlaps are detected", () => {
  assert.deepEqual(
    getOverlappingSenders(
      ["careers@example.com", "example.org", "jobs@example.net"],
      ["example.org", "careers@example.com"],
    ),
    ["careers@example.com", "example.org"],
  );
});

// ==================================================
// 6. Sender conflict detection (12 tests)
// ==================================================

test("Empty sender lists have no conflicts", () => {
  assert.deepEqual(getSenderConflicts([], []), []);
});

test("Identical email addresses create a full conflict", () => {
  assert.deepEqual(
    getSenderConflicts(["careers@example.com"], ["careers@example.com"]),
    [
      {
        trustedSender: "careers@example.com",
        blockedSender: "careers@example.com",
        type: "full",
      },
    ],
  );
});

test("Identical domains create a full conflict", () => {
  assert.deepEqual(getSenderConflicts(["example.com"], ["example.com"]), [
    {
      trustedSender: "example.com",
      blockedSender: "example.com",
      type: "full",
    },
  ]);
});

test("Blocked domain fully overrides trusted email", () => {
  assert.deepEqual(
    getSenderConflicts(["careers@example.com"], ["example.com"]),
    [
      {
        trustedSender: "careers@example.com",
        blockedSender: "example.com",
        type: "full",
      },
    ],
  );
});

test("Blocked email partially overrides trusted domain", () => {
  assert.deepEqual(
    getSenderConflicts(["example.com"], ["careers@example.com"]),
    [
      {
        trustedSender: "example.com",
        blockedSender: "careers@example.com",
        type: "partial",
      },
    ],
  );
});

test("Different emails in the same domain do not conflict", () => {
  assert.deepEqual(
    getSenderConflicts(["careers@example.com"], ["jobs@example.com"]),
    [],
  );
});

test("Different domains do not conflict", () => {
  assert.deepEqual(getSenderConflicts(["example.com"], ["example.org"]), []);
});

test("Blocked parent domain does not match trusted subdomain", () => {
  assert.deepEqual(
    getSenderConflicts(["jobs.example.com"], ["example.com"]),
    [],
  );
});

test("Blocked parent domain does not match email in subdomain", () => {
  assert.deepEqual(
    getSenderConflicts(["careers@jobs.example.com"], ["example.com"]),
    [],
  );
});

test("Blocked subdomain email does not override trusted parent domain", () => {
  assert.deepEqual(
    getSenderConflicts(["example.com"], ["careers@jobs.example.com"]),
    [],
  );
});

test("Multiple full and partial conflicts are detected", () => {
  assert.deepEqual(
    getSenderConflicts(
      ["careers@example.com", "example.org", "example.net"],
      ["example.com", "jobs@example.org", "example.net"],
    ),
    [
      {
        trustedSender: "careers@example.com",
        blockedSender: "example.com",
        type: "full",
      },
      {
        trustedSender: "example.org",
        blockedSender: "jobs@example.org",
        type: "partial",
      },
      {
        trustedSender: "example.net",
        blockedSender: "example.net",
        type: "full",
      },
    ],
  );
});

test("Conflict detection does not mutate sender lists", () => {
  const trusted = Object.freeze(["careers@example.com"]);

  const blocked = Object.freeze(["example.com"]);

  getSenderConflicts(trusted, blocked);

  assert.deepEqual(trusted, ["careers@example.com"]);

  assert.deepEqual(blocked, ["example.com"]);
});

// ==================================================
// 7. Preference comparison and dirty state (12 tests)
// ==================================================

test("Identical empty preferences are equal", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: [],
        blockedSenders: [],
      },
      {
        trustedSenders: [],
        blockedSenders: [],
      },
    ),
    true,
  );
});

test("Identical non-empty preferences are equal", () => {
  const preferences = {
    trustedSenders: ["example.com"],
    blockedSenders: ["example.org"],
  };

  assert.equal(
    arePreferencesEqual(preferences, {
      trustedSenders: ["example.com"],
      blockedSenders: ["example.org"],
    }),
    true,
  );
});

test("Adding a trusted sender changes preferences", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: ["example.com"],
        blockedSenders: [],
      },
      {
        trustedSenders: [],
        blockedSenders: [],
      },
    ),
    false,
  );
});

test("Adding a blocked sender changes preferences", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: [],
        blockedSenders: ["example.com"],
      },
      {
        trustedSenders: [],
        blockedSenders: [],
      },
    ),
    false,
  );
});

test("Removing a sender changes preferences", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: [],
        blockedSenders: [],
      },
      {
        trustedSenders: ["example.com"],
        blockedSenders: [],
      },
    ),
    false,
  );
});

test("Replacing a sender changes preferences", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: ["example.org"],
        blockedSenders: [],
      },
      {
        trustedSenders: ["example.com"],
        blockedSenders: [],
      },
    ),
    false,
  );
});

test("Trusted sender order does not affect equality", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: ["example.com", "example.org"],
        blockedSenders: [],
      },
      {
        trustedSenders: ["example.org", "example.com"],
        blockedSenders: [],
      },
    ),
    true,
  );
});

test("Blocked sender order does not affect equality", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: [],
        blockedSenders: ["example.com", "example.org"],
      },
      {
        trustedSenders: [],
        blockedSenders: ["example.org", "example.com"],
      },
    ),
    true,
  );
});

test("Moving a sender between lists changes preferences", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: [],
        blockedSenders: ["example.com"],
      },
      {
        trustedSenders: ["example.com"],
        blockedSenders: [],
      },
    ),
    false,
  );
});

test("Missing saved snapshot is not considered equal", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: [],
        blockedSenders: [],
      },
      null,
    ),
    false,
  );
});

test("Malformed preference lists are not equal", () => {
  assert.equal(
    arePreferencesEqual(
      {
        trustedSenders: null,
        blockedSenders: [],
      },
      {
        trustedSenders: [],
        blockedSenders: [],
      },
    ),
    false,
  );
});

test("Preference comparison does not mutate sender lists", () => {
  const first = Object.freeze({
    trustedSenders: Object.freeze(["example.org", "example.com"]),
    blockedSenders: Object.freeze(["example.net", "example.edu"]),
  });

  const second = {
    trustedSenders: ["example.com", "example.org"],
    blockedSenders: ["example.edu", "example.net"],
  };

  assert.equal(arePreferencesEqual(first, second), true);

  assert.deepEqual(first.trustedSenders, ["example.org", "example.com"]);

  assert.deepEqual(first.blockedSenders, ["example.net", "example.edu"]);
});

// ==================================================
// 8. API response validation (16 tests)
// ==================================================

test("Valid empty preferences response is accepted", () => {
  assert.deepEqual(
    validatePreferencesResponse({
      trustedSenders: [],
      blockedSenders: [],
    }),
    {
      trustedSenders: [],
      blockedSenders: [],
    },
  );
});

test("Valid populated preferences response is accepted", () => {
  const preferences = {
    trustedSenders: ["careers@example.com", "example.org"],
    blockedSenders: ["newsletter.example.com"],
  };

  assert.deepEqual(validatePreferencesResponse(preferences), preferences);
});

test("Null preferences response is rejected", () => {
  assert.throws(() => validatePreferencesResponse(null));
});

test("Array preferences response is rejected", () => {
  assert.throws(() => validatePreferencesResponse([]));
});

test("Missing trusted sender list is rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      blockedSenders: [],
    }),
  );
});

test("Missing blocked sender list is rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: [],
    }),
  );
});

test("Non-array sender list is rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: "example.com",
      blockedSenders: [],
    }),
  );
});

test("Non-string sender is rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: [123],
      blockedSenders: [],
    }),
  );
});

test("Invalid sender format is rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: ["invalid-domain"],
      blockedSenders: [],
    }),
  );
});

test("Empty sender string is rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: [],
      blockedSenders: [""],
    }),
  );
});

test("Unnormalized sender is rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: [" @EXAMPLE.COM "],
      blockedSenders: [],
    }),
  );
});

test("Duplicate trusted senders are rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: ["example.com", "example.com"],
      blockedSenders: [],
    }),
  );
});

test("Duplicate blocked senders are rejected", () => {
  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: [],
      blockedSenders: ["example.com", "example.com"],
    }),
  );
});

test("Sender list exceeding capacity is rejected", () => {
  const senders = Array.from(
    { length: MAX_SENDERS + 1 },
    (_, index) => `sender${index}@example.com`,
  );

  assert.throws(() =>
    validatePreferencesResponse({
      trustedSenders: senders,
      blockedSenders: [],
    }),
  );
});

test("Overlapping sender lists remain valid", () => {
  const preferences = {
    trustedSenders: ["example.com"],
    blockedSenders: ["example.com"],
  };

  assert.deepEqual(validatePreferencesResponse(preferences), preferences);
});

test("Response validation returns independent lists and ignores extra fields", () => {
  const response = Object.freeze({
    trustedSenders: Object.freeze(["example.com"]),
    blockedSenders: Object.freeze(["example.org"]),
    extraField: "ignored",
  });

  const result = validatePreferencesResponse(response);

  assert.deepEqual(result, {
    trustedSenders: ["example.com"],
    blockedSenders: ["example.org"],
  });

  assert.notEqual(result.trustedSenders, response.trustedSenders);

  assert.notEqual(result.blockedSenders, response.blockedSenders);
});

// ==================================================
// 9. Save failure reconciliation (10 tests)
// ==================================================

function createPreferences(trustedSenders = [], blockedSenders = []) {
  return {
    trustedSenders,
    blockedSenders,
  };
}

test("Reconciliation confirms saved submitted preferences", () => {
  const previous = createPreferences();

  const submitted = createPreferences(["example.com"]);

  const server = createPreferences(["example.com"]);

  assert.deepEqual(reconcilePreferencesSave(previous, submitted, server), {
    status: "saved",
    preferences: server,
  });
});

test("Reconciliation detects unchanged server preferences", () => {
  const previous = createPreferences(["example.com"]);

  const submitted = createPreferences(["example.com", "example.org"]);

  const server = createPreferences(["example.com"]);

  assert.deepEqual(reconcilePreferencesSave(previous, submitted, server), {
    status: "unchanged",
    preferences: server,
  });
});

test("Reconciliation detects conflicting server preferences", () => {
  const previous = createPreferences(["example.com"]);

  const submitted = createPreferences(["example.com", "example.org"]);

  const server = createPreferences(["example.net"]);

  assert.deepEqual(reconcilePreferencesSave(previous, submitted, server), {
    status: "conflict",
    preferences: server,
  });
});

test("Reconciliation ignores trusted sender order", () => {
  const result = reconcilePreferencesSave(
    createPreferences(),
    createPreferences(["example.com", "example.org"]),
    createPreferences(["example.org", "example.com"]),
  );

  assert.equal(result.status, "saved");
});

test("Reconciliation ignores blocked sender order", () => {
  const result = reconcilePreferencesSave(
    createPreferences(),
    createPreferences([], ["example.com", "example.org"]),
    createPreferences([], ["example.org", "example.com"]),
  );

  assert.equal(result.status, "saved");
});

test("Reconciliation confirms removal of all saved senders", () => {
  const result = reconcilePreferencesSave(
    createPreferences(["example.com"]),
    createPreferences(),
    createPreferences(),
  );

  assert.equal(result.status, "saved");

  assert.deepEqual(result.preferences, createPreferences());
});

test("Reconciliation detects unexpected blocked sender changes", () => {
  const result = reconcilePreferencesSave(
    createPreferences(["example.com"]),
    createPreferences(["example.com", "example.org"]),
    createPreferences(["example.com", "example.org"], ["example.net"]),
  );

  assert.equal(result.status, "conflict");
});

test("Reconciliation rejects malformed server preferences", () => {
  assert.throws(() =>
    reconcilePreferencesSave(
      createPreferences(),
      createPreferences(["example.com"]),
      {
        trustedSenders: null,
        blockedSenders: [],
      },
    ),
  );
});

test("Reconciliation rejects missing previous snapshot", () => {
  assert.throws(() =>
    reconcilePreferencesSave(
      null,
      createPreferences(["example.com"]),
      createPreferences(["example.com"]),
    ),
  );
});

test("Reconciliation does not mutate preference snapshots", () => {
  const previous = Object.freeze({
    trustedSenders: Object.freeze([]),
    blockedSenders: Object.freeze([]),
  });

  const submitted = Object.freeze({
    trustedSenders: Object.freeze(["example.com"]),
    blockedSenders: Object.freeze([]),
  });

  const server = Object.freeze({
    trustedSenders: Object.freeze(["example.com"]),
    blockedSenders: Object.freeze([]),
  });

  const result = reconcilePreferencesSave(previous, submitted, server);

  assert.equal(result.status, "saved");

  assert.deepEqual(result.preferences, server);

  assert.notEqual(result.preferences.trustedSenders, server.trustedSenders);

  assert.deepEqual(previous.trustedSenders, []);
});
