const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");
const { OAuth2Client } = require("google-auth-library");

const User = require("../src/models/User");
const Application = require("../src/models/Application");
const createApp = require("../src/app");

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const guestUser = {
  _id: "507f1f77bcf86cd799439011",
  authProvider: "guest",
  displayName: "Guest",
};

const googleUser = {
  _id: "507f1f77bcf86cd799439012",
  authProvider: "google",
  googleId: "google-user-123",
  email: "test@example.com",
  displayName: "Test User",
};

function makeApp(store = new session.MemoryStore()) {
  return createApp({
    sessionStore: store,
    sessionSecret: "test-only-session-secret",
  });
}

async function loginAs(t, user, app) {
  t.mock.method(User, "create", async () => user);
  t.mock.method(User, "findById", async () => user);

  const agent = request.agent(app);
  const login = await agent.post("/api/auth/guest");

  assert.equal(login.status, 201);

  return agent;
}

function getSessions(store) {
  return new Promise((resolve, reject) => {
    store.all((error, sessions) => {
      if (error) reject(error);
      else resolve(sessions);
    });
  });
}

function setSession(store, id, data) {
  return new Promise((resolve, reject) => {
    store.set(id, data, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function startOAuth(t, agent) {
  t.mock.method(OAuth2Client.prototype, "generateAuthUrl", (options) => {
    assert.ok(options.scope.includes(GMAIL_SCOPE));
    assert.ok(options.state);
    assert.equal(options.access_type, "offline");

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    url.searchParams.set("state", options.state);

    return url.toString();
  });

  const response = await agent.get("/api/gmail/connect");

  assert.equal(response.status, 302);

  return new URL(response.headers.location).searchParams.get("state");
}

function mockOAuthTokens(
  t,
  { scopes = [GMAIL_SCOPE], googleId = googleUser.googleId } = {},
) {
  t.mock.method(OAuth2Client.prototype, "getToken", async () => ({
    tokens: {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      id_token: "test-id-token",
      expiry_date: Date.now() + 3600000,
      scope: GMAIL_SCOPE,
    },
  }));

  t.mock.method(OAuth2Client.prototype, "getTokenInfo", async () => ({
    scopes,
  }));

  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({
    getPayload: () => ({
      sub: googleId,
      email: googleUser.email,
      email_verified: true,
    }),
  }));
}

test("Unauthenticated users cannot access Gmail APIs", async () => {
  const app = makeApp();

  const responses = [
    await request(app).get("/api/gmail/status"),
    await request(app).get("/api/gmail/connect"),
    await request(app).get("/api/gmail/callback"),
    await request(app).post("/api/gmail/disconnect"),
    await request(app).get("/api/gmail/emails"),
    await request(app).get("/api/gmail/preferences"),
    await request(app).put("/api/gmail/preferences"),
  ];

  for (const response of responses) {
    assert.equal(response.status, 401);
  }
});

test("Guest users cannot connect Gmail", async (t) => {
  const agent = await loginAs(t, guestUser, makeApp());

  const status = await agent.get("/api/gmail/status");

  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { connected: false });

  const connect = await agent.get("/api/gmail/connect");

  assert.equal(connect.status, 403);
});

test("Gmail callback rejects missing or invalid OAuth state", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  const response = await agent.get(
    "/api/gmail/callback?state=invalid-state&code=test-code",
  );

  assert.equal(response.status, 400);
});

test("Google users can start Gmail authorization", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  const state = await startOAuth(t, agent);

  assert.ok(state);
});

test("Gmail callback stores authorized credentials", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  const state = await startOAuth(t, agent);

  mockOAuthTokens(t);

  const callback = await agent.get(
    `/api/gmail/callback?state=${state}&code=test-code`,
  );

  assert.equal(callback.status, 302);
  assert.equal(
    new URL(callback.headers.location).searchParams.get("gmail"),
    "connected",
  );
  assert.equal(new URL(callback.headers.location).pathname, "/profile");

  const status = await agent.get("/api/gmail/status");

  assert.deepEqual(status.body, { connected: true });

  // The same OAuth state must not be reusable.
  const replay = await agent.get(
    `/api/gmail/callback?state=${state}&code=test-code`,
  );

  assert.equal(replay.status, 400);
});

test("Gmail callback rejects missing Gmail permission", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  const state = await startOAuth(t, agent);

  mockOAuthTokens(t, { scopes: ["openid", "email"] });

  const callback = await agent.get(
    `/api/gmail/callback?state=${state}&code=test-code`,
  );

  assert.equal(callback.status, 302);
  assert.equal(
    new URL(callback.headers.location).searchParams.get("gmail"),
    "missing_permission",
  );
  assert.equal(new URL(callback.headers.location).pathname, "/profile");

  const status = await agent.get("/api/gmail/status");

  assert.deepEqual(status.body, { connected: false });
});

