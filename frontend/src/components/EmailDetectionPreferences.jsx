import { useEffect, useRef, useState } from "react";
import {
  getEmailDetectionPreferences,
  updateEmailDetectionPreferences,
} from "../services/GmailApi";
import {
  arePreferencesEqual,
  getSenderConflicts,
  MAX_SENDERS,
  reconcilePreferencesSave,
  validateNewSender,
  validatePreferencesResponse,
} from "../utils/emailDetectionPreferences";

function EmailDetectionPreferences({ user }) {
  const isGoogleUser = user?.authProvider === "google";

  const [trustedSenders, setTrustedSenders] = useState([]);
  const [blockedSenders, setBlockedSenders] = useState([]);

  const [savedPreferences, setSavedPreferences] = useState(null);

  const [trustedInput, setTrustedInput] = useState("");
  const [blockedInput, setBlockedInput] = useState("");

  const [trustedError, setTrustedError] = useState("");
  const [blockedError, setBlockedError] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const [saveRecovery, setSaveRecovery] = useState(null);

  const saveInProgress = useRef(false);

  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  const senderConflicts = getSenderConflicts(trustedSenders, blockedSenders);
  const hasChanges =
    savedPreferences !== null &&
    !arePreferencesEqual(
      {
        trustedSenders,
        blockedSenders,
      },
      savedPreferences,
    );

  const hasPendingInput =
    Boolean(trustedInput.trim()) || Boolean(blockedInput.trim());

  const canEdit =
    isGoogleUser &&
    !loading &&
    !loadError &&
    savedPreferences !== null &&
    !saving &&
    saveRecovery === null;

  const canSave = canEdit && hasChanges && !hasPendingInput;

  useEffect(() => {
    if (!isGoogleUser || (!hasChanges && !hasPendingInput && !saving)) {
      return;
    }

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = true;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isGoogleUser, hasChanges, hasPendingInput, saving]);

  useEffect(() => {
    if (!isGoogleUser) return;

    const controller = new AbortController();
    let active = true;

    async function loadPreferences() {
      try {
        const response = await getEmailDetectionPreferences({
          signal: controller.signal,
        });

        const preferences = validatePreferencesResponse(response);

        if (!active) return;

        setTrustedSenders(preferences.trustedSenders);
        setBlockedSenders(preferences.blockedSenders);

        setSavedPreferences({
          trustedSenders: [...preferences.trustedSenders],
          blockedSenders: [...preferences.blockedSenders],
        });

        setLoadError("");

        setSaveRecovery(null);
        setSaveError("");
        setSaveSuccess("");

        setTrustedInput("");
        setBlockedInput("");

        setTrustedError("");
        setBlockedError("");
      } catch (err) {
        if (active && err.name !== "AbortError") {
          setLoadError(
            err.message || "Could not load email detection preferences.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPreferences();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isGoogleUser, retryCount]);

  function handleRetry() {
    setLoading(true);
    setLoadError("");
    setRetryCount((previous) => previous + 1);
  }

  async function verifySaveOutcome(previousPreferences, submittedPreferences) {
    try {
      const response = await getEmailDetectionPreferences();

      if (!isMounted.current) {
        return;
      }

      const result = reconcilePreferencesSave(
        previousPreferences,
        submittedPreferences,
        response,
      );

      if (result.status === "saved") {
        setTrustedSenders([...result.preferences.trustedSenders]);

        setBlockedSenders([...result.preferences.blockedSenders]);

        setSavedPreferences({
          trustedSenders: [...result.preferences.trustedSenders],
          blockedSenders: [...result.preferences.blockedSenders],
        });

        setSaveRecovery(null);
        setSaveError("");

        setSaveSuccess("Your email detection preferences are confirmed saved.");

        return;
      }

      if (result.status === "unchanged") {
        setSaveRecovery(null);

        setSaveError(
          "The server still contains your previous preferences. " +
            "Your changes have been preserved. You can try saving again.",
        );

        return;
      }

      setSaveRecovery({
        type: "conflict",
        previousPreferences,
        submittedPreferences,
      });

      setSaveError(
        "Your saved preferences have changed unexpectedly. " +
          "Reload your saved preferences before making another update.",
      );
    } catch (err) {
      if (!isMounted.current) {
        return;
      }

      setSaveRecovery({
        type: "unknown",
        previousPreferences,
        submittedPreferences,
      });

      setSaveError(
        "Could not verify whether your preferences were saved. " +
          "Your changes have been preserved. " +
          "Verification error: " +
          (err.message || "Unknown error."),
      );
    }
  }

  async function handleSavePreferences() {
    if (!canSave || saveInProgress.current) {
      return;
    }

    const previousPreferences = {
      trustedSenders: [...savedPreferences.trustedSenders],
      blockedSenders: [...savedPreferences.blockedSenders],
    };

    const submittedPreferences = {
      trustedSenders: [...trustedSenders],
      blockedSenders: [...blockedSenders],
    };

    saveInProgress.current = true;

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const response =
        await updateEmailDetectionPreferences(submittedPreferences);

      const preferences = validatePreferencesResponse(response);

      if (!isMounted.current) {
        return;
      }

      setTrustedSenders([...preferences.trustedSenders]);

      setBlockedSenders([...preferences.blockedSenders]);

      setSavedPreferences({
        trustedSenders: [...preferences.trustedSenders],
        blockedSenders: [...preferences.blockedSenders],
      });

      setSaveRecovery(null);

      setSaveSuccess("Your email detection preferences have been saved.");
    } catch (err) {
      if (!isMounted.current) {
        return;
      }

      if (err.status === 400) {
        setSaveError(err.message || "The submitted preferences are invalid.");
      } else if (
        err.status === 401 ||
        err.status === 403 ||
        err.status === 404
      ) {
        setSaveRecovery({
          type: "authorization",
        });

        setSaveError(
          "Your account could not be authorized for this update. " +
            "Your changes have been preserved. " +
            "Sign in again before updating your preferences.",
        );
      } else {
        await verifySaveOutcome(previousPreferences, submittedPreferences);
      }
    } finally {
      saveInProgress.current = false;

      if (isMounted.current) {
        setSaving(false);
      }
    }
  }

  async function handleVerifySaveOutcome() {
    if (
      !isGoogleUser ||
      saving ||
      saveInProgress.current ||
      saveRecovery?.type !== "unknown"
    ) {
      return;
    }

    saveInProgress.current = true;

    setSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      await verifySaveOutcome(
        saveRecovery.previousPreferences,
        saveRecovery.submittedPreferences,
      );
    } finally {
      saveInProgress.current = false;

      if (isMounted.current) {
        setSaving(false);
      }
    }
  }

  function handleReloadSavedPreferences() {
    if (!isGoogleUser || saving || saveInProgress.current) {
      return;
    }

    const confirmed = window.confirm(
      "Reloading saved preferences will discard your local changes " +
        "if the reload succeeds. Continue?",
    );

    if (!confirmed) {
      return;
    }

    setSaveError("");
    setSaveSuccess("");

    handleRetry();
  }

  function handleAddTrustedSender() {
    if (!canEdit || saveInProgress.current) {
      return;
    }

    setTrustedError("");

    try {
      const sender = validateNewSender(trustedInput, trustedSenders);

      setTrustedSenders((previous) => [...previous, sender]);

      setTrustedInput("");
      setSaveError("");
      setSaveSuccess("");
    } catch (err) {
      setTrustedError(err.message || "Could not add trusted sender.");
    }
  }

  function handleAddBlockedSender() {
    if (!canEdit || saveInProgress.current) {
      return;
    }

    setBlockedError("");

    try {
      const sender = validateNewSender(blockedInput, blockedSenders);

      setBlockedSenders((previous) => [...previous, sender]);

      setBlockedInput("");
      setSaveError("");
      setSaveSuccess("");
    } catch (err) {
      setBlockedError(err.message || "Could not add blocked sender.");
    }
  }

  function handleRemoveTrustedSender(sender) {
    if (!canEdit || saveInProgress.current) {
      return;
    }

    setTrustedSenders((previous) => previous.filter((item) => item !== sender));

    setTrustedError("");
    setSaveError("");
    setSaveSuccess("");
  }

  function handleRemoveBlockedSender(sender) {
    if (!canEdit || saveInProgress.current) {
      return;
    }

    setBlockedSenders((previous) => previous.filter((item) => item !== sender));

    setBlockedError("");
    setSaveError("");
    setSaveSuccess("");
  }

  return (
    <section
      className="profile-card email-detection-preferences"
      aria-labelledby="email-detection-preferences-title"
      aria-busy={isGoogleUser && (loading || saving)}
    >
      <div className="profile-section-heading">
        <h2 id="email-detection-preferences-title">
          Email Detection Preferences
        </h2>

        <p>
          Manage which email senders are trusted or blocked during application
          detection.
        </p>
      </div>

      {!isGoogleUser ? (
        <p className="profile-field-hint">
          Sign in with Google to manage email detection preferences.
        </p>
      ) : loading ? (
        <p className="profile-field-hint" role="status">
          Loading email detection preferences...
        </p>
      ) : loadError ? (
        <div className="sender-preference-load-error">
          <p className="error" role="alert">
            {loadError}
          </p>

          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Trusted Senders */}

          <div className="sender-preference-group">
            <h3>Trusted Senders</h3>

            <p className="profile-field-hint">
              Trusted senders provide additional classification signals for
              known recruiters and employers. Emails must still contain
              application confirmation information.
            </p>

            <label htmlFor="trusted-sender-input">
              Email address or domain
            </label>

            <div className="sender-preference-input-row">
              <input
                id="trusted-sender-input"
                type="text"
                disabled={!canEdit}
                value={trustedInput}
                onChange={(event) => {
                  setTrustedInput(event.target.value);
                  setTrustedError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();

                    if (trustedInput.trim()) {
                      handleAddTrustedSender();
                    }
                  }
                }}
                placeholder="e.g. careers@example.com"
                autoComplete="off"
                aria-invalid={Boolean(trustedError)}
                aria-describedby={
                  trustedError ? "trusted-sender-error" : undefined
                }
              />

              <button
                type="button"
                disabled={!canEdit || !trustedInput.trim()}
                onClick={handleAddTrustedSender}
              >
                Add
              </button>
            </div>

            {trustedError && (
              <p id="trusted-sender-error" className="error" role="alert">
                {trustedError}
              </p>
            )}

            <p className="sender-preference-count">
              {trustedSenders.length} / {MAX_SENDERS} senders
            </p>

            {trustedSenders.length === 0 ? (
              <p className="sender-preference-empty">
                No trusted senders added.
              </p>
            ) : (
              <ul className="sender-preference-list">
                {trustedSenders.map((sender) => (
                  <li
                    key={sender}
                    className="sender-preference-item is-trusted"
                  >
                    <span>{sender}</span>

                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-label={`Remove trusted sender ${sender}`}
                      onClick={() => handleRemoveTrustedSender(sender)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Blocked Senders */}

          <div className="sender-preference-group">
            <h3>Blocked Senders</h3>

            <p className="profile-field-hint">
              Emails from blocked senders are excluded from application
              detection results.
            </p>

            <label htmlFor="blocked-sender-input">
              Email address or domain
            </label>

            <div className="sender-preference-input-row">
              <input
                id="blocked-sender-input"
                type="text"
                disabled={!canEdit}
                value={blockedInput}
                onChange={(event) => {
                  setBlockedInput(event.target.value);
                  setBlockedError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();

                    if (blockedInput.trim()) {
                      handleAddBlockedSender();
                    }
                  }
                }}
                placeholder="e.g. newsletter.example.com"
                autoComplete="off"
                aria-invalid={Boolean(blockedError)}
                aria-describedby={
                  blockedError ? "blocked-sender-error" : undefined
                }
              />

              <button
                type="button"
                disabled={!canEdit || !blockedInput.trim()}
                onClick={handleAddBlockedSender}
              >
                Add
              </button>
            </div>

            {blockedError && (
              <p id="blocked-sender-error" className="error" role="alert">
                {blockedError}
              </p>
            )}

            <p className="sender-preference-count">
              {blockedSenders.length} / {MAX_SENDERS} senders
            </p>

            {blockedSenders.length === 0 ? (
              <p className="sender-preference-empty">
                No blocked senders added.
              </p>
            ) : (
              <ul className="sender-preference-list">
                {blockedSenders.map((sender) => (
                  <li
                    key={sender}
                    className="sender-preference-item is-blocked"
                  >
                    <span>{sender}</span>

                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-label={`Remove blocked sender ${sender}`}
                      onClick={() => handleRemoveBlockedSender(sender)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {senderConflicts.length > 0 && (
            <div className="sender-preference-conflicts" role="status">
              <h3>Overlapping Sender Rules</h3>

              <p>
                Some trusted senders overlap with blocked senders. Blocked rules
                take priority.
              </p>

              <ul>
                {senderConflicts.map((conflict) => (
                  <li
                    key={`${conflict.trustedSender}:${conflict.blockedSender}`}
                  >
                    {conflict.type === "full" ? (
                      <>
                        Trusted sender <strong>{conflict.trustedSender}</strong>{" "}
                        is fully overridden by blocked rule{" "}
                        <strong>{conflict.blockedSender}</strong>.
                      </>
                    ) : (
                      <>
                        Trusted domain <strong>{conflict.trustedSender}</strong>{" "}
                        is partially overridden by blocked sender{" "}
                        <strong>{conflict.blockedSender}</strong>.
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="gmail-privacy-note">
            <p>
              Blocked senders take priority over trusted senders. Preferences
              apply to future email detection scans.
            </p>

            <p>
              Domains match exactly and do not automatically include subdomains.
            </p>
          </div>

          <div className="sender-preference-save-status">
            {hasChanges ? (
              <p className="sender-preference-unsaved" role="status">
                You have unsaved changes.
              </p>
            ) : (
              <p className="profile-field-hint" role="status">
                No unsaved changes.
              </p>
            )}

            {hasPendingInput && (
              <p className="profile-field-hint">
                Add or clear the pending sender input before saving your
                preferences.
              </p>
            )}

            {saveError && (
              <p className="error" role="alert">
                {saveError}
              </p>
            )}

            {saveRecovery?.type === "unknown" && (
              <div className="sender-preference-recovery-actions">
                <button
                  type="button"
                  onClick={handleVerifySaveOutcome}
                  disabled={saving}
                >
                  {saving
                    ? "Verifying Preferences..."
                    : "Verify Saved Preferences"}
                </button>
              </div>
            )}

            {saveRecovery?.type === "conflict" && (
              <div className="sender-preference-recovery-actions">
                <button
                  type="button"
                  onClick={handleReloadSavedPreferences}
                  disabled={saving}
                >
                  Reload Saved Preferences
                </button>
              </div>
            )}

            {saveRecovery?.type === "authorization" && (
              <p className="profile-field-hint">
                Copy any unsaved sender entries you want to keep before signing
                in again.
              </p>
            )}

            {saveSuccess && (
              <p className="profile-success" role="status">
                {saveSuccess}
              </p>
            )}
          </div>

          <div className="profile-settings-actions">
            <button
              type="button"
              className="primary"
              onClick={handleSavePreferences}
              disabled={!canSave}
            >
              {saving ? "Saving Preferences..." : "Save Preferences"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default EmailDetectionPreferences;
