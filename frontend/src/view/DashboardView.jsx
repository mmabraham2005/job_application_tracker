import { useEffect, useMemo, useState } from "react";
import ApplicationForm from "../components/ApplicationForm";
import ApplicationList from "../components/ApplicationList";
import CalendarConnection from "../components/CalendarConnection";
import CalendarView from "../components/CalendarView";
import ReminderSection from "../components/ReminderSection";
import { DEFAULT_FILTER, SORT_OPTIONS } from "../constants/filters";
import { STATUSES } from "../constants/statuses";
import {
  createApplication,
  deleteApplication,
  getApplications,
  updateApplication,
  updateApplicationStatus,
} from "../services/ApplicationApi";
import { getReminders } from "../services/ReminderApi";
import { toInputDate } from "../utils/dates";

const compareText = (a, b) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });
const sortNewest = (a, b) =>
  new Date(b.applicationDate) - new Date(a.applicationDate);

const SortedFunction = {
  newest: sortNewest,
  oldest: (a, b) => sortNewest(b, a),
  companyAsc: (a, b) =>
    compareText(a.companyName, b.companyName) || sortNewest(a, b),
  companyDesc: (a, b) =>
    compareText(b.companyName, a.companyName) || sortNewest(a, b),
  jobTitle: (a, b) => compareText(a.jobTitle, b.jobTitle) || sortNewest(a, b),
  status: (a, b) =>
    STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) || sortNewest(a, b),
};

