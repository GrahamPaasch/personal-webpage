'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type SubdivisionOption = { id: number; label: string };

const SUBDIVISIONS: SubdivisionOption[] = [
  { id: 1, label: 'Quarter notes (beats)' },
  { id: 2, label: 'Eighth notes' },
  { id: 3, label: 'Triplets' },
  { id: 4, label: 'Sixteenth notes' },
];

type MetronomeSettings = {
  bpm: number;
  beatsPerBar: number;
  subdivision: number;
  swing: number; // 0..0.45, applies to eighths
  volume: number; // 0..1
  accentDownbeat: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AnyWindow = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = AnyWindow.AudioContext || AnyWindow.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function scheduleClick(
  ctx: AudioContext,
  time: number,
  opts: { frequency: number; gain: number },
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(opts.frequency, time);

  // Fast click envelope.
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

  osc.connect(g);
  g.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 0.05);
}

async function safeResume(ctx: AudioContext) {
  try {
    if (ctx.state !== 'running') await ctx.resume();
  } catch {
    // ignore
  }
}

export default function MetronomeTool() {
  const [bpm, setBpm] = useState(84);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [subdivision, setSubdivision] = useState(1);
  const [swing, setSwing] = useState(0.18);
  const [volume, setVolume] = useState(0.7);
  const [accentDownbeat, setAccentDownbeat] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [pulse, setPulse] = useState<{ beat: number; sub: number; t: number } | null>(null);
  const [tapHint, setTapHint] = useState<string>('Tap 4+ times to set tempo.');

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextTimeRef = useRef<number>(0);
  const stepRef = useRef<number>(0);
  const uiTimeoutsRef = useRef<number[]>([]);
  const tapsRef = useRef<number[]>([]);

  const settingsRef = useRef<MetronomeSettings>({
    bpm,
    beatsPerBar,
    subdivision,
    swing,
    volume,
    accentDownbeat,
  });

  useEffect(() => {
    settingsRef.current = {
      bpm,
      beatsPerBar,
      subdivision,
      swing,
      volume,
      accentDownbeat,
    };
  }, [accentDownbeat, beatsPerBar, bpm, subdivision, swing, volume]);

  const beatDots = useMemo(() => Array.from({ length: clamp(beatsPerBar, 1, 12) }, (_, i) => i), [beatsPerBar]);

  const clearUiTimeouts = () => {
    for (const id of uiTimeoutsRef.current) window.clearTimeout(id);
    uiTimeoutsRef.current = [];
  };

  const stopScheduling = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    clearUiTimeouts();
  };

  useEffect(() => {
    return () => {
      stopScheduling();
      // Leave AudioContext alone (browser will GC); avoid calling setState in unmount.
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (isRunning) return;

    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (!ctx) return;

    await safeResume(ctx);

    stopScheduling();
    stepRef.current = 0;
    nextTimeRef.current = ctx.currentTime + 0.06;

    const lookaheadMs = 25;
    const scheduleAheadSec = 0.12;

    const scheduler = () => {
      const s = settingsRef.current;
      const secondsPerBeat = 60 / clamp(s.bpm, 20, 320);
      const subdiv = clamp(s.subdivision, 1, 8);
      const beats = clamp(s.beatsPerBar, 1, 12);
      const swingAmt = subdiv === 2 ? clamp(s.swing, 0, 0.45) : 0;

      while (nextTimeRef.current < ctx.currentTime + scheduleAheadSec) {
        const step = stepRef.current;
        const beatIndex = Math.floor(step / subdiv) % beats;
        const subIndex = step % subdiv;

        const isBeat = subIndex === 0;
        const isDownbeat = beatIndex === 0 && isBeat;

        const accentGain = s.volume * (isDownbeat && s.accentDownbeat ? 0.9 : isBeat ? 0.55 : 0.28);
        const freq = isDownbeat ? 1400 : isBeat ? 980 : 720;

        scheduleClick(ctx, nextTimeRef.current, { frequency: freq, gain: clamp(accentGain, 0, 1) });

        const delayMs = Math.max(0, Math.round((nextTimeRef.current - ctx.currentTime) * 1000));
        const timeoutId = window.setTimeout(() => {
          setPulse({ beat: beatIndex, sub: subIndex, t: Date.now() });
        }, delayMs);
        uiTimeoutsRef.current.push(timeoutId);

        // Step duration, with optional swing for eighth notes.
        const baseStep = secondsPerBeat / subdiv;
        const stepDur =
          subdiv === 2
            ? subIndex === 0
              ? baseStep * (1 + swingAmt)
              : baseStep * (1 - swingAmt)
            : baseStep;

        stepRef.current += 1;
        nextTimeRef.current += stepDur;
      }
    };

    timerRef.current = window.setInterval(scheduler, lookaheadMs);
    setIsRunning(true);
  };

  const stop = () => {
    if (!isRunning) return;
    stopScheduling();
    setIsRunning(false);
    setPulse(null);
  };

  const tapTempo = () => {
    const now = performance.now();
    const taps = tapsRef.current;
    taps.push(now);
    while (taps.length > 8) taps.shift();

    if (taps.length < 2) {
      setTapHint('Keep tapping...');
      return;
    }

    // Use the most recent deltas (ignore long gaps).
    const deltas: number[] = [];
    for (let i = 1; i < taps.length; i += 1) {
      const dt = taps[i] - taps[i - 1];
      if (dt > 120 && dt < 3000) deltas.push(dt);
    }

    if (deltas.length < 3) {
      setTapHint('Tap a few more times...');
      return;
    }

    const avgMs = deltas.reduce((acc, v) => acc + v, 0) / deltas.length;
    const nextBpm = clamp(Math.round(60000 / avgMs), 30, 240);
    setBpm(nextBpm);
    setTapHint(`Set to ${nextBpm} BPM.`);
  };

  const swingEnabled = subdivision === 2;

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Metronome</h1>
          <span className="prompt-header-badge">PRACTICE</span>
        </div>
        <p className="muted">
          Tap tempo, subdivisions, swing, and a downbeat accent. Audio starts only after you press Start (browser policy).
        </p>

        <div className="toolbox-row">
          <div className="music-bpm-display" aria-live="polite">
            <div className="music-bpm-number">{bpm}</div>
            <div className="muted small">BPM</div>
          </div>

          <div className="toolbox-actions">
            <button className={`button primary ${isRunning ? 'music-stop' : ''}`} type="button" onClick={isRunning ? stop : start}>
              {isRunning ? 'Stop' : 'Start'}
            </button>
            <button className="button" type="button" onClick={tapTempo}>
              Tap tempo
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
                className={[
                  'music-beat-dot',
                  downbeat ? 'music-beat-dot-down' : '',
                  active ? 'music-beat-dot-active' : '',
                ].filter(Boolean).join(' ')}
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

        <p className="muted small" style={{ marginTop: 6 }}>
          {tapHint}
        </p>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Tempo</h2>
        <label className="toolbox-field">
          BPM
          <input
            value={String(bpm)}
            onChange={(e) => setBpm(clamp(Number.parseInt(e.target.value || '0', 10), 30, 240))}
            inputMode="numeric"
          />
        </label>
        <input
          type="range"
          min={30}
          max={240}
          value={bpm}
          onChange={(e) => setBpm(Number.parseInt(e.target.value, 10))}
          aria-label="BPM slider"
        />

        <div className="toolbox-row" style={{ marginTop: 12 }}>
          <label className="toolbox-field">
            Beats per bar
            <input
              value={String(beatsPerBar)}
              onChange={(e) => setBeatsPerBar(clamp(Number.parseInt(e.target.value || '0', 10), 1, 12))}
              inputMode="numeric"
            />
          </label>
          <label className="toolbox-field">
            Subdivision
            <select value={subdivision} onChange={(e) => setSubdivision(Number.parseInt(e.target.value, 10))}>
              {SUBDIVISIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {swingEnabled ? (
          <div style={{ marginTop: 12 }}>
            <label className="toolbox-field">
              Swing
              <input
                value={String(Math.round(swing * 100))}
                onChange={(e) => setSwing(clamp(Number.parseInt(e.target.value || '0', 10) / 100, 0, 0.45))}
                inputMode="numeric"
              />
            </label>
            <input
              type="range"
              min={0}
              max={45}
              value={Math.round(swing * 100)}
              onChange={(e) => setSwing(Number.parseInt(e.target.value, 10) / 100)}
              aria-label="Swing slider"
            />
            <p className="muted small">
              Swing delays the offbeat when using eighth-note subdivision. Try 15–25 for a gentle swing.
            </p>
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 12 }}>
            Swing control appears when subdivision is set to eighth notes.
          </p>
        )}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Sound</h2>
        <label className="toolbox-field">
          Volume
          <input
            value={String(Math.round(volume * 100))}
            onChange={(e) => setVolume(clamp(Number.parseInt(e.target.value || '0', 10) / 100, 0, 1))}
            inputMode="numeric"
          />
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number.parseInt(e.target.value, 10) / 100)}
          aria-label="Volume slider"
        />

        <label className="toolbox-check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={accentDownbeat}
            onChange={(e) => setAccentDownbeat(e.target.checked)}
          />
          <span>Accent downbeat</span>
        </label>

        <p className="muted small" style={{ marginTop: 12 }}>
          Tip: if you hear jitter, close other audio tabs. Browsers can deprioritize timers in the background.
        </p>
      </div>
    </>
  );
}

