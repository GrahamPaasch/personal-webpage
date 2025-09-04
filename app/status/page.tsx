export const metadata = { title: 'Status' };

export default function StatusPage() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_GIT_SHA || 'unknown';
  const branch = process.env.VERCEL_GIT_COMMIT_REF || 'unknown';
  const env = process.env.VERCEL_ENV || 'local';
  const deployedAt = new Date().toISOString();

  return (
    <div className="card">
      <h1>Deployment Status</h1>
      <ul className="muted" style={{ listStyle: 'none', padding: 0, lineHeight: 1.8 }}>
        <li><strong>Env:</strong> {env}</li>
        <li><strong>Branch:</strong> {branch}</li>
        <li><strong>Commit:</strong> {sha.slice(0, 7)}</li>
        <li><strong>Time:</strong> {deployedAt}</li>
      </ul>
      <p className="muted">Use this page to confirm which deployment you’re hitting.</p>
    </div>
  );
}

