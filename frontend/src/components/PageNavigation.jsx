import { Link, NavLink, useLocation } from "react-router-dom";

const navigation = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/applications", label: "Applications" },
  { path: "/reminders", label: "Reminders" },
];

function PageNavigation() {
  const { pathname } = useLocation();

  function handleAddApplicationClick() {
    if (pathname === "/applications") {
      document.getElementById("add-application")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  return (
    <nav className="dashboard-navigation" aria-label="Main navigation">
      <div className="dashboard-navigation-links">
        {navigation.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `dashboard-nav-link${isActive ? " is-active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <Link
        to="/applications#add-application"
        onClick={handleAddApplicationClick}
        className="dashboard-add-button"
      >
        + Add Application
      </Link>
    </nav>
  );
}

export default PageNavigation;
