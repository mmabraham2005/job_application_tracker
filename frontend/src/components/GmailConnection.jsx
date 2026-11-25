import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  connectGmail,
  disconnectGmail,
  getGmailStatus,
} from "../services/GmailApi";
import "../style/emailDetection.css";

const CALLBACK_MESSAGES = {
  connected: "Gmail connected successfully.",
  denied: "Gmail authorization was cancelled.",
  missing_permission:
    "Please connect again and grant Gmail read-only permission.",
  account_mismatch:
    "Please connect the same Google account you used to sign in.",
  failed: "Gmail connection failed. Please try again.",
};

function GmailConnection({ user }) {
  const isGoogleUser = user?.authProvider === "google";

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [actionError, setActionError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [searchParams, setSearchParams] = useSearchParams();

  const result = searchParams.get("gmail");

  const callbackMessage = Object.hasOwn(CALLBACK_MESSAGES, result)
    ? CALLBACK_MESSAGES[result]
    : "";

  // Check the authoritative backend connection state.
  useEffect(() => {
    if (!isGoogleUser) return;

    const controller = new AbortController();

    let active = true;

    async function checkConnection() {
      try {
        const data = await getGmailStatus({
          signal: controller.signal,
        });

        if (active) {
          setConnected(data.connected === true);
          setStatusError("");
        }
      } catch (err) {
        if (active && err.name !== "AbortError") {
          setStatusError(err.message || "Could not check Gmail connection.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    checkConnection();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isGoogleUser, retryCount]);

  function dismissCallbackMessage() {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);

        next.delete("gmail");

        return next;
      },
      { replace: true },
    );
  }

  function handleRetry() {
    setLoading(true);
    setStatusError("");
    setActionError("");
    setRetryCount((previous) => previous + 1);
  }

  function handleConnect() {
    if (connecting || disconnecting) return;

    setConnecting(true);
    setActionError("");

    try {
      connectGmail();
    } catch (err) {
      setActionError(err.message || "Could not start Gmail authorization.");

      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (disconnecting || connecting) return;

    const confirmed = window.confirm(
      "Disconnect Gmail?\n\n" +
        "Your saved applications and email detection preferences " +
        "will not be deleted. You can reconnect Gmail later.",
    );

    if (!confirmed) return;

    setDisconnecting(true);
    setActionError("");

    try {
      await disconnectGmail();

      setConnected(false);

      dismissCallbackMessage();
    } catch (err) {
      setActionError(err.message || "Could not disconnect Gmail.");
    } finally {
      setDisconnecting(false);
    }
  }

  const statusText = !isGoogleUser
    ? "Google sign-in required"
    : loading
      ? "Checking Gmail connection..."
      : statusError
        ? "Connection status unavailable"
        : connected
          ? "Gmail connected"
          : "Gmail not connected";

  const showConnected = isGoogleUser && connected && !loading && !statusError;

  const busy = connecting || disconnecting;

  return (
    <section
      className="profile-card gmail-connection"
      aria-labelledby="gmail-connection-title"
      aria-busy={isGoogleUser && (loading || busy)}
    >
      <div className="profile-section-heading">
        <h2 id="gmail-connection-title">Gmail Integration</h2>

        <p>Detect job application confirmations from your inbox.</p>
      </div>

      <div
        className={`gmail-status ${showConnected ? "is-connected" : ""}`}
        role="status"
      >
        <span className="gmail-status-dot" aria-hidden="true" />

        {statusText}
      </div>

      <div className="gmail-privacy-note">
        <strong>Read-only access</strong>

        <p>
          We read emails to detect job applications. We never send, modify, or
          delete your emails. Applications are saved only after you review and
          confirm them.
        </p>
      </div>

      {!isGoogleUser && (
        <p className="profile-field-hint">
          Sign in with Google to enable email detection.
        </p>
      )}

      {isGoogleUser && (statusError || actionError) && (
        <p className="error" role="alert">
          {statusError || actionError}
        </p>
      )}

      {isGoogleUser && callbackMessage && result !== "connected" && (
        <div className="gmail-callback-message">
          <p role="status">{callbackMessage}</p>

          <button type="button" onClick={dismissCallbackMessage}>
            Dismiss
          </button>
        </div>
      )}

      {showConnected && result === "connected" && (
        <div className="gmail-callback-message">
          <p className="profile-success" role="status">
            {callbackMessage}
          </p>

          <button type="button" onClick={dismissCallbackMessage}>
            Dismiss
          </button>
        </div>
      )}

      {isGoogleUser && !loading && (
        <div className="gmail-connection-actions">
          {statusError ? (
            <button type="button" onClick={handleRetry} disabled={busy}>
              Retry
            </button>
          ) : connected ? (
            <button
              type="button"
              className="danger"
              onClick={handleDisconnect}
              disabled={busy}
            >
              {disconnecting ? "Disconnecting..." : "Disconnect Gmail"}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={handleConnect}
              disabled={busy}
            >
              {connecting ? "Connecting..." : "Connect Gmail"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default GmailConnection;
