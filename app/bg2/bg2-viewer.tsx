'use client';

export default function BG2Viewer() {
  return (
    <iframe
      src="https://bg2.grahampaasch.com/?pwd=bg2play"
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      allow="fullscreen; autoplay"
    />
  );
}
