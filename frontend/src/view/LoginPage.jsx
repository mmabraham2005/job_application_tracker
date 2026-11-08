import { GoogleLogin } from "@react-oauth/google";
import { useRef, useState } from "react";
import { loginAsGuest, loginWithGoogle } from "../services/ApplicationApi";
import "../style/loginPage.css";

function LoginPage({ onLogin }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const loginInProgress = useRef(false);

  async function handleLogin(loginFn, provider) {
    if (loginInProgress.current) return;

    loginInProgress.current = true;
    setBusy(provider);
    setError("");

    try {
      const user = await loginFn();
      onLogin(user);
    } catch (err) {
      setError(err?.message || "Unable to sign in. Please try again.");
    } finally {
      loginInProgress.current = false;
      setBusy("");
    }
  }

  function handleGoogleSuccess(response) {
    if (!response.credential) {
      setError("Google did not return a valid credential.");
      return;
    }

    handleLogin(() => loginWithGoogle(response.credential), "google");
  }

  return (
    <div className="login-page">
      <header className="login-header">
        <a
          href="/"
          className="login-brand"
          aria-label="Application Tracker Home"
        >
          <img className="login-logo" src="/favicon.svg" alt="" />
          <span>Application Tracker</span>
        </a>
      </header>

      <main className="login-box">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-icon" aria-hidden="true">
            <img src="/favicon.svg" alt="" />
          </div>

          <h1 id="login-title">Welcome back</h1>

          <p className="login-description">
            Keep track of your job applications, interviews, and progress in one
            place.
          </p>

          <div
            className={`login-actions ${busy ? "is-busy" : ""}`}
            aria-busy={Boolean(busy)}
          >
            <div className="google-login-container">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {
                  setError("Google sign-in failed. Please try again.");
                }}
                theme="outline"
                size="large"
                shape="pill"
                text="continue_with"
                width="280"
              />
            </div>

            <div className="login-divider">
              <span>or</span>
            </div>

            <button
              type="button"
              className="guest-btn"
              onClick={() => handleLogin(loginAsGuest, "guest")}
              disabled={Boolean(busy)}
            >
              {busy === "guest" ? "Signing in..." : "Continue as Guest"}
            </button>
          </div>

          {busy === "google" && (
            <p className="login-feedback" role="status">
              Signing in with Google...
            </p>
          )}

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <p className="login-note">
            Get started quickly and keep your applications organized.
          </p>
        </section>
      </main>

      <footer className="login-footer">
        <p>Developed by Team 9</p>
      </footer>
    </div>
  );
}

export default LoginPage;
