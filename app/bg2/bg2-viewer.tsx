'use client';

import { useEffect, useRef, useState } from 'react';

export default function BG2Viewer() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [status, setStatus] = useState('Loading...');
  const [audioStarted, setAudioStarted] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@novnc/novnc@1.5.0/lib/rfb.js';
    script.type = 'module';

    const initScript = document.createElement('script');
    initScript.type = 'module';
    initScript.textContent = `
      import RFB from 'https://cdn.jsdelivr.net/npm/@novnc/novnc@1.5.0/lib/rfb.js';
      window.__noVNC_RFB = RFB;
      window.dispatchEvent(new Event('novnc-ready'));
    `;

    const onReady = () => {
      const RFB = (window as any).__noVNC_RFB;
      if (!RFB || !canvasRef.current) return;

      const wsUrl = 'wss://bg2.grahampaasch.com:6080';

      const rfb = new RFB(canvasRef.current, wsUrl, {
        wsProtocols: ['binary'],
      });

      rfb.scaleViewport = true;
      rfb.resizeSession = false;

      rfb.addEventListener('connect', () => {
        document.getElementById('bg2-status')?.setAttribute('data-connected', 'true');
        window.dispatchEvent(new Event('bg2-connected'));
      });
      rfb.addEventListener('disconnect', (e: any) => {
        window.dispatchEvent(new CustomEvent('bg2-disconnected', { detail: e.detail }));
      });

      (window as any).__noVNC_rfb = rfb;
    };

    window.addEventListener('novnc-ready', onReady);
    document.head.appendChild(initScript);

    return () => {
      window.removeEventListener('novnc-ready', onReady);
      (window as any).__noVNC_rfb?.disconnect();
    };
  }, []);

  useEffect(() => {
    const onConnect = () => setStatus('Connected');
    const onDisconnect = (e: any) => {
      setStatus(e.detail?.clean ? 'Disconnected' : 'Connection lost');
    };
    window.addEventListener('bg2-connected', onConnect);
    window.addEventListener('bg2-disconnected', onDisconnect);
    return () => {
      window.removeEventListener('bg2-connected', onConnect);
      window.removeEventListener('bg2-disconnected', onDisconnect);
    };
  }, []);

  const startAudio = () => {
    const audio = document.getElementById('bg2audio') as HTMLAudioElement;
    if (audio) {
      audio.play();
      setAudioStarted(true);
    }
  };

  return (
    <>
      {status !== 'Connected' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#ccc',
            fontFamily: 'monospace',
            fontSize: '1.2rem',
            zIndex: 10,
          }}
        >
          {status}
        </div>
      )}
      {status === 'Connected' && !audioStarted && (
        <button
          onClick={startAudio}
          style={{
            position: 'absolute',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            padding: '10px 24px',
            background: '#4a3728',
            color: '#d4a574',
            border: '2px solid #d4a574',
            borderRadius: 6,
            fontFamily: 'serif',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Enable Audio
        </button>
      )}
      <audio
        id="bg2audio"
        src="https://bg2.grahampaasch.com:8443/bg2audio"
        preload="none"
      />
      <div id="bg2-status" ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </>
  );
}
