'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  RoomAudioRenderer,
  useTracks,
  VideoTrack,
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

function ChatControls() {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const participantCount = audioTracks.length;

  const btnStyle = (active: boolean, color: string) => ({
    background: active ? color : '#3a3a4a',
    border: '1px solid #c8a96e44',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.25rem 0.55rem',
    lineHeight: 1,
  });

  return (
    <div>
      {/* Video tiles */}
      {videoTracks.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '4px',
          padding: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
        }}>
          {videoTracks.map(track => (
            <div key={track.participant.sid} style={{ position: 'relative', aspectRatio: '4/3', background: '#111', borderRadius: '4px', overflow: 'hidden' }}>
              <VideoTrack trackRef={track} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 2, left: 4, fontSize: '0.6rem', color: '#c8a96ecc', textShadow: '0 1px 2px #000' }}>
                {track.participant.name || track.participant.identity}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.6rem' }}>
        <span style={{ color: '#c8a96e88', fontSize: '0.75rem', marginRight: '0.25rem' }}>👥 {participantCount}</span>
        <button
          onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
          title={isMicrophoneEnabled ? 'Mute mic' : 'Unmute mic'}
          style={btnStyle(isMicrophoneEnabled, '#2d5a2d')}
        >
          {isMicrophoneEnabled ? '🎙' : '🔇'}
        </button>
        <button
          onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
          title={isCameraEnabled ? 'Stop camera' : 'Start camera'}
          style={btnStyle(isCameraEnabled, '#2d4a6a')}
        >
          {isCameraEnabled ? '📷' : '📵'}
        </button>
      </div>
    </div>
  );
}

export default function BG2Viewer() {
  const [chatOpen, setChatOpen] = useState(false);
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

  // Fetch LiveKit token when chat is opened
  useEffect(() => {
    if (!chatOpen || token) return;
    fetch('/api/meet/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: BG2_ROOM, username }),
    })
      .then(r => r.json())
      .then(d => { if (d.token) setToken(d.token); });
  }, [chatOpen, token, username]);

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

      {/* Floating draggable party chat widget */}
      <div
        ref={widgetRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y === -1 ? '50%' : pos.y,
          transform: pos.y === -1 ? 'translateY(-50%)' : 'none',
          zIndex: 10,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          width: '200px',
        }}
      >
        <div style={{
          background: '#0a0a0fcc',
          border: '2px solid #c8a96e88',
          borderRadius: '6px',
          backdropFilter: 'blur(4px)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', borderBottom: chatOpen ? '1px solid #c8a96e33' : 'none' }}>
            <span style={{ color: '#c8a96e', fontFamily: 'serif', fontSize: '0.85rem' }}>🎙 Party Chat</span>
            <button
              onClick={() => setChatOpen(v => !v)}
              style={{ background: 'none', border: 'none', color: '#c8a96e', cursor: 'pointer', fontSize: '0.8rem', marginLeft: '0.75rem', lineHeight: 1 }}
            >
              {chatOpen ? '✕' : '▶'}
            </button>
          </div>

          {/* LiveKit room */}
          {chatOpen && token && (
            <LiveKitRoom
              token={token}
              serverUrl={LIVEKIT_URL}
              connect={true}
              audio={true}
              video={true}
              onDisconnected={() => { setChatOpen(false); setToken(''); }}
            >
              <RoomAudioRenderer />
              <ChatControls />
            </LiveKitRoom>
          )}
          {chatOpen && !token && (
            <div style={{ color: '#c8a96e88', fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}>Connecting…</div>
          )}
        </div>
      </div>
    </div>
  );
}

