'use client';

import { useRef, useState } from 'react';

export default function BG2Viewer() {
  const [audioStarted, setAudioStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const startAudio = () => {
    if (audioRef.current) {
      audioRef.current.src = 'https://bg2.grahampaasch.com:8443/bg2audio';
      audioRef.current.play().then(() => setAudioStarted(true)).catch(() => {});
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <iframe
        src="https://bg2.grahampaasch.com:6080/vnc.html?autoconnect=true&resize=scale"
        style={{
          width: '100%',
          height: audioStarted ? '100%' : 'calc(100% - 60px)',
          border: 'none',
          display: 'block',
        }}
        allow="fullscreen"
      />
      {!audioStarted && (
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a1a',
          }}
        >
          <button
            onClick={startAudio}
            style={{
              padding: '10px 24px',
              background: '#4a3728',
              color: '#d4a574',
              border: '2px solid #d4a574',
              borderRadius: 6,
              fontFamily: 'serif',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Enable Audio
          </button>
        </div>
      )}
      <audio ref={audioRef} preload="none" />
    </div>
  );
}
