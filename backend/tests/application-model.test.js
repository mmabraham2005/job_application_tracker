const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Application = require("../src/models/Application");

function createValidApplication(overrides = {}) {
  return new Application({
    userId: new mongoose.Types.ObjectId(),
    companyName: "Example Company",
    jobTitle: "Software Engineer",
    applicationDate: "2026-05-28",
    status: "Applied",
    ...overrides,
  });
}

// ===============================
// Backward Compatibility Tests
// ===============================

test("Manual applications do not require Gmail message ID", async () => {
  const application = createValidApplication();

  await assert.doesNotReject(() => application.validate());

  assert.equal(application.sourceGmailMessageId, undefined);
});

test("Legacy applications remain valid without Gmail source tracking", async () => {
  const application = Application.hydrate({
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    companyName: "Legacy Company",
    jobTitle: "Accountant",
    applicationDate: new Date("2026-02-22"),
    status: "Applied",
  });

  await assert.doesNotReject(() => application.validate());

  assert.equal(application.sourceGmailMessageId, undefined);
});

// ===============================
// Gmail Source Tracking Tests
// ===============================

test("Accepts valid Gmail message ID", async () => {
  const application = createValidApplication({
    sourceGmailMessageId: "gmail-001",
  });

  await assert.doesNotReject(() => application.validate());

  assert.equal(application.sourceGmailMessageId, "gmail-001");
});

test("Trims Gmail message ID whitespace", () => {
  const application = createValidApplication({
    sourceGmailMessageId: "  gmail-001  ",
  });

  assert.equal(application.sourceGmailMessageId, "gmail-001");
});

test("Rejects Gmail message ID exceeding 255 characters", async () => {
  const application = createValidApplication({
    sourceGmailMessageId: "a".repeat(256),
  });

  await assert.rejects(
    () => application.validate(),
    (error) => {
      assert.ok(error.errors.sourceGmailMessageId);
      return true;
    },
  );
});

test("Accepts Gmail message ID containing 255 characters", async () => {
  const application = createValidApplication({
    sourceGmailMessageId: "a".repeat(255),
  });

  await assert.doesNotReject(() => application.validate());
});

test("Gmail message ID is optional and immutable in schema", () => {
  const path = Application.schema.path("sourceGmailMessageId");

  assert.ok(path);

  assert.notEqual(path.options.required, true);

  assert.equal(path.options.immutable, true);
});

test("Existing imported applications preserve original Gmail message ID", () => {
  const application = Application.hydrate({
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    companyName: "Example Company",
    jobTitle: "Software Engineer",
    applicationDate: new Date("2026-05-28"),
    status: "Applied",
    sourceGmailMessageId: "gmail-original",
  });

  application.sourceGmailMessageId = "gmail-modified";

  assert.equal(application.sourceGmailMessageId, "gmail-original");
});

// ===============================
// Existing Validation Tests
// ===============================

test("Preserves existing required application fields", async () => {
  const requiredFields = [
    "userId",
    "companyName",
    "jobTitle",
    "applicationDate",
    "status",
  ];

  for (const field of requiredFields) {
    const application = createValidApplication({
      [field]: undefined,
      sourceGmailMessageId: "gmail-001",
    });

    await assert.rejects(
      () => application.validate(),
      (error) => {
        assert.ok(error.errors[field], `Missing validation for ${field}`);

        return true;
      },
    );
  }
});

test("Preserves existing application status validation", async () => {
  const application = createValidApplication({
    status: "Invalid Status",
    sourceGmailMessageId: "gmail-001",
  });

  await assert.rejects(
    () => application.validate(),
    (error) => {
      assert.ok(error.errors.status);
      return true;
    },
  );
});

// ===============================
// Schema Index Tests
// ===============================

test("Preserves existing userId index", () => {
  const indexes = Application.schema.indexes();

  const userIndex = indexes.find(
    ([fields]) => fields.userId === 1 && Object.keys(fields).length === 1,
  );

  assert.ok(userIndex);
});

test("Defines unique compound Gmail message index", () => {
  const indexes = Application.schema.indexes();

  const gmailIndex = indexes.find(
    ([, options]) => options.name === "unique_user_gmail_message",
  );

  assert.ok(gmailIndex);

  const [fields, options] = gmailIndex;

  assert.deepEqual(fields, {
    userId: 1,
    sourceGmailMessageId: 1,
  });

  assert.equal(options.unique, true);
});

test("Gmail unique index excludes missing and empty message IDs", () => {
  const indexes = Application.schema.indexes();

  const gmailIndex = indexes.find(
    ([, options]) => options.name === "unique_user_gmail_message",
  );

  assert.ok(gmailIndex);

  const [, options] = gmailIndex;

  assert.deepEqual(options.partialFilterExpression, {
    sourceGmailMessageId: {
      $type: "string",
      $gt: "",
    },
  });
});
