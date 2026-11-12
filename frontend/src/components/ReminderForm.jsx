import { useState } from "react";

function toLocalInput(value) {
  if (!value) return "";

  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function ReminderForm({
  application,
  reminder,
  user,
  onSave,
  onCancel,
}) {
  const [values, setValues] = useState({
    title: reminder?.title || `Follow up — ${application.companyName}`,
    type: reminder?.type || "follow_up",
    dueAt: toLocalInput(reminder?.dueAt),
    remindAt: toLocalInput(reminder?.remindAt),
    googleCalendar: reminder?.channels.googleCalendar || false,
    email: reminder?.channels.email || false,
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setValues((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const dueAt = new Date(values.dueAt);
    const remindAt = new Date(values.remindAt);

    if (
      !values.title.trim() ||
      Number.isNaN(dueAt.getTime()) ||
      Number.isNaN(remindAt.getTime())
    ) {
      setError("Enter a title and valid dates.");
      return;
    }

    if (remindAt.getTime() <= Date.now() || remindAt > dueAt) {
      setError("Reminder time must be in the future and at or before the task.");
      return;
    }

    setSaving(true);

    try {
      await onSave({
        title: values.title.trim(),
        type: values.type,
        dueAt: dueAt.toISOString(),
        remindAt: remindAt.toISOString(),
        channels: {
          googleCalendar: values.googleCalendar,
          email: values.email,
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="application-form" onSubmit={handleSubmit}>
      <h2>{reminder ? "Edit reminder" : "Add reminder"}</h2>

      <p>
        {application.companyName} — {application.jobTitle}
      </p>

      <div className="form-fields">
        <label>
          Title
          <input
            name="title"
            value={values.title}
            onChange={handleChange}
            maxLength={200}
            required
          />
        </label>

        <label>
          Type
          <select name="type" value={values.type} onChange={handleChange}>
            <option value="follow_up">Follow up</option>
            <option value="status_check">Check application status</option>
          </select>
        </label>

        <label>
          Scheduled time
          <input
            type="datetime-local"
            name="dueAt"
            value={values.dueAt}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Remind me at
          <input
            type="datetime-local"
            name="remindAt"
            value={values.remindAt}
            onChange={handleChange}
            required
          />
        </label>
      </div>

      <p>Times use your device’s local timezone.</p>

      <fieldset>
        <legend>Delivery preferences</legend>

        <label>
          <input
            type="checkbox"
            name="googleCalendar"
            checked={values.googleCalendar}
            onChange={handleChange}
          />
          Google Calendar
        </label>

        <label>
          <input
            type="checkbox"
            name="email"
            checked={values.email}
            onChange={handleChange}
            disabled={!user.email}
          />
          Email
        </label>

        {!user.email && <p>Sign in with Google to select email.</p>}

        <p>Google Calendar events sync when you save.</p>
        {values.email && user.email && (
          <p>Email reminders are sent to {user.email} at the reminder time.</p>
        )}
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save reminder"}
        </button>

        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default ReminderForm;
