import { useEffect, useState } from "react";

function CalendarConnection({ user }) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const result = new URLSearchParams(window.location.search)
    .get("calendar");

  useEffect(() => {
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
  }, []);

  if (user.authProvider !== "google") {
    return <p>Sign in with Google to connect Google Calendar.</p>;
  }

  return (
    <section>
      <h2>Google Calendar</h2>

      {loading ? (
        <p>Checking connection…</p>
      ) : connected ? (
        <p>Google Calendar authorization saved.</p>
      ) : (
        <button
          type="button"
          onClick={() => {
            window.location.assign("/api/calendar/connect");
          }}
        >
          Connect Google Calendar
        </button>
      )}

      {error && <p role="alert">{error}</p>}

      {result === "connected" && (
        <p>Google Calendar connected successfully.</p>
      )}

      {result === "denied" && (
        <p>Calendar authorization was cancelled.</p>
      )}

      {result === "missing_permission" && (
        <p>Please connect again and grant Calendar permission.</p>
      )}

      {result === "failed" && (
        <p>Connection failed. Check the backend terminal and try again.</p>
      )}
    </section>
  );
}

export default CalendarConnection;