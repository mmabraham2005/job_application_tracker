import { useRef, useState } from "react";

import { DEFAULT_STATUS, STATUSES } from "../constants/statuses";

function isValidApplicationDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function initialValues(suggestion) {
  return {
    companyName: suggestion.companyName || "",
    jobTitle: suggestion.jobTitle || "",

    applicationDate: isValidApplicationDate(suggestion.applicationDate)
      ? suggestion.applicationDate
      : "",

    status: STATUSES.includes(suggestion.status)
      ? suggestion.status
      : DEFAULT_STATUS,
  };
}

function ApplicationSuggestionForm({ suggestion, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => initialValues(suggestion));

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submissionInProgress = useRef(false);

  const hasEstimatedDate = suggestion.warnings?.includes(
    "estimated_application_date",
  );

  const hasPossibleDuplicate =
    suggestion.duplicate?.duplicate === true &&
    suggestion.duplicate.reason === "matching_application";

  const canSubmit =
    Boolean(values.companyName.trim()) &&
    Boolean(values.jobTitle.trim()) &&
    isValidApplicationDate(values.applicationDate) &&
    STATUSES.includes(values.status) &&
    Boolean(suggestion.messageId);

  function handleChange(event) {
    const { name, value } = event.target;

    setValues((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submissionInProgress.current) return;

    if (!canSubmit) {
      setError(
        "Enter a company, job title, valid application date, and status.",
      );

      return;
    }

    if (typeof onSubmit !== "function") {
      setError("Application import is currently unavailable.");
      return;
    }

    const payload = {
      messageId: suggestion.messageId,
      companyName: values.companyName.trim(),
      jobTitle: values.jobTitle.trim(),
      applicationDate: values.applicationDate,
      status: values.status,
    };

    submissionInProgress.current = true;

    setSubmitting(true);
    setError("");

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err.message || "Could not import the application.");
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      className="application-form suggestion-review-form"
      onSubmit={handleSubmit}
      aria-busy={submitting}
    >
      <div className="dashboard-section-heading">
        <h2>Review application</h2>

        <p>Review and correct the detected information before importing.</p>
      </div>

      {hasPossibleDuplicate && (
        <div className="suggestion-duplicate-warning">
          <strong>Possible duplicate</strong>

          <p>
            An existing application has matching details. Make sure this is a
            separate application before importing.
          </p>
        </div>
      )}

      <div className="form-fields">
        <label>
          Company
          <input
            name="companyName"
            value={values.companyName}
            onChange={handleChange}
            placeholder="Enter company name"
            disabled={submitting}
            required
          />
        </label>

        <label>
          Job title
          <input
            name="jobTitle"
            value={values.jobTitle}
            onChange={handleChange}
            placeholder="Enter job title"
            disabled={submitting}
            required
          />
        </label>

        <label>
          Date applied
          <input
            type="date"
            name="applicationDate"
            value={values.applicationDate}
            onChange={handleChange}
            disabled={submitting}
            required
          />
          {hasEstimatedDate && (
            <span className="suggestion-field-hint">
              The detected date is estimated from the received email date.
              Correct it if necessary.
            </span>
          )}
        </label>

        <label>
          Status
          <select
            name="status"
            value={values.status}
            onChange={handleChange}
            disabled={submitting}
            required
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!canSubmit && (
        <p className="suggestion-field-hint">
          Complete all required fields before importing.
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button
          type="submit"
          className="primary"
          disabled={submitting || !canSubmit || typeof onSubmit !== "function"}
        >
          {submitting ? "Importing..." : "Import Application"}
        </button>

        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default ApplicationSuggestionForm;
