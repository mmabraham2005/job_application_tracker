import { useState } from 'react'
import { STATUSES, DEFAULT_STATUS } from '../constants/statuses'
import { toInputDate, todayInputDate } from '../utils/dates'

function initialValues(application) {
  if (application) {
    return {
      companyName: application.companyName,
      jobTitle: application.jobTitle,
      applicationDate: toInputDate(application.applicationDate),
      status: application.status,
    }
  }
  return {
    companyName: '',
    jobTitle: '',
    applicationDate: todayInputDate(),
    status: DEFAULT_STATUS,
  }
}

// Used for both adding and editing. When `application` is passed, the form is
// in edit mode: status is changed from the list instead, because the update
// endpoint does not accept it.
function ApplicationForm({ application, onSubmit, onCancel }) {
  const isEditing = Boolean(application)
  const [values, setValues] = useState(() => initialValues(application))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    setValues({ ...values, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const companyName = values.companyName.trim()
    const jobTitle = values.jobTitle.trim()

    if (!companyName || !jobTitle || !values.applicationDate) {
      setError('Company, job title and date are required.')
      return
    }

    const payload = { companyName, jobTitle, applicationDate: values.applicationDate }
    if (!isEditing) payload.status = values.status

    setSubmitting(true)
    setError('')
    try {
      await onSubmit(payload)
      if (!isEditing) setValues(initialValues())
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="application-form" onSubmit={handleSubmit}>
      <h2>{isEditing ? 'Edit application' : 'Add application'}</h2>

      <div className="form-fields">
        <label>
          Company
          <input
            name="companyName"
            value={values.companyName}
            onChange={handleChange}
            placeholder="e.g. Google"
            required
          />
        </label>

        <label>
          Job title
          <input
            name="jobTitle"
            value={values.jobTitle}
            onChange={handleChange}
            placeholder="e.g. Software Engineer Intern"
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
            required
          />
        </label>

        {!isEditing && (
          <label>
            Status
            <select name="status" value={values.status} onChange={handleChange}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEditing ? 'Save changes' : 'Add application'}
        </button>
        {isEditing && (
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default ApplicationForm
