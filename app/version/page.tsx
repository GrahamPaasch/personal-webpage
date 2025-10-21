export const metadata = {
  title: 'Version',
  description: 'Deployed build information',
};

export default function VersionPage() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown';
  const commit = process.env.NEXT_PUBLIC_COMMIT_SHA || 'unknown';

  return (
    <section className="grid">
      <div className="card">
        <h1>Deployed Version</h1>
        <p className="muted">Screenshot this page to confirm the live build.</p>
        <div className="post-list">
          <div className="post-item">Version: <strong>{version}</strong></div>
          <div className="post-item">Build Time: <strong>{buildTime}</strong></div>
          <div className="post-item">Commit: <strong>{commit}</strong></div>
        </div>
      </div>
    </section>
  );
}

