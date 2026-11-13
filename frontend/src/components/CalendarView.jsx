import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function CalendarView({
  reminders = [],
  loading = false,
  error = "",
  connectionControl = null,
}) {
  const [today] = useState(() => new Date());
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(today));

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const remindersByDate = useMemo(() => {
    const grouped = new Map();

    for (const reminder of reminders) {
      const key = localDateKey(reminder.dueAt);
      if (!key) continue;

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(reminder);
    }

    return grouped;
  }, [reminders]);

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();

  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();

  const calendarDays = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const selectedReminders = (remindersByDate.get(selectedDate) || [])
    .slice()
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  const upcomingReminders = reminders
    .filter(
      (reminder) =>
        reminder.state === "pending" &&
        new Date(reminder.dueAt).getTime() >= now,
    )
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 5);

  function changeMonth(offset) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);

    setMonth(next);
    setSelectedDate(localDateKey(next));
  }

  function goToToday() {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(localDateKey(now));
  }

  function selectDay(day) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    setSelectedDate(localDateKey(date));
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function applicationName(reminder) {
    return reminder.applicationId?.companyName || "Application";
  }

  return (
    <section
      id="calendar-view"
      className="dashboard-calendar"
      aria-labelledby="dashboard-calendar-title"
    >
      <div className="calendar-section-header">
        <div className="dashboard-section-heading">
          <h2 id="dashboard-calendar-title">Your Calendar</h2>
          <p>View upcoming application reminders at a glance.</p>
        </div>

        {connectionControl}
      </div>

      <div className="calendar-layout">
        <div className="mini-calendar">
          <div className="mini-calendar-header">
            <h3>
              {month.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h3>

            <div className="mini-calendar-navigation">
              <button type="button" onClick={goToToday}>
                Today
              </button>
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Previous month"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>

          <div className="mini-calendar-grid">
            {WEEKDAYS.map((day) => (
              <div className="mini-calendar-weekday" key={day}>
                {day}
              </div>
            ))}

            {calendarDays.map((day, index) => {
              if (day === null) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="mini-calendar-empty"
                    aria-hidden="true"
                  />
                );
              }

              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const key = localDateKey(date);
              const dailyReminders = remindersByDate.get(key) || [];
              const isSelected = key === selectedDate;
              const isToday = key === localDateKey(today);

              return (
                <button
                  key={key}
                  type="button"
                  className={[
                    "mini-calendar-day",
                    isSelected ? "is-selected" : "",
                    isToday ? "is-today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => selectDay(day)}
                  aria-pressed={isSelected}
                  aria-label={`${date.toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}, ${dailyReminders.length} reminders`}
                >
                  <span>{day}</span>
                  {dailyReminders.length > 0 && (
                    <span className="mini-calendar-dot" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="calendar-details">
          <h3>
            {selectedDate
              ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
                  "en-US",
                  { month: "long", day: "numeric", year: "numeric" },
                )
              : "Selected day"}
          </h3>

          {loading ? (
            <p className="calendar-empty-message">Loading reminders…</p>
          ) : error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : selectedReminders.length === 0 ? (
            <p className="calendar-empty-message">
              No reminders scheduled for this day.
            </p>
          ) : (
            <ul className="calendar-event-list">
              {selectedReminders.map((reminder) => (
                <li key={reminder._id}>
                  <span className="calendar-event-time">
                    {formatTime(reminder.dueAt)}
                  </span>
                  <strong>{reminder.title}</strong>
                  <span>{applicationName(reminder)}</span>
                  <span className="calendar-event-state">{reminder.state}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="calendar-upcoming">
        <div className="calendar-upcoming-heading">
          <h3>Upcoming Reminders</h3>
          <Link to="/reminders">Manage reminders</Link>
        </div>

        {!loading && !error && upcomingReminders.length === 0 && (
          <p className="calendar-empty-message">No upcoming reminders yet.</p>
        )}

        {!loading && !error && upcomingReminders.length > 0 && (
          <ul className="calendar-upcoming-list">
            {upcomingReminders.map((reminder) => (
              <li key={reminder._id}>
                <div>
                  <strong>{reminder.title}</strong>
                  <p>{applicationName(reminder)}</p>
                </div>
                <time dateTime={reminder.dueAt}>
                  {new Date(reminder.dueAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default CalendarView;
