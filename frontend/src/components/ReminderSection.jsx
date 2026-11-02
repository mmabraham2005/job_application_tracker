import { useEffect, useState } from "react";
import ReminderForm from "./ReminderForm";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  retryCalendarSync,
} from "../services/ReminderApi";

function ReminderSection({ applications, user }) {
  const [reminders, setReminders] = useState([]);
  const [applicationId, setApplicationId] = useState("");
  const [editor, setEditor] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;

    getReminders()
      .then((data) => {
        if (active) setReminders(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Hide reminders for applications removed from the dashboard.
  const ownedIds = new Set(applications.map((app) => app._id));

  const visibleReminders = reminders
    .filter((reminder) => ownedIds.has(reminder.applicationId?._id))
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  function openNewReminder() {
    const application = applications.find(
      (app) => app._id === applicationId,
    );

    if (application) {
      setEditor({ application, reminder: null });
    }
  }

  async function handleSave(values) {
    if (editor.reminder) {
      const updated = await updateReminder(editor.reminder._id, values);

      setReminders((previous) =>
        previous.map((item) => item._id === updated._id ? updated : item),
      );
    } else {
      const created = await createReminder({
        applicationId: editor.application._id,
        ...values,
      });

      setReminders((previous) => [...previous, created]);
    }

    setEditor(null);
  }

  async function handleAction(reminder, action) {
    setError("");
    setBusyId(reminder._id);

    try {
      if (action === "delete") {
        await deleteReminder(reminder._id);

        setReminders((previous) =>
          previous.filter((item) => item._id !== reminder._id),
        );
      } else {
        const updated = await updateReminder(reminder._id, {
          state: reminder.state === "pending" ? "completed" : "pending",
        });

        setReminders((previous) =>
          previous.map((item) => item._id === updated._id ? updated : item),
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }
  async function handleCalendarRetry(id) {
  setError("");
  setBusyId(id);

  try {
    const updated = await retryCalendarSync(id);

    setReminders((previous) =>
      previous.map((item) =>
        item._id === updated._id ? updated : item,
      ),
    );
  } catch (err) {
    setError(err.message);
  } finally {
    setBusyId(null);
  }
}

  return (
  <section className="reminders">
    <h2>Reminders</h2>

    <div className="toolbar">
      <select
        aria-label="Application for reminder"
        value={applicationId}
        onChange={(event) => setApplicationId(event.target.value)}
      >
        <option value="">Select an application</option>

        {applications.map((app) => (
          <option key={app._id} value={app._id}>
            {app.companyName} — {app.jobTitle}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={openNewReminder}
        disabled={!applicationId}
      >
        Add reminder
      </button>
    </div>

    {editor && (
      <ReminderForm
        key={editor.reminder?._id || editor.application._id}
        application={editor.application}
        reminder={editor.reminder}
        user={user}
        onSave={handleSave}
        onCancel={() => setEditor(null)}
      />
    )}

    {error && (
      <p className="error" role="alert">
        {error}
      </p>
    )}

    {loading ? (
      <p>Loading reminders…</p>
    ) : visibleReminders.length === 0 ? (
      <p>No reminders yet.</p>
    ) : (
      <ul>
        {visibleReminders.map((reminder) => (
          <li key={reminder._id}>
            <strong>{reminder.title}</strong>

            <p>
              {reminder.applicationId.companyName}
              {" — "}
              {new Date(reminder.dueAt).toLocaleString()}
            </p>

            <p>
              Remind at: {new Date(reminder.remindAt).toLocaleString()}
              {" · "}
              {reminder.state}
            </p>

            {reminder.calendarSyncError && (
              <div className="error" role="alert">
                <p>{reminder.calendarSyncError}</p>

                <button
                  type="button"
                  disabled={busyId === reminder._id}
                  onClick={() => handleCalendarRetry(reminder._id)}
                >
                  {busyId === reminder._id
                    ? "Processing…"
                    : "Retry calendar sync"}
                </button>
              </div>
            )}

            {reminder.channels?.googleCalendar &&
              reminder.googleEventUrl &&
              !reminder.calendarSyncError && (
                <p>
                  <a
                    href={reminder.googleEventUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Google Calendar
                  </a>
                </p>
              )}

            <button
              type="button"
              disabled={busyId === reminder._id}
              onClick={() =>
                setEditor({
                  application: reminder.applicationId,
                  reminder,
                })
              }
            >
              Edit
            </button>

            <button
              type="button"
              disabled={busyId === reminder._id}
              onClick={() => handleAction(reminder, "toggle")}
            >
              {reminder.state === "pending" ? "Complete" : "Reopen"}
            </button>

            <button
              type="button"
              disabled={busyId === reminder._id}
              onClick={() => handleAction(reminder, "delete")}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
}

export default ReminderSection;