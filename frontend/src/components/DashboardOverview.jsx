function DashboardOverview({ stats, loading }) {
  return (
    <section className="dashboard-overview" aria-label="Application overview">
      <div className="dashboard-stats">
        {stats.map((stat) => (
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
    </section>
  );
}

export default DashboardOverview;
