const assert = require("node:assert/strict");
const test = require("node:test");
const Application = require("../src/models/Application");
const Reminder = require("../src/models/Reminder");
const User = require("../src/models/User");
const { updateReminder } = require("../src/controllers/reminderController");
const { processDueEmail } = require("../src/services/emailReminderService");

test("Saving a legacy reminder activates email and rescheduling replaces the delivery", async (t) => {
  const remindAt = new Date(Date.now() + 60_000);
  const details = {
    title: "Follow up",
    type: "follow_up",
    dueAt: new Date(Date.now() + 180_000).toISOString(),
    remindAt: remindAt.toISOString(),
    channels: { email: true, googleCalendar: false },
  };
  const reminder = new Reminder(details);
  t.mock.method(Reminder, "findOne", async () => reminder);
  t.mock.method(reminder, "save", async () => reminder);
  t.mock.method(reminder, "populate", async () => reminder);

  const req = {
    body: details,
    params: { id: reminder._id.toString() },
    user: { email: "owner@example.com" },
  };
  const res = { json: (body) => body };

  assert.equal(reminder.emailDelivery, undefined);
  await updateReminder(req, res);
  assert.deepEqual(reminder.emailDelivery.nextAttemptAt, remindAt);
  const deliveryId = reminder.emailDelivery._id.toString();

  await updateReminder(req, res);
  assert.equal(reminder.emailDelivery._id.toString(), deliveryId);

  req.body = { ...details, remindAt: details.dueAt };
  await updateReminder(req, res);
  assert.notEqual(reminder.emailDelivery._id.toString(), deliveryId);
  assert.equal(reminder.emailDelivery.nextAttemptAt.toISOString(), details.dueAt);

  req.body = { ...details, channels: { email: false, googleCalendar: false } };
  await updateReminder(req, res);
  assert.equal(reminder.emailDelivery, undefined);
});

test("The worker retries with the same message and records provider acceptance", async (t) => {
  const reminder = new Reminder({
    title: "Check status",
    dueAt: new Date(Date.now() + 60_000),
    remindAt: new Date(Date.now() - 1000),
    emailDelivery: {},
  });
  const claim = t.mock.method(Reminder, "findOneAndUpdate", () => ({
    select: async () => {
      reminder.emailDelivery.attempts += 1;
      return reminder;
    },
  }));
  const update = t.mock.method(Reminder, "updateOne", async (_filter, changes) => {
    const message = changes.$set["emailDelivery.message"];
    if (message) reminder.emailDelivery.message = message;
    return { matchedCount: 1 };
  });
  t.mock.method(User, "findOne", async () => ({ email: "owner@example.com" }));
  t.mock.method(Application, "findOne", async () => ({
    companyName: "Example Co",
    jobTitle: "Developer",
  }));
  const statuses = [503, 200];
  const send = t.mock.method(globalThis, "fetch", async () =>
    new Response(null, { status: statuses.shift() }),
  );
  const config = { apiKey: "test-key", from: "reminders@example.com" };

  await processDueEmail(config);
  const [claimFilter] = claim.mock.calls[0].arguments;
  assert.equal(claimFilter.state, "pending");
  assert.equal(claimFilter["channels.email"], true);
  assert.ok(update.mock.calls[1].arguments[1].$set["emailDelivery.nextAttemptAt"]);

  await processDueEmail(config);
  const [, first] = send.mock.calls[0].arguments;
  const [, second] = send.mock.calls[1].arguments;
  assert.deepEqual(JSON.parse(first.body).to, ["owner@example.com"]);
  assert.equal(second.body, first.body);
  assert.equal(second.headers["Idempotency-Key"], first.headers["Idempotency-Key"]);
  assert.ok(update.mock.calls[3].arguments[1].$set["emailDelivery.sentAt"]);

  // A completed, disabled, deleted, or rescheduled reminder fails the pre-send check.
  update.mock.mockImplementation(async () => ({ matchedCount: 0 }));
  await processDueEmail(config);
  assert.equal(send.mock.callCount(), 2);
});
