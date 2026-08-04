'use client';

import { useEffect } from 'react';

/**
 * Catches errors thrown by the root layout itself. This replaces the entire
 * document, so it renders its own <html>/<body> and cannot rely on globals.css
 * (the layout that imports it is exactly what failed) — hence inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global error boundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0e14',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: 24,
        }}
      >
        <main style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 12 }}>This site failed to load</h1>
          <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>
            Something went wrong before the page could render. Reloading usually helps.
          </p>
          {error.digest && (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
          <button
            onClick={reset}
            type="button"
            style={{
              marginTop: 16,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
