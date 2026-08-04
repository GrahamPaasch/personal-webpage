import { ImageResponse } from 'next/og';

// Next picks this file up by convention and emits og:image + twitter:image
// (auto-upgrading twitter:card to summary_large_image) for every route that
// does not define its own.
export const runtime = 'edge';
export const alt = 'Graham Paasch — network engineering, Python, music, juggling';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #0b0e14 0%, #131a2a 100%)',
          color: '#e2e8f0',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#60a5fa',
          }}
        >
          grahampaasch.com
        </div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, marginTop: 24 }}>
          Graham Paasch
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            marginTop: 20,
            color: '#94a3b8',
            lineHeight: 1.4,
          }}
        >
          Network engineering, Python, and a lot of music and juggling.
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 48,
            height: 8,
            width: 220,
            background: '#2563eb',
            borderRadius: 4,
          }}
        />
      </div>
    ),
    size,
  );
}