function DashboardView({ user, onLogout }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState(DEFAULT_FILTER);

  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [remindersError, setRemindersError] = useState("");

  useEffect(() => {
    let active = true;

    getReminders()
      .then((data) => {
        if (active) setReminders(data);
      })
      .catch((err) => {
        if (active) setRemindersError(err.message);
      })
      .finally(() => {
        if (active) setRemindersLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    getApplications()
      .then(setApplications)
      .catch((err) => setError(`Could not load applications: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  function replaceApplication(updated) {
    setApplications((apps) =>
      apps.map((app) => (app._id === updated._id ? updated : app)),
    );
  }

  async function handleCreate(values) {
    const created = await createApplication(values);
    setApplications((apps) => [...apps, created]);
  }

  async function handleUpdate(values) {
    const updated = await updateApplication(editing._id, values);
    replaceApplication(updated);
    setEditing(null);
  }

  async function handleStatusChange(id, status) {
    setError("");
    try {
      replaceApplication(await updateApplicationStatus(id, status));
    } catch (err) {
      setError(`Could not update status: ${err.message}`);
    }
  }

  async function handleDelete(id) {
    setError("");
    try {
      await deleteApplication(id);
      setApplications((apps) => apps.filter((app) => app._id !== id));
      setReminders((previous) =>
        previous.filter((reminder) => reminder.applicationId?._id !== id),
      );
      if (editing?._id === id) setEditing(null);
    } catch (err) {
      setError(`Could not delete application: ${err.message}`);
    }
  }

  function updateFilter(name, value) {
    setFilter((prev) => ({ ...prev, [name]: value }));
  }

  function clearFilter() {
    setFilter(DEFAULT_FILTER);
  }

  const activeFilter = Object.keys(DEFAULT_FILTER).some(
    (key) => filter[key] !== DEFAULT_FILTER[key],
  );

  const statusCounts = useMemo(() => {
    const counts = {};
    for (const app of applications) {
      counts[app.status] = (counts[app.status] || 0) + 1;
    }
    return counts;
  }, [applications]);

  const dashboardStats = [
    {
      label: "Total Applications",
      value: applications.length,
      icon: "◈",
    },
    {
      label: "Applied",
      value: statusCounts["Applied"] || 0,
      icon: "↗",
    },
    {
      label: "Interviews",
      value:
        (statusCounts["Interview"] || 0) +
        (statusCounts["Second Interview"] || 0) +
        (statusCounts["Final Interview"] || 0),
      icon: "◎",
    },
    {
      label: "Offers",
      value: statusCounts["Offer"] || 0,
      icon: "★",
    },
  ];

  const visibleApplications = useMemo(() => {
    const { search, status, startDate, endDate, sortBy } = filter;
    const query = search.trim().toLowerCase();

    return applications
      .filter((app) => status === "All" || app.status === status)
      .filter(
        (app) =>
          !query ||
          app.companyName.toLowerCase().includes(query) ||
          app.jobTitle.toLowerCase().includes(query),
      )
      .filter((app) => {
        const applyDate = toInputDate(app.applicationDate);
        if (startDate && applyDate < startDate) return false;
        if (endDate && applyDate > endDate) return false;
        return true;
      })
      .sort(SortedFunction[sortBy] ?? SortedFunction.newest);
  }, [applications, filter]);

  const visibleReminders = useMemo(() => {
    const applicationIds = new Set(
      applications.map((application) => application._id),
    );

    return reminders.filter((reminder) =>
      applicationIds.has(reminder.applicationId?._id),
    );
  }, [applications, reminders]);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-topbar">
          <a href="/" className="dashboard-brand">
            <img src="/favicon.svg" alt="" />
            <span>Application Tracker</span>
          </a>

          <div className="dashboard-account">
            <span className="dashboard-user">
              {user.displayName || user.email || "Guest"}
            </span>

            <button type="button" className="logout-btn" onClick={onLogout}>
              Log Out
            </button>
          </div>
        </div>

        <div className="dashboard-welcome">
          <h1>Your Dashboard</h1>
          <p>Track your applications and stay on top of your job search.</p>
        </div>
      </header>

      {applications.length > 0 && (
        <section
          className="dashboard-overview"
          aria-label="Application overview"
        >
          <div className="dashboard-stats">
            {dashboardStats.map((stat) => (
              <div className="dashboard-stat-card" key={stat.label}>
                <div className="dashboard-stat-top">
                  <span>{stat.label}</span>
                  <span className="dashboard-stat-icon" aria-hidden="true">
                    {stat.icon}
                  </span>
                </div>

                <strong>{loading ? "—" : stat.value}</strong>
              </div>
            ))}
          </div>

          <nav className="dashboard-quick-actions" aria-label="Quick actions">
            <a href="#add-application" className="quick-action-primary">
              + Add Application
            </a>

            <a href="#applications" className="quick-action-secondary">
              View Applications
            </a>

            <a href="#reminders" className="quick-action-secondary">
              View Reminders
            </a>
          </nav>
        </section>
      )}

      <div id="add-application" className="dashboard-form-section">
        <ApplicationForm
          key={editing?._id ?? "new"}
          application={editing}
          onSubmit={editing ? handleUpdate : handleCreate}
          onCancel={() => setEditing(null)}
        />
      </div>

      <section id="applications" className="applications">
        <div className="dashboard-section-heading">
          <div>
            <h2>Your Applications</h2>
            <p>Manage and track your job applications.</p>
          </div>
        </div>
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search company or job title"
            value={filter.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            aria-label="Search applications"
          />
          <select
            value={filter.status}
            onChange={(e) => updateFilter("status", e.target.value)}
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <label className="filter-by-date">
            From{" "}
            <input
              type="date"
              value={filter.startDate}
              max={filter.endDate || undefined}
              onChange={(e) => updateFilter("startDate", e.target.value)}
            />
          </label>
          <label className="filter-by-date">
            To{" "}
            <input
              type="date"
              value={filter.endDate}
              min={filter.startDate || undefined}
              onChange={(e) => updateFilter("endDate", e.target.value)}
            />
          </label>

          <select
            value={filter.sortBy}
            onChange={(e) => updateFilter("sortBy", e.target.value)}
            aria-label="Sort Applications"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="button" onClick={clearFilter} disabled={!activeFilter}>
            Clear Filters
          </button>
        </div>

        {!loading && applications.length > 0 && (
          <p className="application-count" aria-live="polite">
            {visibleApplications.length === applications.length
              ? `Showing all ${applications.length} application${applications.length === 1 ? "" : "s"}`
              : `Showing ${visibleApplications.length} of ${applications.length} applications`}
          </p>
        )}

        {error && <p className="error">{error}</p>}

        {loading ? (
          <p className="empty">Loading applications…</p>
        ) : applications.length === 0 ? (
          <p className="empty">
            No applications yet. Add your first one above.
          </p>
        ) : visibleApplications.length === 0 ? (
          <div className="empty">
            <p>No applications match your filters.</p>
            <button type="button" onClick={clearFilter}>
              Clear Filters
            </button>
          </div>
        ) : (
          <ApplicationList
            applications={visibleApplications}
            onStatusChange={handleStatusChange}
            onEdit={(app) => {
              setEditing(app);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onDelete={handleDelete}
          />
        )}
      </section>

      <CalendarConnection user={user} />

      <CalendarView
        reminders={visibleReminders}
        loading={remindersLoading || loading}
        error={remindersError}
      />

      {!loading && (
        <div id="reminders" className="dashboard-reminders-section">
          <ReminderSection
            applications={applications}
            user={user}
            reminders={reminders}
            setReminders={setReminders}
            loading={remindersLoading}
            loadError={remindersError}
          />
        </div>
      )}
    </main>
  );
}

export default DashboardView;