test("Gmail callback rejects a different Google account", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  const state = await startOAuth(t, agent);

  mockOAuthTokens(t, {
    googleId: "different-google-user",
  });

  const callback = await agent.get(
    `/api/gmail/callback?state=${state}&code=test-code`,
  );

  assert.equal(callback.status, 302);
  assert.equal(
    new URL(callback.headers.location).searchParams.get("gmail"),
    "account_mismatch",
  );
  assert.equal(new URL(callback.headers.location).pathname, "/profile");

  const status = await agent.get("/api/gmail/status");

  assert.deepEqual(status.body, { connected: false });
});

test("Gmail disconnect preserves login and Calendar credentials", async (t) => {
  const store = new session.MemoryStore();

  const agent = await loginAs(t, googleUser, makeApp(store));

  const sessions = await getSessions(store);
  const [sessionId] = Object.keys(sessions);

  assert.ok(sessionId);

  const storedSession = sessions[sessionId];

  storedSession.googleGmail = {
    access_token: "test-gmail-token",
    refresh_token: "test-gmail-refresh-token",
  };

  storedSession.gmailOAuth = {
    state: "pending-gmail-state",
  };

  storedSession.googleCalendar = {
    access_token: "test-calendar-token",
    refresh_token: "test-calendar-refresh-token",
  };

  await setSession(store, sessionId, storedSession);

  const before = await agent.get("/api/gmail/status");

  assert.deepEqual(before.body, { connected: true });

  const disconnect = await agent.post("/api/gmail/disconnect");

  assert.equal(disconnect.status, 200);
  assert.equal(disconnect.body.connected, false);

  const after = await agent.get("/api/gmail/status");

  assert.deepEqual(after.body, { connected: false });

  const calendar = await agent.get("/api/calendar/status");

  assert.deepEqual(calendar.body, { connected: true });

  const currentUser = await agent.get("/api/auth/me");

  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.body.user.id, googleUser._id);

  const updatedSessions = await getSessions(store);
  const updatedSession = updatedSessions[sessionId];

  assert.equal(updatedSession.googleGmail, undefined);
  assert.equal(updatedSession.gmailOAuth, undefined);

  assert.equal(
    updatedSession.googleCalendar.access_token,
    "test-calendar-token",
  );
});

async function loginWithGmail(t, app) {
  const agent = await loginAs(t, googleUser, app);

  const state = await startOAuth(t, agent);

  mockOAuthTokens(t);

  const callback = await agent.get(
    `/api/gmail/callback?state=${state}&code=test-code`,
  );

  assert.equal(callback.status, 302);
  assert.equal(
    new URL(callback.headers.location).searchParams.get("gmail"),
    "connected",
  );
  assert.equal(new URL(callback.headers.location).pathname, "/profile");

  return agent;
}

function createEmailFixture() {
  return {
    id: "message-001",
    threadId: "thread-001",
    internalDate: String(Date.parse("2026-06-15T12:00:00.000Z")),
    snippet: "Thank you for applying.",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        {
          name: "Subject",
          value: "Application received - Software Engineer",
        },
        {
          name: "From",
          value: "careers@example.com",
        },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: {
            data: Buffer.from(
              "Thank you for applying to Example Company.",
            ).toString("base64url"),
          },
        },
        {
          mimeType: "text/html",
          body: {
            data: Buffer.from("<p>Thank you for applying.</p>").toString(
              "base64url",
            ),
          },
        },
      ],
    },
  };
}

test("Guest users cannot retrieve Gmail emails", async (t) => {
  const agent = await loginAs(t, guestUser, makeApp());

  const response = await agent.get("/api/gmail/emails");

  assert.equal(response.status, 403);
});

test("Google users must connect Gmail before retrieving emails", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  const response = await agent.get("/api/gmail/emails");

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Connect Gmail first.");
});

test("Gmail retrieval returns normalized email metadata without private bodies", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const calls = [];

  t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    calls.push(options);

    if (options.url.endsWith("/messages")) {
      assert.equal(options.method, "GET");
      assert.equal(options.params.maxResults, 25);
      assert.equal(options.params.includeSpamTrash, false);

      assert.ok(options.params.q.includes("newer_than:365d"));

      return {
        data: {
          messages: [
            {
              id: "message-001",
              threadId: "thread-001",
            },
          ],
          nextPageToken: "next-page-token",
        },
      };
    }

    assert.ok(options.url.endsWith("/message-001"));
    assert.equal(options.params.format, "full");

    return {
      data: createEmailFixture(),
    };
  });

  const response = await agent.get("/api/gmail/emails");

  assert.equal(response.status, 200);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.hasMore, true);
  assert.equal(calls.length, 2);
  assert.equal(response.headers["cache-control"], "no-store");

  assert.deepEqual(response.body.emails[0], {
    messageId: "message-001",
    subject: "Application received - Software Engineer",
    from: "careers@example.com",
    receivedAt: "2026-06-15T12:00:00.000Z",
  });

  assert.equal(response.body.emails[0].body, undefined);
  assert.equal(response.body.emails[0].snippet, undefined);
  assert.equal(response.body.emails[0].access_token, undefined);
});

