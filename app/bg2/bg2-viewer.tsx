'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const NEKO_URL = 'https://bg2.grahampaasch.com/?pwd=bg2play';

export default function BG2Viewer() {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const jitsiRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<unknown>(null);

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

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'IFRAME') return;
    isMouseDown.current = true;
    isDraggingRef.current = false;
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    const rect = widgetRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isMouseDown.current) return;
      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      if (!isDraggingRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        setIsDragging(true);
        // Disable pointer events on Neko iframe so mouseup fires on window
        if (nekoIframeRef.current) nekoIframeRef.current.style.pointerEvents = 'none';
      }
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onUp = () => {
      isMouseDown.current = false;
      isDraggingRef.current = false;
      setIsDragging(false);
      // Re-enable pointer events on Neko iframe
      if (nekoIframeRef.current) nekoIframeRef.current.style.pointerEvents = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

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
        ref={nekoIframeRef}
        src={NEKO_URL}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="pointer-lock; microphone; camera; fullscreen; autoplay"
      />

      {/* Floating draggable voice chat panel */}
      <div
        ref={widgetRef}
        onMouseDown={onMouseDown}
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
        <button
          onClick={() => setVoiceOpen(v => !v)}
          style={{
            padding: '0.5rem 1rem',
            background: voiceOpen ? '#c8a96e33' : '#0a0a0fcc',
            border: '2px solid #c8a96e88',
            borderRadius: '4px',
            color: '#c8a96e',
            cursor: 'grab',
            fontFamily: 'serif',
            fontSize: '0.9rem',
            backdropFilter: 'blur(4px)',
            marginBottom: '0.5rem',
            width: '100%',
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
