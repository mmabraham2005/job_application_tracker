const MAX_SENDERS = 100;
const MAX_SENDER_LENGTH = 254;

function isValidDomain(domain) {
  if (domain.length > 253) return false;

  const labels = domain.split(".");

  if (labels.length < 2) return false;

  return labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
  );
}

function isValidEmail(address) {
  const parts = address.split("@");

  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;

  if (!localPart || localPart.length > 64) {
    return false;
  }

  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..")
  ) {
    return false;
  }

  const validLocalPart = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;

  return validLocalPart.test(localPart) && isValidDomain(domain);
}

function normalizeSender(value) {
  if (typeof value !== "string") {
    throw new Error("Sender must be a string.");
  }

  let normalized = value.trim().toLowerCase();

  // Allow users to enter @example.com as a domain.
  if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }

  if (!normalized || normalized.length > MAX_SENDER_LENGTH) {
    throw new Error("Invalid sender length.");
  }

  const valid = normalized.includes("@")
    ? isValidEmail(normalized)
    : isValidDomain(normalized);

  if (!valid) {
    throw new Error("Invalid email address or domain.");
  }

  return normalized;
}

function normalizeSenderList(values, fieldName) {
  if (!Array.isArray(values)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  if (values.length > MAX_SENDERS) {
    throw new Error(
      `${fieldName} cannot contain more than ${MAX_SENDERS} entries.`,
    );
  }

  return [...new Set(values.map(normalizeSender))];
}

function validateEmailDetectionPreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid preferences payload.");
  }

  const allowedFields = ["trustedSenders", "blockedSenders"];

  const hasUnexpectedFields = Object.keys(input).some(
    (key) => !allowedFields.includes(key),
  );

  if (hasUnexpectedFields) {
    throw new Error("Unexpected preference fields.");
  }

  const trustedSenders = normalizeSenderList(
    input.trustedSenders,
    "trustedSenders",
  );

  const blockedSenders = normalizeSenderList(
    input.blockedSenders,
    "blockedSenders",
  );

  return {
    trustedSenders,
    blockedSenders,
  };
}

module.exports = {
  validateEmailDetectionPreferences,
};
