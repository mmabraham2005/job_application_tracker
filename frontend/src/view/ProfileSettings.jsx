
import { useEffect, useState } from "react";
import {
  getProfile,
  updateProfile,
} from "../services/ApplicationApi";

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
      <main className="dashboard-section">
        <p>Loading profile...</p>
      </main>
    );
  }

  return (
    <main className="dashboard-section">
      <section className="section-heading">
        <div>
          <h1>Profile Settings</h1>
          <p>Manage your account information.</p>
        </div>
      </section>

      <section className="dashboard-card profile-settings-card">
        <div className="profile-settings-header">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Profile"
              className="profile-avatar"
            />
          ) : (
            <div className="profile-avatar profile-avatar-placeholder">
              {displayName.charAt(0).toUpperCase() || "?"}
            </div>
          )}

          <div>
            <h2>{displayName || "Your Profile"}</h2>
            <p>{email || "Guest account"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="profile-settings-form">
          <div className="form-group">
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
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              readOnly
              disabled
            />
            <p className="profile-field-hint">
              Your email address cannot be changed here.
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
            <button
              type="submit"
              className="primary"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default ProfileSettings;
