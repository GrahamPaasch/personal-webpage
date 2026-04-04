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

interface ZoomState {
  scale: number;
  tx: number;
  ty: number;
}

export default function MeetRoom({ token, roomName, onLeave }: MeetRoomProps) {
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const zoomStates = new WeakMap<Element, ZoomState>();

    function getState(tile: Element): ZoomState {
      if (!zoomStates.has(tile)) {
        zoomStates.set(tile, { scale: 1, tx: 0, ty: 0 });
      }
      return zoomStates.get(tile)!;
    }

    function applyZoom(tile: HTMLElement, state: ZoomState) {
      const video = tile.querySelector('video') as HTMLVideoElement | null;
      if (!video) return;
      if (state.scale <= 1) {
        video.style.transform = '';
        video.style.transformOrigin = '';
        video.style.cursor = '';
        tile.style.overflow = '';
        tile.removeAttribute('data-zoomed');
      } else {
        tile.style.overflow = 'hidden';
        video.style.transformOrigin = '0 0';
        video.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
        video.style.cursor = 'grab';
        tile.setAttribute('data-zoomed', 'true');
      }
    }

    function clamp(tile: HTMLElement, state: ZoomState) {
      const video = tile.querySelector('video') as HTMLVideoElement | null;
      if (!video) return;
      const rect = tile.getBoundingClientRect();
      const maxTx = 0;
      const minTx = Math.min(0, rect.width - video.offsetWidth * state.scale);
      const maxTy = 0;
      const minTy = Math.min(0, rect.height - video.offsetHeight * state.scale);
      state.tx = Math.max(minTx, Math.min(maxTx, state.tx));
      state.ty = Math.max(minTy, Math.min(maxTy, state.ty));
    }

    // ── Double-click → fullscreen ──────────────────────────────────
    function handleDblClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const tile = target.closest('[data-lk-source], .lk-participant-tile') as HTMLElement | null;
      if (!tile) return;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        tile.requestFullscreen().catch(() => {});
      }
    }

    // ── Scroll wheel → zoom centered on cursor ─────────────────────
    function handleWheel(e: WheelEvent) {
      const target = e.target as HTMLElement;
      const tile = target.closest('[data-lk-source], .lk-participant-tile') as HTMLElement | null;
      if (!tile) return;

      e.preventDefault();

      const rect = tile.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const state = getState(tile);
      const oldScale = state.scale;
      const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      const newScale = Math.max(1, Math.min(10, oldScale * factor));

      if (newScale === 1) {
        state.scale = 1;
        state.tx = 0;
        state.ty = 0;
      } else {
        // Keep the point under the cursor fixed as scale changes
        const ex = (mx - state.tx) / oldScale;
        const ey = (my - state.ty) / oldScale;
        state.tx = mx - ex * newScale;
        state.ty = my - ey * newScale;
        state.scale = newScale;
        clamp(tile, state);
      }

      applyZoom(tile, state);
    }

    // ── Drag to pan ────────────────────────────────────────────────
    let dragTile: HTMLElement | null = null;
    let dragLastX = 0;
    let dragLastY = 0;

    function handleMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      const tile = target.closest('[data-lk-source], .lk-participant-tile') as HTMLElement | null;
      if (!tile) return;
      const state = getState(tile);
      if (state.scale <= 1) return;
      dragTile = tile;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      const video = tile.querySelector('video') as HTMLVideoElement | null;
      if (video) video.style.cursor = 'grabbing';
      e.preventDefault();
    }

    function handleMouseMove(e: MouseEvent) {
      if (!dragTile) return;
      const state = getState(dragTile);
      state.tx += e.clientX - dragLastX;
      state.ty += e.clientY - dragLastY;
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      clamp(dragTile, state);
      applyZoom(dragTile, state);
    }

    function handleMouseUp() {
      if (!dragTile) return;
      const state = getState(dragTile);
      const video = dragTile.querySelector('video') as HTMLVideoElement | null;
      if (video) video.style.cursor = 'grab';
      dragTile = null;
    }

    // ── Escape → reset zoom on all tiles ──────────────────────────
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      container.querySelectorAll<HTMLElement>('[data-zoomed="true"]').forEach(tile => {
        const state = getState(tile);
        state.scale = 1;
        state.tx = 0;
        state.ty = 0;
        applyZoom(tile, state);
      });
    }

    container.addEventListener('dblclick', handleDblClick);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('dblclick', handleDblClick);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-950">
      <style>{`
        [data-lk-source="screen_share"] video {
          cursor: zoom-in;
        }
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
