import { useEffect, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { getApplications } from "../services/ApplicationApi";
import { getReminders } from "../services/ReminderApi";
import DashboardOverview from "./DashboardOverview";
import PageNavigation from "./PageNavigation";

function DashboardLayout({ user, onLogout }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [remindersError, setRemindersError] = useState("");

  useEffect(() => {
    let active = true;

    getApplications()
      .then((data) => {
        if (active) setApplications(data);
      })
      .catch((err) => {
        if (active) {
          setError(`Could not load applications: ${err.message}`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

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

  const statusCounts = {};

  for (const application of applications) {
    statusCounts[application.status] =
      (statusCounts[application.status] || 0) + 1;
  }

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

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-topbar">
          <Link to="/dashboard" className="dashboard-brand">
            <img src="/favicon.svg" alt="" />
            <span>Application Tracker</span>
          </Link>

          <div className="dashboard-account">
            <span className="dashboard-user">
              {user.displayName || user.email || "Guest"}
            </span>

            <button type="button" className="logout-btn" onClick={onLogout}>
              Log Out
            </button>
          </div>
        </div>
      </header>

      <DashboardOverview stats={dashboardStats} loading={loading} />

      <PageNavigation />

      <Outlet
        context={{
          applications,
          setApplications,
          loading,
          error,
          setError,
          reminders,
          setReminders,
          remindersLoading,
          remindersError,
        }}
      />
    </div>
  );
}

export default DashboardLayout;
