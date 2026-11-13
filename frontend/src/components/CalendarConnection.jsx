import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

function CalendarConnection({ user }) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const result = searchParams.get("calendar");
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

  function connectCalendar() {
    window.location.assign("/api/calendar/connect");
  }

  async function disconnectCalendar() {
    const confirmed = window.confirm(
      "Disconnect Google Calendar?\n\n" +
        "Your applications, reminders, and existing Google Calendar events " +
        "will not be deleted.",
    );

    if (!confirmed) return;

    setDisconnecting(true);
    setError("");

    try {
      const response = await fetch("/api/calendar/disconnect", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Could not disconnect Google Calendar.");
      }

      setConnected(false);

      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("calendar");
          return next;
        },
        { replace: true },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  }

  function dismissMessage() {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("calendar");
        return next;
      },
      { replace: true },
    );
  }

  const statusText = !isGoogleUser
    ? "Google sign-in required"
    : loading
      ? "Checking connection..."
      : error
        ? "Connection unavailable"
        : connected
          ? "Google Calendar connected"
          : "Google Calendar not connected";

  return (
    <div className="calendar-integration">
      <div className="calendar-integration-actions">
        <span
          className={`calendar-status ${
            isGoogleUser && connected && !error ? "is-connected" : ""
          }`}
          role="status"
        >
          <span className="calendar-status-dot" aria-hidden="true" />
          {statusText}
        </span>

        {isGoogleUser && !loading && connected && !error && (
          <button
            type="button"
            className="calendar-disconnect-btn"
            onClick={disconnectCalendar}
            disabled={disconnecting}
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        )}

        {isGoogleUser && !loading && (!connected || error) && (
          <button
            type="button"
            className="primary calendar-connect-btn"
            onClick={connectCalendar}
            disabled={disconnecting}
          >
            Connect Google Calendar
          </button>
        )}
      </div>

      {!isGoogleUser && (
        <p className="calendar-integration-hint">
          Sign in with Google to enable calendar sync.
        </p>
      )}

      {(error || result) && (
        <div className="calendar-integration-message" aria-live="polite">
          {error && <p role="alert">{error}</p>}

          {result === "connected" && (
            <p>Google Calendar connected successfully.</p>
          )}

          {result === "denied" && <p>Calendar authorization was cancelled.</p>}

          {result === "missing_permission" && (
            <p>Please connect again and grant Calendar permission.</p>
          )}

          {result === "failed" && (
            <p role="alert">Calendar connection failed. Please try again.</p>
          )}

          {result && (
            <button
              type="button"
              className="calendar-dismiss-btn"
              onClick={dismissMessage}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default CalendarConnection;
