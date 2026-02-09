'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { clamp, frequencyFromMidi, midiToNoteName } from '@/lib/music/notes';

type Interval = {
  id: string;
  semitones: number;
  short: string;
  name: string;
};

const INTERVALS: Interval[] = [
  { id: 'm2', semitones: 1, short: 'm2', name: 'Minor 2nd' },
  { id: 'M2', semitones: 2, short: 'M2', name: 'Major 2nd' },
  { id: 'm3', semitones: 3, short: 'm3', name: 'Minor 3rd' },
  { id: 'M3', semitones: 4, short: 'M3', name: 'Major 3rd' },
  { id: 'P4', semitones: 5, short: 'P4', name: 'Perfect 4th' },
  { id: 'TT', semitones: 6, short: 'TT', name: 'Tritone' },
  { id: 'P5', semitones: 7, short: 'P5', name: 'Perfect 5th' },
  { id: 'm6', semitones: 8, short: 'm6', name: 'Minor 6th' },
  { id: 'M6', semitones: 9, short: 'M6', name: 'Major 6th' },
  { id: 'm7', semitones: 10, short: 'm7', name: 'Minor 7th' },
  { id: 'M7', semitones: 11, short: 'M7', name: 'Major 7th' },
  { id: 'P8', semitones: 12, short: '8', name: 'Octave' },
];

type Mode = 'melodic' | 'harmonic';
type Direction = 'up' | 'down' | 'mixed';

type Question = {
  rootMidi: number;
  targetMidi: number;
  intervalId: string;
  direction: 'up' | 'down';
};

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

