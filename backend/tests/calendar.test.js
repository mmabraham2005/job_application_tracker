const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");

const User = require("../src/models/User");
const createApp = require("../src/app");

function makeApp() {
  return createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });
}

test("Unauthenticated users cannot access Calendar APIs", async () => {
  const app = makeApp();

  const status = await request(app).get("/api/calendar/status");
  const connect = await request(app).get("/api/calendar/connect");
  const callback = await request(app).get("/api/calendar/callback");

  assert.equal(status.status, 401);
  assert.equal(connect.status, 401);
  assert.equal(callback.status, 401);
});

test("Guest users cannot connect Google Calendar", async (t) => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "guest",
    displayName: "Guest",
  };

  t.mock.method(User, "create", async () => user);
  t.mock.method(User, "findById", async () => user);

  const agent = request.agent(makeApp());

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  const status = await agent.get("/api/calendar/status");
  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { connected: false });

  const connect = await agent.get("/api/calendar/connect");
  assert.equal(connect.status, 403);
  assert.match(connect.text, /Sign in with Google first/);
});

test("Calendar callback rejects missing OAuth state", async (t) => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "guest",
    displayName: "Guest",
  };

  t.mock.method(User, "create", async () => user);
  t.mock.method(User, "findById", async () => user);

  const agent = request.agent(makeApp());

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  const callback = await agent.get(
    "/api/calendar/callback?state=invalid-state&code=test-code",
  );

  assert.equal(callback.status, 400);
  assert.match(callback.text, /Invalid or expired authorization/);
});

test("Calendar retry endpoint preserves and reports sync errors", async (t) => {
  const mongoose = require("mongoose");
  const Reminder = require("../src/models/Reminder");

  const user = {
    _id: new mongoose.Types.ObjectId(),
    authProvider: "guest",
    displayName: "Guest",
  };

  const reminder = {
    _id: new mongoose.Types.ObjectId(),
    userId: user._id,
    title: "Follow up with Google",
    type: "follow_up",
    dueAt: new Date("2026-12-05T18:00:00Z"),
    remindAt: new Date("2026-12-05T17:30:00Z"),
    state: "pending",
    channels: {
      googleCalendar: true,
      email: false,
    },
    googleEventId: "existing-event-123",
    googleEventUrl: undefined,
    calendarSyncError: undefined,

    async save() {
      return this;
    },

    async populate() {
      return this;
    },
  };

  t.mock.method(User, "create", async () => user);
  t.mock.method(User, "findById", async () => user);

  t.mock.method(Reminder, "findOne", async (query) => {
    assert.equal(query._id.toString(), reminder._id.toString());
    assert.equal(query.userId.toString(), user._id.toString());
    return reminder;
  });

  const agent = request.agent(makeApp());

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  const response = await agent.post(
    `/api/reminders/${reminder._id}/calendar-sync`,
  );

  // The request succeeds, but the response reports the sync problem.
  assert.equal(response.status, 200);
  assert.equal(
    response.body.calendarSyncError,
    "Connect Google Calendar first.",
  );

  // The reminder's existing event reference is preserved.
  assert.equal(response.body.googleEventId, "existing-event-123");
});

test("Google Calendar disconnect removes session credentials", async (t) => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "guest",
    displayName: "Guest",
  };

  t.mock.method(User, "create", async () => user);
  t.mock.method(User, "findById", async () => user);

  const agent = request.agent(makeApp());

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  const response = await agent.post("/api/calendar/disconnect");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    connected: false,
    message: "Google Calendar disconnected successfully",
  });

  const status = await agent.get("/api/calendar/status");

  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { connected: false });
});

test("Unauthenticated users cannot disconnect Google Calendar", async () => {
  const response = await request(makeApp()).post("/api/calendar/disconnect");

  assert.equal(response.status, 401);
  assert.equal(response.body.message, "Not authenticated");
});

test("Disconnect removes stored Google Calendar tokens but preserves login", async (t) => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "google",
    email: "test@example.com",
    displayName: "Test User",
  };

  t.mock.method(User, "findById", async () => user);
  t.mock.method(User, "create", async () => user);

  const store = new session.MemoryStore();

  const app = createApp({
    sessionStore: store,
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  // Retrieve the session created by login.
  const sessions = await new Promise((resolve, reject) => {
    store.all((error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });

  const [sessionId] = Object.keys(sessions);
  assert.ok(sessionId);

  const storedSession = sessions[sessionId];

  // Simulate an existing Google Calendar connection.
  storedSession.googleCalendar = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
  };

  storedSession.calendarOAuth = {
    state: "pending-oauth-state",
  };

  await new Promise((resolve, reject) => {
    store.set(sessionId, storedSession, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  // Calendar should initially report connected.
  const before = await agent.get("/api/calendar/status");
  assert.equal(before.status, 200);
  assert.equal(before.body.connected, true);

  // Disconnect.
  const disconnect = await agent.post("/api/calendar/disconnect");

  assert.equal(disconnect.status, 200);
  assert.equal(disconnect.body.connected, false);

  // Calendar should now report disconnected.
  const after = await agent.get("/api/calendar/status");

  assert.equal(after.status, 200);
  assert.equal(after.body.connected, false);

  // The user must remain logged in.
  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.user.id, user._id);

  // Verify the credentials were actually removed.
  const updatedSession = await new Promise((resolve, reject) => {
    store.get(sessionId, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });

  assert.equal(updatedSession.googleCalendar, undefined);
  assert.equal(updatedSession.calendarOAuth, undefined);
});