test("Gmail retrieval handles an empty search result", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  let requestCount = 0;

  t.mock.method(OAuth2Client.prototype, "request", async () => {
    requestCount++;

    return {
      data: {},
    };
  });

  const response = await agent.get("/api/gmail/emails");

  assert.equal(response.status, 200);
  assert.equal(requestCount, 1);

  assert.deepEqual(response.body, {
    count: 0,
    hasMore: false,
    emails: [],
  });
});

test("Gmail retrieval handles expired or revoked authorization", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  t.mock.method(OAuth2Client.prototype, "request", async () => {
    const error = new Error("Unauthorized");

    error.response = {
      status: 401,
    };

    throw error;
  });

  const response = await agent.get("/api/gmail/emails");

  assert.equal(response.status, 403);
  assert.equal(
    response.body.message,
    "Gmail access failed. Reconnect Gmail and retry.",
  );
});

test("Gmail retrieval handles upstream API failures", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  t.mock.method(OAuth2Client.prototype, "request", async () => {
    const error = new Error("Gmail API unavailable");

    error.response = {
      status: 503,
    };

    throw error;
  });

  const response = await agent.get("/api/gmail/emails");

  assert.equal(response.status, 502);
  assert.equal(response.body.message, "Failed to retrieve application emails.");
});

test("Guest users cannot access Gmail preferences", async (t) => {
  const agent = await loginAs(t, guestUser, makeApp());

  const get = await agent.get("/api/gmail/preferences");

  const put = await agent.put("/api/gmail/preferences").send({
    trustedSenders: [],
    blockedSenders: [],
  });

  assert.equal(get.status, 403);
  assert.equal(put.status, 403);
});

test("Existing users without preferences receive empty defaults", async (t) => {
  const legacyUser = { ...googleUser };

  delete legacyUser.emailDetectionPreferences;

  const agent = await loginAs(t, legacyUser, makeApp());

  const response = await agent.get("/api/gmail/preferences");

  assert.equal(response.status, 200);

  assert.deepEqual(response.body, {
    trustedSenders: [],
    blockedSenders: [],
  });

  assert.equal(response.headers["cache-control"], "no-store");
});

test("Google users can retrieve existing sender preferences", async (t) => {
  const user = {
    ...googleUser,
    emailDetectionPreferences: {
      trustedSenders: ["careers@example.com"],
      blockedSenders: ["scholarship@example.org"],
    },
  };

  const agent = await loginAs(t, user, makeApp());

  const response = await agent.get("/api/gmail/preferences");

  assert.equal(response.status, 200);

  assert.deepEqual(response.body, user.emailDetectionPreferences);
});

test("Google users can update normalized preferences without connecting Gmail", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  let updateCalled = false;

  t.mock.method(User, "findByIdAndUpdate", async (userId, update, options) => {
    updateCalled = true;

    assert.equal(userId, googleUser._id);

    assert.deepEqual(update, {
      $set: {
        "emailDetectionPreferences.trustedSenders": ["example.com"],
        "emailDetectionPreferences.blockedSenders": ["scholarship@example.org"],
      },
    });

    assert.equal(options.new, true);
    assert.equal(options.runValidators, true);

    return {
      ...googleUser,
      emailDetectionPreferences: {
        trustedSenders: ["example.com"],
        blockedSenders: ["scholarship@example.org"],
      },
    };
  });

  const response = await agent.put("/api/gmail/preferences").send({
    trustedSenders: [" EXAMPLE.COM ", "@example.com"],
    blockedSenders: ["Scholarship@Example.org"],
  });

  assert.equal(response.status, 200);
  assert.equal(updateCalled, true);

  assert.deepEqual(response.body, {
    trustedSenders: ["example.com"],
    blockedSenders: ["scholarship@example.org"],
  });

  assert.equal(response.headers["cache-control"], "no-store");
});

test("Rejects invalid preferences before database update", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  let updateCalled = false;

  t.mock.method(User, "findByIdAndUpdate", async () => {
    updateCalled = true;
    throw new Error("Unexpected database write");
  });

  const response = await agent.put("/api/gmail/preferences").send({
    trustedSenders: ["invalid-email"],
    blockedSenders: [],
  });

  assert.equal(response.status, 400);
  assert.equal(updateCalled, false);
});

