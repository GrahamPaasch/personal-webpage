'use client';

import { useRef, useState } from 'react';

export default function BG2Viewer() {
  const [audioStarted, setAudioStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#000' }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a', flexShrink: 0 }}>
        {!audioStarted ? (
          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.src = 'https://bg2.grahampaasch.com:8443/bg2audio';
                audioRef.current.play().then(() => setAudioStarted(true)).catch(() => setAudioStarted(true));
              }
            }}
            style={{ padding: '12px 32px', background: '#4a3728', color: '#d4a574', border: '2px solid #d4a574', borderRadius: 6, fontFamily: 'serif', fontSize: '1.1rem', cursor: 'pointer' }}
          >
            Enable Audio
          </button>
        ) : (
          <span style={{ color: '#d4a574', fontFamily: 'serif' }}>Audio Enabled</span>
        )}
      </div>
      {audioStarted && (
        <iframe
          src="https://bg2.grahampaasch.com:6080/vnc.html?autoconnect=true&resize=scale"
          style={{ width: '100%', flex: 1, border: 'none', display: 'block' }}
          allow="fullscreen"
        />
      )}
      <audio ref={audioRef} preload="none" />
    </div>
  );
}
