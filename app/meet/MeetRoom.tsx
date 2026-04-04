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

export default function MeetRoom({ token, roomName, onLeave }: MeetRoomProps) {
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    container.addEventListener('dblclick', handleDblClick);
    return () => container.removeEventListener('dblclick', handleDblClick);
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-gray-950">
      <style>{`
        [data-lk-source="screen_share"],
        [data-lk-source="screen_share"] ~ * {
          cursor: zoom-in;
        }
        [data-lk-source="screen_share"]:fullscreen,
        .lk-participant-tile:fullscreen {
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: zoom-out;
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
