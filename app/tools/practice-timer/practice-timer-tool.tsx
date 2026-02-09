'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { clamp } from '@/lib/music/notes';

type Segment = {
  id: string;
  label: string;
  seconds: number;
};

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AnyWindow = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = AnyWindow.AudioContext || AnyWindow.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

async function safeResume(ctx: AudioContext) {
  try {
    if (ctx.state !== 'running') await ctx.resume();
  } catch {
    // ignore
  }
}

function beep(ctx: AudioContext, opts: { freq: number; durationMs: number; gain: number }) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(opts.freq, now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + opts.durationMs / 1000);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + opts.durationMs / 1000 + 0.05);
}

const DEFAULT_SEGMENTS: Segment[] = [
  { id: 'warm', label: 'Warm-up', seconds: 5 * 60 },
  { id: 'tech', label: 'Technique (scales)', seconds: 10 * 60 },
  { id: 'rep', label: 'Repertoire', seconds: 20 * 60 },
  { id: 'read', label: 'Sight reading', seconds: 10 * 60 },
  { id: 'cool', label: 'Cool down', seconds: 3 * 60 },
];

export default function PracticeTimerTool(props: { initialSegments?: Segment[] }) {
  const initialSegments =
    props.initialSegments && props.initialSegments.length ? props.initialSegments : DEFAULT_SEGMENTS;

  const [segments, setSegments] = useState<Segment[]>(initialSegments);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(initialSegments[0].seconds * 1000);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const endAtRef = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const segmentsRef = useRef(segments);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      endAtRef.current = null;
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  const active = segments[activeIndex] || null;
  const activeDurationMs = active ? active.seconds * 1000 : 0;

  const totals = useMemo(() => {
    const totalSec = segments.reduce((acc, s) => acc + Math.max(0, s.seconds), 0);
    return { totalSec, totalMs: totalSec * 1000 };
  }, [segments]);

  const progress = useMemo(() => {
    if (!active || activeDurationMs <= 0) return 0;
    return clamp(1 - remainingMs / activeDurationMs, 0, 1);
  }, [active, activeDurationMs, remainingMs]);

  const stopInterval = () => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    endAtRef.current = null;
  };

  const ensureAudio = async () => {
    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (ctx) await safeResume(ctx);
    return ctx;
  };

  const start = async () => {
    if (isRunning) return;
    if (!segments.length) return;
    if (!active) return;

    const ctx = await ensureAudio();
    if (!ctx) return;

    stopInterval();

    endAtRef.current = Date.now() + remainingMs;
    intervalRef.current = window.setInterval(() => {
      const endAt = endAtRef.current;
      if (!endAt) return;
      const nextRemaining = endAt - Date.now();

      if (nextRemaining <= 0) {
        // Segment complete.
        const i = activeIndexRef.current;
        const segs = segmentsRef.current;
        const nextIdx = i + 1;
        if (nextIdx < segs.length) {
          // Transition beep.
          beep(ctx, { freq: 880, durationMs: 140, gain: 0.22 });
          const nextSeg = segs[nextIdx];
          activeIndexRef.current = nextIdx;
          setActiveIndex(nextIdx);
          setRemainingMs(nextSeg.seconds * 1000);
          endAtRef.current = Date.now() + nextSeg.seconds * 1000;
        } else {
          // Session complete: two beeps.
          beep(ctx, { freq: 1320, durationMs: 160, gain: 0.25 });
          window.setTimeout(() => beep(ctx, { freq: 990, durationMs: 220, gain: 0.2 }), 180);
          stopInterval();
          setIsRunning(false);
          setRemainingMs(0);
        }
        return;
      }
      setRemainingMs(nextRemaining);
    }, 200);

    setIsRunning(true);
  };

  const pause = () => {
    if (!isRunning) return;
    const endAt = endAtRef.current;
    if (endAt) setRemainingMs(Math.max(0, endAt - Date.now()));
    stopInterval();
    setIsRunning(false);
  };

  const reset = () => {
    pause();
    setActiveIndex(0);
    setRemainingMs((segments[0]?.seconds ?? 0) * 1000);
  };

  const skip = async (direction: 1 | -1) => {
    const nextIdx = clamp(activeIndex + direction, 0, Math.max(0, segments.length - 1));
    if (nextIdx === activeIndex) return;

    const ctx = await ensureAudio();
    if (ctx) beep(ctx, { freq: direction === 1 ? 740 : 620, durationMs: 110, gain: 0.18 });

    pause();
    setActiveIndex(nextIdx);
    setRemainingMs((segments[nextIdx]?.seconds ?? 0) * 1000);
  };

  const updateSegment = (id: string, patch: Partial<Pick<Segment, 'label' | 'seconds'>>) => {
    const nextSeconds =
      patch.seconds !== undefined ? clamp(Math.round(patch.seconds), 1, 8 * 60 * 60) : null;

    setSegments((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              ...(patch.label !== undefined ? { label: patch.label } : null),
              ...(nextSeconds !== null ? { seconds: nextSeconds } : null),
            }
          : s,
      ),
    );

    // If the active segment duration changes while paused, clamp the remaining clock to it.
    if (!isRunning && nextSeconds !== null && active?.id === id) {
      setRemainingMs((prev) => clamp(prev, 0, nextSeconds * 1000));
    }
  };

  const removeSegment = (id: string) => {
    const idx = segments.findIndex((s) => s.id === id);
    if (idx < 0) return;

    const nextSegments = segments.filter((s) => s.id !== id);
    setSegments(nextSegments);

    let nextActiveIndex = activeIndex;
    if (idx < activeIndex) nextActiveIndex = Math.max(0, activeIndex - 1);
    if (idx === activeIndex) nextActiveIndex = clamp(activeIndex, 0, Math.max(0, nextSegments.length - 1));

    setActiveIndex(nextActiveIndex);
    const nextActive = nextSegments[nextActiveIndex] || null;

    setRemainingMs((prev) => {
      if (!nextActive) return 0;
      const cap = nextActive.seconds * 1000;
      if (idx === activeIndex) return cap;
      return clamp(prev, 0, cap);
    });
  };

  const addSegment = () => {
    setSegments((prev) => [
      ...prev,
      { id: createId(), label: 'New block', seconds: 5 * 60 },
    ]);
  };

  const setCopied = (message: string) => {
    setCopyNote(message);
    window.setTimeout(() => setCopyNote(null), 2200);
  };

  const copyPlan = async () => {
    const json = JSON.stringify({ segments }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied('Copied plan JSON.');
    } catch {
      setCopied('Copy failed.');
    }
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Practice Timer</h1>
          <span className="prompt-header-badge">FOCUS</span>
        </div>
        <p className="muted">
          Build a practice session out of timed blocks (warm-up, technique, rep, etc.). The timer beeps on block transitions.
        </p>

        <div className="toolbox-row">
          <div className="music-timer-display" aria-live="polite">
            <div className="music-timer-label">{active?.label || 'No blocks'}</div>
            <div className="music-timer-clock">{formatClock(remainingMs)}</div>
            <div className="muted small">
              Block {segments.length ? activeIndex + 1 : 0}/{segments.length} · Total {formatClock(totals.totalMs)}
            </div>
            <div className="music-progress" aria-hidden="true">
              <div className="music-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>

          <div className="toolbox-actions">
            <button className={`button primary ${isRunning ? 'music-stop' : ''}`} type="button" onClick={isRunning ? pause : start} disabled={!active}>
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button className="button" type="button" onClick={reset} disabled={!segments.length}>
              Reset
            </button>
            <button className="button" type="button" onClick={() => skip(-1)} disabled={!segments.length || activeIndex === 0}>
              Prev
            </button>
            <button className="button" type="button" onClick={() => skip(1)} disabled={!segments.length || activeIndex >= segments.length - 1}>
              Next
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        {copyNote ? <p className="muted small">{copyNote}</p> : null}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Blocks</h2>
        <p className="muted small">
          Edit blocks while paused. (It is easy to accidentally change a running timer.)
        </p>

        <div className="toolbox-actions" style={{ marginBottom: 10 }}>
          <button className="button" type="button" onClick={addSegment} disabled={isRunning}>
            Add block
          </button>
          <button className="button" type="button" onClick={copyPlan} disabled={!segments.length}>
            Copy plan JSON
          </button>
        </div>

        <div className="music-block-list">
          {segments.length === 0 ? (
            <p className="muted">No blocks. Add one.</p>
          ) : (
            segments.map((seg, idx) => {
              const isActive = idx === activeIndex;
              const mins = Math.floor(seg.seconds / 60);
              const secs = seg.seconds % 60;
              return (
                <div key={seg.id} className={`music-block ${isActive ? 'music-block-active' : ''}`}>
                  <div className="music-block-head">
                    <span className="music-block-index">{idx + 1}</span>
                    <input
                      value={seg.label}
                      onChange={(e) => updateSegment(seg.id, { label: e.target.value })}
                      disabled={isRunning}
                      aria-label={`Block ${idx + 1} label`}
                    />
                    <button
                      className="button"
                      type="button"
                      onClick={() => removeSegment(seg.id)}
                      disabled={isRunning || segments.length <= 1}
                      aria-label={`Remove block ${idx + 1}`}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="music-block-time">
                    <label className="toolbox-field">
                      Min
                      <input
                        value={String(mins)}
                        onChange={(e) => {
                          const v = clamp(Number.parseInt(e.target.value || '0', 10), 0, 8 * 60);
                          updateSegment(seg.id, { seconds: v * 60 + secs });
                        }}
                        inputMode="numeric"
                        disabled={isRunning}
                      />
                    </label>
                    <label className="toolbox-field">
                      Sec
                      <input
                        value={String(secs)}
                        onChange={(e) => {
                          const v = clamp(Number.parseInt(e.target.value || '0', 10), 0, 59);
                          updateSegment(seg.id, { seconds: mins * 60 + v });
                        }}
                        inputMode="numeric"
                        disabled={isRunning}
                      />
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Usage Ideas</h2>
        <ul>
          <li>Technique: scales + arpeggios, then 1–2 etudes, then repertoire.</li>
          <li>Chunking: 3 blocks of 8–10 minutes on one hard passage beats 1 block of 30.</li>
          <li>For marimba: set short blocks for each part, then a final “whole song” block.</li>
        </ul>
        <p className="muted small">
          This is intentionally simple: no accounts, no cloud, no tracking beyond what your browser is already doing.
        </p>
      </div>
    </>
  );
}
