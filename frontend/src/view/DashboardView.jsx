import { useEffect, useMemo, useState } from 'react'
import ApplicationForm from '../components/ApplicationForm'
import ApplicationList from '../components/ApplicationList'
import { STATUSES } from '../constants/statuses'
import {
  getApplications,
  createApplication,
  updateApplication,
  updateApplicationStatus,
  deleteApplication,
} from '../services/ApplicationApi'

function DashboardView() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  useEffect(() => {
    getApplications()
      .then(setApplications)
      .catch((err) => setError(`Could not load applications: ${err.message}`))
      .finally(() => setLoading(false))
  }, [])

  function replaceApplication(updated) {
    setApplications((apps) => apps.map((app) => (app._id === updated._id ? updated : app)))
  }

  async function handleCreate(values) {
    const created = await createApplication(values)
    setApplications((apps) => [...apps, created])
  }

  async function handleUpdate(values) {
    const updated = await updateApplication(editing._id, values)
    replaceApplication(updated)
    setEditing(null)
  }

  async function handleStatusChange(id, status) {
    setError('')
    try {
      replaceApplication(await updateApplicationStatus(id, status))
    } catch (err) {
      setError(`Could not update status: ${err.message}`)
    }
  }

  async function handleDelete(id) {
    setError('')
    try {
      await deleteApplication(id)
      setApplications((apps) => apps.filter((app) => app._id !== id))
      if (editing?._id === id) setEditing(null)
    } catch (err) {
      setError(`Could not delete application: ${err.message}`)
    }
  }

  const statusCounts = useMemo(() => {
    const counts = {}
    for (const app of applications) {
      counts[app.status] = (counts[app.status] || 0) + 1
    }
    return counts
  }, [applications])

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase()
    return applications
      .filter((app) => statusFilter === 'All' || app.status === statusFilter)
      .filter(
        (app) =>
          !query ||
          app.companyName.toLowerCase().includes(query) ||
          app.jobTitle.toLowerCase().includes(query),
      )
      .sort((a, b) => new Date(b.applicationDate) - new Date(a.applicationDate))
  }, [applications, search, statusFilter])

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <h1>Job Application Tracker</h1>
        <p>{applications.length} total applications</p>
      </header>

      {applications.length > 0 && (
        <ul className="status-summary">
          {STATUSES.filter((status) => statusCounts[status]).map((status) => (
            <li key={status}>
              <span className="count">{statusCounts[status]}</span> {status}
            </li>
          ))}
        </ul>
      )}

      <ApplicationForm
        key={editing?._id ?? 'new'}
        application={editing}
        onSubmit={editing ? handleUpdate : handleCreate}
        onCancel={() => setEditing(null)}
      />

      <section className="applications">
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search company or job title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search applications"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="empty">Loading applications…</p>
        ) : applications.length === 0 ? (
          <p className="empty">No applications yet. Add your first one above.</p>
        ) : visibleApplications.length === 0 ? (
          <p className="empty">No applications match your filters.</p>
        ) : (
          <ApplicationList
            applications={visibleApplications}
            onStatusChange={handleStatusChange}
            onEdit={(app) => {
              setEditing(app)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onDelete={handleDelete}
          />
        )}
      </section>
    </main>
  )
}

export default DashboardView
