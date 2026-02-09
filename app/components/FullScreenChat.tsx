'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const A2AChat = dynamic(() => import('./A2AChat'), { ssr: false });

export default function FullScreenChat() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button className="chat-fab" aria-label="Chat" onClick={() => setOpen(true)}>
        &#x1F4AC;
      </button>
      {open && (
        <div
          className="chat-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-title"
        >
          <div className="chat-shell">
            <div className="chat-bar">
              <div className="title" id="chat-title">
                Chat with Graham&apos;s Agent
              </div>
              <button
                ref={closeRef}
                className="close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="chat-body">
              <A2AChat fullscreen />
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .chat-fab {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #0a5025;
          color: #dcfce7;
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          border: 1px solid #14532d;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
          font-size: 20px;
          z-index: 70;
        }
        .chat-fab:hover {
          background: #0b6a31;
        }
        .chat-fab:focus-visible {
          outline: 2px solid rgba(134, 239, 172, 0.95);
          outline-offset: 3px;
        }
        .chat-overlay {
          position: fixed;
          inset: 0;
          background: rgba(9, 11, 16, 0.92);
          backdrop-filter: blur(6px);
          z-index: 60;
          display: flex;
        }
        .chat-shell {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
        }
        .chat-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: #0c0e14;
        }
        .chat-bar .title {
          font-weight: 600;
        }
        .chat-bar .close {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 8px;
          padding: 6px 10px;
        }
        .chat-bar .close:hover {
          border-color: rgba(248, 113, 113, 0.5);
        }
        .chat-bar .close:focus-visible {
          outline: 2px solid rgba(248, 113, 113, 0.9);
          outline-offset: 2px;
        }
        .chat-body {
          flex: 1;
          padding: 12px;
          display: flex;
        }
        .chat-body :global(.a2a-chat) {
          width: 100%;
        }
      `}</style>
    </>
  );
}
