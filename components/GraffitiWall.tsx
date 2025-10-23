'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type Stroke = {
  id: string;
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
};

const COLORS = ['#f97316', '#facc15', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899', '#f5f5f5'];

export default function GraffitiWall() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(10);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState<Array<{ x: number; y: number }>>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/graffiti');
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (cancelled) return;
        const items: Stroke[] = (data.items ?? []).map((item: any) => ({
          id: item.id,
          color: item.payload?.color || COLORS[0],
          size: item.payload?.size || 10,
          points: item.payload?.points || [],
        }));
        setStrokes(items);
      } catch {
        if (!cancelled) setStatus('Could not load the current wall.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.fillRect(x, 0, 1, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.fillRect(0, y, canvas.width, 1);
    }
    const everything = current.length ? [...strokes, { id: 'preview', color, size, points: current }] : strokes;
    for (const stroke of everything) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
  }, [color, current, size, strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      drawAll();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [drawAll]);

  useEffect(() => {
    drawAll();
  }, [drawAll]);

  function pointerToCanvas(event: PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
    setDrawing(true);
    const pt = pointerToCanvas(event.nativeEvent);
    setCurrent([pt]);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    event.preventDefault();
    const pt = pointerToCanvas(event.nativeEvent);
    setCurrent((prev) => [...prev, pt]);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    (event.target as HTMLCanvasElement).releasePointerCapture(event.pointerId);
    if (!drawing) return;
    setDrawing(false);
    finalizeStroke();
  }

  function handlePointerLeave() {
    if (!drawing) return;
    setDrawing(false);
    finalizeStroke();
  }

  async function finalizeStroke() {
    const strokePoints = current;
    setCurrent([]);
    if (strokePoints.length < 2) return;
    try {
      const res = await fetch('/api/graffiti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: strokePoints, color, size }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const saved = await res.json();
      setStrokes((prev) => [...prev, { id: saved.id, color, size, points: strokePoints }]);
      setStatus(null);
    } catch (err: any) {
      setStatus(err?.message || 'Could not save stroke.');
    }
  }

  async function clearWall() {
    const key = window.prompt('Enter the graffiti reset key');
    if (!key) return;
    const res = await fetch(`/api/graffiti?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (res.ok) {
      setStrokes([]);
      setStatus('Wall cleared.');
    } else {
      setStatus('Reset failed.');
    }
  }

  return (
    <div className="graffiti-wrapper">
      <div className="graffiti-controls">
        <div className="color-row">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch${c === color ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <label className="size-control">
          Size
          <input
            type="range"
            min={4}
            max={40}
            step={1}
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          />
        </label>
        <button type="button" className="button" onClick={clearWall}>
          Clear wall
        </button>
      </div>
      <div className="graffiti-canvas" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
        <div className="graffiti-message">Spray anywhere. Tags are public and stick around.</div>
      </div>
      {status ? <p className="graffiti-status">{status}</p> : null}
    </div>
  );
}
