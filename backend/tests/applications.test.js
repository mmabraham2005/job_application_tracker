const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const session = require("express-session");

const User = require("../src/models/User");
const Application = require("../src/models/Application");
const createApp = require("../src/app");

test("Authenticated guest can perform application CRUD operations", async (t) => {
  const originalCreate = User.create;
  const originalFindById = User.findById;
  const originalSave = Application.prototype.save;
  const originalFind = Application.find;
  const originalFindOne = Application.findOne;
  const originalFindOneAndDelete = Application.findOneAndDelete;

  const fakeUser = {
    _id: "507f1f77bcf86cd799439011",
    authProvider: "guest",
    displayName: "Guest",
  };

  const applications = new Map();

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

  Application.findOneAndDelete = async (query) => {
    const saved = applications.get(query._id.toString());

    if (!saved || saved.userId.toString() !== query.userId.toString()) {
      return null;
    }

    applications.delete(query._id.toString());

    return saved;
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

  t.after(() => {
    User.create = originalCreate;
    User.findById = originalFindById;
    Application.prototype.save = originalSave;
    Application.find = originalFind;
    Application.findOne = originalFindOne;
    Application.findOneAndDelete = originalFindOneAndDelete;
  });

  const app = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-only-session-secret",
  });

  const agent = request.agent(app);

  const login = await agent.post("/api/auth/guest");
  assert.equal(login.status, 201);

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

  const getResponse = await agent.get("/api/applications");

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.length, 1);
  assert.equal(getResponse.body[0].companyName, "Google");
  assert.equal(getResponse.body[0].jobTitle, "Software Engineer Intern");
  assert.equal(getResponse.body[0].userId, fakeUser._id);

  const applicationId = response.body._id;

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

  const deleteResponse = await agent.delete(
    `/api/applications/${applicationId}`,
  );

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.message, "Application deleted successfully");
  assert.equal(deleteResponse.body.application._id, applicationId);
  assert.equal(applications.size, 0);

  // Verify the deleted application no longer appears
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
