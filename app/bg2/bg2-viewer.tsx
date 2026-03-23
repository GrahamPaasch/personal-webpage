'use client';

import { useState } from 'react';

const NEKO_URL = 'https://bg2.grahampaasch.com/?pwd=bg2play';
const JITSI_URL = 'https://meet.jit.si/GrahamBG2SwordCoast'
  + '#config.startWithVideoMuted=true'
  + '&config.startWithAudioMuted=true'
  + '&config.disableDeepLinking=true'
  + '&config.prejoinPageEnabled=false'
  + '&config.disableInviteFunctions=true'
  + '&interfaceConfig.SHOW_JITSI_WATERMARK=false'
  + '&interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false';

export default function BG2Viewer() {
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>

      {/* Neko game — full viewport */}
      <iframe
        src={NEKO_URL}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="pointer-lock; microphone; camera; fullscreen; autoplay"
      />

      {/* Floating voice chat panel */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        zIndex: 10,
      }}>
        <button
          onClick={() => setVoiceOpen(v => !v)}
          title={voiceOpen ? 'Close voice chat' : 'Open voice chat'}
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
        {voiceOpen && (
          <iframe
            src={JITSI_URL}
            style={{
              width: '320px',
              height: '240px',
              border: '2px solid #c8a96e55',
              borderRadius: '6px',
              background: '#0a0a0f',
            }}
            allow="camera; microphone; fullscreen"
          />
        )}
      </div>
    </div>
  );
}
