const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function getClient(req) {
  const tokens = req.session.googleCalendar;

  if (!tokens?.access_token) {
    throw new Error("Connect Google Calendar first.");
  }

  const client = new OAuth2Client(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  );

  client.setCredentials(tokens);

  return client;
}

async function calendarRequest(req, options) {
  const client = getClient(req);

  try {
    // The client automatically refreshes expired access tokens.
    return await client.request(options);
  } finally {
    // Keep refreshed credentials in the server-side session.
    req.session.googleCalendar = {
      ...req.session.googleCalendar,
      ...client.credentials,
    };

    await saveSession(req);
  }
}

function getStatus(error) {
  return Number(error.response?.status || error.code);
}

async function removeCalendarEvent(req, reminder) {
  if (!reminder.googleEventId) return;

  try {
    await calendarRequest(req, {
      url: `${EVENTS_URL}/${encodeURIComponent(reminder.googleEventId)}`,
      method: "DELETE",
    });
  } catch (error) {
    // Already deleted or absent: there is nothing left to remove.
    if (![404, 410].includes(getStatus(error))) throw error;
  }

  reminder.googleEventId = undefined;
  reminder.googleEventUrl = undefined;
}

async function syncCalendarEvent(req, reminder) {
  // Unchecking Calendar removes an existing linked event.
  if (!reminder.channels.googleCalendar) {
    await removeCalendarEvent(req, reminder);
    return;
  }

  const start = new Date(reminder.dueAt);
  const end = new Date(start.getTime() + 15 * 60 * 1000);

  const minutesBefore = Math.round(
    (start.getTime() - new Date(reminder.remindAt).getTime()) / 60000,
  );

  if (minutesBefore < 0 || minutesBefore > 40320) {
    throw new Error(
      "Calendar reminder time must be within four weeks before the task.",
    );
  }

  const event = {
    summary: reminder.title,
    description:
      `Job Application Tracker\n` +
      `Reminder type: ${reminder.type.replaceAll("_", " ")}\n` +
      `Reference: ${reminder._id}`,
    start: {
      dateTime: start.toISOString(),
    },
    end: {
      dateTime: end.toISOString(),
    },
    reminders: {
      useDefault: false,
      overrides:
        reminder.state === "completed"
          ? []
          : [{ method: "popup", minutes: minutesBefore }],
    },
  };

  // Save an ID before contacting Google, so retrying the same
  // reminder does not insert a second event.
  if (!reminder.googleEventId) {
    reminder.googleEventId = crypto.randomBytes(16).toString("hex");
    await reminder.save();
  }

  const eventUrl =
    `${EVENTS_URL}/${encodeURIComponent(reminder.googleEventId)}`;

  let response;

  try {
    response = await calendarRequest(req, {
      url: eventUrl,
      method: "PATCH",
      data: event,
    });
  } catch (error) {
    if (getStatus(error) !== 404) throw error;

    try {
      response = await calendarRequest(req, {
        url: EVENTS_URL,
        method: "POST",
        data: {
          id: reminder.googleEventId,
          ...event,
        },
      });
    } catch (insertError) {
      // Another retry may already have created this event.
      if (getStatus(insertError) !== 409) throw insertError;

      response = await calendarRequest(req, {
        url: eventUrl,
        method: "PATCH",
        data: event,
      });
    }
  }

  reminder.googleEventUrl = response.data.htmlLink;
}

async function syncAndSaveCalendar(req, reminder) {
  try {
    await syncCalendarEvent(req, reminder);
    reminder.calendarSyncError = undefined;
  } catch (error) {
    const status = getStatus(error);

    // Do not store raw Google responses or tokens.
    reminder.calendarSyncError =
      status === 401 || status === 403
        ? "Calendar access failed. Reconnect Google Calendar and retry."
        : error.message === "Connect Google Calendar first."
          ? error.message
          : "Calendar sync failed. Check the connection and retry.";

    console.error("Calendar sync failed:", status || "request error");
  }

  await reminder.save();
}

module.exports = {
  syncAndSaveCalendar,
  removeCalendarEvent,
};