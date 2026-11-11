const Application = require("../models/Application");
const Reminder = require("../models/Reminder");
const User = require("../models/User");

const POLL_MS = 15_000;
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 5;
// Keep all retries within Resend's 24-hour idempotency window.
const MAX_AGE_MS = 23 * 60 * 60 * 1000;
const activeReminder = { state: "pending", "channels.email": true };

async function buildMessage(reminder, from) {
  const [user, application] = await Promise.all([
    User.findOne({ _id: reminder.userId, authProvider: "google" }),
    Application.findOne({
      _id: reminder.applicationId,
      userId: reminder.userId,
    }),
  ]);

  if (!user?.email || !application) return null;

  const dueAt = reminder.dueAt.toISOString().replace("T", " ").slice(0, 16);
  return {
    from,
    to: [user.email],
    subject: `Job tracker reminder: ${reminder.title.replace(/[\r\n]+/g, " ")}`,
    text: [
      reminder.title,
      `${application.jobTitle} at ${application.companyName}`,
      `Scheduled for ${dueAt} UTC`,
    ].join("\n"),
  };
}

async function processDueEmail({ apiKey, from }) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const reminder = await Reminder.findOneAndUpdate(
    { ...activeReminder, "emailDelivery.nextAttemptAt": { $lte: now } },
    {
      $set: { "emailDelivery.nextAttemptAt": leaseUntil },
      $inc: { "emailDelivery.attempts": 1 },
    },
    {
      sort: { "emailDelivery.nextAttemptAt": 1 },
      returnDocument: "after",
    },
  ).select("+emailDelivery.message");

  if (!reminder) return false;

  const delivery = reminder.emailDelivery;
  const claim = {
    _id: reminder._id,
    "emailDelivery._id": delivery._id,
    "emailDelivery.nextAttemptAt": leaseUntil,
  };

  let outcome = "failed";
  if (delivery.attempts <= MAX_ATTEMPTS && now - reminder.remindAt < MAX_AGE_MS) {
    const message = delivery.message ?? (await buildMessage(reminder, from));
    if (message) {
      // Freeze the payload for retries and check that the claim is still active.
      const result = await Reminder.updateOne(
        { ...claim, ...activeReminder },
        { $set: { "emailDelivery.message": message } },
      );
      if (!result.matchedCount) return true;

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `job-tracker-reminder/${delivery._id}`,
          },
          body: JSON.stringify(message),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          outcome = "sent";
        } else if ([408, 409, 429].includes(response.status) || response.status >= 500) {
          outcome = "retry";
        }
        await response.body?.cancel().catch(() => {});
      } catch {
        outcome = "retry";
      }
    }
  }

  if (outcome === "retry" && delivery.attempts < MAX_ATTEMPTS) {
    const delay = POLL_MS * 2 ** delivery.attempts;
    await Reminder.updateOne(claim, {
      $set: { "emailDelivery.nextAttemptAt": new Date(Date.now() + delay) },
    });
  } else {
    const timestamp = outcome === "sent" ? "emailDelivery.sentAt" : "emailDelivery.failedAt";
    await Reminder.updateOne(claim, {
      $set: { [timestamp]: new Date() },
      $unset: { "emailDelivery.nextAttemptAt": "", "emailDelivery.message": "" },
    });
  }

  return true;
}

function startEmailReminderWorker() {
  const config = {
    apiKey: process.env.RESEND_API_KEY?.trim(),
    from: process.env.REMINDER_FROM_EMAIL?.trim(),
  };

  if (!config.apiKey || !config.from) {
    console.info("Email reminders are disabled. Set RESEND_API_KEY and REMINDER_FROM_EMAIL to enable delivery.");
    return;
  }

  async function poll() {
    try {
      for (let count = 0; count < 20; count += 1) {
        if (!(await processDueEmail(config))) break;
      }
    } catch {
      console.error("Email reminder worker could not finish processing. It will retry.");
    } finally {
      setTimeout(poll, POLL_MS).unref();
    }
  }

  void poll();
}

module.exports = { processDueEmail, startEmailReminderWorker };
