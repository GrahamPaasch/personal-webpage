'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Message } from '../types';

const starterQuestions = [
  "First, tell me about yourself. What's your role and what kind of network environment do you work with?",
  "What's the most frustrating part of your current network operations? The thing that makes you think \"there has to be a better way\"?",
  'Have you tried any automation before? Even simple scripts count. How did it go?',
];

const teaserMessage =
  "Great start! I'm already seeing some patterns. Save your progress to continue and get your full assessment.";

const initialMessages: Message[] = [
  {
    role: 'assistant',
    content: 'Welcome to the NAF Discovery Tool. I will ask a few quick questions to map your automation journey.',
  },
  { role: 'assistant', content: starterQuestions[0] },
];

const typingDelayMs = 700;

export default function DiscoveryChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const nextPromptIndexRef = useRef(1);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleSend = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setIsTyping(true);

    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      const promptIndex = nextPromptIndexRef.current;
      let assistantReply = teaserMessage;

      if (promptIndex < starterQuestions.length) {
        assistantReply = starterQuestions[promptIndex];
        nextPromptIndexRef.current += 1;
      } else if (promptIndex === starterQuestions.length) {
        assistantReply = teaserMessage;
        nextPromptIndexRef.current += 1;
      } else {
        assistantReply = 'Thanks for sharing. Save your progress to continue your full assessment.';
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: assistantReply }]);
      setIsTyping(false);
    }, typingDelayMs);
  };

  const canSend = input.trim().length > 0 && !isTyping;

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
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type your response..."
          className="flex-1 rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-[0.95rem] text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 font-ai"
        />
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
