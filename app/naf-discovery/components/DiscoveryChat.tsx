'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Message } from '../types';

type SpeechRecognitionConstructor = new () => SpeechRecognition;

type SpeechRecognitionBrowser = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as SpeechRecognitionBrowser;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
};

const initialMessages: Message[] = [
  {
    role: 'assistant',
    content: 'Welcome to the NAF Discovery Tool. I will ask a few quick questions to map your automation journey.',
  },
];

export default function DiscoveryChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptBaseRef = useRef('');

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  useEffect(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    setIsSpeechSupported(Boolean(SpeechRecognitionCtor));
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = async () => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.interimResults = true;
    recognition.continuous = false;

    const base = input;
    const spacer = base.length > 0 && !base.endsWith(' ') ? ' ' : '';
    transcriptBaseRef.current = `${base}${spacer}`;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      setInput(`${transcriptBaseRef.current}${transcript}`);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  const handleMicClick = () => {
    if (!isSpeechSupported) return;
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSend = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/naf-discovery/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          typeof data?.error === 'string'
            ? data.error
            : 'Sorry, I had trouble generating a response.';
        setMessages((prev) => [...prev, { role: 'assistant', content: errorMessage }]);
        return;
      }

      const reply =
        typeof data?.message === 'string' && data.message.trim().length > 0
          ? data.message
          : 'Sorry, I had trouble generating a response.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I ran into a connection issue. Please try again.' },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const canSend = input.trim().length > 0 && !isTyping;

  const micTooltip = isSpeechSupported
    ? isListening
      ? 'Stop listening'
      : 'Push to talk'
    : "Speech recognition isn't supported in this browser.";

  const micButtonClasses = [
    'inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-400/20',
    isListening
      ? 'border-rose-400/60 bg-rose-500/20 text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.45)] animate-pulse'
      : 'border-slate-800/70 bg-slate-900/70 text-emerald-100 hover:border-emerald-400/40 hover:text-emerald-200',
    !isSpeechSupported ? 'cursor-not-allowed opacity-40' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-[0_0_40px_rgba(15,23,42,0.55)]">
      <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/60 px-4 py-2 text-xs font-ai uppercase tracking-[0.32em] text-emerald-300/70">
        <span>Session</span>
        <span className="text-emerald-200/50">naf-discovery</span>
      </div>

      <div
        ref={messagesRef}
        className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto rounded-xl border border-slate-800/60 bg-slate-950/60 p-4"
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl border px-4 py-3 text-[0.95rem] leading-relaxed shadow-sm ${
                message.role === 'user'
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                  : 'border-slate-700/60 bg-slate-900/70 text-slate-100'
              }`}
            >
              <p className="whitespace-pre-wrap font-ai">{message.content}</p>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex items-center gap-2 text-xs font-ai text-emerald-200/80">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400/80" />
            <span>Assistant is typing...</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your response..."
          className="flex-1 rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-[0.95rem] text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 font-ai"
        />
        <button
          type="button"
          onClick={handleMicClick}
          disabled={!isSpeechSupported}
          aria-pressed={isListening}
          aria-label={micTooltip}
          title={micTooltip}
          className={micButtonClasses}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <path d="M12 19v3" />
            <path d="M8 22h8" />
          </svg>
        </button>
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
