'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

type Stroke = {
  id: string;
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
};

const COLORS = ['#f97316', '#facc15', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899', '#f5f5f5'];

// The wall is a fixed-size surface scaled to fit the screen, so the page text lands
// under the same wall coordinates on every device and a cross-out stays on its word.
const WALL_WIDTH = 1440;
const WALL_HEIGHT = 2400;

// The page text keeps its old reading width, centred on the wall.
const CONTENT_WIDTH = 920;
const CONTENT_LEFT = (WALL_WIDTH - CONTENT_WIDTH) / 2;

// Older tags were drawn on smaller surfaces; shift them to where those now sit.
// No `v`: the original canvas under the controls. v2: the 920-wide wall.
const WALL_VERSION = 3;
function offsetFor(version: unknown): { x: number; y: number } {
  if (version === WALL_VERSION) return { x: 0, y: 0 };
  if (version === 2) return { x: CONTENT_LEFT, y: 0 };
  return { x: CONTENT_LEFT, y: 300 };
}

export default function GraffitiWall({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
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
        const items: Stroke[] = (data.items ?? []).map((item: any) => {
          const points: Array<{ x: number; y: number }> = item.payload?.points || [];
          const offset = offsetFor(item.payload?.v);
          return {
            id: item.id,
            color: item.payload?.color || COLORS[0],
            size: item.payload?.size || 10,
            points: points.map((pt) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
          };
        });
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
    // Transparent canvas over the page text; the wall background is CSS underneath.
    const dpr = canvas.width / WALL_WIDTH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, WALL_WIDTH, WALL_HEIGHT);
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
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    const resize = () => {
      const nextScale = viewport.getBoundingClientRect().width / WALL_WIDTH;
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * nextScale;
      canvas.width = Math.round(WALL_WIDTH * dpr);
      canvas.height = Math.round(WALL_HEIGHT * dpr);
      setScale(nextScale);
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
      x: ((event.clientX - rect.left) / rect.width) * WALL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * WALL_HEIGHT,
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
        body: JSON.stringify({ points: strokePoints, color, size, v: WALL_VERSION }),
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
    <div className="graffiti-viewport" ref={viewportRef} style={{ height: WALL_HEIGHT * scale }}>
      <div
        className="graffiti-wall"
        style={{ width: WALL_WIDTH, height: WALL_HEIGHT, transform: `scale(${scale})` }}
      >
        <div className="graffiti-content" style={{ width: CONTENT_WIDTH, marginLeft: CONTENT_LEFT }}>
          {children}
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
          {status ? <p className="graffiti-status">{status}</p> : null}
        </div>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
        <div className="graffiti-message">Spray anywhere — even on the words. Tags are public and stick around.</div>
      </div>
    </div>
  );
}
