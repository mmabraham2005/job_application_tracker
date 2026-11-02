const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");

const User = require("../src/models/User");
const createApp = require("../src/app");

test("Guest login, session persistence, and logout", async (t) => {
  const originalCreate = User.create;
  const originalFindById = User.findById;

  const users = new Map();
  let createdUsers = 0;

  User.create = async (data) => {
    createdUsers++;

    const user = {
      _id: "507f1f77bcf86cd799439011",
      authProvider: data.authProvider,
      displayName: data.displayName,
    };

    users.set(user._id, user);
    return user;
  };

  User.findById = async (id) => {
    return users.get(id.toString()) || null;
  };

  t.after(() => {
    User.create = originalCreate;
    User.findById = originalFindById;
  });

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  // 1. User is not logged in
  const beforeLogin = await agent.get("/api/auth/me");
  assert.equal(beforeLogin.status, 401);

  // 2. First guest login creates a new account
  const firstLogin = await agent.post("/api/auth/guest");

  assert.equal(firstLogin.status, 201);
  assert.equal(firstLogin.body.user.authProvider, "guest");
  assert.equal(firstLogin.body.user.displayName, "Guest");
  assert.equal(createdUsers, 1);

  const userId = firstLogin.body.user.id;

  // 3. Session persists across requests
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.user.id, userId);

  // 4. Repeated guest login returns the existing user
  const repeatedLogin = await agent.post("/api/auth/guest");

  assert.equal(repeatedLogin.status, 200);
  assert.equal(repeatedLogin.body.user.id, userId);
  assert.equal(createdUsers, 1);

  // 5. Logout destroys the session
  const logout = await agent.post("/api/auth/logout");

  assert.equal(logout.status, 200);
  assert.equal(logout.body.message, "Logged out successfully");

  // 6. User is no longer authenticated
  const afterLogout = await agent.get("/api/auth/me");

  assert.equal(afterLogout.status, 401);
});
