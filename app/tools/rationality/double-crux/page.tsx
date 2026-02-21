'use client';

import { useEffect, useState } from 'react';

export default function DoubleCruxPage() {
  const [htmlContent, setHtmlContent] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/rationality/double-crux.html')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load double-crux.html (${response.status})`);
        }
        return response.text();
      })
      .then((html) => {
        if (!cancelled) {
          setHtmlContent(html);
        }
      })
      .catch((error) => {
        console.error('Failed to load Double Crux tool HTML:', error);
        if (!cancelled) {
          setLoadError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: 'calc(100vh - 120px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6b7280',
          fontSize: 14,
        }}
      >
        Unable to load the Double Crux tool.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: 'calc(100vh - 120px)' }}>
      <iframe
        srcDoc={htmlContent}
        style={{ width: '100%', height: 'calc(100vh - 120px)', border: 'none', borderRadius: 8 }}
        title="Double Crux"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
