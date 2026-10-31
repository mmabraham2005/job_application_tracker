const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");
const { OAuth2Client } = require("google-auth-library");
const mongoose = require("mongoose");
const User = require("../src/models/User");

const createApp = require("../src/app");

test("Google login rejects missing credentials", async () => {
  // Create Express app with test-only session storage
  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  // Use an agent to preserve cookies across requests
  const agent = request.agent(app);

  // Attempt Google login without a credential
  const response = await agent.post("/api/auth/google").send({});

  // Verify the backend rejects the request
  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Google credential is required");

  // Verify no authenticated session was created
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 401);
  assert.equal(currentUser.body.message, "Not authenticated");
});

test("Google login rejects invalid tokens", async (t) => {
  // Save the original Google verification method
  const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;

  // Mock Google token verification failure
  OAuth2Client.prototype.verifyIdToken = async () => {
    throw new Error("Invalid token");
  };

  // Restore the original method after the test
  t.after(() => {
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
  });

  // Create Express app with test-only session storage
  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  // Preserve cookies across requests
  const agent = request.agent(app);

  // Attempt login with an invalid token
  const response = await agent.post("/api/auth/google").send({
    credential: "invalid-google-token",
  });

  // Backend must reject the invalid token
  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Invalid or expired Google credential");

  // Failed login must not create an authenticated session
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 401);
  assert.equal(currentUser.body.message, "Not authenticated");
});

test("Google login rejects invalid account payloads", async (t) => {
  const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;

  t.after(() => {
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
  });

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  // Case 1: Google account is missing the subject ID
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      email: "test@example.com",
      email_verified: true,
    }),
  });

  const missingSubject = await agent
    .post("/api/auth/google")
    .send({ credential: "test-token-missing-sub" });

  assert.equal(missingSubject.status, 401);
  assert.equal(missingSubject.body.message, "Invalid Google account");

  // Case 2: Google email is not verified
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      sub: "google-user-123",
      email: "test@example.com",
      email_verified: false,
    }),
  });

  const unverifiedEmail = await agent
    .post("/api/auth/google")
    .send({ credential: "test-token-unverified-email" });

  assert.equal(unverifiedEmail.status, 401);
  assert.equal(unverifiedEmail.body.message, "Invalid Google account");

  // Neither attempt should create an authenticated session
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 401);
  assert.equal(currentUser.body.message, "Not authenticated");
});

test("Google login authenticates an existing user", async (t) => {
  // Save original methods
  const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
  const originalFindOne = User.findOne;
  const originalFindById = User.findById;
  const originalFindOneAndUpdate = User.findOneAndUpdate;

  // Create an existing Google user
  const existingUser = {
    _id: new mongoose.Types.ObjectId(),
    authProvider: "google",
    googleId: "google-user-123",
    email: "test@example.com",
    displayName: "Test User",
    avatarUrl: "https://example.com/avatar.png",
  };

  // Mock successful Google token verification
  OAuth2Client.prototype.verifyIdToken = async (options) => {
    assert.equal(options.idToken, "valid-google-token");

    return {
      getPayload: () => ({
        sub: "google-user-123",
        email: "test@example.com",
        email_verified: true,
        name: "Test User",
        picture: "https://example.com/avatar.png",
      }),
    };
  };

  // Mock finding an existing Google user
  User.findOne = async (query) => {
    assert.equal(query.authProvider, "google");
    assert.equal(query.googleId, "google-user-123");

    return existingUser;
  };

  // Mock retrieving the user from the session
  User.findById = async (id) => {
    return id.toString() === existingUser._id.toString() ? existingUser : null;
  };

  // Existing users should not need to be created again
  let createWasCalled = false;

  User.findOneAndUpdate = async () => {
    createWasCalled = true;
    throw new Error("Existing user should not be recreated");
  };

  // Restore original methods after the test
  t.after(() => {
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    User.findOne = originalFindOne;
    User.findById = originalFindById;
    User.findOneAndUpdate = originalFindOneAndUpdate;
  });

  // Create the test app
  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  // Log in using a valid Google credential
  const login = await agent.post("/api/auth/google").send({
    credential: "valid-google-token",
  });

  // Verify Google login succeeded
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, existingUser._id.toString());
  assert.equal(login.body.user.displayName, "Test User");

  // Verify no new user was created
  assert.equal(createWasCalled, false);

  // Verify the authenticated session persists
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.user.id, existingUser._id.toString());
  assert.equal(currentUser.body.user.displayName, "Test User");
});

