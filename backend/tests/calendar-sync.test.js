const test = require("node:test");
const assert = require("node:assert/strict");
const { OAuth2Client } = require("google-auth-library");
const mongoose = require("mongoose");

const { syncAndSaveCalendar } = require("../src/services/calendarService");

test("Creates a Google Calendar event for a new reminder", async (t) => {
  const requests = [];

  // Mock Google Calendar API requests.
  t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    requests.push(options);

    // The event does not exist yet.
    if (options.method === "PATCH") {
      const error = new Error("Event not found");
      error.response = { status: 404 };
      throw error;
    }

    // Simulate successful event creation.
    if (options.method === "POST") {
      return {
        data: {
          htmlLink: "https://calendar.google.com/test-event",
        },
      };
    }

    throw new Error(`Unexpected method: ${options.method}`);
  });

  const reminder = {
    _id: new mongoose.Types.ObjectId(),
    title: "Follow up with Google",
    type: "follow_up",
    dueAt: new Date("2026-12-01T18:00:00Z"),
    remindAt: new Date("2026-12-01T17:30:00Z"),
    state: "pending",
    channels: {
      googleCalendar: true,
      email: false,
    },
    googleEventId: undefined,
    googleEventUrl: undefined,
    calendarSyncError: undefined,

    async save() {
      return this;
    },
  };

  const req = {
    session: {
      googleCalendar: {
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
        expiry_date: Date.now() + 3600000,
      },

      save(callback) {
        callback(null);
      },
    },
  };

  await syncAndSaveCalendar(req, reminder);

  // A unique event ID should be generated.
  assert.ok(reminder.googleEventId);

  // Google Calendar should be called twice:
  // PATCH existing event, then POST when it returns 404.
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "PATCH");
  assert.equal(requests[1].method, "POST");

  // The new event must use the generated ID.
  assert.equal(requests[1].data.id, reminder.googleEventId);
  assert.equal(requests[1].data.summary, "Follow up with Google");
  assert.equal(requests[1].data.start.dateTime, "2026-12-01T18:00:00.000Z");
  assert.equal(requests[1].data.reminders.overrides[0].minutes, 30);
  // Successful sync should save the event URL.
  assert.equal(
    reminder.googleEventUrl,
    "https://calendar.google.com/test-event",
  );

  assert.equal(reminder.calendarSyncError, undefined);
});

test("Updates an existing Google Calendar event without creating a duplicate", async (t) => {
  const requests = [];

  t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    requests.push(options);

    return {
      data: {
        htmlLink: "https://calendar.google.com/updated-event",
      },
    };
  });

  const reminder = {
    _id: new mongoose.Types.ObjectId(),
    title: "Updated interview preparation",
    type: "follow_up",
    dueAt: new Date("2026-12-02T20:00:00Z"),
    remindAt: new Date("2026-12-02T19:45:00Z"),
    state: "pending",
    channels: {
      googleCalendar: true,
      email: false,
    },
    googleEventId: "existing-event-123",
    googleEventUrl: "https://calendar.google.com/old-event",
    calendarSyncError: undefined,

    async save() {
      return this;
    },
  };

  const req = {
    session: {
      googleCalendar: {
        access_token: "fake-access-token",
        refresh_token: "fake-refresh-token",
        expiry_date: Date.now() + 3600000,
      },
      save(callback) {
        callback(null);
      },
    },
  };

  await syncAndSaveCalendar(req, reminder);

  // Existing events should be updated with PATCH only.
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "PATCH");

  assert.ok(requests[0].url.endsWith("/existing-event-123"));

  // The updated reminder details must be sent to Google.
  assert.equal(requests[0].data.summary, "Updated interview preparation");

  assert.equal(requests[0].data.start.dateTime, "2026-12-02T20:00:00.000Z");

  assert.equal(requests[0].data.reminders.overrides[0].minutes, 15);

  // The existing ID should be preserved.
  assert.equal(reminder.googleEventId, "existing-event-123");

  // The latest Google Calendar URL should be saved.
  assert.equal(
    reminder.googleEventUrl,
    "https://calendar.google.com/updated-event",
  );

  assert.equal(reminder.calendarSyncError, undefined);
});

