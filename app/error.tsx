'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Route-level error boundary. Without this, an unhandled render error anywhere
 * under app/ falls through to Next's built-in overlay, which in production is a
 * bare "Application error: a client-side exception has occurred".
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the Vercel function/browser logs alongside the digest, which
    // is the only handle you get on a production stack trace.
    console.error('[app error boundary]', error);
  }, [error]);

  return (
    <div className="card">
      <h1>Something broke on this page</h1>
      <p className="muted">
        This one is on me, not you. The rest of the site should still work.
      </p>
      {error.digest && (
        <p className="muted small">
          Reference: <code>{error.digest}</code>
        </p>
      )}
      <div className="cta-row" style={{ marginTop: 16 }}>
        <button className="button primary" onClick={reset} type="button">
          Try again
        </button>
        <Link className="button" href="/">Back home</Link>
      </div>
    </div>
  );
}
