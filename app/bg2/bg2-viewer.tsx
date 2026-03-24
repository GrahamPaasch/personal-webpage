'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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

  // Draggable widget state
  const [pos, setPos] = useState({ x: 16, y: -1 }); // y=-1 signals "use CSS centering"
  const [isDragging, setIsDragging] = useState(false);
  const isMouseDown = useRef(false);
  const isDraggingRef = useRef(false);
  const mouseDownPos = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);
  const nekoIframeRef = useRef<HTMLIFrameElement>(null);
  const DRAG_THRESHOLD = 6;

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

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'IFRAME') return;
    isMouseDown.current = true;
    isDraggingRef.current = false;
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    const rect = widgetRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    isMouseDown.current = true;
    isDraggingRef.current = false;
    mouseDownPos.current = { x: t.clientX, y: t.clientY };
    const rect = widgetRef.current!.getBoundingClientRect();
    dragOffset.current = { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }, []);

  useEffect(() => {
    const startDrag = () => {
      isDraggingRef.current = true;
      setIsDragging(true);
      if (nekoIframeRef.current) nekoIframeRef.current.style.pointerEvents = 'none';
    };
    const endDrag = () => {
      isMouseDown.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);
      if (nekoIframeRef.current) nekoIframeRef.current.style.pointerEvents = '';
    };

    const onMove = (e: MouseEvent) => {
      if (!isMouseDown.current) return;
      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      if (!isDraggingRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!isDraggingRef.current) startDrag();
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isMouseDown.current) return;
      const t = e.touches[0];
      const dx = t.clientX - mouseDownPos.current.x;
      const dy = t.clientY - mouseDownPos.current.y;
      if (!isDraggingRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!isDraggingRef.current) startDrag();
      e.preventDefault();
      setPos({ x: t.clientX - dragOffset.current.x, y: t.clientY - dragOffset.current.y });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', endDrag);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', endDrag);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>

      {/* Neko game — full viewport */}
      <iframe
        ref={nekoIframeRef}
        src={NEKO_URL}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', cursor: 'none' }}
        allow="pointer-lock; microphone; camera; fullscreen; autoplay"
      />

      {/* Floating draggable voice chat widget */}
      <div
        ref={widgetRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y === -1 ? '50%' : pos.y,
          transform: pos.y === -1 ? 'translateY(-50%)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          zIndex: 10,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
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


