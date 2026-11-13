const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");
const mongoose = require("mongoose");

const Reminder = require("../src/models/Reminder");
const User = require("../src/models/User");
const Application = require("../src/models/Application");
const createApp = require("../src/app");

test("Authenticated guest can perform application CRUD operations", async (t) => {
  const originalCreate = User.create;
  const originalFindById = User.findById;
  const originalSave = Application.prototype.save;
  const originalFind = Application.find;
  const originalFindOne = Application.findOne;

  const fakeUser = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "guest",
    displayName: "Guest",
  };

  const applications = new Map();

  // This application has no reminders.
  // Prevent the controller from querying a real MongoDB database.
  t.mock.method(Reminder, "find", async () => []);

  // The controller now deletes through the application document.
  t.mock.method(Application.prototype, "deleteOne", async function () {
    const deleted = applications.delete(this._id.toString());

    return {
      acknowledged: true,
      deletedCount: deleted ? 1 : 0,
    };
  });

  // Restore manually replaced methods after the test.
  t.after(() => {
    User.create = originalCreate;
    User.findById = originalFindById;
    Application.prototype.save = originalSave;
    Application.find = originalFind;
    Application.findOne = originalFindOne;
  });

  Application.find = async (query) => {
    return [...applications.values()].filter(
      (application) =>
        application.userId.toString() === query.userId.toString(),
    );
  };

  Application.findOne = async (query) => {
    const saved = applications.get(query._id.toString());

    if (!saved || saved.userId.toString() !== query.userId.toString()) {
      return null;
    }

    return new Application(saved);
  };

  User.create = async () => fakeUser;

  User.findById = async (id) => {
    return id.toString() === fakeUser._id ? fakeUser : null;
  };

  Application.prototype.save = async function () {
    await this.validate();

    applications.set(this._id.toString(), this.toObject());

    return this;
  };

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  // Log in as a guest.
  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  // Create an application.
  const response = await agent.post("/api/applications").send({
    companyName: "Google",
    jobTitle: "Software Engineer Intern",
    applicationDate: "2026-10-30",
    status: "Applied",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.companyName, "Google");
  assert.equal(response.body.jobTitle, "Software Engineer Intern");
  assert.equal(response.body.status, "Applied");
  assert.equal(response.body.userId, fakeUser._id);
  assert.equal(applications.size, 1);

  // Retrieve the saved application.
  const getResponse = await agent.get("/api/applications");

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.length, 1);
  assert.equal(getResponse.body[0].companyName, "Google");
  assert.equal(getResponse.body[0].jobTitle, "Software Engineer Intern");
  assert.equal(getResponse.body[0].userId, fakeUser._id);

  const applicationId = response.body._id;

  // Update application details.
  const updateResponse = await agent
    .patch(`/api/applications/${applicationId}`)
    .send({
      companyName: "Microsoft",
      jobTitle: "Backend Engineer Intern",
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.companyName, "Microsoft");
  assert.equal(updateResponse.body.jobTitle, "Backend Engineer Intern");
  assert.equal(updateResponse.body.status, "Applied");

  const getAfterUpdate = await agent.get("/api/applications");

  assert.equal(getAfterUpdate.status, 200);
  assert.equal(getAfterUpdate.body.length, 1);
  assert.equal(getAfterUpdate.body[0]._id, applicationId);
  assert.equal(getAfterUpdate.body[0].companyName, "Microsoft");
  assert.equal(getAfterUpdate.body[0].jobTitle, "Backend Engineer Intern");

  // Update the application status.
  const statusResponse = await agent
    .patch(`/api/applications/${applicationId}/status`)
    .send({
      status: "Interview",
    });

  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.body.status, "Interview");
  assert.equal(statusResponse.body._id, applicationId);

  const getAfterStatusUpdate = await agent.get("/api/applications");

  assert.equal(getAfterStatusUpdate.status, 200);
  assert.equal(getAfterStatusUpdate.body.length, 1);
  assert.equal(getAfterStatusUpdate.body[0].status, "Interview");

  // Delete the application.
  const deleteResponse = await agent.delete(
    `/api/applications/${applicationId}`,
  );

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.message, "Application deleted successfully");
  assert.equal(deleteResponse.body.application._id, applicationId);
  assert.equal(applications.size, 0);

  // Verify the deleted application no longer appears.
  const getAfterDelete = await agent.get("/api/applications");

  assert.equal(getAfterDelete.status, 200);
  assert.equal(getAfterDelete.body.length, 0);
});

test("Unauthenticated users cannot access application APIs", async () => {
  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const applicationId = "507f1f77bcf86cd799439012";

  const responses = [
    await request(app).get("/api/applications"),

    await request(app).post("/api/applications").send({
      companyName: "Google",
      jobTitle: "Software Engineer Intern",
      applicationDate: "2026-10-30",
      status: "Applied",
    }),

    await request(app)
      .patch(`/api/applications/${applicationId}`)
      .send({ companyName: "Microsoft" }),

    await request(app)
      .patch(`/api/applications/${applicationId}/status`)
      .send({ status: "Interview" }),

    await request(app).delete(`/api/applications/${applicationId}`),
  ];

  for (const response of responses) {
    assert.equal(response.status, 401);
    assert.equal(response.body.message, "Not authenticated");
  }
});

