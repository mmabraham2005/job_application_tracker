require("dotenv").config();

const mongoose = require("mongoose");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const Application = require("../src/models/Application");

const TEST_DATABASE = "test";
const TEST_COLLECTION = "gmail_duplicate_verification";

const runId = randomUUID();

const userA = new mongoose.Types.ObjectId();
const userB = new mongoose.Types.ObjectId();

let passed = 0;

function createRecord(userId, messageId) {
  const record = {
    verificationRunId: runId,
    userId,
    companyName: "Integration Test Company",
    jobTitle: "Software Engineer",
    applicationDate: new Date("2026-06-15"),
    status: "Applied",
  };

  if (messageId !== undefined) {
    record.sourceGmailMessageId = messageId;
  }

  return record;
}

function pass(name) {
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}

async function main() {
  let collection;

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: TEST_DATABASE,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 10000,
    });

    assert.equal(mongoose.connection.name, TEST_DATABASE);

    collection = mongoose.connection.db.collection(TEST_COLLECTION);

    assert.equal(collection.collectionName, TEST_COLLECTION);

    console.log("=== GMAIL DUPLICATE INTEGRATION TESTS ===");
    console.log("Database:", mongoose.connection.name);
    console.log("Collection:", collection.collectionName);
    console.log("Run ID:", runId);

    // Copy the actual index definition from Application Model.
    const index = Application.schema
      .indexes()
      .find(([, options]) => options.name === "unique_user_gmail_message");

    assert.ok(index, "Gmail index definition is missing");

    const [keys, options] = index;

    await collection.createIndex(keys, options);

    console.log("Test index ready");

    // DB-01: Manual application without Gmail ID.
    await collection.insertOne(createRecord(userA));

    pass("Manual application without Gmail ID");

    // DB-02: Multiple manual applications for the same user.
    await collection.insertOne(createRecord(userA));

    const manualCount = await collection.countDocuments({
      verificationRunId: runId,
      userId: userA,
      sourceGmailMessageId: { $exists: false },
    });

    assert.equal(manualCount, 2);

    pass("Multiple manual applications for the same user");

    // DB-03: Same user and same Gmail message.
    const messageA = `${runId}-message-A`;

    await collection.insertOne(createRecord(userA, messageA));

    await assert.rejects(
      () => collection.insertOne(createRecord(userA, messageA)),
      (error) => error.code === 11000,
    );

    pass("Rejects repeated Gmail message for the same user");

    // DB-04: Different users and same Gmail message.
    await collection.insertOne(createRecord(userB, messageA));

    pass("Allows the same Gmail message ID for different users");

    // DB-05: Same user and different Gmail messages.
    await collection.insertOne(createRecord(userA, `${runId}-message-B`));

    pass("Allows different Gmail messages for the same user");

    // DB-06: Concurrent duplicate inserts.
    const concurrentMessage = `${runId}-concurrent`;

    const results = await Promise.allSettled([
      collection.insertOne(createRecord(userA, concurrentMessage)),
      collection.insertOne(createRecord(userA, concurrentMessage)),
    ]);

    const successful = results.filter(
      (result) => result.status === "fulfilled",
    );

    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(successful.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 11000);

    const concurrentCount = await collection.countDocuments({
      verificationRunId: runId,
      userId: userA,
      sourceGmailMessageId: concurrentMessage,
    });

    assert.equal(concurrentCount, 1);

    pass("Prevents duplicate concurrent inserts");

    const total = await collection.countDocuments({
      verificationRunId: runId,
    });

    assert.equal(total, 6);

    console.log("\nSuccessful test records:", total);
    console.log(`RESULT: ${passed}/6 PASSED`);
  } catch (error) {
    console.error(
      "Integration verification failed:",
      error.name,
      error.code || "",
    );

    process.exitCode = 1;
  } finally {
    try {
      if (collection) {
        const cleanup = await collection.deleteMany({
          verificationRunId: runId,
        });

        console.log("Test records cleaned up:", cleanup.deletedCount);

        const remaining = await collection.countDocuments({
          verificationRunId: runId,
        });

        console.log("Remaining test records:", remaining);

        assert.equal(remaining, 0);
      }
    } catch (error) {
      console.error("Cleanup failed. Run ID:", runId);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  }
}

main();
