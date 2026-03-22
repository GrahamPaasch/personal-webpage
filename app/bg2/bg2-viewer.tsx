'use client';

import { useState } from 'react';

export default function BG2Viewer() {
  const [audioStarted, setAudioStarted] = useState(false);

  const startAudio = () => {
    const audio = new Audio('https://bg2.grahampaasch.com:8443/bg2audio');
    audio.crossOrigin = 'anonymous';
    audio.play().then(() => setAudioStarted(true)).catch(() => {});
  };

  return (
    <>
      <iframe
        src="https://bg2.grahampaasch.com:6080/vnc.html?autoconnect=true&resize=scale"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
        allow="fullscreen"
      />
      {!audioStarted && (
        <button
          onClick={startAudio}
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
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
      )}
    </>
  );
}
