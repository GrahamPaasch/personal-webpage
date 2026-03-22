'use client';

import { useEffect, useRef, useState } from 'react';

export default function BG2Viewer() {
  const [audioStarted, setAudioStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startAudio = async () => {
    const audio = new Audio();
    audioRef.current = audio;

    if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      audio.src = 'https://bg2.grahampaasch.com:8443/stream.m3u8';
      audio.play().then(() => setAudioStarted(true)).catch(() => {});
    } else {
      const Hls = (await import('hls.js')).default;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource('https://bg2.grahampaasch.com:8443/stream.m3u8');
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().then(() => setAudioStarted(true)).catch(() => {});
        });
      }
    }
  };

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

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
    </div>
  );
}
