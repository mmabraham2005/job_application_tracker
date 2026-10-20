import { useEffect, useState } from 'react'
import DashboardView from './view/DashboardView'
import LoginPage from './view/LoginPage'
import { getCurrentUser, logout } from './services/authAPI'
import './App.css'
import { use } from 'react'

function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    getCurrentUser ().then(setUser).catch(() => setUser(null)).finally(() => setChecking(false))
  }, [])

  async function handleLogout() {
    try {
      await logout()
    } finally {
      setUser(null)
    }
  }

  if (checking) return <p>Loading...</p>
  if (!user) return <LoginPage onLogin={setUser} />

  return <DashboardView user={user} onLogout={handleLogout} />
}

export default App
