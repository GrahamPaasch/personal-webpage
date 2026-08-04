import Link from 'next/link';

export const metadata = {
  title: 'Page not found',
  description: 'That page does not exist on grahampaasch.com.',
};

export default function NotFound() {
  return (
    <div className="card">
      <h1>404 — page not found</h1>
      <p className="muted">
        That link does not point anywhere on this site. It may have moved, or it may never
        have existed.
      </p>
      <div className="cta-row" style={{ marginTop: 16 }}>
        <Link className="button primary" href="/">Back home</Link>
        <Link className="button" href="/writings">Writings</Link>
        <Link className="button" href="/tools">Toolbox</Link>
      </div>
    </div>
  );
}
