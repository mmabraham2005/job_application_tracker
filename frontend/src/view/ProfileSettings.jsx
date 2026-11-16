import { useEffect, useState } from "react";
import { getProfile, updateProfile } from "../services/ApplicationApi";

function ProfileSettings({ user, onUserUpdated }) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load the latest profile information from the backend.
  useEffect(() => {
    let active = true;

    getProfile()
      .then((profile) => {
        if (!active) return;

        setDisplayName(profile.displayName || "");
        setEmail(profile.email || "");
        setAvatarUrl(profile.avatarUrl || "");
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Could not load your profile.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setError("Display name cannot be empty.");
      return;
    }

    setSaving(true);

    try {
      const updatedUser = await updateProfile(trimmedName);

      setDisplayName(updatedUser.displayName || "");
      setEmail(updatedUser.email || "");
      setAvatarUrl(updatedUser.avatarUrl || "");

      // Update the user in App.jsx so the dashboard header
      // immediately displays the new name.
      onUserUpdated?.(updatedUser);

      setSuccess("Your profile has been updated successfully.");
    } catch (err) {
      setError(err.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="dashboard-page">
        <div className="dashboard-welcome">
          <h1>Profile Settings</h1>
          <p>Loading your account information...</p>
        </div>
      </main>
    );
  }

  const isGoogleUser = user?.authProvider === "google";

  return (
    <main className="dashboard-page">
      <div className="dashboard-welcome">
        <h1>Profile Settings</h1>
        <p>Manage your personal information and account details.</p>
      </div>

      <section className="profile-card profile-identity">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="profile-avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="profile-avatar profile-avatar-placeholder">
            {(displayName || user?.displayName || "G").charAt(0).toUpperCase()}
          </div>
        )}

        <div className="profile-identity-info">
          <h2>{user?.displayName || "Your Profile"}</h2>
          <p>{email || "Guest account"}</p>
          <span className="profile-account-badge">
            {isGoogleUser ? "Google Account" : "Guest Account"}
          </span>
        </div>
      </section>

      <section className="profile-card">
        <div className="profile-section-heading">
          <h2>Personal Information</h2>
          <p>Update how your name appears throughout the dashboard.</p>
        </div>

        <form onSubmit={handleSubmit} className="profile-settings-form">
          <div className="profile-form-field">
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setSuccess("");
              }}
              placeholder="Enter your display name"
              maxLength={100}
              disabled={saving}
              required
            />
          </div>

          <div className="profile-form-field">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              placeholder="Not available for guest accounts"
              readOnly
              disabled
            />
            <p className="profile-field-hint">
              {isGoogleUser
                ? "Your email is linked to your Google account."
                : "Guest accounts do not have a linked email address."}
            </p>
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="profile-success" role="status">
              {success}
            </p>
          )}

          <div className="profile-settings-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default ProfileSettings;
