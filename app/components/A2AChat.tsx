"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { A2AClient } from '@a2a-js/sdk/client';
import type { Message } from '@a2a-js/sdk';

type ChatItem = {
  id: string;
  role: 'user' | 'agent';
  text: string;
};

export default function A2AChat({ fullscreen = false }: { fullscreen?: boolean }) {
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const clientRef = useRef<A2AClient | null>(null);
  const contextIdRef = useRef<string | null>(null);

  const cardUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/a2a/.well-known/agent-card.json`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('@a2a-js/sdk/client');
      const client = await mod.A2AClient.fromCardUrl(cardUrl);
      if (!cancelled) {
        clientRef.current = client;
        contextIdRef.current = crypto.randomUUID();
        setReady(true);
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cardUrl]);

  async function send() {
    const text = input.trim();
    if (!text || !clientRef.current) return;
    const client = clientRef.current;
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', text }]);
    setInput('');

    const params = {
      message: {
        kind: 'message' as const,
        messageId: crypto.randomUUID(),
        role: 'user' as const,
        contextId: contextIdRef.current!,
        parts: [{ kind: 'text' as const, text }],
      },
      configuration: {
        blocking: false,
        acceptedOutputModes: ['text/plain'],
      },
    };

    try {
      setTyping(true);
      const stream = client.sendMessageStream(params);

      let agentMsgId: string | null = null;
      for await (const event of stream) {
        if ((event as any).kind === 'status-update') {
          const st = (event as any).status?.state;
          if (st === 'working') setTyping(true);
          if (st === 'completed' || (event as any).final) setTyping(false);
        } else if ((event as any).kind === 'message') {
          const msg = event as Message;
          const part = msg?.parts?.[0];
          const text = part?.kind === 'text' ? (part as any).text as string : '';
          if (!agentMsgId) {
            agentMsgId = crypto.randomUUID();
            setMessages((m) => [...m, { id: agentMsgId!, role: 'agent', text }]);
          } else {
            setMessages((m) => m.map(it => it.id === agentMsgId ? { ...it, text: it.text + text } : it));
          }
        }
      }
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: 'agent', text: 'There was a problem sending your message.' },
      ]);
      setTyping(false);
    }
  }

  return (
    <div className={`a2a-chat ${fullscreen ? 'fullscreen' : ''}`}>
      <div className="a2a-chat-window">
        <div className="a2a-messages">
          {messages.map((m) => (
            <div key={m.id} className={`a2a-msg ${m.role}`}>
              <div className="bubble">{m.text}</div>
            </div>
          ))}
        </div>
        <div className="a2a-input">
          <input
            type="text"
            value={input}
            placeholder={ready ? 'Type a message…' : 'Loading agent…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            disabled={!ready}
          />
          <button onClick={send} disabled={!ready || !input.trim()}>Send</button>
        </div>
        {typing && <div className="typing">Agent is typing…</div>}
      </div>
      <style jsx>{`
        .a2a-chat { display: flex; justify-content: center; height: auto; }
        .a2a-chat.fullscreen { height: 100%; }
        .a2a-chat-window { width: 100%; max-width: 720px; border: 1px solid var(--border); background: var(--panel); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; }
        .a2a-chat.fullscreen .a2a-chat-window { max-width: none; height: 100%; }
        .a2a-messages { display: flex; flex-direction: column; gap: 8px; min-height: 240px; max-height: 50vh; overflow-y: auto; padding: 6px; }
        .a2a-chat.fullscreen .a2a-messages { flex: 1; max-height: none; }
        .a2a-msg { display: flex; }
        .a2a-msg.user { justify-content: flex-end; }
        .a2a-msg.agent { justify-content: flex-start; }
        .bubble { padding: 10px 12px; border-radius: 10px; background: #1b2030; border: 1px solid #2a3443; max-width: 80%; white-space: pre-wrap; }
        .a2a-msg.user .bubble { background: #0a5025; border-color: #14532d; color: #dcfce7; }
        .a2a-input { display: flex; gap: 8px; margin-top: 8px; }
        .a2a-chat.fullscreen .a2a-input { margin-top: 12px; }
        .a2a-input input { flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: #121521; color: var(--text); }
        .a2a-input button { padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); background: #151823; color: var(--text); }
        .a2a-input button:disabled { opacity: 0.5; }
        .typing { margin-top: 6px; color: var(--muted); font-size: 0.9rem; }
      `}</style>
    </div>
  );
}
