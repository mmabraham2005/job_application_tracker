import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ApplicationSuggestionCard from "./ApplicationSuggestionCard";
import ApplicationSuggestionForm from "./ApplicationSuggestionForm";

import {
  getGmailStatus,
  importGmailApplication,
  scanGmailApplications,
} from "../services/GmailApi";

import "../style/emailDetection.css";

function EmailDetection({
  user,
  applicationsLoading = false,
  onApplicationImported,
}) {
  const isGoogleUser = user?.authProvider === "google";

  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [importingMessageId, setImportingMessageId] = useState(null);

  const [importSuccess, setImportSuccess] = useState("");
  const [dismissMessage, setDismissMessage] = useState("");

  const importInProgress = useRef(false);
  const scanInProgress = useRef(false);

  const importing = importingMessageId !== null;

  const suggestions = scanResult?.suggestions ?? [];

  const selectedSuggestion =
    suggestions.find(
      (suggestion) => suggestion.messageId === selectedMessageId,
    ) ?? null;

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
          setChecking(false);
        }
      }
    }

    checkConnection();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isGoogleUser, retryCount]);

  function handleRetry() {
    setChecking(true);
    setStatusError("");
    setRetryCount((previous) => previous + 1);
  }

  async function handleScan() {
    if (
      !isGoogleUser ||
      !connected ||
      scanInProgress.current ||
      importInProgress.current
    ) {
      return;
    }

    scanInProgress.current = true;

    setScanning(true);
    setScanError("");
    setImportSuccess("");
    setDismissMessage("");
    setScanResult(null);
    setSelectedMessageId(null);

    try {
      const result = await scanGmailApplications();

      setScanResult({
        ...result,
        dismissedCount: 0,
      });
    } catch (err) {
      setScanError(err.message || "Could not scan Gmail applications.");

      if (err.status === 403) {
        setConnected(false);
      }
    } finally {
      scanInProgress.current = false;
      setScanning(false);
    }
  }

  function handleReview(suggestion) {
    if (importInProgress.current || scanInProgress.current) {
      return;
    }

    setImportSuccess("");
    setDismissMessage("");
    setSelectedMessageId(suggestion.messageId);
  }

  function handleCancelReview() {
    if (importInProgress.current) return;

    setSelectedMessageId(null);
  }

  function handleDismissSuggestion(messageId) {
    if (importInProgress.current || scanInProgress.current) {
      return;
    }

    const dismissedSuggestion = suggestions.find(
      (suggestion) => suggestion.messageId === messageId,
    );

    if (!dismissedSuggestion) return;

    setScanResult((previous) => {
      if (!previous) return previous;

      const exists = previous.suggestions.some(
        (suggestion) => suggestion.messageId === messageId,
      );

      if (!exists) return previous;

      const remainingSuggestions = previous.suggestions.filter(
        (suggestion) => suggestion.messageId !== messageId,
      );

      return {
        ...previous,

        suggestions: remainingSuggestions,

        suggestionCount: remainingSuggestions.length,

        dismissedCount: (previous.dismissedCount ?? 0) + 1,

        possibleDuplicateCount: remainingSuggestions.filter(
          (suggestion) =>
            suggestion.duplicate?.duplicate === true &&
            suggestion.duplicate.reason === "matching_application",
        ).length,
      };
    });

    setSelectedMessageId((previous) =>
      previous === messageId ? null : previous,
    );

    setImportSuccess("");

    setDismissMessage(
      `${dismissedSuggestion.companyName || "Application"} suggestion dismissed for this scan.`,
    );
  }

  async function handleImportApplication(payload) {
    if (importInProgress.current || scanInProgress.current) {
      throw new Error("Another email detection operation is in progress.");
    }

    if (!isGoogleUser || !connected) {
      throw new Error("Connect Gmail before importing applications.");
    }

    if (applicationsLoading) {
      throw new Error(
        "Please allow your existing applications to finish loading.",
      );
    }

    if (typeof onApplicationImported !== "function") {
      throw new Error("Application import is currently unavailable.");
    }

    if (
      !selectedSuggestion ||
      selectedSuggestion.messageId !== payload.messageId
    ) {
      throw new Error("Please select a valid application suggestion.");
    }

    importInProgress.current = true;

    setImportingMessageId(payload.messageId);
    setImportSuccess("");
    setDismissMessage("");

    try {
      // The backend validates and saves the application.
      const application = await importGmailApplication(payload);

      if (!application?._id) {
        throw new Error(
          "The import response could not be verified. Refresh your applications before retrying.",
        );
      }

      // Update the shared application state.
      onApplicationImported(application);

      // Remove the successfully imported suggestion.
      setScanResult((previous) => {
        if (!previous) return previous;

        const importedSuggestion = previous.suggestions.find(
          (suggestion) => suggestion.messageId === payload.messageId,
        );

        if (!importedSuggestion) return previous;

        const remainingSuggestions = previous.suggestions.filter(
          (suggestion) => suggestion.messageId !== payload.messageId,
        );

        return {
          ...previous,

          suggestions: remainingSuggestions,

          suggestionCount: remainingSuggestions.length,

          alreadyImportedCount: previous.alreadyImportedCount + 1,

          possibleDuplicateCount: remainingSuggestions.filter(
            (suggestion) =>
              suggestion.duplicate?.duplicate === true &&
              suggestion.duplicate.reason === "matching_application",
          ).length,
        };
      });

      setSelectedMessageId(null);

      setImportSuccess(
        `${application.companyName} — ${application.jobTitle} imported successfully.`,
      );
    } catch (err) {
      if (err.status === 403) {
        setConnected(false);

        throw new Error(
          "Gmail authorization is unavailable. Reconnect Gmail in Profile Settings, then scan again.",
          { cause: err },
        );
      }

      if (err.status === 409) {
        throw new Error(
          "This Gmail message has already been imported. Refresh your applications and scan again.",
          { cause: err },
        );
      }

      if (err.status === 401) {
        throw new Error(
          "Your session has expired. Sign in again before importing applications.",
          { cause: err },
        );
      }

      if (!err.status || err.status >= 500) {
        throw new Error(
          "The import could not be confirmed. Refresh your applications and check whether it was saved before retrying.",
          { cause: err },
        );
      }

      throw err;
    } finally {
      importInProgress.current = false;

      setImportingMessageId(null);
    }
  }

  const statusText = !isGoogleUser
    ? "Google sign-in required"
    : checking
      ? "Checking Gmail connection..."
      : statusError
        ? "Connection status unavailable"
        : connected
          ? "Gmail connected"
          : "Gmail not connected";

  const showConnected = isGoogleUser && connected && !checking && !statusError;

  return (
    <section
      className="email-detection"
      aria-labelledby="email-detection-title"
      aria-busy={isGoogleUser && (checking || scanning || importing)}
    >
      <div className="dashboard-section-heading">
        <h2 id="email-detection-title">Email Auto Detection</h2>

        <p>Find job application confirmations from your Gmail inbox.</p>
      </div>

      <div className="email-detection-header">
        <div
          className={`gmail-status ${showConnected ? "is-connected" : ""}`}
          role="status"
        >
          <span className="gmail-status-dot" aria-hidden="true" />

          {statusText}
        </div>

        {isGoogleUser && (
          <Link to="/profile" className="email-detection-settings-link">
            Manage Gmail
          </Link>
        )}
      </div>

      {!isGoogleUser && (
        <p className="profile-field-hint">
          Sign in with Google to enable email detection.
        </p>
      )}

      {isGoogleUser && statusError && (
        <>
          <p className="error" role="alert">
            {statusError}
          </p>

          <div className="email-detection-actions">
            <button type="button" onClick={handleRetry}>
              Retry
            </button>
          </div>
        </>
      )}

      {isGoogleUser && !checking && !statusError && !connected && (
        <div className="gmail-privacy-note">
          <p>
            Connect or reconnect Gmail in Profile Settings to enable email
            detection.
          </p>
        </div>
      )}

      {showConnected && (
        <>
          <div className="email-detection-actions">
            <button
              type="button"
              className="primary"
              onClick={handleScan}
              disabled={scanning || importing}
            >
              {scanning
                ? "Scanning your inbox..."
                : scanResult
                  ? "Scan Again"
                  : "Scan for Applications"}
            </button>
          </div>

          <p className="profile-field-hint">
            Scans up to 25 matching emails from the past 365 days. Nothing is
            saved automatically. Dismissed suggestions may reappear when you
            scan again.
          </p>
        </>
      )}

      {scanning && (
        <p role="status" className="email-detection-loading">
          Searching for application confirmation emails...
        </p>
      )}

      {scanError && (
        <p className="error" role="alert">
          {scanError}
        </p>
      )}

      {importSuccess && (
        <p className="profile-success" role="status">
          {importSuccess}
        </p>
      )}

      {dismissMessage && (
        <p className="email-detection-dismiss-feedback" role="status">
          {dismissMessage}
        </p>
      )}

      {scanResult && (
        <div className="email-detection-results">
          <h3>Scan Results</h3>

          <p className="profile-field-hint">
            Results reflect your latest scan and actions taken during this scan.
            Scan again to refresh duplicate checks.
          </p>

          <div className="email-detection-stats" aria-live="polite">
            {[
              {
                label: "Emails scanned",
                value: scanResult.scannedCount,
              },
              {
                label: "Remaining suggestions",
                value: scanResult.suggestionCount,
              },
              {
                label: "Already imported",
                value: scanResult.alreadyImportedCount,
              },
              {
                label: "Possible duplicates",
                value: scanResult.possibleDuplicateCount,
              },
              {
                label: "Excluded emails",
                value: scanResult.excludedCount,
              },
              {
                label: "Dismissed",
                value: scanResult.dismissedCount ?? 0,
              },
            ].map(({ label, value }) => (
              <div key={label} className="email-detection-stat">
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>

          {scanResult.hasMore && (
            <p className="email-detection-notice">
              More matching emails are available but were not included in this
              scan.
            </p>
          )}

          {scanResult.suggestionCount === 0 && (
            <p className="empty">
              {scanResult.dismissedCount > 0
                ? "No application suggestions remain for this scan."
                : "No new application suggestions remain."}
            </p>
          )}

          {suggestions.length > 0 && (
            <div className="application-suggestions">
              <div className="suggestion-list-heading">
                <h3>Detected Applications</h3>

                <p role="status">
                  {suggestions.length} application
                  {suggestions.length === 1 ? "" : "s"} detected. Review each
                  suggestion before importing.
                </p>
              </div>

              <div className="suggestion-list">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.messageId} className="suggestion-item">
                    <ApplicationSuggestionCard
                      suggestion={suggestion}
                      onReview={handleReview}
                      onDismiss={handleDismissSuggestion}
                      disabled={scanning || importing}
                    />

                    {selectedSuggestion?.messageId === suggestion.messageId && (
                      <div className="suggestion-review-container">
                        <ApplicationSuggestionForm
                          key={suggestion.messageId}
                          suggestion={selectedSuggestion}
                          onSubmit={
                            applicationsLoading || !connected || statusError
                              ? undefined
                              : handleImportApplication
                          }
                          onCancel={handleCancelReview}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default EmailDetection;
