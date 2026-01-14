"use client";
import { useState } from 'react';
import dynamic from 'next/dynamic';

const A2AChat = dynamic(() => import('./A2AChat'), { ssr: false });

export default function FullScreenChat() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="chat-fab" aria-label="Chat" onClick={() => setOpen(true)}>💬</button>
      {open && (
        <div className="chat-overlay" role="dialog" aria-modal="true">
          <div className="chat-shell">
            <div className="chat-bar">
              <div className="title">Chat with Graham’s Agent</div>
              <button className="close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="chat-body">
              <A2AChat fullscreen />
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        .chat-fab { position: fixed; right: 20px; bottom: 20px; width: 48px; height: 48px; border-radius: 50%; background: #0a5025; color: #dcfce7; display: flex; align-items: center; justify-content: center; text-decoration: none; border: 1px solid #14532d; box-shadow: 0 4px 20px rgba(0,0,0,0.25); font-size: 20px; z-index: 70; }
        .chat-fab:hover { background: #0b6a31; }
        .chat-overlay { position: fixed; inset: 0; background: rgba(9,11,16,0.92); backdrop-filter: blur(6px); z-index: 60; display: flex; }
        .chat-shell { display: flex; flex-direction: column; width: 100%; height: 100%; }
        .chat-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); background: #0c0e14; }
        .chat-bar .title { font-weight: 600; }
        .chat-bar .close { background: transparent; border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 6px 10px; }
        .chat-body { flex: 1; padding: 12px; display: flex; }
        .chat-body :global(.a2a-chat) { width: 100%; }
      `}</style>
    </>
  );
}