test("Google login creates a new user", async (t) => {
  // Save original methods
  const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
  const originalFindOne = User.findOne;
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  const originalFindById = User.findById;

  const googlePayload = {
    sub: "new-google-user-456",
    email: "newuser@example.com",
    email_verified: true,
    name: "New Google User",
    picture: "https://example.com/new-avatar.png",
  };

  let createdUser = null;
  let upsertCount = 0;

  // Mock successful Google token verification
  OAuth2Client.prototype.verifyIdToken = async (options) => {
    assert.equal(options.idToken, "valid-new-user-token");

    return {
      getPayload: () => googlePayload,
    };
  };

  // Simulate a user who does not exist in the database
  User.findOne = async (query) => {
    assert.equal(query.authProvider, "google");
    assert.equal(query.googleId, googlePayload.sub);

    return null;
  };

  // Simulate MongoDB upsert creating a new user
  User.findOneAndUpdate = async (filter, update, options) => {
    upsertCount++;

    // Verify the correct Google account is being created
    assert.deepEqual(filter, {
      authProvider: "google",
      googleId: googlePayload.sub,
    });

    // Verify Google profile information
    assert.deepEqual(update.$setOnInsert, {
      email: googlePayload.email,
      displayName: googlePayload.name,
      avatarUrl: googlePayload.picture,
    });

    // Verify upsert configuration
    assert.equal(options.upsert, true);
    assert.equal(options.new, true);
    assert.equal(options.runValidators, true);

    createdUser = {
      _id: new mongoose.Types.ObjectId(),
      authProvider: "google",
      googleId: googlePayload.sub,
      ...update.$setOnInsert,
    };

    return createdUser;
  };

  // Mock retrieving the user through the session
  User.findById = async (id) => {
    if (!createdUser) {
      return null;
    }

    return id.toString() === createdUser._id.toString() ? createdUser : null;
  };

  // Restore original methods
  t.after(() => {
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    User.findOne = originalFindOne;
    User.findOneAndUpdate = originalFindOneAndUpdate;
    User.findById = originalFindById;
  });

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  // First-time Google login
  const login = await agent.post("/api/auth/google").send({
    credential: "valid-new-user-token",
  });

  assert.equal(login.status, 200);

  // Verify a new Google user was created
  assert.equal(upsertCount, 1);
  assert.ok(createdUser);

  assert.equal(login.body.user.id, createdUser._id.toString());
  assert.equal(login.body.user.displayName, "New Google User");
  assert.equal(login.body.user.email, "newuser@example.com");

  // Verify the new user's session persists
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.user.id, createdUser._id.toString());
  assert.equal(currentUser.body.user.displayName, "New Google User");
});

test("Google login handles database failures", async (t) => {
  // Save original methods
  const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
  const originalFindOne = User.findOne;

  // Mock successful Google token verification
  OAuth2Client.prototype.verifyIdToken = async (options) => {
    assert.equal(options.idToken, "valid-google-token");

    return {
      getPayload: () => ({
        sub: "google-user-123",
        email: "test@example.com",
        email_verified: true,
        name: "Test User",
      }),
    };
  };

  // Simulate database connection failure
  User.findOne = async (query) => {
    assert.equal(query.authProvider, "google");
    assert.equal(query.googleId, "google-user-123");

    throw new Error("Database connection failed");
  };

  // Restore original methods
  t.after(() => {
    OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    User.findOne = originalFindOne;
  });

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  // Attempt Google login with a valid token
  const response = await agent.post("/api/auth/google").send({
    credential: "valid-google-token",
  });

  // Backend must handle database errors
  assert.equal(response.status, 500);
  assert.equal(response.body.message, "Failed to complete Google login");

  // Database failure must not create a session
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 401);
  assert.equal(currentUser.body.message, "Not authenticated");
});
