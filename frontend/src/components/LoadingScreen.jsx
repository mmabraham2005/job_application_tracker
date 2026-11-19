import "../style/loadingScreen.css";

function LoadingScreen() {
  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <div className="loading-content">
        <div className="loading-logo">
          <img src="/logo.svg" alt="" />
        </div>

        <h1>Job Application Tracker</h1>
        <p>Preparing your workspace...</p>

        <div className="loading-spinner" aria-hidden="true" />
      </div>
    </main>
  );
}

export default LoadingScreen;
