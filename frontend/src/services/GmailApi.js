import { apiUrl } from "./apiConfig";

const BASE_URL = "/api/gmail";

async function request(path, options = {}) {
  const response = await fetch(apiUrl(`${BASE_URL}${path}`), {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.error ||
        data?.message ||
        `Gmail request failed (${response.status})`,
    );

    error.status = response.status;

    throw error;
  }

  if (data === null) {
    throw new Error("Invalid response from the Gmail service.");
  }

  return data;
}

// ==================================================
// Gmail connection
// ==================================================

export function getGmailStatus(options = {}) {
  return request("/status", options);
}

export function connectGmail() {
  window.location.assign(apiUrl(`${BASE_URL}/connect`));
}

export function disconnectGmail() {
  return request("/disconnect", {
    method: "POST",
  });
}

// ==================================================
// Application detection and import
// ==================================================

export function scanGmailApplications(options = {}) {
  return request("/suggestions", options);
}

export function importGmailApplication({
  messageId,
  companyName,
  jobTitle,
  applicationDate,
  status,
}) {
  return request("/import", {
    method: "POST",
    body: JSON.stringify({
      messageId,
      companyName,
      jobTitle,
      applicationDate,
      status,
    }),
  });
}

// ==================================================
// Email detection preferences
// ==================================================

export function getEmailDetectionPreferences(options = {}) {
  return request("/preferences", options);
}

export function updateEmailDetectionPreferences({
  trustedSenders,
  blockedSenders,
}) {
  return request("/preferences", {
    method: "PUT",
    body: JSON.stringify({
      trustedSenders,
      blockedSenders,
    }),
  });
}