test("Rejects attempts to update another user's preferences", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  let updateCalled = false;

  t.mock.method(User, "findByIdAndUpdate", async () => {
    updateCalled = true;
    throw new Error("Unexpected database write");
  });

  const response = await agent.put("/api/gmail/preferences").send({
    userId: "507f1f77bcf86cd799439099",
    trustedSenders: ["example.com"],
    blockedSenders: [],
  });

  assert.equal(response.status, 400);
  assert.equal(updateCalled, false);
});

test("Google users can clear all sender preferences", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  t.mock.method(User, "findByIdAndUpdate", async (userId, update) => {
    assert.equal(userId, googleUser._id);

    assert.deepEqual(update.$set, {
      "emailDetectionPreferences.trustedSenders": [],
      "emailDetectionPreferences.blockedSenders": [],
    });

    return {
      ...googleUser,
      emailDetectionPreferences: {
        trustedSenders: [],
        blockedSenders: [],
      },
    };
  });

  const response = await agent.put("/api/gmail/preferences").send({
    trustedSenders: [],
    blockedSenders: [],
  });

  assert.equal(response.status, 200);

  assert.deepEqual(response.body, {
    trustedSenders: [],
    blockedSenders: [],
  });
});

test("Preference update returns 404 when user no longer exists", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  t.mock.method(User, "findByIdAndUpdate", async () => null);

  const response = await agent.put("/api/gmail/preferences").send({
    trustedSenders: [],
    blockedSenders: [],
  });

  assert.equal(response.status, 404);
});

test("Preference update handles database failures", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  t.mock.method(User, "findByIdAndUpdate", async () => {
    throw new Error("Database unavailable");
  });

  const response = await agent.put("/api/gmail/preferences").send({
    trustedSenders: [],
    blockedSenders: [],
  });

  assert.equal(response.status, 500);

  assert.equal(
    response.body.message,
    "Could not update email detection preferences.",
  );
});

// ===============================
// Gmail Import Test Helpers
// ===============================

function createImportPayload(overrides = {}) {
  return {
    messageId: "message-001",
    companyName: "Example Company",
    jobTitle: "Software Engineer",
    applicationDate: "2026-06-15",
    status: "Applied",
    ...overrides,
  };
}

function mockImportDatabase(
  t,
  { existingApplication = null, lookupError = null, saveError = null } = {},
) {
  const lookups = [];
  const savedApplications = [];

  t.mock.method(Application, "findOne", async (query) => {
    lookups.push(query);

    if (lookupError) {
      throw lookupError;
    }

    return existingApplication;
  });

  t.mock.method(Application.prototype, "save", async function () {
    if (saveError) {
      throw saveError;
    }

    savedApplications.push(this.toObject());

    return this;
  });

  return {
    lookups,
    savedApplications,
  };
}

function mockImportEmail(t, overrides = {}) {
  const fixture = createEmailFixture();

  const email = {
    ...fixture,
    ...overrides,
  };

  return t.mock.method(OAuth2Client.prototype, "request", async () => ({
    data: email,
  }));
}

function mockImportGmailError(t, status) {
  return t.mock.method(OAuth2Client.prototype, "request", async () => {
    const error = new Error("Mock Gmail API error");

    error.response = { status };

    throw error;
  });
}

// ===============================
// Gmail Import Authentication
// ===============================

