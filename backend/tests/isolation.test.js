const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");
const mongoose = require("mongoose");

const User = require("../src/models/User");
const Application = require("../src/models/Application");
const createApp = require("../src/app");

test("Users can only access their own applications", async (t) => {
  // Save original methods
  const originalCreate = User.create;
  const originalFindById = User.findById;
  const originalSave = Application.prototype.save;
  const originalFind = Application.find;
  const originalFindOne = Application.findOne;
  const originalFindOneAndDelete = Application.findOneAndDelete;

  // Fake database
  const users = new Map();
  const applications = new Map();

  // Mock User.create()
  User.create = async (data) => {
    const id = new mongoose.Types.ObjectId().toString();

    const user = {
      _id: id,
      authProvider: data.authProvider,
      displayName: data.displayName,
    };

    users.set(id, user);
    return user;
  };

  // Mock User.findById()
  User.findById = async (id) => {
    return users.get(id.toString()) || null;
  };

  // Mock Application.save()
  Application.prototype.save = async function () {
    await this.validate();

    applications.set(this._id.toString(), this.toObject());
    return this;
  };

  // Mock Application.find()
  Application.find = async (query) => {
    assert.ok(query.userId, "Application query must include userId");

    return [...applications.values()].filter(
      (application) =>
        application.userId.toString() === query.userId.toString(),
    );
  };

  // Mock Application.findOne()
  Application.findOne = async (query) => {
    assert.ok(query._id, "Application query must include _id");
    assert.ok(query.userId, "Application query must include userId");

    const saved = applications.get(query._id.toString());

    if (!saved) {
      return null;
    }

    if (saved.userId.toString() !== query.userId.toString()) {
      return null;
    }

    return new Application(saved);
  };

  // Mock Application.findOneAndDelete()
  Application.findOneAndDelete = async (query) => {
    assert.ok(query._id, "Delete query must include _id");
    assert.ok(query.userId, "Delete query must include userId");

    const saved = applications.get(query._id.toString());

    if (!saved) {
      return null;
    }

    if (saved.userId.toString() !== query.userId.toString()) {
      return null;
    }

    applications.delete(query._id.toString());

    return saved;
  };

  // Restore original methods after the test
  t.after(() => {
    User.create = originalCreate;
    User.findById = originalFindById;
    Application.prototype.save = originalSave;
    Application.find = originalFind;
    Application.findOne = originalFindOne;
    Application.findOneAndDelete = originalFindOneAndDelete;
  });

  // Create Express app with test-only session storage
  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  // Create two independent browser sessions
  const agentA = request.agent(app);
  const agentB = request.agent(app);

  // Log in as User A
  const loginA = await agentA.post("/api/auth/guest");

  // Log in as User B
  const loginB = await agentB.post("/api/auth/guest");

  // Verify both logins succeeded
  assert.equal(loginA.status, 201);
  assert.equal(loginB.status, 201);

  // Verify the two users have different IDs
  assert.notEqual(loginA.body.user.id, loginB.body.user.id);

  // User A creates an application
  const createA = await agentA.post("/api/applications").send({
    companyName: "Google",
    jobTitle: "Software Engineer Intern",
    applicationDate: "2026-10-30",
    status: "Applied",
  });

  // User B creates a different application
  const createB = await agentB.post("/api/applications").send({
    companyName: "Microsoft",
    jobTitle: "Backend Engineer Intern",
    applicationDate: "2026-10-30",
    status: "Applied",
  });

  assert.equal(createA.status, 201);
  assert.equal(createB.status, 201);

  // Both applications should be stored
  assert.equal(applications.size, 2);

  // Each user retrieves their own applications
  const listA = await agentA.get("/api/applications");
  const listB = await agentB.get("/api/applications");

  assert.equal(listA.status, 200);
  assert.equal(listB.status, 200);

  // Each user should only see one application
  assert.equal(listA.body.length, 1);
  assert.equal(listB.body.length, 1);

  // Verify application ownership
  assert.equal(listA.body[0].companyName, "Google");
  assert.equal(listB.body[0].companyName, "Microsoft");

  // Verify the returned user IDs
  assert.equal(listA.body[0].userId.toString(), loginA.body.user.id);

  assert.equal(listB.body[0].userId.toString(), loginB.body.user.id);

  // User A attempts to update User B's application
  const applicationBId = createB.body._id;

  const unauthorizedUpdate = await agentA
    .patch(`/api/applications/${applicationBId}`)
    .send({
      companyName: "Hacked Company",
    });

  assert.equal(unauthorizedUpdate.status, 404);

  // User B's application must remain unchanged
  const listBAfterUpdate = await agentB.get("/api/applications");

  assert.equal(listBAfterUpdate.status, 200);
  assert.equal(listBAfterUpdate.body.length, 1);
  assert.equal(listBAfterUpdate.body[0].companyName, "Microsoft");

  // User B attempts to update User A's application
  const applicationAId = createA.body._id;

  const reverseUnauthorizedUpdate = await agentB
    .patch(`/api/applications/${applicationAId}`)
    .send({
      companyName: "Hacked Google",
    });

  assert.equal(reverseUnauthorizedUpdate.status, 404);

  const listAAfterUpdate = await agentA.get("/api/applications");

  assert.equal(listAAfterUpdate.status, 200);
  assert.equal(listAAfterUpdate.body.length, 1);
  assert.equal(listAAfterUpdate.body[0].companyName, "Google");

  // User A attempts to change User B's application status
  const unauthorizedStatusUpdate = await agentA
    .patch(`/api/applications/${applicationBId}/status`)
    .send({
      status: "Interview",
    });

  assert.equal(unauthorizedStatusUpdate.status, 404);

  // Verify User B's application status remains unchanged
  const listBAfterStatusUpdate = await agentB.get("/api/applications");

  assert.equal(listBAfterStatusUpdate.status, 200);
  assert.equal(listBAfterStatusUpdate.body.length, 1);
  assert.equal(listBAfterStatusUpdate.body[0].status, "Applied");

  // User B attempts to change User A's application status
  const reverseUnauthorizedStatusUpdate = await agentB
    .patch(`/api/applications/${applicationAId}/status`)
    .send({
      status: "Rejected",
    });

  assert.equal(reverseUnauthorizedStatusUpdate.status, 404);

  // Verify User A's application status remains unchanged
  const listAAfterStatusUpdate = await agentA.get("/api/applications");

  assert.equal(listAAfterStatusUpdate.status, 200);
  assert.equal(listAAfterStatusUpdate.body.length, 1);
  assert.equal(listAAfterStatusUpdate.body[0].status, "Applied");

  // User A attempts to delete User B's application
  const unauthorizedDelete = await agentA.delete(
    `/api/applications/${applicationBId}`,
  );

  assert.equal(unauthorizedDelete.status, 404);

  // User B attempts to delete User A's application
  const reverseUnauthorizedDelete = await agentB.delete(
    `/api/applications/${applicationAId}`,
  );

  assert.equal(reverseUnauthorizedDelete.status, 404);

  // Verify neither application was deleted
  assert.equal(applications.size, 2);

  // Verify User A still has their application
  const listAAfterDelete = await agentA.get("/api/applications");

  assert.equal(listAAfterDelete.status, 200);
  assert.equal(listAAfterDelete.body.length, 1);
  assert.equal(listAAfterDelete.body[0].companyName, "Google");

  // Verify User B still has their application
  const listBAfterDelete = await agentB.get("/api/applications");

  assert.equal(listBAfterDelete.status, 200);
  assert.equal(listBAfterDelete.body.length, 1);
  assert.equal(listBAfterDelete.body[0].companyName, "Microsoft");
});
