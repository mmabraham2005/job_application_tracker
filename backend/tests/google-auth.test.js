const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");
const { OAuth2Client } = require("google-auth-library");

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
