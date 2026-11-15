const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function apiUrl(path) {
  return `${API_ORIGIN}${path}`;
}
