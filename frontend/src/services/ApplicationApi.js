// Vite proxies /api to the backend on http://localhost:5001
const BASE_URL = '/api/applications'

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const data = await res.json().catch(() => null)

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Request failed (${res.status})`)
  }
  return data
}

export function getApplications() {
  return request(BASE_URL)
}

export function createApplication(application) {
  return request(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(application),
  })
}

// Only companyName, jobTitle and applicationDate are accepted by the backend
export function updateApplication(id, fields) {
  return request(`${BASE_URL}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export function updateApplicationStatus(id, status) {
  return request(`${BASE_URL}/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function deleteApplication(id) {
  return request(`${BASE_URL}/${id}`, { method: 'DELETE' })
}
