'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import '@livekit/components-styles';

// ── Canvas that renders incoming annotations ─────────────────────────
function AnnotationCanvas() {
  const room = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Map<string, { color: string; points: [number, number][] }>>(new Map());
  const dec = new TextDecoder();

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const { color, points } of strokes.current.values()) {
      if (points.length < 2) {
        const [x, y] = points[0];
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(x * canvas.width, y * canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(points[0][0] * canvas.width, points[0][1] * canvas.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] * canvas.width, points[i][1] * canvas.height);
      }
      ctx.stroke();
    }
  }

  useEffect(() => {
    function onData(payload: Uint8Array) {
      try {
        const msg = JSON.parse(dec.decode(payload));
        if (!msg._ann) return;
        if (msg.type === 'clear') { strokes.current.clear(); }
        else if (msg.type === 'start') { strokes.current.set(msg.id, { color: msg.color, points: [[msg.x, msg.y]] }); }
        else if (msg.type === 'point') { strokes.current.get(msg.id)?.points.push([msg.x, msg.y]); }
        redraw();
      } catch { /* ignore */ }
    }
    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      redraw();
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

// ── Inner component (needs to be inside LiveKitRoom) ─────────────────
function OverlayInner({ roomName }: { roomName: string }) {
  return (
    <>
      <RoomAudioRenderer />
      <AnnotationCanvas />
      {/* Minimal HUD */}
      <div
        style={{
          position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, pointerEvents: 'none',
        }}
        className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full select-none flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
        Live annotations — {roomName}
      </div>
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────
function OverlayPageInner() {
  const params = useSearchParams();
  const roomName = params.get('room') ?? '';
  const username = params.get('username') ?? 'overlay-viewer';

  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!roomName) { setError('No room specified. Close this window and re-open via the Meet right-click menu.'); return; }
    fetch('/api/meet/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomName, username }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.token) { setToken(data.token); setServerUrl(data.serverUrl ?? ''); }
        else setError(data.error ?? 'Failed to get token');
      })
      .catch(() => setError('Failed to connect to token API'));
  }, [roomName, username]);

  // Dark background so annotations pop
  const bg = '#111827';

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ef4444', fontFamily: 'sans-serif', padding: 24, textAlign: 'center' }}>{error}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#9ca3af', fontFamily: 'sans-serif' }}>Connecting…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: bg }}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        audio={false}
        video={false}
        style={{ height: '100vh' }}
      >
        <OverlayInner roomName={roomName} />
      </LiveKitRoom>
    </div>
  );
}

export default function OverlayPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#111827' }} />}>
      <OverlayPageInner />
    </Suspense>
  );
}