test("Unauthenticated users cannot import Gmail applications", async (t) => {
  const db = mockImportDatabase(t);

  const response = await request(makeApp())
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 401);
  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Guest users cannot import Gmail applications", async (t) => {
  const agent = await loginAs(t, guestUser, makeApp());
  const db = mockImportDatabase(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 403);
  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Google users must connect Gmail before importing", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());
  const db = mockImportDatabase(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 403);
  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

// ===============================
// Gmail Import Request Validation
// ===============================

test("Gmail import rejects invalid request body", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const response = await agent.post("/api/gmail/import").send([]);

  assert.equal(response.status, 400);
  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects invalid message IDs", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const invalidIds = [
    "",
    " ",
    "../message-001",
    "message/001",
    "a".repeat(256),
    12345,
    null,
  ];

  for (const messageId of invalidIds) {
    const response = await agent
      .post("/api/gmail/import")
      .send(createImportPayload({ messageId }));

    assert.equal(response.status, 400);
  }

  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects missing required application fields", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const fields = [
    "messageId",
    "companyName",
    "jobTitle",
    "applicationDate",
    "status",
  ];

  for (const field of fields) {
    const payload = createImportPayload();

    delete payload[field];

    const response = await agent.post("/api/gmail/import").send(payload);

    assert.equal(response.status, 400);
  }

  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects invalid application dates", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const dates = [
    "invalid-date",
    "2026-02-30",
    "2026-13-01",
    "06/15/2026",
    "2026-06-15T12:00:00Z",
  ];

  for (const applicationDate of dates) {
    const response = await agent
      .post("/api/gmail/import")
      .send(createImportPayload({ applicationDate }));

    assert.equal(response.status, 400);
  }

  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects invalid application status", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const gmail = mockImportEmail(t);

  const response = await agent.post("/api/gmail/import").send(
    createImportPayload({
      status: "Invalid Status",
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(gmail.mock.callCount(), 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects client-supplied user ID", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const response = await agent.post("/api/gmail/import").send(
    createImportPayload({
      userId: "507f1f77bcf86cd799439099",
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects client-supplied source identifier", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const response = await agent.post("/api/gmail/import").send(
    createImportPayload({
      sourceGmailMessageId: "another-message",
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(db.lookups.length, 0);
  assert.equal(db.savedApplications.length, 0);
});

// ===============================
// Gmail Import Ownership
// ===============================

test("Gmail import rejects inaccessible messages", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  mockImportGmailError(t, 404);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 404);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects mismatched message IDs", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  mockImportEmail(t, {
    id: "different-message",
  });

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 404);
  assert.equal(db.savedApplications.length, 0);
});

// ===============================
// Gmail Import Classification
// ===============================

test("Gmail import rejects scholarship emails", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  mockImportEmail(t, {
    snippet: "Scholarship Application Received",
    payload: {
      mimeType: "text/plain",
      headers: [
        {
          name: "Subject",
          value: "Scholarship Application Received",
        },
        {
          name: "From",
          value: "scholarship@example.org",
        },
      ],
      body: {
        data: Buffer.from(
          "Thank you for your scholarship application.",
        ).toString("base64url"),
      },
    },
  });

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 400);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import rejects job follow-up emails", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const fixture = createEmailFixture();

  fixture.payload.headers.find((header) => header.name === "Subject").value =
    "First Round Interview";

  mockImportEmail(t, fixture);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 400);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import respects blocked sender preferences", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  t.mock.method(User, "findById", async () => ({
    ...googleUser,
    emailDetectionPreferences: {
      trustedSenders: ["example.com"],
      blockedSenders: ["example.com"],
    },
  }));

  mockImportEmail(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 400);
  assert.equal(db.savedApplications.length, 0);
});

// ===============================
// Gmail Import Duplicate Protection
// ===============================

test("Gmail import rejects previously imported messages", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const db = mockImportDatabase(t, {
    existingApplication: {
      _id: "507f1f77bcf86cd799439020",
      sourceGmailMessageId: "message-001",
    },
  });

  const gmail = mockImportEmail(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 409);

  assert.equal(response.body.applicationId, "507f1f77bcf86cd799439020");

  assert.equal(gmail.mock.callCount(), 0);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import handles database duplicate key errors", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const error = new Error("Duplicate key");

  error.code = 11000;

  const db = mockImportDatabase(t, {
    saveError: error,
  });

  mockImportEmail(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 409);
  assert.equal(db.savedApplications.length, 0);
});

// ===============================
// Successful Gmail Imports
// ===============================

test("Imports a valid Gmail application after user confirmation", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  const gmail = mockImportEmail(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 201);
  assert.equal(db.savedApplications.length, 1);
  assert.equal(gmail.mock.callCount(), 1);

  assert.equal(response.headers["cache-control"], "no-store");

  const saved = db.savedApplications[0];

  assert.equal(String(saved.userId), googleUser._id);
  assert.equal(saved.companyName, "Example Company");
  assert.equal(saved.jobTitle, "Software Engineer");
  assert.equal(saved.status, "Applied");

  assert.equal(saved.sourceGmailMessageId, "message-001");

  assert.equal(saved.applicationDate.toISOString(), "2026-06-15T00:00:00.000Z");

  assert.equal(saved.body, undefined);
  assert.equal(saved.snippet, undefined);
  assert.equal(saved.access_token, undefined);

  const [options] = gmail.mock.calls[0].arguments;

  assert.equal(
    options.url,
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/message-001",
  );

  assert.equal(options.method, "GET");
  assert.equal(options.params.format, "full");
});

test("Gmail import preserves user-edited application details", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  mockImportEmail(t);

  const response = await agent.post("/api/gmail/import").send(
    createImportPayload({
      companyName: "  Corrected Company  ",
      jobTitle: "Junior Software Engineer",
      applicationDate: "2026-06-14",
      status: "Interview",
    }),
  );

  assert.equal(response.status, 201);
  assert.equal(db.savedApplications.length, 1);

  const saved = db.savedApplications[0];

  assert.equal(saved.companyName, "Corrected Company");
  assert.equal(saved.jobTitle, "Junior Software Engineer");
  assert.equal(saved.status, "Interview");

  assert.equal(saved.applicationDate.toISOString(), "2026-06-14T00:00:00.000Z");

  assert.equal(saved.sourceGmailMessageId, "message-001");
});

