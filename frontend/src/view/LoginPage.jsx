import { useState } from 'react'
import '../style/loginPage.css'
import { GoogleLogin } from '@react-oauth/google'
import { loginWithGoogle, loginAsGuest } from '../services/authAPI'

function LoginPage({ onLogin }) {
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    async function handleLogin(loginFn) {
        setError('')
        setBusy(true)
        try {
            onLogin(await loginFn())
        } catch (err) {
            setError(`Login failed: ${err.message}`)
        } finally {
            setBusy(false)
        }
    }

    return (
    <div className="login-page">
        <header className="login-header">
            <img className="login-logo" src="/logo.svg" alt="" />
            <span>Application Tracker</span>
        </header>
        
        <main className='login-box'>
            <section className='login-card'>
                <h1>Sign in to your account</h1>
                <div className='google-btn-wrap'>
                    <div className='login-btn google-btn' aria-hidden='true'>
                        <img src="/google-logo.svg" alt="" width="50" height="50"></img>
                        Sign in with Google
                    </div>
                    <div className='google-btn-overlay'>
                        <GoogleLogin
                            onSuccess={(res) => handleLogin(() => loginWithGoogle(res.credential))}
                            onError={() => setError('Google sign-in failed!')}
                            size="large"
                            shape="pill"
                            width="400"
                        />
                    </div>
                </div>

                <button type="button" className='login-btn guest-btn' 
                    onClick={() => handleLogin(loginAsGuest)}
                    disabled={busy}
                >
                    Continue as Guest
                </button>
                {error && <p className='login-error'>{error}</p>}
            </section>
        </main>
    </div>
    )
}

export default LoginPage