'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
const TTS_FALLBACK_TIMEOUT_MS = 10000; // If TTS onend doesn't fire in 10s, continue anyway
const POST_TTS_DELAY_MS = 500; // Small delay after TTS before starting mic

export default function DiscoveryChat() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [isTTSSupported, setIsTTSSupported] = useState(false);
  const [autoSendCountdown, setAutoSendCountdown] = useState<number | null>(null);
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>('');
  
  const nextPromptIndexRef = useRef(1);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const autoSendTimeoutRef = useRef<number | null>(null);
  const autoSendIntervalRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptBaseRef = useRef('');
  const inputRef = useRef('');
  const voiceSessionActiveRef = useRef(false);
  const ttsFallbackTimeoutRef = useRef<number | null>(null);
  const ttsCompletedRef = useRef(false);

  const log = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[DiscoveryChat ${timestamp}] ${msg}`);
    setVoiceStatus(msg);
  };

  useEffect(() => {
    voiceSessionActiveRef.current = voiceSessionActive;
  }, [voiceSessionActive]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
      if (autoSendTimeoutRef.current !== null) window.clearTimeout(autoSendTimeoutRef.current);
      if (autoSendIntervalRef.current !== null) window.clearInterval(autoSendIntervalRef.current);
      if (ttsFallbackTimeoutRef.current !== null) window.clearTimeout(ttsFallbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
    setIsSpeechSupported(Boolean(SpeechRecognitionConstructor));
    setIsTTSSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const clearTTSFallback = () => {
    if (ttsFallbackTimeoutRef.current !== null) {
      window.clearTimeout(ttsFallbackTimeoutRef.current);
      ttsFallbackTimeoutRef.current = null;
    }
  };

  const updateInputValue = (value: string) => {
    inputRef.current = value;
    setInput(value);
  };

  const clearAutoSend = () => {
    if (autoSendTimeoutRef.current !== null) {
      window.clearTimeout(autoSendTimeoutRef.current);
      autoSendTimeoutRef.current = null;
    }
    if (autoSendIntervalRef.current !== null) {
      window.clearInterval(autoSendIntervalRef.current);
      autoSendIntervalRef.current = null;
    }
    setAutoSendCountdown(null);
  };

  const stopSpeaking = useCallback(() => {
    log('Stopping TTS');
    clearTTSFallback();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback((options?: { abort?: boolean }) => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setIsListening(false);
      return;
    }
    log(`Stopping recognition (abort: ${options?.abort ?? false})`);
    if (options?.abort) {
      recognition.abort();
    } else {
      recognition.stop();
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionConstructor) {
      log('Speech recognition not supported');
      return;
    }

    // Don't start if we're still speaking
    if (window.speechSynthesis?.speaking) {
      log('Still speaking, delaying mic start');
      setTimeout(() => startListening(), 500);
      return;
    }

    log('Requesting microphone permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      log('Microphone permission denied');
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    log('Starting speech recognition');
    const recognition = new SpeechRecognitionConstructor();
    recognitionRef.current = recognition;
    recognition.interimResults = true;
    recognition.continuous = false;

    const base = inputRef.current;
    const spacer = base.length > 0 && !base.endsWith(' ') ? ' ' : '';
    transcriptBaseRef.current = `${base}${spacer}`;

    recognition.onstart = () => {
      log('Recognition started');
      setIsListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      updateInputValue(`${transcriptBaseRef.current}${transcript}`);
    };

    recognition.onerror = (event) => {
      log(`Recognition error: ${event.error}`);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      log('Recognition ended');
      setIsListening(false);
      recognitionRef.current = null;
      
      // Only auto-send if voice session is still active and we have input
      const trimmed = inputRef.current.trim();
      if (trimmed && voiceSessionActiveRef.current) {
        log('Starting auto-send countdown');
        clearAutoSend();
        setAutoSendCountdown(3);

        autoSendIntervalRef.current = window.setInterval(() => {
          setAutoSendCountdown((prev) => {
            if (prev === null) return null;
            return prev > 1 ? prev - 1 : 1;
          });
        }, 1000);

        autoSendTimeoutRef.current = window.setTimeout(() => {
          if (voiceSessionActiveRef.current) {
            handleSendInternal();
          } else {
            clearAutoSend();
          }
        }, 3000);
      }
    };

    try {
      recognition.start();
    } catch (error) {
      log(`Failed to start recognition: ${error}`);
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, []);

  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!isTTSSupported || typeof window === 'undefined') {
      log('TTS not supported, skipping');
      onEnd?.();
      return;
    }

    log('Starting TTS');
    ttsCompletedRef.current = false;
    
    // Cancel any existing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const handleTTSComplete = () => {
      if (ttsCompletedRef.current) return; // Prevent double-firing
      ttsCompletedRef.current = true;
      clearTTSFallback();
      log('TTS completed');
      setIsSpeaking(false);
      
      // Add a small delay before calling onEnd to let audio settle
      if (onEnd) {
        setTimeout(onEnd, POST_TTS_DELAY_MS);
      }
    };

    utterance.onstart = () => {
      log('TTS onstart fired');
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      log('TTS onend fired');
      handleTTSComplete();
    };

    utterance.onerror = (event) => {
      log(`TTS error: ${event.error}`);
      handleTTSComplete();
    };

    // Fallback timeout in case onend never fires (common with Bluetooth)
    clearTTSFallback();
    ttsFallbackTimeoutRef.current = window.setTimeout(() => {
      if (!ttsCompletedRef.current) {
        log('TTS fallback timeout triggered');
        window.speechSynthesis.cancel();
        handleTTSComplete();
      }
    }, TTS_FALLBACK_TIMEOUT_MS);

    window.speechSynthesis.speak(utterance);
    
    // Chrome bug workaround: speechSynthesis can pause indefinitely
    // Ping it periodically to keep it alive
    const keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking || ttsCompletedRef.current) {
        clearInterval(keepAlive);
      } else {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 5000);

  }, [isTTSSupported]);

  const handleSendInternal = useCallback(() => {
    clearAutoSend();
    stopListening({ abort: true });
    
    const trimmed = inputRef.current.trim();
    if (!trimmed) return;

    log(`Sending message: ${trimmed.substring(0, 50)}...`);
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    updateInputValue('');
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

      // If voice session is active, speak then listen
      if (voiceSessionActiveRef.current) {
        log('Voice session active, speaking response');
        speakText(assistantReply, () => {
          if (voiceSessionActiveRef.current) {
            log('TTS done, starting listening');
            startListening();
          }
        });
      }
    }, typingDelayMs);
  }, [speakText, startListening, stopListening]);

  const handleSend = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    handleSendInternal();
  };

  const startVoiceSession = async () => {
    if (!isSpeechSupported) return;
    log('Starting voice session');
    setVoiceSessionActive(true);
    voiceSessionActiveRef.current = true;
    
    // Speak the current assistant message first, then start listening
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
    if (lastAssistantMessage && isTTSSupported) {
      speakText(lastAssistantMessage.content, () => {
        if (voiceSessionActiveRef.current) {
          startListening();
        }
      });
    } else {
      await startListening();
    }
  };

  const endVoiceSession = () => {
    log('Ending voice session');
    setVoiceSessionActive(false);
    voiceSessionActiveRef.current = false;
    stopSpeaking();
    stopListening({ abort: true });
    clearAutoSend();
    setVoiceStatus('');
  };

  const handleMicClick = async () => {
    if (!isSpeechSupported) return;
    
    if (voiceSessionActive) {
      endVoiceSession();
    } else {
      await startVoiceSession();
    }
  };

  const canSend = input.trim().length > 0 && !isTyping;
  
  const micTooltip = isSpeechSupported
    ? voiceSessionActive
      ? 'End voice conversation'
      : 'Start voice conversation'
    : "Speech recognition isn't supported in this browser.";

  const micButtonClasses = [
    'inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-400/20',
    voiceSessionActive
      ? 'border-rose-400/60 bg-rose-500/20 text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.45)]'
      : 'border-slate-800/70 bg-slate-900/70 text-emerald-100 hover:border-emerald-400/40 hover:text-emerald-200',
    isListening ? 'animate-pulse' : '',
    !isSpeechSupported ? 'cursor-not-allowed opacity-40' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-[0_0_40px_rgba(15,23,42,0.55)]">
      <div className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/60 px-4 py-2 text-xs font-ai uppercase tracking-[0.32em] text-emerald-300/70">
        <span>Session</span>
        <div className="flex items-center gap-2">
          {voiceSessionActive && (
            <span className="flex items-center gap-1 text-rose-300">
              <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
              {isSpeaking ? 'Speaking...' : isListening ? 'Listening...' : 'Voice Active'}
            </span>
          )}
          <span className="text-emerald-200/50">naf-discovery</span>
        </div>
      </div>

      {/* Debug status - remove in production */}
      {voiceStatus && (
        <div className="text-xs font-mono text-amber-400/70 px-2">
          Debug: {voiceStatus}
        </div>
      )}

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
        <div className="flex flex-1 flex-col gap-1">
          <input
            type="text"
            value={input}
            onChange={(event) => {
              clearAutoSend();
              updateInputValue(event.target.value);
            }}
            placeholder={voiceSessionActive ? "Voice session active - speak or type..." : "Type your response..."}
            className="w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-3 text-[0.95rem] text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/70 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 font-ai"
          />
          {autoSendCountdown !== null && (
            <span className="text-xs font-ai text-emerald-200/70">
              Sending in {autoSendCountdown}s... (type to cancel)
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleMicClick}
          disabled={!isSpeechSupported}
          aria-pressed={voiceSessionActive}
          aria-label={micTooltip}
          title={micTooltip}
          className={micButtonClasses}
        >
          {voiceSessionActive ? (
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
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          ) : (
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
          )}
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
