export const MAX_SENDERS = 100;
export const MAX_SENDER_LENGTH = 254;

function isValidDomain(domain) {
  if (domain.length > 253) {
    return false;
  }

  const labels = domain.split(".");

  if (labels.length < 2) {
    return false;
  }

  return labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
  );
}

function isValidEmail(address) {
  const parts = address.split("@");

  if (parts.length !== 2) {
    return false;
  }

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

export function normalizeSender(value) {
  if (typeof value !== "string") {
    throw new Error("Sender must be a string.");
  }

  let normalized = value.trim().toLowerCase();

  // Allow @example.com as a domain.
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

export function validateNewSender(value, existingSenders = []) {
  const sender = normalizeSender(value);

  if (existingSenders.includes(sender)) {
    throw new Error("This sender has already been added.");
  }

  if (existingSenders.length >= MAX_SENDERS) {
    throw new Error(`You can add up to ${MAX_SENDERS} senders per list.`);
  }

  return sender;
}

export function getOverlappingSenders(
  trustedSenders = [],
  blockedSenders = [],
) {
  const blockedSet = new Set(blockedSenders);

  return trustedSenders.filter((sender) => blockedSet.has(sender));
}

export function getSenderConflicts(trustedSenders = [], blockedSenders = []) {
  const conflicts = [];

  for (const trustedSender of trustedSenders) {
    for (const blockedSender of blockedSenders) {
      if (trustedSender === blockedSender) {
        conflicts.push({
          trustedSender,
          blockedSender,
          type: "full",
        });

        continue;
      }

      const trustedIsEmail = trustedSender.includes("@");

      const blockedIsEmail = blockedSender.includes("@");

      // A blocked domain overrides a trusted email.
      if (
        trustedIsEmail &&
        !blockedIsEmail &&
        trustedSender.split("@")[1] === blockedSender
      ) {
        conflicts.push({
          trustedSender,
          blockedSender,
          type: "full",
        });

        continue;
      }

      // A blocked email partially overrides a trusted domain.
      if (
        !trustedIsEmail &&
        blockedIsEmail &&
        blockedSender.split("@")[1] === trustedSender
      ) {
        conflicts.push({
          trustedSender,
          blockedSender,
          type: "partial",
        });
      }
    }
  }

  return conflicts;
}

export function arePreferencesEqual(first, second) {
  if (!first || !second) {
    return false;
  }

  function areSenderListsEqual(firstList, secondList) {
    if (!Array.isArray(firstList) || !Array.isArray(secondList)) {
      return false;
    }

    if (firstList.length !== secondList.length) {
      return false;
    }

    const firstSorted = [...firstList].sort();
    const secondSorted = [...secondList].sort();

    return firstSorted.every((sender, index) => sender === secondSorted[index]);
  }

  return (
    areSenderListsEqual(first.trustedSenders, second.trustedSenders) &&
    areSenderListsEqual(first.blockedSenders, second.blockedSenders)
  );
}

export function validatePreferencesResponse(response) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("Invalid email detection preferences response.");
  }

  function validateSenderList(list) {
    if (!Array.isArray(list) || list.length > MAX_SENDERS) {
      throw new Error("Invalid sender list in preferences response.");
    }

    const validated = [];

    for (const sender of list) {
      const normalized = validateNewSender(sender, validated);

      if (sender !== normalized) {
        throw new Error(
          "Preferences response contains an unnormalized sender.",
        );
      }

      validated.push(normalized);
    }

    return validated;
  }

  return {
    trustedSenders: validateSenderList(response.trustedSenders),
    blockedSenders: validateSenderList(response.blockedSenders),
  };
}

export function reconcilePreferencesSave(
  previousPreferences,
  submittedPreferences,
  serverPreferences,
) {
  const previous = validatePreferencesResponse(previousPreferences);

  const submitted = validatePreferencesResponse(submittedPreferences);

  const server = validatePreferencesResponse(serverPreferences);

  if (arePreferencesEqual(server, submitted)) {
    return {
      status: "saved",
      preferences: server,
    };
  }

  if (arePreferencesEqual(server, previous)) {
    return {
      status: "unchanged",
      preferences: server,
    };
  }

  return {
    status: "conflict",
    preferences: server,
  };
}
