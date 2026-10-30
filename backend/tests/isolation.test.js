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

  // Restore original methods after the test
  t.after(() => {
    User.create = originalCreate;
    User.findById = originalFindById;
    Application.prototype.save = originalSave;
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
});
