const BASE_URL = "/api/reminders";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Reminder request failed");
  }

  return data;
}

export function getReminders() {
  return request(BASE_URL);
}

export function createReminder(values) {
  return request(BASE_URL, {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export function updateReminder(id, values) {
  return request(`${BASE_URL}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}

export function deleteReminder(id) {
  return request(`${BASE_URL}/${id}`, {
    method: "DELETE",
  });
}

export function retryCalendarSync(id) {
  return request(`${BASE_URL}/${id}/calendar-sync`, {
    method: "POST",
  });
}