'use client';

import { useState, useEffect, useRef } from 'react';

const NEKO_URL = 'https://bg2.grahampaasch.com/?pwd=bg2play';

export default function BG2Viewer() {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const jitsiRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<unknown>(null);

  useEffect(() => {
    if (!voiceOpen) {
      if (apiRef.current) {
        (apiRef.current as { dispose: () => void }).dispose();
        apiRef.current = null;
      }
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      if (!jitsiRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiRef.current = new (window as any).JitsiMeetExternalAPI('meet.jit.si', {
        roomName: 'GrahamBG2SwordCoast',
        width: '100%',
        height: '100%',
        parentNode: jitsiRef.current,
        configOverwrite: {
          startWithVideoMuted: true,
          startWithAudioMuted: true,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup', 'settings'],
        },
      });
    };
    document.head.appendChild(script);

    return () => {
      if (apiRef.current) {
        (apiRef.current as { dispose: () => void }).dispose();
        apiRef.current = null;
      }
      script.remove();
    };
  }, [voiceOpen]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>

      {/* Neko game — full viewport */}
      <iframe
        src={NEKO_URL}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="pointer-lock; microphone; camera; fullscreen; autoplay"
      />

      {/* Floating voice chat panel — top-center */}
      <div style={{
        position: 'absolute',
        left: '1rem',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        zIndex: 10,
      }}>
        <button
          onClick={() => setVoiceOpen(v => !v)}
          style={{
            padding: '0.5rem 1rem',
            background: voiceOpen ? '#c8a96e33' : '#0a0a0fcc',
            border: '2px solid #c8a96e88',
            borderRadius: '4px',
            color: '#c8a96e',
            cursor: 'pointer',
            fontFamily: 'serif',
            fontSize: '0.9rem',
            backdropFilter: 'blur(4px)',
            marginBottom: '0.5rem',
          }}
        >
          {voiceOpen ? '✕ Voice Chat' : '🎙 Voice Chat'}
        </button>
        <div
          ref={jitsiRef}
          style={{
            display: voiceOpen ? 'block' : 'none',
            width: '360px',
            height: '260px',
            border: '2px solid #c8a96e55',
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#0a0a0f',
          }}
        />
      </div>
    </div>
  );
}
