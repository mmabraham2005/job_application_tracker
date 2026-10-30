const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");

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
