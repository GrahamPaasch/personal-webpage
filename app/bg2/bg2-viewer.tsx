'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

function VideoTile({ track }: { track: TrackReference }) {
  return (
    <div style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 4, overflow: 'hidden', background: '#111' }}>
      <VideoTrack trackRef={track} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <span style={{ position: 'absolute', bottom: 2, left: 4, fontSize: '0.6rem', color: '#c8a96ecc', textShadow: '0 1px 2px #000' }}>
        {track.participant.name || track.participant.identity}
      </span>
    </div>
  );
}

function ConnectedLayout({
  leftRef, rightRef, controlsRef, onLeave,
}: {
  leftRef: React.RefObject<HTMLDivElement | null>;
  rightRef: React.RefObject<HTMLDivElement | null>;
  controlsRef: React.RefObject<HTMLDivElement | null>;
  onLeave: () => void;
}) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const leftTracks = videoTracks.filter((_, i) => i % 2 === 0).filter(isTrackReference);
  const rightTracks = videoTracks.filter((_, i) => i % 2 !== 0).filter(isTrackReference);

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
          <span style={{ color: '#c8a96e88', fontSize: '0.7rem' }}>👥 {videoTracks.length + 1}</span>
          {btn(isMicrophoneEnabled, '#2d5a2d', isMicrophoneEnabled ? '🎙' : '🔇', () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
          {btn(isCameraEnabled, '#2d4a6a', isCameraEnabled ? '📷' : '📵', () => localParticipant.setCameraEnabled(!isCameraEnabled))}
          {btn(false, '#5a2d2d', '✕ Leave', onLeave)}
        </div>,
        controlsRef.current
      )}
      {leftRef.current && createPortal(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {leftTracks.map(t => <VideoTile key={t.participant.sid} track={t} />)}
        </div>,
        leftRef.current
      )}
      {rightRef.current && createPortal(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rightTracks.map(t => <VideoTile key={t.participant.sid} track={t} />)}
        </div>,
        rightRef.current
      )}
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
    const onChange = () => {
      // If Neko's internal button fullscreened the iframe instead of our container,
      // intercept and redirect so sidebars stay visible.
      if (document.fullscreenElement === nekoIframeRef.current) {
        document.exitFullscreen().then(() => outerRef.current?.requestFullscreen());
        return;
      }
      setIsFullscreen(!!document.fullscreenElement);
    };
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

  const sideStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, background: '#0a0a0f',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  };

  return (
    <div ref={outerRef} style={{ width: '100%', height: '100%', display: 'flex', background: '#000', position: 'relative' }}>

      {/* Left sidebar — party chat controls + left video tiles */}
      <div style={sideStyle}>
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
          allow="pointer-lock; microphone; camera; autoplay"
        />
        {/* Fullscreen button — more prominent so users use this instead of Neko's button */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (keeps video chat visible)'}
          style={{
            position: 'absolute', bottom: 8, right: 8,
            background: '#0a0a0fcc', border: '1px solid #c8a96e99',
            borderRadius: 6, color: '#c8a96e', cursor: 'pointer',
            fontSize: '1rem', padding: '0.3rem 0.7rem', lineHeight: 1,
            boxShadow: '0 0 8px #c8a96e44',
          }}
        >{isFullscreen ? '⊡ Exit' : '⛶ Full'}</button>
      </div>

      {/* Right sidebar — right video tiles */}
      <div style={sideStyle}>
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
