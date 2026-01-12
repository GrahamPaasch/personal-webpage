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
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const nextPromptIndexRef = useRef(1);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
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
    return () => {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
    setIsSpeechSupported(Boolean(SpeechRecognitionConstructor));
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const requestMicrophonePermission = async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      return false;
    }
  };

  const stopListening = (options?: { abort?: boolean }) => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setIsListening(false);
      return;
    }

    if (options?.abort) {
      recognition.abort();
    } else {
      recognition.stop();
    }
    setIsListening(false);
  };

  const startListening = async () => {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionConstructor) return;

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) return;

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognitionRef.current = recognition;
    recognition.interimResults = true;
    recognition.continuous = false;

    const base = input;
    const spacer = base.length > 0 && !base.endsWith(' ') ? ' ' : '';
    transcriptBaseRef.current = `${base}${spacer}`;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      setInput(`${transcriptBaseRef.current}${transcript}`);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      recognitionRef.current = null;
      setIsListening(false);
    }
  };

  const handleMicClick = async () => {
    if (!isSpeechSupported) return;
    if (isListening) {
      stopListening();
      return;
    }
    await startListening();
  };

  const handleSend = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (isListening) {
      stopListening({ abort: true });
    }
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
  const micTooltip = isSpeechSupported
    ? isListening
      ? 'Stop voice input'
      : 'Start voice input'
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
          onChange={(event) => setInput(event.target.value)}
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