test("Disabling Google Calendar removes the linked event", async (t) => {
  const requests = [];

  t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    requests.push(options);

    return { status: 204 };
  });

  const reminder = {
    _id: new mongoose.Types.ObjectId(),
    title: "Follow up with Google",
    type: "follow_up",
    dueAt: new Date("2026-12-01T18:00:00Z"),
    remindAt: new Date("2026-12-01T17:30:00Z"),
    state: "pending",
    channels: {
      googleCalendar: false,
      email: false,
    },
    googleEventId: "existing-event-123",
    googleEventUrl: "https://calendar.google.com/old-event",
    calendarSyncError: undefined,

    async save() {
      return this;
    },
  };

  const req = {
    session: {
      googleCalendar: {
        access_token: "fake-access-token",
        expiry_date: Date.now() + 3600000,
      },

      save(callback) {
        callback(null);
      },
    },
  };

  await syncAndSaveCalendar(req, reminder);

  // Disabling Calendar must delete the existing Google event.
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "DELETE");
  assert.ok(requests[0].url.endsWith("/existing-event-123"));

  // The reminder should no longer reference the deleted event.
  assert.equal(reminder.googleEventId, undefined);
  assert.equal(reminder.googleEventUrl, undefined);
  assert.equal(reminder.calendarSyncError, undefined);
});

test("Completing a reminder disables its Google Calendar popup", async (t) => {
  const requests = [];

  t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    requests.push(options);

    return {
      data: {
        htmlLink: "https://calendar.google.com/completed-event",
      },
    };
  });

  const reminder = {
    _id: new mongoose.Types.ObjectId(),
    title: "Follow up with Apple",
    type: "follow_up",
    dueAt: new Date("2026-12-03T18:00:00Z"),
    remindAt: new Date("2026-12-03T17:30:00Z"),
    state: "completed",
    channels: {
      googleCalendar: true,
      email: false,
    },
    googleEventId: "existing-event-456",
    googleEventUrl: "https://calendar.google.com/old-event",
    calendarSyncError: undefined,

    async save() {
      return this;
    },
  };

  const req = {
    session: {
      googleCalendar: {
        access_token: "fake-access-token",
        expiry_date: Date.now() + 3600000,
      },
      save(callback) {
        callback(null);
      },
    },
  };

  await syncAndSaveCalendar(req, reminder);

  // Update the existing event without deleting it.
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "PATCH");

  // The event must have no popup reminders.
  assert.equal(requests[0].data.reminders.useDefault, false);
  assert.deepEqual(requests[0].data.reminders.overrides, []);

  // Keep the existing Google Calendar event.
  assert.equal(reminder.googleEventId, "existing-event-456");
  assert.equal(
    reminder.googleEventUrl,
    "https://calendar.google.com/completed-event",
  );

  assert.equal(reminder.calendarSyncError, undefined);
});

test("Calendar sync failure is recorded and a later retry succeeds", async (t) => {
  let shouldFail = true;
  const requests = [];
  let saveCount = 0;

  t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    requests.push(options);

    if (shouldFail) {
      const error = new Error("Access denied");
      error.response = { status: 403 };
      throw error;
    }

    return {
      data: {
        htmlLink: "https://calendar.google.com/retried-event",
      },
    };
  });

  const reminder = {
    _id: new mongoose.Types.ObjectId(),
    title: "Follow up with Apple",
    type: "follow_up",
    dueAt: new Date("2026-12-04T18:00:00Z"),
    remindAt: new Date("2026-12-04T17:30:00Z"),
    state: "pending",
    channels: {
      googleCalendar: true,
      email: false,
    },
    googleEventId: "existing-event-789",
    googleEventUrl: undefined,
    calendarSyncError: undefined,

    async save() {
      saveCount += 1;
      return this;
    },
  };

  const req = {
    session: {
      googleCalendar: {
        access_token: "fake-access-token",
        expiry_date: Date.now() + 3600000,
      },
      save(callback) {
        callback(null);
      },
    },
  };

  // First attempt: Google rejects the request.
  await syncAndSaveCalendar(req, reminder);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "PATCH");
  assert.equal(
    reminder.calendarSyncError,
    "Calendar access failed. Reconnect Google Calendar and retry.",
  );
  assert.equal(reminder.googleEventId, "existing-event-789");
  assert.equal(reminder.googleEventUrl, undefined);
  assert.equal(saveCount, 1);

  // Simulate restored Google Calendar access.
  shouldFail = false;

  // Second attempt: synchronization succeeds.
  await syncAndSaveCalendar(req, reminder);

  assert.equal(requests.length, 2);
  assert.equal(requests[1].method, "PATCH");

  // Retry should reuse the same event ID.
  assert.equal(reminder.googleEventId, "existing-event-789");

  assert.equal(
    reminder.googleEventUrl,
    "https://calendar.google.com/retried-event",
  );

  // A successful retry should clear the previous error.
  assert.equal(reminder.calendarSyncError, undefined);
  assert.equal(saveCount, 2);
});
