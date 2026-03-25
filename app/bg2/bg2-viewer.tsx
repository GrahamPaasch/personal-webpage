'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  LiveKitRoom,
  useLocalParticipant,
  useParticipants,
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

type Assignment = { sid: string; side: 'left' | 'right' };

// Module-level drag state — ephemeral, shared between ConnectedLayout and BG2Viewer
const dragState = { sid: null as string | null, overSid: null as string | null };
let onSidebarDrop: ((side: 'left' | 'right') => void) | null = null;

function ConnectedLayout({
  leftRef, rightRef, controlsRef, onLeave,
}: {
  leftRef: React.RefObject<HTMLDivElement | null>;
  rightRef: React.RefObject<HTMLDivElement | null>;
  controlsRef: React.RefObject<HTMLDivElement | null>;
  onLeave: () => void;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const participants = useParticipants();
  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [draggingSid, setDraggingSid] = useState<string | null>(null);
  const [dragOverSid, setDragOverSid] = useState<string | null>(null);

  // Sync assignments as participants join/leave
  useEffect(() => {
    const tracks = videoTracks.filter(isTrackReference);
    setAssignments(prev => {
      const activeSids = new Set(tracks.map(t => t.participant.sid));
      const kept = prev.filter(a => activeSids.has(a.sid));
      const existingSids = new Set(kept.map(a => a.sid));
      const added = tracks
        .filter(t => !existingSids.has(t.participant.sid))
        .map((t, i) => ({
          sid: t.participant.sid,
          side: (kept.length + i) % 2 === 0 ? 'left' : 'right' as 'left' | 'right',
        }));
      return [...kept, ...added];
    });
  }, [videoTracks]);

  // Register drop handler for outer sidebar containers in BG2Viewer.
  // Runs every render so the closure always has fresh state.
  useEffect(() => {
    onSidebarDrop = (side: 'left' | 'right') => {
      const { sid, overSid } = dragState;
      if (!sid) return;
      setAssignments(prev => {
        const without = prev.filter(a => a.sid !== sid);
        const item: Assignment = { sid, side };
        if (!overSid) return [...without, item];
        const idx = without.findIndex(a => a.sid === overSid);
        if (idx === -1) return [...without, item];
        const result = [...without];
        result.splice(idx, 0, item);
        return result;
      });
      dragState.sid = null;
      dragState.overSid = null;
      setDraggingSid(null);
      setDragOverSid(null);
    };
    return () => { onSidebarDrop = null; };
  });

  const getTrack = (sid: string) =>
    videoTracks.filter(isTrackReference).find(t => t.participant.sid === sid);

  const renderTiles = (side: 'left' | 'right') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, padding: 4, minHeight: 40 }}>
      {assignments.filter(a => a.side === side).map(a => {
        const track = getTrack(a.sid);
        if (!track) return null;
        const isBeingDragged = draggingSid === a.sid;
        const isDropTarget = dragOverSid === a.sid && !isBeingDragged;
        return (
          <div
            key={a.sid}
            draggable
            onDragStart={() => { dragState.sid = a.sid; setDraggingSid(a.sid); }}
            onDragEnd={() => { dragState.sid = null; dragState.overSid = null; setDraggingSid(null); setDragOverSid(null); }}
            onDragOver={e => {
              e.preventDefault();
              dragState.overSid = a.sid;
              if (dragOverSid !== a.sid) setDragOverSid(a.sid);
            }}
            style={{
              position: 'relative', aspectRatio: '4/3', borderRadius: 4,
              overflow: 'hidden', background: '#111',
              opacity: isBeingDragged ? 0.35 : 1,
              cursor: 'grab',
              borderTop: isDropTarget ? '3px solid #c8a96e' : '3px solid transparent',
              transition: 'opacity 0.15s, border-top-color 0.1s',
            }}
            onDragLeave={() => {
              if (dragState.overSid === a.sid) {
                dragState.overSid = null;
                setDragOverSid(null);
              }
            }}
          >
            <VideoTrack trackRef={track} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: '0.6rem', color: '#c8a96ecc', textShadow: '0 1px 2px #000' }}>
              {track.participant.name || track.participant.identity}
            </span>
            <span style={{ position: 'absolute', top: 2, right: 4, fontSize: '0.6rem', color: '#c8a96e66', userSelect: 'none' }}>⠿</span>
          </div>
        );
      })}
    </div>
  );

  const btn = (active: boolean, bg: string, label: string, onClick: () => void) => (
    <button onClick={onClick} style={{
      background: active ? bg : '#2a2a3a',
      border: '1px solid #c8a96e44', borderRadius: 4,
      color: '#fff', cursor: 'pointer', fontSize: '1rem',
      padding: '0.25rem 0.5rem', lineHeight: 1,
    }}>{label}</button>
  );

  if (!mounted) return null;

  return (
    <>
      {controlsRef.current && createPortal(
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.3rem 0', flexWrap: 'wrap' }}>
          <span style={{ color: '#c8a96e88', fontSize: '0.7rem' }}>👥 {participants.length}</span>
          {btn(isMicrophoneEnabled, '#2d5a2d', isMicrophoneEnabled ? '🎙' : '🔇', () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
          {btn(isCameraEnabled, '#2d4a6a', isCameraEnabled ? '📷' : '📵', () => localParticipant.setCameraEnabled(!isCameraEnabled))}
          {btn(false, '#5a2d2d', '✕ Leave', onLeave)}
        </div>,
        controlsRef.current
      )}
      {leftRef.current && createPortal(renderTiles('left'), leftRef.current)}
      {rightRef.current && createPortal(renderTiles('right'), rightRef.current)}
    </>
  );
}

export default function BG2Viewer() {
  const [chatOpen, setChatOpen] = useState(false);
  const [token, setToken] = useState('');
  const [username] = useState(randomName);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const outerRef = useRef<HTMLDivElement>(null);
  const nekoIframeRef = useRef<HTMLIFrameElement>(null);
  const leftSidebarRef = useRef<HTMLDivElement>(null);
  const rightSidebarRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === outerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
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

  const sideStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, background: '#0a0a0f',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  return (
    <div ref={outerRef} style={{ width: '100%', height: '100%', display: 'flex', background: '#000', position: 'relative' }}>

      {/* Left sidebar — party chat controls + left video tiles */}
      <div
        style={sideStyle}
        onDragOver={e => e.preventDefault()}
        onDrop={() => onSidebarDrop?.('left')}
      >
        <div style={{ padding: '0.5rem 0.6rem', borderBottom: '1px solid #c8a96e22', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <span style={{ color: '#c8a96e', fontFamily: 'serif', fontSize: '0.8rem' }}>🎙 Party Chat</span>
            {!chatOpen && (
              <button
                onClick={() => setChatOpen(true)}
                style={{ background: '#1a2a1a', border: '1px solid #c8a96e55', borderRadius: 4, color: '#c8a96e', cursor: 'pointer', fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
              >Join</button>
            )}
          </div>
          {/* Controls portalled here when connected */}
          <div ref={controlsRef} />
        </div>
        {/* Left video tiles portalled here */}
        <div ref={leftSidebarRef} style={{ flex: 1, overflowY: 'auto', padding: 4 }} />
      </div>

      {/* Center — Neko iframe locked to 4:3, no black bars */}
      <div style={{ height: '100%', aspectRatio: '4/3', maxWidth: '100%', flexShrink: 0, position: 'relative' }}>
        <iframe
          ref={nekoIframeRef}
          src={NEKO_URL}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block', cursor: 'none' }}
          allow="pointer-lock; microphone; camera; fullscreen; autoplay"
        />
        {/* Fullscreen button — use this to keep Party Chat sidebars visible */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen — keeps Party Chat visible'}
          style={{
            position: 'absolute', bottom: 8, right: 250,
            background: '#0a0a0fcc', border: '1px solid #c8a96e88',
            borderRadius: 6, color: '#c8a96e', cursor: 'pointer',
            fontSize: '1rem', padding: '0.35rem 0.75rem', lineHeight: 1,
            boxShadow: '0 0 10px #c8a96e33',
          }}
        >{isFullscreen ? '⊡ Exit' : '⛶ Full'}</button>
      </div>

      {/* Right sidebar — right video tiles */}
      <div
        style={sideStyle}
        onDragOver={e => e.preventDefault()}
        onDrop={() => onSidebarDrop?.('right')}
      >
        <div ref={rightSidebarRef} style={{ flex: 1, overflowY: 'auto', padding: 4 }} />
      </div>

      {/* LiveKit — hidden from layout, portals content into sidebars */}
      {chatOpen && token && (
        <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <LiveKitRoom
            token={token}
            serverUrl={LIVEKIT_URL}
            connect={true}
            audio={true}
            video={true}
            onDisconnected={handleLeave}
          >
            <RoomAudioRenderer />
            <ConnectedLayout
              leftRef={leftSidebarRef}
              rightRef={rightSidebarRef}
              controlsRef={controlsRef}
              onLeave={handleLeave}
            />
          </LiveKitRoom>
        </div>
      )}
    </div>
  );
}
