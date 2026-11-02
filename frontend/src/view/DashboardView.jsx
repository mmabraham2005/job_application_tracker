import { useEffect, useMemo, useState } from 'react'
import ApplicationForm from '../components/ApplicationForm'
import ApplicationList from '../components/ApplicationList'
import { STATUSES } from '../constants/statuses'
import { DEFAULT_FILTER, SORT_OPTIONS } from '../constants/filters'
import { toInputDate } from '../utils/dates'
import {
  getApplications,
  createApplication,
  updateApplication,
  updateApplicationStatus,
  deleteApplication,
} from '../services/ApplicationApi'
import ReminderSection from "../components/ReminderSection";
import CalendarConnection from "../components/CalendarConnection";

const compareText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })
const sortNewest = (a, b) => new Date(b.applicationDate) - new Date(a.applicationDate)

const SortedFunction = {
  newest: sortNewest,
  oldest: (a, b) => sortNewest(b, a),
  'companyAsc': (a, b) => compareText(a.companyName, b.companyName) || sortNewest(a, b),
  'companyDesc': (a, b) => compareText(b.companyName, a.companyName) || sortNewest(a, b),
  'jobTitle': (a, b) => compareText(a.jobTitle, b.jobTitle) || sortNewest(a, b),
  status: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || sortNewest(a, b)
}

function DashboardView({ user, onLogout }) {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState(DEFAULT_FILTER)

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

  function updateFilter(name, value) {
    setFilter((prev) => ({ ...prev, [name] : value }))
  }

  function clearFilter() {
    setFilter(DEFAULT_FILTER)
  }

  const activeFilter = Object.keys(DEFAULT_FILTER).some((key) => filter[key] !== DEFAULT_FILTER[key])

  const statusCounts = useMemo(() => {
    const counts = {}
    for (const app of applications) {
      counts[app.status] = (counts[app.status] || 0) + 1
    }
    return counts
  }, [applications])

  const visibleApplications = useMemo(() => {
    const { search, status, startDate, endDate, sortBy } = filter
    const query = search.trim().toLowerCase()

    return applications
      .filter((app) => status === 'All' || app.status === status)
      .filter(
        (app) =>
          !query ||
          app.companyName.toLowerCase().includes(query) ||
          app.jobTitle.toLowerCase().includes(query),
      )
      .filter(
        (app) => {
          const applyDate = toInputDate(app.applicationDate)
          if (startDate && applyDate < startDate) return false
          if (endDate && applyDate > endDate) return false 
          return true
        }
      )
      .sort(SortedFunction[sortBy] ?? SortedFunction.newest)
  }, [applications, filter])

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <h1>Job Application Tracker</h1>
        <div className='user-bar'>
          <span className='user-display'>Signed in as {user.displayName || user.email || 'Guest'}</span>
          <button type="button" className="logout-btn" onClick={onLogout}>Log Out</button>
        </div>
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
            value={filter.search}
            onChange={(e) => updateFilter('search', e.target.value)}
            aria-label="Search applications"
          />
          <select
            value={filter.status}
            onChange={(e) => updateFilter('status', e.target.value)}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <label className='filter-by-date'>
            From <input 
                    type="date"
                    value={filter.startDate}
                    max={filter.endDate || undefined}
                    onChange={(e) => updateFilter('startDate', e.target.value)}
                    />
          </label>
          <label className='filter-by-date'>
            To <input 
                  type="date"
                  value={filter.endDate}
                  min={filter.startDate || undefined}
                  onChange={(e) => updateFilter('endDate', e.target.value)}
                  />
          </label>
          
          <select
            value={filter.sortBy}
            onChange={(e) => updateFilter('sortBy', e.target.value)}
            aria-label='Sort Applications'
            >
              {SORT_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
          </select>

          <button
            type="button"
            onClick={clearFilter}
            disabled={!activeFilter}>
            Clear Filters  
          </button>
        </div>

        {!loading && applications.length > 0 && (
          <p className='application-count' aria-live='polite'>
            {visibleApplications.length === applications.length 
            ? `Showing all ${applications.length} application${applications.length === 1 ? '' : 's'}`
            : `Showing ${visibleApplications.length} of ${applications.length} applications`}
          </p>
        )}

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="empty">Loading applications…</p>
        ) : applications.length === 0 ? (
          <p className="empty">No applications yet. Add your first one above.</p>
        ) : visibleApplications.length === 0 ? (
          <div className="empty">
            <p>No applications match your filters.</p>
            <button type='button' onClick={clearFilter}>Clear Filters</button>
          </div>
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
      <CalendarConnection user={user} />
      {!loading && (
  <ReminderSection applications={applications} user={user} />
)}
    </main>
  )
}

export default DashboardView