test("Gmail import scopes duplicate lookup to authenticated user", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  mockImportEmail(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 201);
  assert.equal(db.lookups.length, 1);

  assert.equal(String(db.lookups[0].userId), googleUser._id);

  assert.equal(db.lookups[0].sourceGmailMessageId, "message-001");

  assert.equal(String(db.savedApplications[0].userId), googleUser._id);
});

// ===============================
// Gmail Import Error Handling
// ===============================

test("Gmail import handles expired or revoked Gmail authorization", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  mockImportGmailError(t, 401);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 403);

  assert.equal(
    response.body.message,
    "Gmail access failed. Reconnect Gmail and retry.",
  );

  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import handles upstream Gmail API failures", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockImportDatabase(t);

  mockImportGmailError(t, 503);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 502);
  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import handles database save failures", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const db = mockImportDatabase(t, {
    saveError: new Error("Database unavailable"),
  });

  mockImportEmail(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 500);

  assert.equal(response.body.message, "Failed to import application.");

  assert.equal(db.savedApplications.length, 0);
});

test("Gmail import handles database lookup failures", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const db = mockImportDatabase(t, {
    lookupError: new Error("Database unavailable"),
  });

  const gmail = mockImportEmail(t);

  const response = await agent
    .post("/api/gmail/import")
    .send(createImportPayload());

  assert.equal(response.status, 500);
  assert.equal(gmail.mock.callCount(), 0);
  assert.equal(db.savedApplications.length, 0);
});

// ===============================
// Gmail Suggestions Test Helpers
// ===============================

function createScanEmail({
  id = "message-001",
  subject = "Application received for the role of Software Engineer at Example Company",
  from = "careers@example.com",
  body = "Thank you for applying for the Software Engineer position at Example Company.",
  receivedAt = "2026-06-15T12:00:00.000Z",
} = {}) {
  return {
    id,
    threadId: `thread-${id}`,
    internalDate: String(Date.parse(receivedAt)),
    snippet: body,
    payload: {
      mimeType: "text/plain",
      headers: [
        {
          name: "Subject",
          value: subject,
        },
        {
          name: "From",
          value: from,
        },
      ],
      body: {
        data: Buffer.from(body).toString("base64url"),
      },
    },
  };
}

function mockSuggestionDatabase(
  t,
  { applications = [], lookupError = null } = {},
) {
  const queries = [];
  const selectedFields = [];
  let writeCount = 0;

  t.mock.method(Application, "find", (query) => {
    queries.push(query);

    return {
      select(fields) {
        selectedFields.push(fields);

        return this;
      },

      async lean() {
        if (lookupError) {
          throw lookupError;
        }

        return applications;
      },
    };
  });

  function rejectWrite() {
    writeCount++;

    throw new Error("Suggestions must not modify applications");
  }

  t.mock.method(Application.prototype, "save", async () => rejectWrite());

  t.mock.method(Application, "create", async () => rejectWrite());

  t.mock.method(Application, "updateOne", async () => rejectWrite());

  t.mock.method(Application, "deleteOne", async () => rejectWrite());

  return {
    queries,
    selectedFields,

    get writeCount() {
      return writeCount;
    },
  };
}

function mockSuggestionScan(t, emails = [], { hasMore = false } = {}) {
  return t.mock.method(OAuth2Client.prototype, "request", async (options) => {
    if (options.url.endsWith("/messages")) {
      return {
        data: {
          messages: emails.map((email) => ({
            id: email.id,
            threadId: email.threadId,
          })),
          ...(hasMore ? { nextPageToken: "next-page-token" } : {}),
        },
      };
    }

    const email = emails.find((item) =>
      options.url.endsWith(`/${encodeURIComponent(item.id)}`),
    );

    assert.ok(email, "Unexpected Gmail message request");

    return {
      data: email,
    };
  });
}

// ===============================
// Gmail Suggestions Authentication
// ===============================

test("Unauthenticated users cannot scan Gmail suggestions", async (t) => {
  const db = mockSuggestionDatabase(t);
  const gmail = mockSuggestionScan(t);

  const response = await request(makeApp()).get("/api/gmail/suggestions");

  assert.equal(response.status, 401);
  assert.equal(db.queries.length, 0);
  assert.equal(db.writeCount, 0);
  assert.equal(gmail.mock.callCount(), 0);
});

test("Guest users cannot scan Gmail suggestions", async (t) => {
  const agent = await loginAs(t, guestUser, makeApp());

  const db = mockSuggestionDatabase(t);
  const gmail = mockSuggestionScan(t);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 403);
  assert.equal(db.queries.length, 0);
  assert.equal(db.writeCount, 0);
  assert.equal(gmail.mock.callCount(), 0);
});

