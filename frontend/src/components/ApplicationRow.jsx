import { useState } from 'react'
import { STATUSES } from '../constants/statuses'
import { formatDate } from '../utils/dates'

function statusClass(status) {
  return `status status-${status.toLowerCase().replace(/\s+/g, '-')}`
}

function ApplicationRow({ application, onStatusChange, onEdit, onDelete }) {
  const [busy, setBusy] = useState(false)

  async function run(action) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td data-label="Company">{application.companyName}</td>
      <td data-label="Job title">{application.jobTitle}</td>
      <td data-label="Date applied">{formatDate(application.applicationDate)}</td>
      <td data-label="Status">
        <select
          className={statusClass(application.status)}
          value={application.status}
          disabled={busy}
          onChange={(e) => run(() => onStatusChange(application._id, e.target.value))}
          aria-label={`Status for ${application.companyName}`}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </td>
      <td className="row-actions">
        <button type="button" onClick={() => onEdit(application)} disabled={busy}>
          Edit
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete ${application.jobTitle} at ${application.companyName}?`)) {
              run(() => onDelete(application._id))
            }
          }}
        >
          Delete
        </button>
      </td>
    </tr>
  )
}

export default ApplicationRow
