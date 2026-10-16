// Dates from <input type="date"> are saved as UTC midnight, so format in UTC
// to avoid showing the previous day in US time zones.

export function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString(undefined, { timeZone: 'UTC' })
}

export function toInputDate(isoDate) {
  return new Date(isoDate).toISOString().slice(0, 10)
}

export function todayInputDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now - offset).toISOString().slice(0, 10)
}
