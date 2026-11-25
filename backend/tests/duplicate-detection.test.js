const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeValue,
  normalizeDate,
  createApplicationKey,
  detectDuplicate,
} = require("../src/services/duplicateDetectionService");

const BASE_APPLICATION = {
  _id: "app-001",
  companyName: "Example Company",
  jobTitle: "Software Engineer",
  applicationDate: "2026-05-28",
};

const NO_DUPLICATE = {
  duplicate: false,
  reason: null,
  applicationId: null,
};

// ===============================
// Normalization Tests
// ===============================

test("Normalizes case and whitespace", () => {
  assert.equal(normalizeValue("  EXAMPLE   Company  "), "example company");
});

test("Normalizes equivalent Unicode strings", () => {
  assert.equal(normalizeValue("Cafe\u0301"), normalizeValue("Café"));
});

test("Preserves meaningful punctuation", () => {
  assert.notEqual(
    normalizeValue("C++ Developer"),
    normalizeValue("C Developer"),
  );
});

test("Handles invalid normalization inputs", () => {
  for (const value of [null, undefined, 123, {}, [], " "]) {
    assert.equal(normalizeValue(value), "");
  }
});

test("Normalizes dates from strings and Date objects", () => {
  const values = [
    "2026-05-28",
    "2026-05-28T04:00:00.000Z",
    new Date("2026-05-28T04:00:00.000Z"),
  ];

  for (const value of values) {
    assert.equal(normalizeDate(value), "2026-05-28");
  }
});

test("Rejects missing or invalid date values", () => {
  const values = [
    null,
    undefined,
    "",
    " ",
    "invalid-date",
    new Date("invalid-date"),
    12345,
    {},
  ];

  for (const value of values) {
    assert.equal(normalizeDate(value), "");
  }
});

// ===============================
// Application Key Tests
// ===============================

test("Creates consistent keys for equivalent applications", () => {
  const first = createApplicationKey(BASE_APPLICATION);

  const second = createApplicationKey({
    companyName: " EXAMPLE COMPANY ",
    jobTitle: "Software   Engineer",
    applicationDate: "2026-05-28T04:00:00.000Z",
  });

  assert.ok(first);
  assert.equal(first, second);
});

test("Does not create keys for incomplete applications", () => {
  const fields = ["companyName", "jobTitle", "applicationDate"];

  for (const field of fields) {
    assert.equal(
      createApplicationKey({
        ...BASE_APPLICATION,
        [field]: "",
      }),
      null,
    );
  }
});

test("Rejects application keys containing invalid dates", () => {
  assert.equal(
    createApplicationKey({
      ...BASE_APPLICATION,
      applicationDate: "invalid-date",
    }),
    null,
  );
});

// ===============================
// Duplicate Detection Tests
// ===============================

test("Detects matching company, job title, and date", () => {
  assert.deepEqual(detectDuplicate(BASE_APPLICATION, [BASE_APPLICATION]), {
    duplicate: true,
    reason: "matching_application",
    applicationId: "app-001",
  });
});

test("Allows reapplications on different dates", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        ...BASE_APPLICATION,
        applicationDate: "2026-02-22",
      },
      [BASE_APPLICATION],
    ),
    NO_DUPLICATE,
  );
});

test("Allows different positions at the same company", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        ...BASE_APPLICATION,
        jobTitle: "Data Analyst",
      },
      [BASE_APPLICATION],
    ),
    NO_DUPLICATE,
  );
});

test("Allows the same position at different companies", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        ...BASE_APPLICATION,
        companyName: "Another Company",
      },
      [BASE_APPLICATION],
    ),
    NO_DUPLICATE,
  );
});

test("Detects duplicates despite case and whitespace differences", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        companyName: " EXAMPLE COMPANY ",
        jobTitle: "software   engineer",
        applicationDate: "2026-05-28T04:00:00.000Z",
      },
      [BASE_APPLICATION],
    ),
    {
      duplicate: true,
      reason: "matching_application",
      applicationId: "app-001",
    },
  );
});

test("Detects previously imported Gmail messages", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        messageId: "gmail-001",
      },
      [
        {
          ...BASE_APPLICATION,
          sourceGmailMessageId: "gmail-001",
        },
      ],
    ),
    {
      duplicate: true,
      reason: "already_imported",
      applicationId: "app-001",
    },
  );
});

test("Detects imported Gmail messages after application details change", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        messageId: "gmail-001",
        companyName: "Updated Company",
        jobTitle: "Updated Position",
        applicationDate: "2026-06-01",
      },
      [
        {
          ...BASE_APPLICATION,
          sourceGmailMessageId: "gmail-001",
        },
      ],
    ),
    {
      duplicate: true,
      reason: "already_imported",
      applicationId: "app-001",
    },
  );
});

test("Prioritizes Gmail message ID over matching application details", () => {
  const applications = [
    BASE_APPLICATION,
    {
      _id: "app-002",
      companyName: "Another Company",
      jobTitle: "Data Analyst",
      applicationDate: "2026-05-29",
      sourceGmailMessageId: "gmail-001",
    },
  ];

  assert.deepEqual(
    detectDuplicate(
      {
        ...BASE_APPLICATION,
        messageId: "gmail-001",
      },
      applications,
    ),
    {
      duplicate: true,
      reason: "already_imported",
      applicationId: "app-002",
    },
  );
});

test("Does not treat different Gmail message IDs as already imported", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        messageId: "gmail-002",
      },
      [
        {
          ...BASE_APPLICATION,
          sourceGmailMessageId: "gmail-001",
        },
      ],
    ),
    NO_DUPLICATE,
  );
});

test("Does not match incomplete applications using missing fields", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        ...BASE_APPLICATION,
        jobTitle: "",
      },
      [
        {
          ...BASE_APPLICATION,
          jobTitle: "",
        },
      ],
    ),
    NO_DUPLICATE,
  );
});

test("Handles applications without Gmail source tracking", () => {
  assert.deepEqual(
    detectDuplicate(
      {
        ...BASE_APPLICATION,
        messageId: "gmail-001",
      },
      [BASE_APPLICATION],
    ),
    {
      duplicate: true,
      reason: "matching_application",
      applicationId: "app-001",
    },
  );
});

test("Handles an empty list of existing applications", () => {
  assert.deepEqual(detectDuplicate(BASE_APPLICATION, []), NO_DUPLICATE);
});

test("Handles missing suggestion information", () => {
  assert.deepEqual(detectDuplicate(), NO_DUPLICATE);
});
