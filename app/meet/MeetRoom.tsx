'use client';

import '@livekit/components-styles';
import { useEffect, useRef } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from '@livekit/components-react';

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
