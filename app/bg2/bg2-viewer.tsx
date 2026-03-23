'use client';

import { useState, useEffect, useRef } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  RoomAudioRenderer,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';

const NEKO_URL = 'https://bg2.grahampaasch.com/?pwd=bg2play';
const BG2_ROOM = 'bg2-voice';
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

function randomName() {
  const adj = ['Swift', 'Bold', 'Dark', 'Iron', 'Storm', 'Silver', 'Wild'];
  const noun = ['Ranger', 'Mage', 'Paladin', 'Rogue', 'Cleric', 'Warrior', 'Druid'];
  return `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}`;
}

function VoiceControls() {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const participants = tracks.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem' }}>
      <span style={{ color: '#c8a96e88', fontSize: '0.75rem' }}>
        👥 {participants}
      </span>
      <button
        onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        title={isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        style={{
          background: isMicrophoneEnabled ? '#2d5a2d' : '#5a2d2d',
          border: '1px solid #c8a96e55',
          borderRadius: '4px',
          color: '#c8a96e',
          cursor: 'pointer',
          fontSize: '1rem',
          padding: '0.2rem 0.5rem',
          lineHeight: 1,
        }}
      >
        {isMicrophoneEnabled ? '🎙' : '🔇'}
      </button>
    </div>
  );
}

export default function BG2Viewer() {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [token, setToken] = useState('');
  const [username] = useState(randomName);
  const nekoIframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch LiveKit token when voice is opened
  useEffect(() => {
    if (!voiceOpen || token) return;
    fetch('/api/meet/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: BG2_ROOM, username }),
    })
      .then(r => r.json())
      .then(d => { if (d.token) setToken(d.token); });
  }, [voiceOpen, token, username]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>

      {/* Neko game — full viewport */}
      <iframe
        ref={nekoIframeRef}
        src={NEKO_URL}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="pointer-lock; microphone; camera; fullscreen; autoplay"
      />

      {/* Fixed voice chat widget — top-left */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        zIndex: 10,
      }}>
        <div style={{
          background: '#0a0a0fcc',
          border: '2px solid #c8a96e88',
          borderRadius: '6px',
          backdropFilter: 'blur(4px)',
          overflow: 'hidden',
        }}>
          {/* Header row: label + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', borderBottom: voiceOpen ? '1px solid #c8a96e33' : 'none' }}>
            <span style={{ color: '#c8a96e', fontFamily: 'serif', fontSize: '0.85rem' }}>🎙 Voice Chat</span>
            <button
              onClick={() => setVoiceOpen(v => !v)}
              style={{
                background: 'none', border: 'none', color: '#c8a96e', cursor: 'pointer',
                fontSize: '0.8rem', marginLeft: '0.75rem', lineHeight: 1,
              }}
            >
              {voiceOpen ? '✕' : '▶'}
            </button>
          </div>

          {/* LiveKit audio-only panel */}
          {voiceOpen && token && (
            <LiveKitRoom
              token={token}
              serverUrl={LIVEKIT_URL}
              connect={true}
              audio={true}
              video={false}
              onDisconnected={() => { setVoiceOpen(false); setToken(''); }}
            >
              <RoomAudioRenderer />
              <VoiceControls />
            </LiveKitRoom>
          )}
          {voiceOpen && !token && (
            <div style={{ color: '#c8a96e88', fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}>Connecting…</div>
          )}
        </div>
      </div>
    </div>
  );
}