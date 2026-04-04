'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';

interface Props {
  active: boolean;
  clearTrigger: number; // increment to broadcast + clear
  color: string;
}

type StrokeMsg =
  | { _ann: true; type: 'start'; id: string; color: string; x: number; y: number }
  | { _ann: true; type: 'point'; id: string; x: number; y: number }
  | { _ann: true; type: 'end'; id: string }
  | { _ann: true; type: 'clear' };

const enc = new TextEncoder();
const dec = new TextDecoder();

export default function AnnotationLayer({ active, clearTrigger, color }: Props) {
  const room = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // all strokes: id → { color, points (normalized 0-1) }
  const strokes = useRef<Map<string, { color: string; points: [number, number][] }>>(new Map());
  const drawing = useRef(false);
  const activeStrokeId = useRef<string | null>(null);
  const lastClearTrigger = useRef(clearTrigger);

  // ── redraw ──────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const { color: c, points } of strokes.current.values()) {
      if (points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(points[0][0] * canvas.width, points[0][1] * canvas.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] * canvas.width, points[i][1] * canvas.height);
      }
      ctx.stroke();
    }
  }, []);

  const clearAll = useCallback(() => {
    strokes.current.clear();
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ── publish helper ───────────────────────────────────────────────
  const publish = useCallback((msg: StrokeMsg) => {
    try {
      room.localParticipant.publishData(enc.encode(JSON.stringify(msg)), { reliable: true });
    } catch { /* room may not be fully connected yet */ }
  }, [room]);

  // ── receive remote annotations ───────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function onData(payload: Uint8Array) {
      try {
        const msg = JSON.parse(dec.decode(payload)) as StrokeMsg;
        if (!msg._ann) return;
        if (msg.type === 'clear') { clearAll(); return; }
        if (msg.type === 'start') {
          strokes.current.set(msg.id, { color: msg.color, points: [[msg.x, msg.y]] });
        } else if (msg.type === 'point') {
          strokes.current.get(msg.id)?.points.push([msg.x, msg.y]);
        }
        // 'end' — no extra action needed, stroke is already tracked
        redraw();
      } catch { /* ignore malformed */ }
    }
    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room, clearAll, redraw]);

  // ── handle clearTrigger ──────────────────────────────────────────
  useEffect(() => {
    if (clearTrigger !== lastClearTrigger.current) {
      lastClearTrigger.current = clearTrigger;
      clearAll();
      publish({ _ann: true, type: 'clear' });
    }
  }, [clearTrigger, clearAll, publish]);

  // ── resize canvas to fill viewport ───────────────────────────────
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
  }, [redraw]);

  // ── drawing mouse events ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function norm(e: MouseEvent): [number, number] {
      return [e.clientX / window.innerWidth, e.clientY / window.innerHeight];
    }

    function onDown(e: MouseEvent) {
      if (e.button !== 0) return;
      drawing.current = true;
      const id = `${room.localParticipant.identity ?? 'local'}-${Date.now()}`;
      activeStrokeId.current = id;
      const [x, y] = norm(e);
      strokes.current.set(id, { color, points: [[x, y]] });
      redraw();
      publish({ _ann: true, type: 'start', id, color, x, y });
    }

    function onMove(e: MouseEvent) {
      if (!drawing.current || !activeStrokeId.current) return;
      const [x, y] = norm(e);
      strokes.current.get(activeStrokeId.current)?.points.push([x, y]);
      redraw();
      publish({ _ann: true, type: 'point', id: activeStrokeId.current, x, y });
    }

    function onUp() {
      if (!drawing.current || !activeStrokeId.current) return;
      publish({ _ann: true, type: 'end', id: activeStrokeId.current });
      drawing.current = false;
      activeStrokeId.current = null;
    }

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [active, color, room, publish, redraw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        pointerEvents: active ? 'all' : 'none',
        cursor: active ? 'crosshair' : 'default',
      }}
    />
  );
}