test("Google users must connect Gmail before scanning suggestions", async (t) => {
  const agent = await loginAs(t, googleUser, makeApp());

  const db = mockSuggestionDatabase(t);
  const gmail = mockSuggestionScan(t);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 403);
  assert.equal(response.body.message, "Connect Gmail first.");

  assert.equal(db.queries.length, 0);
  assert.equal(db.writeCount, 0);
  assert.equal(gmail.mock.callCount(), 0);
});

// ===============================
// Gmail Suggestions Responses
// ===============================

test("Returns empty suggestions for an empty Gmail scan", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  const gmail = mockSuggestionScan(t);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);

  assert.deepEqual(response.body, {
    scannedCount: 0,
    suggestionCount: 0,
    alreadyImportedCount: 0,
    possibleDuplicateCount: 0,
    excludedCount: 0,
    suggestions: [],
    hasMore: false,
  });

  assert.equal(gmail.mock.callCount(), 1);
  assert.equal(db.writeCount, 0);
});

test("Returns a complete application suggestion through the API", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  const gmail = mockSuggestionScan(t, [createScanEmail()]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.scannedCount, 1);
  assert.equal(response.body.suggestionCount, 1);
  assert.equal(response.body.alreadyImportedCount, 0);
  assert.equal(response.body.possibleDuplicateCount, 0);
  assert.equal(response.body.excludedCount, 0);
  assert.equal(response.body.hasMore, false);

  const suggestion = response.body.suggestions[0];

  assert.equal(suggestion.messageId, "message-001");
  assert.equal(suggestion.companyName, "Example Company");
  assert.equal(suggestion.jobTitle, "Software Engineer");
  assert.equal(suggestion.applicationDate, "2026-06-15");
  assert.equal(suggestion.status, "Applied");
  assert.equal(suggestion.confidence, "high");

  assert.deepEqual(suggestion.duplicate, {
    duplicate: false,
    reason: null,
    applicationId: null,
  });

  assert.equal(gmail.mock.callCount(), 2);
  assert.equal(db.writeCount, 0);
});

test("Returns incomplete suggestions for user review", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockSuggestionScan(t, [
    createScanEmail({
      subject: "Thank you for applying to Example Company",
      body: "Thank you for applying to Example Company.",
    }),
  ]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.suggestionCount, 1);

  const suggestion = response.body.suggestions[0];

  assert.equal(suggestion.companyName, "Example Company");
  assert.equal(suggestion.jobTitle, "");
  assert.equal(suggestion.confidence, "low");

  assert.ok(suggestion.warnings.includes("missing_job_title"));

  assert.equal(db.writeCount, 0);
});

test("Reports additional Gmail results through hasMore", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockSuggestionScan(t, [createScanEmail()], { hasMore: true });

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.hasMore, true);
  assert.equal(db.writeCount, 0);
});

// ===============================
// Gmail Suggestions Duplicate Filtering
// ===============================

test("Suggestions API excludes previously imported messages", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const db = mockSuggestionDatabase(t, {
    applications: [
      {
        _id: "application-001",
        sourceGmailMessageId: "message-001",
        companyName: "Edited Company",
        jobTitle: "Edited Position",
        applicationDate: new Date("2026-06-20"),
      },
    ],
  });

  mockSuggestionScan(t, [createScanEmail()]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.scannedCount, 1);
  assert.equal(response.body.suggestionCount, 0);
  assert.equal(response.body.alreadyImportedCount, 1);
  assert.equal(response.body.excludedCount, 0);

  assert.deepEqual(response.body.suggestions, []);

  assert.equal(db.writeCount, 0);
});

test("Suggestions API preserves possible duplicate warnings", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const db = mockSuggestionDatabase(t, {
    applications: [
      {
        _id: "application-001",
        companyName: "Example Company",
        jobTitle: "Software Engineer",
        applicationDate: new Date("2026-06-15"),
      },
    ],
  });

  mockSuggestionScan(t, [createScanEmail()]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.suggestionCount, 1);
  assert.equal(response.body.possibleDuplicateCount, 1);

  assert.deepEqual(response.body.suggestions[0].duplicate, {
    duplicate: true,
    reason: "matching_application",
    applicationId: "application-001",
  });

  assert.equal(db.writeCount, 0);
});

test("Suggestions API allows applications on different dates", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const db = mockSuggestionDatabase(t, {
    applications: [
      {
        _id: "application-001",
        companyName: "Example Company",
        jobTitle: "Software Engineer",
        applicationDate: new Date("2026-02-22"),
      },
    ],
  });

  mockSuggestionScan(t, [createScanEmail()]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.suggestionCount, 1);
  assert.equal(response.body.possibleDuplicateCount, 0);

  assert.equal(response.body.suggestions[0].duplicate.duplicate, false);

  assert.equal(db.writeCount, 0);
});