function scheduleTone(ctx: AudioContext, opts: { time: number; freq: number; duration: number; gain: number }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(opts.freq, opts.time);

  const a = Math.max(0.0002, opts.gain);
  g.gain.setValueAtTime(0.0001, opts.time);
  g.gain.exponentialRampToValueAtTime(a, opts.time + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, opts.time + opts.duration);

  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(opts.time);
  osc.stop(opts.time + opts.duration + 0.05);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function hashStringToSeed(input: string): number {
  // FNV-1a-ish string hash -> uint32 seed.
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export default function EarTrainerTool() {
  const [mode, setMode] = useState<Mode>('melodic');
  const [direction, setDirection] = useState<Direction>('up');
  const [autoPlay, setAutoPlay] = useState(true);
  const [a4, setA4] = useState(440);
  const [selectedIds, setSelectedIds] = useState<string[]>(['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8']);

  const [question, setQuestion] = useState<Question | null>(null);
  const [result, setResult] = useState<{ state: 'idle' | 'correct' | 'wrong'; pickedId?: string }>(
    { state: 'idle' },
  );
  const [stats, setStats] = useState<{ total: number; correct: number; streak: number }>({
    total: 0,
    correct: 0,
    streak: 0,
  });

  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Create an initial question.
    if (!question) {
      setQuestion(makeQuestion(selectedIds, direction));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Ensure the current question interval is still selectable.
    if (!question) return;
    if (selectedIds.includes(question.intervalId)) return;
    const next = makeQuestion(selectedIds, direction);
    setQuestion(next);
    setResult({ state: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join('|')]);

  useEffect(() => {
    return () => {
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  const selectedIntervals = useMemo(
    () => INTERVALS.filter((i) => selectedIds.includes(i.id)),
    [selectedIds],
  );

  const questionIntervalId = question?.intervalId ?? 'none';
  const questionRootMidi = question?.rootMidi ?? 0;
  const questionTargetMidi = question?.targetMidi ?? 0;
  const questionDirection = question?.direction ?? 'up';

  const answerChoices = useMemo(() => {
    // Keep choice order stable during a question, but reshuffle for each new question.
    const key = `${questionIntervalId}|${questionRootMidi}|${questionTargetMidi}|${questionDirection}`;
    return shuffleSeeded(selectedIntervals, hashStringToSeed(key));
  }, [selectedIntervals, questionDirection, questionIntervalId, questionRootMidi, questionTargetMidi]);

  const rootLabel = useMemo(() => {
    if (!question) return '';
    return midiToNoteName(question.rootMidi, 'flat');
  }, [question]);

  const ensureAudio = async () => {
    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (ctx) await safeResume(ctx);
    return ctx;
  };

  const play = async () => {
    if (!question) return;
    const interval = INTERVALS.find((i) => i.id === question.intervalId);
    if (!interval) return;

    const ctx = await ensureAudio();
    if (!ctx) return;

    const now = ctx.currentTime + 0.05;
    const rootFreq = frequencyFromMidi(question.rootMidi, a4);
    const targetFreq = frequencyFromMidi(question.targetMidi, a4);

    if (mode === 'harmonic') {
      scheduleTone(ctx, { time: now, freq: rootFreq, duration: 0.7, gain: 0.16 });
      scheduleTone(ctx, { time: now, freq: targetFreq, duration: 0.7, gain: 0.16 });
      return;
    }

    scheduleTone(ctx, { time: now, freq: rootFreq, duration: 0.42, gain: 0.18 });
    scheduleTone(ctx, { time: now + 0.52, freq: targetFreq, duration: 0.48, gain: 0.18 });
  };

  const newQuestion = async (opts?: { autoplay?: boolean }) => {
    const next = makeQuestion(selectedIds, direction);
    setQuestion(next);
    setResult({ state: 'idle' });
    if (opts?.autoplay) {
      await playAfter(next);
    }
  };

  const playAfter = async (q: Question) => {
    const interval = INTERVALS.find((i) => i.id === q.intervalId);
    if (!interval) return;
    const ctx = await ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime + 0.05;
    const rootFreq = frequencyFromMidi(q.rootMidi, a4);
    const targetFreq = frequencyFromMidi(q.targetMidi, a4);
    if (mode === 'harmonic') {
      scheduleTone(ctx, { time: now, freq: rootFreq, duration: 0.7, gain: 0.16 });
      scheduleTone(ctx, { time: now, freq: targetFreq, duration: 0.7, gain: 0.16 });
      return;
    }
    scheduleTone(ctx, { time: now, freq: rootFreq, duration: 0.42, gain: 0.18 });
    scheduleTone(ctx, { time: now + 0.52, freq: targetFreq, duration: 0.48, gain: 0.18 });
  };

  const guess = async (intervalId: string) => {
    if (!question) return;
    if (result.state !== 'idle') return;

    const correct = intervalId === question.intervalId;
    setResult({ state: correct ? 'correct' : 'wrong', pickedId: intervalId });
    setStats((prev) => ({
      total: prev.total + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak: correct ? prev.streak + 1 : 0,
    }));
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next.length ? next : prev;
      }
      return [...prev, id];
    });
  };

  const reveal = useMemo(() => {
    if (!question) return null;
    const i = INTERVALS.find((x) => x.id === question.intervalId);
    if (!i) return null;
    const dir = question.direction === 'up' ? '↑' : '↓';
    return `${i.name} (${i.short}) ${dir}`;
  }, [question]);

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Interval Ear Trainer</h1>
          <span className="prompt-header-badge">EAR</span>
        </div>
        <p className="muted">
          Hit Play, then identify the interval. Pick a small set of intervals first; expand the set as you get consistent.
        </p>

        <div className="toolbox-row">
          <div className="music-quiz-display">
            <div className="music-quiz-label">Root</div>
            <div className="music-quiz-value">{rootLabel || '—'}</div>
            <div className="muted small">
              {stats.correct}/{stats.total} correct · streak {stats.streak}
            </div>
          </div>
          <div className="toolbox-actions">
            <button className="button primary" type="button" onClick={play} disabled={!question}>
              Play
            </button>
            <button className="button" type="button" onClick={() => newQuestion({ autoplay: autoPlay })}>
              New
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        {result.state !== 'idle' ? (
          <p
            className={`music-result ${result.state === 'correct' ? 'music-result-ok' : 'music-result-bad'}`}
            role="status"
          >
            {result.state === 'correct' ? 'Correct:' : 'Answer:'} {reveal}
          </p>
        ) : (
          <p className="muted small">Choose an answer below.</p>
        )}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Answer</h2>
        <div className="music-choices">
          {answerChoices.map((i) => (
            <button
              key={i.id}
              className="music-choice"
              type="button"
              onClick={() => guess(i.id)}
              disabled={!question || result.state !== 'idle'}
            >
              <span className="music-choice-short">{i.short}</span>
              <span className="music-choice-name">{i.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="melodic">Melodic (one after another)</option>
              <option value="harmonic">Harmonic (together)</option>
            </select>
          </label>
          <label className="toolbox-field">
            Direction
            <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
        </div>

        <label className="toolbox-check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={autoPlay} onChange={(e) => setAutoPlay(e.target.checked)} />
          <span>Auto-play when creating a new question</span>
        </label>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          A4 tuning (Hz)
          <input
            value={String(a4)}
            onChange={(e) => setA4(clamp(Number.parseInt(e.target.value || '0', 10), 415, 466))}
            inputMode="numeric"
          />
        </label>

        <h3 style={{ marginTop: 18 }}>Intervals to include</h3>
        <div className="music-interval-grid">
          {INTERVALS.map((i) => (
            <label key={i.id} className="music-interval-toggle">
              <input
                type="checkbox"
                checked={selectedIds.includes(i.id)}
                onChange={() => toggle(i.id)}
              />
              <span className="music-interval-pill">
                {i.short} <span className="muted small">{i.name}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </>
  );

  function makeQuestion(ids: string[], dir: Direction): Question {
    const pool = INTERVALS.filter((i) => ids.includes(i.id));
    const interval = pool.length ? pickRandom(pool) : INTERVALS[0];
    const pickedDir: 'up' | 'down' =
      dir === 'mixed' ? (Math.random() < 0.5 ? 'up' : 'down') : dir;

    // Keep within a comfortable range (roughly C2..C6).
    const minMidi = 36;
    const maxMidi = 84;
    const minRoot = pickedDir === 'up' ? minMidi : minMidi + interval.semitones;
    const maxRoot = pickedDir === 'up' ? maxMidi - interval.semitones : maxMidi;

    let rootMidi = 60; // C4 fallback
    if (minRoot <= maxRoot) {
      rootMidi = Math.floor(Math.random() * (maxRoot - minRoot + 1)) + minRoot;
    }

    // Snap root to a chromatic note so the ear trainer doesn't bias toward non-12TET targets.
    rootMidi = clamp(rootMidi, minRoot, maxRoot);

    const targetMidi = pickedDir === 'up' ? rootMidi + interval.semitones : rootMidi - interval.semitones;
    return { rootMidi, targetMidi, intervalId: interval.id, direction: pickedDir };
  }
}
