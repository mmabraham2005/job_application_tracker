const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateEmailDetectionPreferences,
} = require("../src/utils/emailDetectionPreferences");

test("Accepts empty sender preferences", () => {
  const result = validateEmailDetectionPreferences({
    trustedSenders: [],
    blockedSenders: [],
  });

  assert.deepEqual(result, {
    trustedSenders: [],
    blockedSenders: [],
  });
});

test("Normalizes sender preferences and removes duplicates", () => {
  const result = validateEmailDetectionPreferences({
    trustedSenders: [
      " Careers@Example.com ",
      "EXAMPLE.COM",
      "@example.com",
      "example.com",
    ],
    blockedSenders: [" Scholarship@Example.org ", "SCHOLARSHIP@EXAMPLE.ORG"],
  });

  assert.deepEqual(result, {
    trustedSenders: ["careers@example.com", "example.com"],
    blockedSenders: ["scholarship@example.org"],
  });
});

test("Accepts valid email addresses and subdomains", () => {
  const result = validateEmailDetectionPreferences({
    trustedSenders: ["recruiter+jobs@example.com", "careers.example.com"],
    blockedSenders: [],
  });

  assert.equal(result.trustedSenders.length, 2);
});

test("Rejects invalid sender formats", () => {
  const invalidSenders = [
    "",
    " ",
    "invalid-email",
    "user@",
    "@",
    "https://example.com",
    "*.example.com",
    "user@@example.com",
    "user..name@example.com",
    "-example.com",
    "example-.com",
    "example..com",
  ];

  for (const sender of invalidSenders) {
    assert.throws(
      () =>
        validateEmailDetectionPreferences({
          trustedSenders: [sender],
          blockedSenders: [],
        }),
      Error,
      `Expected rejection for: ${sender}`,
    );
  }
});

test("Rejects non-string sender entries", () => {
  for (const sender of [null, 123, {}, []]) {
    assert.throws(() =>
      validateEmailDetectionPreferences({
        trustedSenders: [sender],
        blockedSenders: [],
      }),
    );
  }
});

test("Rejects missing or invalid preference arrays", () => {
  const invalidInputs = [
    null,
    [],
    {},
    { trustedSenders: [] },
    { blockedSenders: [] },
    {
      trustedSenders: "example.com",
      blockedSenders: [],
    },
    {
      trustedSenders: [],
      blockedSenders: {},
    },
  ];

  for (const input of invalidInputs) {
    assert.throws(() => validateEmailDetectionPreferences(input));
  }
});

test("Rejects unexpected preference fields", () => {
  assert.throws(() =>
    validateEmailDetectionPreferences({
      trustedSenders: [],
      blockedSenders: [],
      displayName: "Unauthorized change",
    }),
  );
});

test("Rejects more than 100 sender entries", () => {
  const senders = Array.from(
    { length: 101 },
    (_, index) => `sender${index}@example.com`,
  );

  assert.throws(() =>
    validateEmailDetectionPreferences({
      trustedSenders: senders,
      blockedSenders: [],
    }),
  );

  assert.throws(() =>
    validateEmailDetectionPreferences({
      trustedSenders: [],
      blockedSenders: senders,
    }),
  );
});

test("Accepts exactly 100 sender entries", () => {
  const senders = Array.from(
    { length: 100 },
    (_, index) => `sender${index}@example.com`,
  );

  const result = validateEmailDetectionPreferences({
    trustedSenders: senders,
    blockedSenders: [],
  });

  assert.equal(result.trustedSenders.length, 100);
});

test("Allows overlap between trusted and blocked lists", () => {
  const result = validateEmailDetectionPreferences({
    trustedSenders: ["example.com"],
    blockedSenders: ["example.com"],
  });

  assert.deepEqual(result, {
    trustedSenders: ["example.com"],
    blockedSenders: ["example.com"],
  });
});