// ===============================
// Gmail Suggestions Classification
// ===============================

test("Suggestions API excludes non-job and follow-up emails", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockSuggestionScan(t, [
    createScanEmail({
      id: "scholarship-001",
      subject: "Scholarship Application Received",
      from: "scholarship@example.org",
      body: "Thank you for your scholarship application.",
    }),

    createScanEmail({
      id: "interview-001",
      subject: "First Round Interview",
      body: "We invite you to an interview.",
    }),
  ]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.scannedCount, 2);
  assert.equal(response.body.excludedCount, 2);
  assert.equal(response.body.suggestionCount, 0);
  assert.equal(db.writeCount, 0);
});

test("Suggestions API uses stored blocked sender preferences", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  t.mock.method(User, "findById", async () => ({
    ...googleUser,
    emailDetectionPreferences: {
      trustedSenders: ["example.com"],
      blockedSenders: ["example.com"],
    },
  }));

  mockSuggestionScan(t, [createScanEmail()]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.suggestionCount, 0);
  assert.equal(response.body.excludedCount, 1);
  assert.equal(db.writeCount, 0);
});

test("Suggestions API uses stored trusted sender preferences", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  t.mock.method(User, "findById", async () => ({
    ...googleUser,
    emailDetectionPreferences: {
      trustedSenders: ["example.org"],
      blockedSenders: [],
    },
  }));

  mockSuggestionScan(t, [
    createScanEmail({
      subject: "Application received",
      from: "notifications@example.org",
      body: "Thank you for applying.",
    }),
  ]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.suggestionCount, 1);
  assert.equal(response.body.excludedCount, 0);
  assert.equal(db.writeCount, 0);
});

// ===============================
// Gmail Suggestions Security & Privacy
// ===============================

test("Suggestions API queries only authenticated user's applications", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockSuggestionScan(t, [createScanEmail()]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);

  assert.equal(db.queries.length, 1);

  assert.deepEqual(db.queries[0], {
    userId: googleUser._id,
  });

  assert.equal(
    db.selectedFields[0],
    "_id companyName jobTitle applicationDate sourceGmailMessageId",
  );

  assert.equal(db.writeCount, 0);
});

test("Suggestions API does not expose private Gmail data", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockSuggestionScan(t, [createScanEmail()]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);

  assert.equal(response.headers["cache-control"], "no-store");

  const suggestion = response.body.suggestions[0];

  const privateFields = [
    "body",
    "snippet",
    "subject",
    "from",
    "payload",
    "access_token",
    "refresh_token",
  ];

  for (const field of privateFields) {
    assert.equal(Object.hasOwn(suggestion, field), false);
  }

  const serialized = JSON.stringify(response.body);

  assert.ok(!serialized.includes("test-access-token"));

  assert.ok(!serialized.includes("test-refresh-token"));

  assert.equal(db.writeCount, 0);
});

test("Scanning suggestions never automatically saves applications", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockSuggestionScan(t, [
    createScanEmail({
      id: "message-001",
    }),

    createScanEmail({
      id: "message-002",
      receivedAt: "2026-06-16T12:00:00.000Z",
    }),
  ]);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 200);
  assert.equal(response.body.suggestionCount, 2);
  assert.equal(db.writeCount, 0);
});

// ===============================
// Gmail Suggestions Error Handling
// ===============================

test("Suggestions API handles expired Gmail authorization", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockImportGmailError(t, 401);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 403);

  assert.equal(
    response.body.message,
    "Gmail access failed. Reconnect Gmail and retry.",
  );

  assert.equal(db.writeCount, 0);
});

test("Suggestions API handles upstream Gmail failures", async (t) => {
  const agent = await loginWithGmail(t, makeApp());
  const db = mockSuggestionDatabase(t);

  mockImportGmailError(t, 503);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 502);

  assert.equal(response.body.message, "Failed to scan Gmail emails.");

  assert.equal(db.writeCount, 0);
});

test("Suggestions API handles database lookup failures", async (t) => {
  const agent = await loginWithGmail(t, makeApp());

  const db = mockSuggestionDatabase(t, {
    lookupError: new Error("Database unavailable"),
  });

  const gmail = mockSuggestionScan(t);

  const response = await agent.get("/api/gmail/suggestions");

  assert.equal(response.status, 500);

  assert.equal(
    response.body.message,
    "Failed to generate application suggestions.",
  );

  assert.equal(gmail.mock.callCount(), 0);
  assert.equal(db.writeCount, 0);
});
