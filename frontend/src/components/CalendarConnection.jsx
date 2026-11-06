import { useEffect, useState } from "react";

function CalendarConnection({ user }) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const result = new URLSearchParams(window.location.search).get("calendar");
  const isGoogleUser = user.authProvider === "google";

  useEffect(() => {
    if (!isGoogleUser) return;

    let active = true;

    async function checkConnection() {
      try {
        const response = await fetch("/api/calendar/status");

        if (!response.ok) {
          throw new Error("Could not check calendar connection.");
        }

        const data = await response.json();

        if (active) setConnected(data.connected);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    checkConnection();

    return () => {
      active = false;
    };
  }, [isGoogleUser]);

  const statusText = !isGoogleUser
    ? "Google sign-in required"
    : loading
      ? "Checking connection..."
      : error
        ? "Connection status unavailable"
        : connected
          ? "Connected"
          : "Not connected";

  return (
    <section className="calendar-connection" aria-labelledby="calendar-title">
      <div className="calendar-content">
        <div className="calendar-icon" aria-hidden="true">
          <svg
            width="25"
            height="25"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M7 3v4M17 3v4M3 10h18" />
            <path d="m9 16 2 2 4-4" />
          </svg>
        </div>

        <div className="calendar-info">
          <h2 id="calendar-title">Google Calendar</h2>
          <p>Keep your application reminders in sync with your calendar.</p>
        </div>
      </div>

      <div className="calendar-action">
        <span
          className={`calendar-status ${
            connected && isGoogleUser && !error ? "is-connected" : ""
          }`}
          role="status"
        >
          <span className="calendar-status-dot" aria-hidden="true" />
          {statusText}
        </span>

        {!isGoogleUser ? (
          <p className="calendar-hint">
            Sign in with Google to connect your calendar.
          </p>
        ) : !loading && (!connected || error) ? (
          <button
            type="button"
            className="primary calendar-connect-btn"
            onClick={() => {
              window.location.assign("/api/calendar/connect");
            }}
          >
            Connect Google Calendar
          </button>
        ) : null}
      </div>

      {(error || result) && (
        <div className="calendar-messages" aria-live="polite">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {result === "connected" && (
            <p className="calendar-success">
              Google Calendar connected successfully.
            </p>
          )}

          {result === "denied" && <p>Calendar authorization was cancelled.</p>}

          {result === "missing_permission" && (
            <p>Please connect again and grant Calendar permission.</p>
          )}

          {result === "failed" && (
            <p className="error" role="alert">
              Connection failed. Check the backend terminal and try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default CalendarConnection;
