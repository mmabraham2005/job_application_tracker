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
