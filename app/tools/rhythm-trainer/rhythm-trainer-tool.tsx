'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type SubdivisionOption = { id: number; label: string };

const SUBDIVISIONS: SubdivisionOption[] = [
  { id: 1, label: 'Quarter notes (beats)' },
  { id: 2, label: 'Eighth notes' },
  { id: 3, label: 'Triplets' },
  { id: 4, label: 'Sixteenth notes' },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function scheduleClick(ctx: AudioContext, time: number, opts: { frequency: number; gain: number }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(opts.frequency, time);

  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.05);
}

type TapSample = { t: number; offsetMs: number };

export default function RhythmTrainerTool() {
  const [bpm, setBpm] = useState(84);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [subdivision, setSubdivision] = useState(1);
  const [toleranceMs, setToleranceMs] = useState(30);
  const [soundOn, setSoundOn] = useState(true);
  const [volume, setVolume] = useState(0.55);
  const [isRunning, setIsRunning] = useState(false);

  const [pulse, setPulse] = useState<{ beat: number; sub: number; t: number } | null>(null);
  const [lastTap, setLastTap] = useState<TapSample | null>(null);
  const [samples, setSamples] = useState<TapSample[]>([]);
  const [streak, setStreak] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const uiTimeoutsRef = useRef<number[]>([]);
  const nextTimeRef = useRef<number>(0);
  const stepRef = useRef<number>(0);
  const gridStartRef = useRef<number>(0);

  const settingsRef = useRef({
    bpm,
    beatsPerBar,
    subdivision,
    toleranceMs,
    soundOn,
    volume,
  });

  useEffect(() => {
    settingsRef.current = { bpm, beatsPerBar, subdivision, toleranceMs, soundOn, volume };
  }, [beatsPerBar, bpm, soundOn, subdivision, toleranceMs, volume]);

  const clearUiTimeouts = () => {
    for (const id of uiTimeoutsRef.current) window.clearTimeout(id);
    uiTimeoutsRef.current = [];
  };

  const stopSchedulingNoState = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearUiTimeouts();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isRunning) return;
      if (e.code === 'Space') {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      for (const id of uiTimeoutsRef.current) window.clearTimeout(id);
      uiTimeoutsRef.current = [];
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  const beatDots = useMemo(() => Array.from({ length: clamp(beatsPerBar, 1, 12) }, (_, i) => i), [beatsPerBar]);

  const stats = useMemo(() => {
    if (!samples.length) {
      return { meanMs: 0, meanAbsMs: 0, stdMs: 0, n: 0, earlyPct: 0, latePct: 0 };
    }
    const n = samples.length;
    const offsets = samples.map((s) => s.offsetMs);
    const meanMs = offsets.reduce((acc, v) => acc + v, 0) / n;
    const meanAbsMs = offsets.reduce((acc, v) => acc + Math.abs(v), 0) / n;
    const variance = offsets.reduce((acc, v) => acc + (v - meanMs) * (v - meanMs), 0) / n;
    const stdMs = Math.sqrt(variance);
    const early = offsets.filter((v) => v < 0).length;
    const late = offsets.filter((v) => v > 0).length;
    return {
      meanMs,
      meanAbsMs,
      stdMs,
      n,
      earlyPct: Math.round((early / n) * 100),
      latePct: Math.round((late / n) * 100),
    };
  }, [samples]);

  const start = async () => {
    if (isRunning) return;
    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (!ctx) return;

    await safeResume(ctx);

    stopSchedulingNoState();
    stepRef.current = 0;
    gridStartRef.current = ctx.currentTime + 0.12;
    nextTimeRef.current = gridStartRef.current;

    setSamples([]);
    setStreak(0);
    setLastTap(null);
    setPulse(null);

    const lookaheadMs = 25;
    const scheduleAheadSec = 0.12;

    const scheduler = () => {
      const s = settingsRef.current;
      const beats = clamp(s.beatsPerBar, 1, 12);
      const subdiv = clamp(s.subdivision, 1, 8);
      const secondsPerBeat = 60 / clamp(s.bpm, 30, 240);

      while (nextTimeRef.current < ctx.currentTime + scheduleAheadSec) {
        const step = stepRef.current;
        const beatIndex = Math.floor(step / subdiv) % beats;
        const subIndex = step % subdiv;

        if (s.soundOn) {
          const isBeat = subIndex === 0;
          const isDownbeat = beatIndex === 0 && isBeat;
          const gain = s.volume * (isDownbeat ? 0.8 : isBeat ? 0.45 : 0.18);
          const freq = isDownbeat ? 1400 : isBeat ? 980 : 720;
          scheduleClick(ctx, nextTimeRef.current, { frequency: freq, gain: clamp(gain, 0, 1) });
        }

        const delayMs = Math.max(0, Math.round((nextTimeRef.current - ctx.currentTime) * 1000));
        const timeoutId = window.setTimeout(() => setPulse({ beat: beatIndex, sub: subIndex, t: Date.now() }), delayMs);
        uiTimeoutsRef.current.push(timeoutId);

        stepRef.current += 1;
        nextTimeRef.current += secondsPerBeat / subdiv;
      }
    };

    timerRef.current = window.setInterval(scheduler, lookaheadMs);
    setIsRunning(true);
  };

  const stop = () => {
    if (!isRunning) return;
    stopSchedulingNoState();
    setIsRunning(false);
    setPulse(null);
  };

  function tap() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (!isRunning) return;

    const s = settingsRef.current;
    const subdiv = clamp(s.subdivision, 1, 8);
    const secondsPerBeat = 60 / clamp(s.bpm, 30, 240);
    const stepDur = secondsPerBeat / subdiv;

    const tTap = ctx.currentTime;
    const start = gridStartRef.current;
    const elapsed = tTap - start;
    if (!Number.isFinite(elapsed) || elapsed < -0.15) return;

    const stepIndex = Math.round(elapsed / stepDur);
    if (stepIndex < 0) return;
    const target = start + stepIndex * stepDur;
    const offsetMs = (tTap - target) * 1000;

    const sample: TapSample = { t: Date.now(), offsetMs };
    setLastTap(sample);
    setSamples((prev) => [...prev, sample].slice(-64));
    setStreak((prev) => (Math.abs(offsetMs) <= clamp(s.toleranceMs, 5, 250) ? prev + 1 : 0));
  }

  const resetStats = () => {
    setSamples([]);
    setStreak(0);
    setLastTap(null);
  };

  const lastLabel = useMemo(() => {
    if (!lastTap) return '—';
    const v = lastTap.offsetMs;
    const side = v === 0 ? 'on time' : v < 0 ? 'early' : 'late';
    return `${v >= 0 ? '+' : ''}${v.toFixed(1)} ms (${side})`;
  }, [lastTap]);

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Rhythm Trainer</h1>
          <span className="prompt-header-badge">TIME</span>
        </div>
        <p className="muted">
          Start the click, then tap along with the beat (or subdivision). You can tap with the button or the spacebar.
          The trainer shows early/late timing in milliseconds.
        </p>

        <div className="toolbox-row">
          <div className="music-timer-display" aria-live="polite">
            <div className="music-timer-label">Last tap</div>
            <div className="music-timer-clock" style={{ fontSize: '1.6rem' }}>
              {lastLabel}
            </div>
            <div className="muted small">
              {stats.n} taps · avg abs {stats.meanAbsMs.toFixed(1)} ms · std {stats.stdMs.toFixed(1)} ms · streak {streak}
            </div>
          </div>

          <div className="toolbox-actions">
            <button className={`button primary ${isRunning ? 'music-stop' : ''}`} type="button" onClick={isRunning ? stop : start}>
              {isRunning ? 'Stop' : 'Start'}
            </button>
            <button className="button" type="button" onClick={tap} disabled={!isRunning}>
              Tap
            </button>
            <button className="button" type="button" onClick={resetStats} disabled={!samples.length}>
              Reset stats
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        <div className="music-beat-row" aria-label="Beat indicator">
          {beatDots.map((idx) => {
            const active = pulse?.beat === idx && pulse?.sub === 0;
            const downbeat = idx === 0;
            return (
              <div
                key={idx}
                className={['music-beat-dot', downbeat ? 'music-beat-dot-down' : '', active ? 'music-beat-dot-active' : ''].filter(Boolean).join(' ')}
                aria-hidden="true"
              />
            );
          })}
          {subdivision > 1 ? (
            <span className="muted small" style={{ marginLeft: 10 }}>
              subdivision {pulse ? `${pulse.sub + 1}/${subdivision}` : `1/${subdivision}`}
            </span>
          ) : null}
        </div>

        {stats.n ? (
          <p className="muted small" style={{ marginTop: 8 }}>
            bias: {stats.meanMs >= 0 ? '+' : ''}
            {stats.meanMs.toFixed(1)} ms · {stats.earlyPct}% early / {stats.latePct}% late
          </p>
        ) : (
          <p className="muted small" style={{ marginTop: 8 }}>
            Tip: start with quarters, then move to eighths or triplets.
          </p>
        )}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            BPM
            <input
              value={String(bpm)}
              onChange={(e) => setBpm(clamp(Number.parseInt(e.target.value || '0', 10), 30, 240))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
          <label className="toolbox-field">
            Beats per bar
            <input
              value={String(beatsPerBar)}
              onChange={(e) => setBeatsPerBar(clamp(Number.parseInt(e.target.value || '0', 10), 1, 12))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
        </div>

        <div className="toolbox-row" style={{ marginTop: 12 }}>
          <label className="toolbox-field">
            Subdivision
            <select value={subdivision} onChange={(e) => setSubdivision(Number.parseInt(e.target.value, 10))} disabled={isRunning}>
              {SUBDIVISIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbox-field">
            Tolerance (ms)
            <input
              value={String(toleranceMs)}
              onChange={(e) => setToleranceMs(clamp(Number.parseInt(e.target.value || '0', 10), 5, 250))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
        </div>

        <label className="toolbox-check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} disabled={isRunning} />
          <span>Click track sound</span>
        </label>

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Click volume
          <input
            value={String(Math.round(volume * 100))}
            onChange={(e) => setVolume(clamp(Number.parseInt(e.target.value || '0', 10) / 100, 0, 1))}
            inputMode="numeric"
            disabled={isRunning}
          />
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number.parseInt(e.target.value, 10) / 100)}
          aria-label="Click volume slider"
          disabled={isRunning}
        />
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Practice Ideas</h2>
        <ul>
          <li>Start with a wide tolerance (50ms), then tighten it gradually.</li>
          <li>Tap only downbeats for a full minute, then switch to subdivisions.</li>
          <li>Work in short bursts: 30 seconds of focus beats 10 minutes of drifting.</li>
        </ul>
        <p className="muted small">
          This measures timing against a perfect grid. Human feel is still real. The goal is control: choose the feel
          instead of landing there by accident.
        </p>
      </div>
    </>
  );
}
