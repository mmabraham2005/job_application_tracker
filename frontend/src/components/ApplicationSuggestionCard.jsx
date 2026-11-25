import { formatDate } from "../utils/dates";

const CONFIDENCE_LABELS = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const WARNING_MESSAGES = {
  missing_company_name: "Company name could not be detected.",

  company_inferred_from_sender:
    "Company name was inferred from the email sender. Please verify it.",

  missing_job_title: "Job title could not be detected.",

  missing_application_date: "Application date could not be detected.",

  estimated_application_date:
    "Application date is estimated from the received email date.",

  ambiguous_job_title: "Job title could not be determined reliably.",
};

function ApplicationSuggestionCard({
  suggestion,
  onReview,
  onDismiss,
  disabled = false,
}) {
  const {
    messageId,
    companyName,
    jobTitle,
    applicationDate,
    confidence,
    warnings = [],
    duplicate,
  } = suggestion;

  const confidenceLevel = Object.hasOwn(CONFIDENCE_LABELS, confidence)
    ? confidence
    : "low";

  const warningMessages = [
    ...new Set(
      warnings.map((warning) =>
        Object.hasOwn(WARNING_MESSAGES, warning)
          ? WARNING_MESSAGES[warning]
          : "Please review the detected application information.",
      ),
    ),
  ];

  const hasPossibleDuplicate =
    duplicate?.duplicate === true &&
    duplicate.reason === "matching_application";

  const hasMissingFields =
    !companyName?.trim() || !jobTitle?.trim() || !applicationDate;

  const hasEstimatedDate = warnings.includes("estimated_application_date");

  const validDate =
    applicationDate && !Number.isNaN(new Date(applicationDate).getTime());

  return (
    <article className="application-suggestion-card">
      <div className="suggestion-card-header">
        <div className="suggestion-card-identity">
          <h4>{companyName || "Unknown company"}</h4>

          <p
            className={
              jobTitle ? "suggestion-job-title" : "suggestion-missing-field"
            }
          >
            {jobTitle || "Job title not detected"}
          </p>
        </div>

        <span className={`suggestion-confidence confidence-${confidenceLevel}`}>
          {CONFIDENCE_LABELS[confidenceLevel]}
        </span>
      </div>

      <p className="suggestion-date">
        {validDate
          ? formatDate(applicationDate)
          : "Application date not detected"}

        {validDate && hasEstimatedDate && <span> · Estimated date</span>}
      </p>

      {hasMissingFields && (
        <p className="suggestion-missing-field">
          Additional information required before importing.
        </p>
      )}

      {hasPossibleDuplicate && (
        <div className="suggestion-duplicate-warning">
          <strong>Possible duplicate</strong>

          <p>
            An existing application has the same company, job title, and
            application date. Please review before importing.
          </p>
        </div>
      )}

      {warningMessages.length > 0 && (
        <ul className="suggestion-warnings">
          {warningMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="suggestion-card-actions">
        {typeof onDismiss === "function" && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onDismiss(messageId)}
          >
            Dismiss
          </button>
        )}

        <button
          type="button"
          className="primary"
          disabled={disabled || typeof onReview !== "function"}
          onClick={() => onReview(suggestion)}
        >
          Review &amp; Import
        </button>
      </div>
    </article>
  );
}

export default ApplicationSuggestionCard;
