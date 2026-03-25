'use client';

import { useState, useEffect, useRef } from 'react';
import {
  LiveKitRoom,
  useLocalParticipant,
  RoomAudioRenderer,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import type { TrackReference, TrackReferenceOrPlaceholder } from '@livekit/components-react';
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

function isTrackReference(t: TrackReferenceOrPlaceholder): t is TrackReference {
  return t.publication !== undefined;
}

// Individual draggable video tile overlaid on top of the game
function DraggableTile({ track, startX, startY }: { track: TrackReference; startX: number; startY: number }) {
  const [pos, setPos] = useState({ x: startX, y: startY });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, tileX: 0, tileY: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPos({
        x: dragStart.current.tileX + (e.clientX - dragStart.current.mouseX),
        y: dragStart.current.tileY + (e.clientY - dragStart.current.mouseY),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  useEffect(() => {
    const onMove = (e: TouchEvent) => {
      if (!isDragging) return;
      const t = e.touches[0];
      setPos({
        x: dragStart.current.tileX + (t.clientX - dragStart.current.mouseX),
        y: dragStart.current.tileY + (t.clientY - dragStart.current.mouseY),
      });
    };
    const onEnd = () => setIsDragging(false);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  }, [isDragging]);

  const startDrag = (clientX: number, clientY: number) => {
    dragStart.current = { mouseX: clientX, mouseY: clientY, tileX: pos.x, tileY: pos.y };
    setIsDragging(true);
  };

  return (
    <div
      onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
      onTouchStart={e => { startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
      style={{
        position: 'absolute', left: pos.x, top: pos.y,
        width: 160, zIndex: 40,
        cursor: isDragging ? 'grabbing' : 'grab',
        borderRadius: 6, overflow: 'hidden',
        boxShadow: '0 2px 16px #000c',
        border: '1px solid #c8a96e66',
        background: '#111',
        userSelect: 'none',
      }}
    >
      <VideoTrack trackRef={track} style={{ width: '100%', aspectRatio: '4/3', display: 'block', objectFit: 'cover' }} />
      <div style={{ position: 'absolute', bottom: 2, left: 4, fontSize: '0.6rem', color: '#c8a96ecc', textShadow: '0 1px 2px #000' }}>
        {track.participant.name || track.participant.identity}
      </div>
    </div>
  );
}

// Renders controls + draggable tiles overlaid on the game; must be inside LiveKitRoom
function ConnectedOverlay({ onLeave }: { onLeave: () => void }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true }).filter(isTrackReference);

  const btn = (active: boolean, bg: string, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      background: active ? bg : '#2a2a3a',
      border: '1px solid #c8a96e44', borderRadius: 4,
      color: '#fff', cursor: 'pointer', fontSize: '0.9rem',
      padding: '0.25rem 0.5rem', lineHeight: 1,
    }}>{label}</button>
  );

  return (
    <>
      {/* Controls bar — top-left corner */}
      <div style={{
        position: 'absolute', top: 8, left: 8, zIndex: 40,
        display: 'flex', gap: '0.4rem', alignItems: 'center',
        background: '#0a0a0fcc', border: '1px solid #c8a96e44',
        borderRadius: 6, padding: '0.3rem 0.5rem',
        pointerEvents: 'auto',
      }}>
        <span style={{ color: '#c8a96e88', fontSize: '0.7rem' }}>👥 {videoTracks.length + 1}</span>
        {btn(isMicrophoneEnabled, '#2d5a2d', isMicrophoneEnabled ? '🎙' : '🔇', () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
        {btn(isCameraEnabled, '#2d4a6a', isCameraEnabled ? '📷' : '📵', () => localParticipant.setCameraEnabled(!isCameraEnabled))}
        {btn(false, '#5a2d2d', '✕ Leave', onLeave)}
      </div>

      {/* One draggable tile per remote participant, stacked top-left below controls by default */}
      {videoTracks.map((track, i) => (
        <DraggableTile
          key={track.participant.sid}
          track={track}
          startX={8}
          startY={56 + i * 128}
        />
      ))}
    </>
  );
}

export default function BG2Viewer() {
  const [chatOpen, setChatOpen] = useState(false);
  const [token, setToken] = useState('');
  const [username] = useState(randomName);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) outerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

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

  const handleLeave = () => { setChatOpen(false); setToken(''); };

  return (
    <div
      ref={outerRef}
      style={{ width: '100%', height: '100%', position: 'relative', background: '#000', overflow: 'hidden' }}
    >
      {/* Game stream — fills the container */}
      <iframe
        src={NEKO_URL}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', cursor: 'none' }}
        allow="pointer-lock; microphone; camera; fullscreen; autoplay"
      />

      {/* Overlay — pointer-events: none so the game still receives mouse input;
          individual interactive elements re-enable it */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>

        {/* Party Chat join button (before connecting) */}
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            style={{
              position: 'absolute', top: 8, left: 8,
              background: '#1a2a1acc', border: '1px solid #c8a96e66',
              borderRadius: 6, color: '#c8a96e', cursor: 'pointer',
              fontSize: '0.75rem', padding: '0.3rem 0.7rem',
              pointerEvents: 'auto',
            }}
          >🎙 Party Chat</button>
        )}

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{
            position: 'absolute', bottom: 8, right: 8,
            background: '#0a0a0fcc', border: '1px solid #c8a96e66',
            borderRadius: 6, color: '#c8a96e', cursor: 'pointer',
            fontSize: '1rem', padding: '0.3rem 0.7rem', lineHeight: 1,
            pointerEvents: 'auto',
          }}
        >{isFullscreen ? '⊡ Exit' : '⛶ Full'}</button>

        {/* LiveKit — audio renderer + draggable tiles + controls */}
        {chatOpen && token && (
          <LiveKitRoom
            token={token}
            serverUrl={LIVEKIT_URL}
            connect={true}
            audio={true}
            video={true}
            onDisconnected={handleLeave}
            style={{ position: 'absolute', inset: 0 }}
          >
            <RoomAudioRenderer />
            <ConnectedOverlay onLeave={handleLeave} />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}