test("Invalid application IDs return 400", async (t) => {
  const originalCreate = User.create;
  const originalFindById = User.findById;

  const fakeUser = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "guest",
    displayName: "Guest",
  };

  t.after(() => {
    User.create = originalCreate;
    User.findById = originalFindById;
  });

  User.create = async () => fakeUser;

  User.findById = async (id) =>
    id.toString() === fakeUser._id ? fakeUser : null;

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  // Authenticate before testing application validation.
  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  const invalidId = "not-a-valid-id";

  const responses = [
    await agent
      .patch(`/api/applications/${invalidId}`)
      .send({ companyName: "Microsoft" }),

    await agent
      .patch(`/api/applications/${invalidId}/status`)
      .send({ status: "Interview" }),

    await agent.delete(`/api/applications/${invalidId}`),
  ];

  for (const response of responses) {
    assert.equal(response.status, 400);
    assert.equal(response.body.message, "Invalid application ID");
  }
});

test("Invalid application data returns 400", async (t) => {
  const originalCreate = User.create;
  const originalFindById = User.findById;
  const originalSave = Application.prototype.save;

  const fakeUser = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "guest",
    displayName: "Guest",
  };

  t.after(() => {
    User.create = originalCreate;
    User.findById = originalFindById;
    Application.prototype.save = originalSave;
  });

  User.create = async () => fakeUser;

  User.findById = async (id) =>
    id.toString() === fakeUser._id ? fakeUser : null;

  Application.prototype.save = async function () {
    await this.validate();
    return this;
  };

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  // Reject an unsupported status.
  const invalidStatus = await agent.post("/api/applications").send({
    companyName: "Google",
    jobTitle: "Software Engineer Intern",
    applicationDate: "2026-10-30",
    status: "Unknown Status",
  });

  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.body.message, "Invalid application data");

  // Reject an application without a company name.
  const missingCompany = await agent.post("/api/applications").send({
    jobTitle: "Software Engineer Intern",
    applicationDate: "2026-10-30",
    status: "Applied",
  });

  assert.equal(missingCompany.status, 400);
  assert.equal(missingCompany.body.message, "Invalid application data");

  const applicationId = "507f1f77bcf86cd799439012";

  // Prevent changing application ownership through the update endpoint.
  const invalidUpdate = await agent
    .patch(`/api/applications/${applicationId}`)
    .send({ userId: fakeUser._id });

  assert.equal(invalidUpdate.status, 400);
  assert.equal(invalidUpdate.body.message, "Invalid update fields");

  // Reject an empty status.
  const invalidStatusUpdate = await agent
    .patch(`/api/applications/${applicationId}/status`)
    .send({ status: "" });

  assert.equal(invalidStatusUpdate.status, 400);
  assert.equal(invalidStatusUpdate.body.message, "Valid status is required");
});

test("Deleting an application preserves reminders when calendar cleanup fails", async (t) => {
  const originalUserCreate = User.create;
  const originalUserFindById = User.findById;
  const originalApplicationFindOne = Application.findOne;
  const originalReminderFind = Reminder.find;

  t.after(() => {
    User.create = originalUserCreate;
    User.findById = originalUserFindById;
    Application.findOne = originalApplicationFindOne;
    Reminder.find = originalReminderFind;
  });

  const userId = new mongoose.Types.ObjectId();
  const applicationId = new mongoose.Types.ObjectId();

  const user = {
    _id: userId,
    authProvider: "guest",
    displayName: "Guest",
  };

  let applicationDeleted = false;
  const deletedReminders = [];

  const application = {
    _id: applicationId,
    userId,
    async deleteOne() {
      applicationDeleted = true;
    },
  };

  const reminders = [
    {
      _id: new mongoose.Types.ObjectId(),
      userId,
      applicationId,
      // No linked Google event: cleanup succeeds.
      async deleteOne() {
        deletedReminders.push("first");
      },
    },
    {
      _id: new mongoose.Types.ObjectId(),
      userId,
      applicationId,
      googleEventId: "calendar-event-123",
      // No Calendar authorization in the guest session:
      // removeCalendarEvent will fail.
      async deleteOne() {
        deletedReminders.push("second");
      },
    },
  ];

  User.create = async () => user;
  User.findById = async () => user;

  Application.findOne = async (query) => {
    assert.equal(query._id.toString(), applicationId.toString());
    assert.equal(query.userId.toString(), userId.toString());
    return application;
  };

  Reminder.find = async (query) => {
    assert.equal(query.applicationId.toString(), applicationId.toString());
    assert.equal(query.userId.toString(), userId.toString());
    return reminders;
  };

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

  const response = await agent.delete(`/api/applications/${applicationId}`);

  // Calendar cleanup fails, so deletion must be rejected.
  assert.equal(response.status, 502);

  // The application must not be deleted.
  assert.equal(applicationDeleted, false);

  // No reminders should be deleted when cleanup fails.
  assert.deepEqual(deletedReminders, []);
});
