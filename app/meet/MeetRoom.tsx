'use client';

import '@livekit/components-styles';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';
import AnnotationLayer from './AnnotationLayer';

interface MeetRoomProps {
  token: string;
  roomName: string;
  onLeave: () => void;
}

interface TileZoom {
  scale: number;
  tx: number;
  ty: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  tile: HTMLElement | null;
}

const MIN_SCALE = 1;
const MAX_SCALE = 10;
const ZOOM_FACTOR = 1.2;

// Distinct annotation colors for local participant
const ANNOTATION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

function findTile(target: HTMLElement, container: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target;
  while (el && el !== container) {
    if (el.classList.contains('lk-participant-tile')) return el;
    el = el.parentElement;
  }
  return null;
}

export default function MeetRoom({ token, roomName, onLeave }: MeetRoomProps) {
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom state lives in a ref so context menu actions can reach it
  const zoomsRef = useRef<Map<HTMLElement, TileZoom>>(new Map());

  // Annotation state
  const [annotating, setAnnotating] = useState(false);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [annotationColor, setAnnotationColor] = useState(ANNOTATION_COLORS[0]);

  // Pause state
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const closeMenu = useCallback(() => setCtxMenu(null), []);

  // ── Zoom helpers (callable from context menu) ──────────────────
  function getZoom(tile: HTMLElement): TileZoom {
    if (!zoomsRef.current.has(tile)) zoomsRef.current.set(tile, { scale: 1, tx: 0, ty: 0 });
    return zoomsRef.current.get(tile)!;
  }

  function applyZoom(tile: HTMLElement, z: TileZoom) {
    const video = tile.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;
    if (z.scale <= 1) {
      video.style.transform = '';
      video.style.transformOrigin = '';
      tile.style.overflow = '';
    } else {
      tile.style.overflow = 'hidden';
      video.style.transformOrigin = '0 0';
      video.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.scale})`;
    }
  }

  function resetTile(tile: HTMLElement) {
    const z = { scale: 1, tx: 0, ty: 0 };
    zoomsRef.current.set(tile, z);
    applyZoom(tile, z);
  }

  function zoomTile(tile: HTMLElement, factor: number) {
    const z = getZoom(tile);
    const rect = tile.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, z.scale * factor));
    if (newScale <= 1) { resetTile(tile); return; }
    const ratio = newScale / z.scale;
    const newTx = cx - (cx - z.tx) * ratio;
    const newTy = cy - (cy - z.ty) * ratio;
    const video = tile.querySelector('video') as HTMLVideoElement | null;
    const vw = video?.offsetWidth ?? rect.width;
    const vh = video?.offsetHeight ?? rect.height;
    const zNew: TileZoom = {
      scale: newScale,
      tx: Math.min(0, Math.max(rect.width - vw * newScale, newTx)),
      ty: Math.min(0, Math.max(rect.height - vh * newScale, newTy)),
    };
    zoomsRef.current.set(tile, zNew);
    applyZoom(tile, zNew);
  }

  // ── Mouse / keyboard effects ───────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Double-click → fullscreen
    function onDblClick(e: MouseEvent) {
      const tile = findTile(e.target as HTMLElement, container);
      if (!tile) return;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        tile.requestFullscreen().catch(() => {});
      }
    }

    // Scroll wheel → zoom centered on cursor
    function onWheel(e: WheelEvent) {
      const tile = findTile(e.target as HTMLElement, container);
      if (!tile) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = tile.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const z = getZoom(tile);
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, z.scale * factor));
      if (newScale <= 1) { resetTile(tile); return; }
      const ratio = newScale / z.scale;
      const newTx = mx - (mx - z.tx) * ratio;
      const newTy = my - (my - z.ty) * ratio;
      const video = tile.querySelector('video') as HTMLVideoElement | null;
      const vw = video?.offsetWidth ?? rect.width;
      const vh = video?.offsetHeight ?? rect.height;
      const zNew: TileZoom = {
        scale: newScale,
        tx: Math.min(0, Math.max(rect.width - vw * newScale, newTx)),
        ty: Math.min(0, Math.max(rect.height - vh * newScale, newTy)),
      };
      zoomsRef.current.set(tile, zNew);
      applyZoom(tile, zNew);
    }

    // Drag to pan
    let dragTile: HTMLElement | null = null;
    let dragLastX = 0;
    let dragLastY = 0;

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const tile = findTile(e.target as HTMLElement, container);
      if (!tile) return;
      const z = getZoom(tile);
      if (z.scale <= 1) return;
      dragTile = tile;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      tile.style.cursor = 'grabbing';
      e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragTile) return;
      const z = getZoom(dragTile);
      const dx = e.clientX - dragLastX;
      const dy = e.clientY - dragLastY;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      const rect = dragTile.getBoundingClientRect();
      const video = dragTile.querySelector('video') as HTMLVideoElement | null;
      const vw = video?.offsetWidth ?? rect.width;
      const vh = video?.offsetHeight ?? rect.height;
      const zNew: TileZoom = {
        scale: z.scale,
        tx: Math.min(0, Math.max(rect.width - vw * z.scale, z.tx + dx)),
        ty: Math.min(0, Math.max(rect.height - vh * z.scale, z.ty + dy)),
      };
      zoomsRef.current.set(dragTile, zNew);
      applyZoom(dragTile, zNew);
    }

    function onMouseUp() {
      if (!dragTile) return;
      dragTile.style.cursor = '';
      dragTile = null;
    }

    // Right-click → custom context menu
    function onContextMenu(e: MouseEvent) {
      e.preventDefault();
      const tile = findTile(e.target as HTMLElement, container);
      setCtxMenu({ x: e.clientX, y: e.clientY, tile: tile ?? null });
    }

    // Keyboard shortcuts
    function onKeyDown(e: KeyboardEvent) {
      // Ignore Space when focus is in an input/button/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === ' ' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
        e.preventDefault();
        const nowPaused = !pausedRef.current;
        pausedRef.current = nowPaused;
        setPaused(nowPaused);
        container.querySelectorAll<HTMLVideoElement>('video').forEach(v => {
          if (nowPaused) v.pause();
          else v.play().catch(() => {});
        });
        return;
      }
      if (e.key !== 'Escape') return;
      setCtxMenu(null);
      container.querySelectorAll<HTMLElement>('.lk-participant-tile').forEach(resetTile);
    }

    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('contextmenu', onContextMenu, { capture: true });
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    container.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('dblclick', onDblClick);
      container.removeEventListener('contextmenu', onContextMenu, { capture: true });
      container.removeEventListener('wheel', onWheel, { capture: true });
      container.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    function onClickOutside() { setCtxMenu(null); }
    window.addEventListener('click', onClickOutside);
    return () => window.removeEventListener('click', onClickOutside);
  }, [ctxMenu]);

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-950">
      <style>{`
        [data-lk-source="screen_share"]:fullscreen,
        .lk-participant-tile:fullscreen {
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        [data-lk-source="screen_share"]:fullscreen video,
        .lk-participant-tile:fullscreen video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      `}</style>

      {/* Annotation mode badge */}
      {annotating && (
        <div
          style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}
          className="bg-black/70 text-white text-sm px-4 py-1.5 rounded-full flex items-center gap-2 select-none"
        >
          <span
            style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: annotationColor }}
          />
          Draw mode — right-click to change color or stop
        </div>
      )}

      {/* Paused badge */}
      {paused && (
        <div
          style={{ position: 'fixed', top: annotating ? 56 : 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}
          className="bg-yellow-500/90 text-black text-sm font-semibold px-4 py-1.5 rounded-full flex items-center gap-2 select-none"
        >
          ⏸ Paused — press Space to resume
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 300,
            minWidth: 200,
          }}
          className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl py-1 text-sm text-white overflow-hidden"
        >
          {/* Annotate section */}
          <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">Annotate</div>
          <button
            className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
            onClick={() => { setAnnotating(a => !a); closeMenu(); }}
          >
            <span>{annotating ? '⏹' : '✏️'}</span>
            {annotating ? 'Stop drawing' : 'Start drawing'}
          </button>

          {/* Color picker */}
          <div className="px-4 py-2 flex items-center gap-1.5">
            <span className="text-gray-400 text-xs mr-1">Color:</span>
            {ANNOTATION_COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setAnnotationColor(c); setAnnotating(true); closeMenu(); }}
                style={{
                  width: 18, height: 18, borderRadius: '50%', background: c,
                  border: annotationColor === c ? '2px solid white' : '2px solid transparent',
                }}
              />
            ))}
          </div>

          <button
            className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
            onClick={() => { setClearTrigger(t => t + 1); closeMenu(); }}
          >
            <span>🗑️</span> Clear annotations
          </button>

          {/* Divider */}
          <div className="border-t border-gray-700 my-1" />
          <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">Zoom</div>

          <button
            className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
            onClick={() => { if (ctxMenu.tile) zoomTile(ctxMenu.tile, ZOOM_FACTOR); closeMenu(); }}
            disabled={!ctxMenu.tile}
          >
            <span>🔍</span> Zoom in
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
            onClick={() => { if (ctxMenu.tile) zoomTile(ctxMenu.tile, 1 / ZOOM_FACTOR); closeMenu(); }}
            disabled={!ctxMenu.tile}
          >
            <span>🔎</span> Zoom out
          </button>
          <button
            className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              if (ctxMenu.tile) resetTile(ctxMenu.tile);
              else containerRef.current?.querySelectorAll<HTMLElement>('.lk-participant-tile').forEach(resetTile);
              closeMenu();
            }}
          >
            <span>↩️</span> Reset zoom
          </button>

          {/* Divider */}
          <div className="border-t border-gray-700 my-1" />
          <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">View</div>

          <button
            className="w-full text-left px-4 py-2 hover:bg-gray-700 flex items-center gap-2"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              } else if (ctxMenu.tile) {
                ctxMenu.tile.requestFullscreen().catch(() => {});
              }
              closeMenu();
            }}
          >
            <span>{document.fullscreenElement ? '⊠' : '⛶'}</span>
            {document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      )}

      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        onDisconnected={onLeave}
        data-lk-theme="default"
        style={{ height: '100vh' }}
      >
        <VideoConference />
        <RoomAudioRenderer />
        <AnnotationLayer
          active={annotating}
          clearTrigger={clearTrigger}
          color={annotationColor}
        />
      </LiveKitRoom>
    </div>
  );
}


interface MeetRoomProps {
  token: string;
  roomName: string;
  onLeave: () => void;
}

interface TileZoom {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 10;
const ZOOM_FACTOR = 1.2;

function findTile(target: HTMLElement, container: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = target;
  while (el && el !== container) {
    if (el.classList.contains('lk-participant-tile')) return el;
    el = el.parentElement;
  }
  return null;
}

export default function MeetRoom({ token, roomName, onLeave }: MeetRoomProps) {
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const zooms = new Map<HTMLElement, TileZoom>();

    function getZoom(tile: HTMLElement): TileZoom {
      if (!zooms.has(tile)) zooms.set(tile, { scale: 1, tx: 0, ty: 0 });
      return zooms.get(tile)!;
    }

    function applyZoom(tile: HTMLElement, z: TileZoom) {
      const video = tile.querySelector('video') as HTMLVideoElement | null;
      if (!video) return;
      if (z.scale <= 1) {
        video.style.transform = '';
        video.style.transformOrigin = '';
        tile.style.overflow = '';
      } else {
        tile.style.overflow = 'hidden';
        video.style.transformOrigin = '0 0';
        video.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.scale})`;
      }
    }

    function resetTile(tile: HTMLElement) {
      const z = { scale: 1, tx: 0, ty: 0 };
      zooms.set(tile, z);
      applyZoom(tile, z);
    }

    // Double-click → fullscreen
    function onDblClick(e: MouseEvent) {
      const tile = findTile(e.target as HTMLElement, container);
      if (!tile) return;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        tile.requestFullscreen().catch(() => {});
      }
    }

    // Scroll wheel → zoom centered exactly on cursor
    function onWheel(e: WheelEvent) {
      const tile = findTile(e.target as HTMLElement, container);
      if (!tile) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = tile.getBoundingClientRect();
      // Cursor position in tile-local space (stable — tile itself is never transformed)
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const z = getZoom(tile);
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, z.scale * factor));

      if (newScale <= 1) {
        resetTile(tile);
        return;
      }

      // Keep the point under the cursor fixed:
      // newTx = mx - (mx - tx) * newScale / oldScale
      const ratio = newScale / z.scale;
      const newTx = mx - (mx - z.tx) * ratio;
      const newTy = my - (my - z.ty) * ratio;

      // Clamp so the video never leaves a gap at the tile edges
      const video = tile.querySelector('video') as HTMLVideoElement | null;
      const vw = video?.offsetWidth ?? rect.width;
      const vh = video?.offsetHeight ?? rect.height;
      const clampedTx = Math.min(0, Math.max(rect.width - vw * newScale, newTx));
      const clampedTy = Math.min(0, Math.max(rect.height - vh * newScale, newTy));

      const zNew: TileZoom = { scale: newScale, tx: clampedTx, ty: clampedTy };
      zooms.set(tile, zNew);
      applyZoom(tile, zNew);
    }

    // Drag to pan while zoomed
    let dragTile: HTMLElement | null = null;
    let dragLastX = 0;
    let dragLastY = 0;

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const tile = findTile(e.target as HTMLElement, container);
      if (!tile) return;
      const z = getZoom(tile);
      if (z.scale <= 1) return;
      dragTile = tile;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      tile.style.cursor = 'grabbing';
      e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragTile) return;
      const z = getZoom(dragTile);
      const dx = e.clientX - dragLastX;
      const dy = e.clientY - dragLastY;
      dragLastX = e.clientX;
      dragLastY = e.clientY;

      const rect = dragTile.getBoundingClientRect();
      const video = dragTile.querySelector('video') as HTMLVideoElement | null;
      const vw = video?.offsetWidth ?? rect.width;
      const vh = video?.offsetHeight ?? rect.height;

      const newTx = Math.min(0, Math.max(rect.width - vw * z.scale, z.tx + dx));
      const newTy = Math.min(0, Math.max(rect.height - vh * z.scale, z.ty + dy));

      const zNew: TileZoom = { scale: z.scale, tx: newTx, ty: newTy };
      zooms.set(dragTile, zNew);
      applyZoom(dragTile, zNew);
    }

    function onMouseUp() {
      if (!dragTile) return;
      dragTile.style.cursor = '';
      dragTile = null;
    }

    // Escape → reset all zoomed tiles
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      container.querySelectorAll<HTMLElement>('.lk-participant-tile').forEach(resetTile);
    }

    // capture:true so we intercept before LiveKit's own wheel handlers
    container.addEventListener('dblclick', onDblClick);
    container.addEventListener('wheel', onWheel, { passive: false, capture: true });
    container.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('dblclick', onDblClick);
      container.removeEventListener('wheel', onWheel, { capture: true });
      container.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-950">
      <style>{`
        [data-lk-source="screen_share"]:fullscreen,
        .lk-participant-tile:fullscreen {
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        [data-lk-source="screen_share"]:fullscreen video,
        .lk-participant-tile:fullscreen video {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      `}</style>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={true}
        onDisconnected={onLeave}
        data-lk-theme="default"
        style={{ height: '100vh' }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
