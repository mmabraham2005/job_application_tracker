import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./App.css";
import DashboardLayout from "./components/DashboardLayout";
import { getCurrentUser, logout } from "./services/ApplicationApi";
import DashboardView from "./view/DashboardView";
import LoginPage from "./view/LoginPage";

function RootRedirect() {
  const { search } = useLocation();

  return <Navigate to={`/dashboard${search}`} replace />;
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }

  if (checking) return <p>Loading...</p>;

  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <Routes>
      <Route element={<DashboardLayout user={user} onLogout={handleLogout} />}>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/dashboard"
          element={<DashboardView user={user} onLogout={handleLogout} />}
        />
        <Route
          path="/applications"
          element={<DashboardView user={user} onLogout={handleLogout} />}
        />
        <Route
          path="/reminders"
          element={<DashboardView user={user} onLogout={handleLogout} />}
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
