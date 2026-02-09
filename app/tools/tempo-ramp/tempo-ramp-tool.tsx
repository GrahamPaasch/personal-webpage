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

type RampSettings = {
  startBpm: number;
  endBpm: number;
  stepBpm: number;
  barsPerStep: number;
  stopAtEnd: boolean;
  loop: boolean;
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

async function safeResume(ctx: AudioContext) {
  try {
    if (ctx.state !== 'running') await ctx.resume();
  } catch {
    // ignore
  }
}

export default function TempoRampTool() {
  const [startBpm, setStartBpm] = useState(72);
  const [endBpm, setEndBpm] = useState(120);
  const [stepBpm, setStepBpm] = useState(4);
  const [barsPerStep, setBarsPerStep] = useState(4);
  const [stopAtEnd, setStopAtEnd] = useState(true);
  const [loop, setLoop] = useState(false);

  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [subdivision, setSubdivision] = useState(1);
  const [swing, setSwing] = useState(0.18);
  const [volume, setVolume] = useState(0.7);
  const [accentDownbeat, setAccentDownbeat] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [currentBpm, setCurrentBpm] = useState(startBpm);
  const [pulse, setPulse] = useState<{ beat: number; sub: number; t: number } | null>(null);
  const [rampNote, setRampNote] = useState<string>('Press Start to begin the ramp.');

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const uiTimeoutsRef = useRef<number[]>([]);

  const nextTimeRef = useRef<number>(0);
  const stepRef = useRef<number>(0);
  const bpmRef = useRef<number>(startBpm);
  const stopAtTimeRef = useRef<number | null>(null);

  const settingsRef = useRef<RampSettings>({
    startBpm,
    endBpm,
    stepBpm,
    barsPerStep,
    stopAtEnd,
    loop,
    beatsPerBar,
    subdivision,
    swing,
    volume,
    accentDownbeat,
  });

  useEffect(() => {
    settingsRef.current = {
      startBpm,
      endBpm,
      stepBpm,
      barsPerStep,
      stopAtEnd,
      loop,
      beatsPerBar,
      subdivision,
      swing,
      volume,
      accentDownbeat,
    };
  }, [accentDownbeat, barsPerStep, beatsPerBar, endBpm, loop, startBpm, stepBpm, stopAtEnd, subdivision, swing, volume]);

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
    stopAtTimeRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      for (const id of uiTimeoutsRef.current) window.clearTimeout(id);
      uiTimeoutsRef.current = [];
      stopAtTimeRef.current = null;
      try {
        ctxRef.current?.close?.();
      } catch {
        // ignore
      }
      ctxRef.current = null;
    };
  }, []);

  const start = async () => {
    if (isRunning) return;

    if (!ctxRef.current) ctxRef.current = getAudioContext();
    const ctx = ctxRef.current;
    if (!ctx) return;
    await safeResume(ctx);

    stopSchedulingNoState();
    stepRef.current = 0;
    bpmRef.current = clamp(startBpm, 20, 320);
    stopAtTimeRef.current = null;
    nextTimeRef.current = ctx.currentTime + 0.06;
    setCurrentBpm(bpmRef.current);
    setPulse(null);

    const lookaheadMs = 25;
    const scheduleAheadSec = 0.12;

    const scheduler = () => {
      const s = settingsRef.current;
      const beats = clamp(s.beatsPerBar, 1, 12);
      const subdiv = clamp(s.subdivision, 1, 8);
      const swingAmt = subdiv === 2 ? clamp(s.swing, 0, 0.45) : 0;

      while (nextTimeRef.current < ctx.currentTime + scheduleAheadSec) {
        const stopAtTime = stopAtTimeRef.current;
        if (stopAtTime !== null && nextTimeRef.current >= stopAtTime) {
          stopSchedulingNoState();
          setIsRunning(false);
          setPulse(null);
          setRampNote('Finished ramp.');
          return;
        }

        const step = stepRef.current;
        const beatIndex = Math.floor(step / subdiv) % beats;
        const subIndex = step % subdiv;
        const barNumber = Math.floor(step / (subdiv * beats));

        const isBeat = subIndex === 0;
        const isDownbeat = beatIndex === 0 && isBeat;

        if (isDownbeat && barNumber > 0) {
          const bars = Math.max(1, Math.round(s.barsPerStep));
          if (barNumber % bars === 0) {
            const start = clamp(s.startBpm, 20, 320);
            const end = clamp(s.endBpm, 20, 320);
            const stepSize = clamp(Math.round(Math.abs(s.stepBpm)), 1, 40);
            const dir = start <= end ? 1 : -1;
            const next = bpmRef.current + dir * stepSize;

            const passedEnd = dir === 1 ? next >= end : next <= end;
            const applied = passedEnd ? end : next;

            if (passedEnd && s.loop) {
              bpmRef.current = start;
              setCurrentBpm(start);
              setRampNote(`Looped back to ${start} BPM.`);
            } else {
              bpmRef.current = applied;
              setCurrentBpm(applied);
              setRampNote(passedEnd ? `Reached ${end} BPM.` : `Bumped to ${applied} BPM.`);

              if (passedEnd && s.stopAtEnd && !s.loop) {
                const secondsPerBeatAtEnd = 60 / clamp(applied, 20, 320);
                stopAtTimeRef.current = nextTimeRef.current + secondsPerBeatAtEnd * beats;
              }
            }
          }
        }

        const secondsPerBeat = 60 / clamp(bpmRef.current, 20, 320);

        const accentGain = s.volume * (isDownbeat && s.accentDownbeat ? 0.9 : isBeat ? 0.55 : 0.28);
        const freq = isDownbeat ? 1400 : isBeat ? 980 : 720;
        scheduleClick(ctx, nextTimeRef.current, { frequency: freq, gain: clamp(accentGain, 0, 1) });

        const delayMs = Math.max(0, Math.round((nextTimeRef.current - ctx.currentTime) * 1000));
        const timeoutId = window.setTimeout(() => setPulse({ beat: beatIndex, sub: subIndex, t: Date.now() }), delayMs);
        uiTimeoutsRef.current.push(timeoutId);

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
    setRampNote('Running.');
    setIsRunning(true);
  };

  const stop = () => {
    if (!isRunning) return;
    stopSchedulingNoState();
    setIsRunning(false);
    setPulse(null);
    setRampNote('Stopped.');
  };

  const swingEnabled = subdivision === 2;
  const beatDots = useMemo(() => Array.from({ length: clamp(beatsPerBar, 1, 12) }, (_, i) => i), [beatsPerBar]);

  const directionLabel = useMemo(() => {
    if (startBpm === endBpm) return 'flat';
    return startBpm < endBpm ? 'up' : 'down';
  }, [endBpm, startBpm]);

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Tempo Ramp</h1>
          <span className="prompt-header-badge">SPEED</span>
        </div>
        <p className="muted">
          A speed trainer: ramp a metronome from a start BPM to an end BPM in steps every N bars.
          Great for slow-practice that gradually speeds up without you thinking about the math.
        </p>

        <div className="toolbox-row">
          <div className="music-bpm-display" aria-live="polite">
            <div className="music-bpm-number">{currentBpm}</div>
            <div className="muted small">BPM ({directionLabel})</div>
          </div>

          <div className="toolbox-actions">
            <button className={`button primary ${isRunning ? 'music-stop' : ''}`} type="button" onClick={isRunning ? stop : start}>
              {isRunning ? 'Stop' : 'Start'}
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

        <p className="muted small" style={{ marginTop: 8 }}>
          {rampNote}
        </p>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Ramp</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            Start BPM
            <input
              value={String(startBpm)}
              onChange={(e) => {
                const next = clamp(Number.parseInt(e.target.value || '0', 10), 30, 240);
                setStartBpm(next);
                setCurrentBpm(next);
              }}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
          <label className="toolbox-field">
            End BPM
            <input
              value={String(endBpm)}
              onChange={(e) => setEndBpm(clamp(Number.parseInt(e.target.value || '0', 10), 30, 240))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
        </div>

        <div className="toolbox-row" style={{ marginTop: 12 }}>
          <label className="toolbox-field">
            Step (BPM)
            <input
              value={String(stepBpm)}
              onChange={(e) => setStepBpm(clamp(Number.parseInt(e.target.value || '0', 10), 1, 40))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
          <label className="toolbox-field">
            Every (bars)
            <input
              value={String(barsPerStep)}
              onChange={(e) => setBarsPerStep(clamp(Number.parseInt(e.target.value || '0', 10), 1, 64))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
        </div>

        <div className="toolbox-row" style={{ marginTop: 12 }}>
          <label className="toolbox-check">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => {
                setLoop(e.target.checked);
                if (e.target.checked) setStopAtEnd(false);
              }}
              disabled={isRunning}
            />
            <span>Loop back to start when reaching the end</span>
          </label>

          <label className="toolbox-check">
            <input
              type="checkbox"
              checked={stopAtEnd}
              onChange={(e) => setStopAtEnd(e.target.checked)}
              disabled={isRunning || loop}
            />
            <span>Stop after one bar at the end tempo</span>
          </label>
        </div>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Timing</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            Beats per bar
            <input
              value={String(beatsPerBar)}
              onChange={(e) => setBeatsPerBar(clamp(Number.parseInt(e.target.value || '0', 10), 1, 12))}
              inputMode="numeric"
              disabled={isRunning}
            />
          </label>
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
        </div>

        {swingEnabled ? (
          <div style={{ marginTop: 12 }}>
            <label className="toolbox-field">
              Swing
              <input
                value={String(Math.round(swing * 100))}
                onChange={(e) => setSwing(clamp(Number.parseInt(e.target.value || '0', 10) / 100, 0, 0.45))}
                inputMode="numeric"
                disabled={isRunning}
              />
            </label>
            <input
              type="range"
              min={0}
              max={45}
              value={Math.round(swing * 100)}
              onChange={(e) => setSwing(Number.parseInt(e.target.value, 10) / 100)}
              aria-label="Swing slider"
              disabled={isRunning}
            />
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 12 }}>
            Swing control appears when subdivision is set to eighth notes.
          </p>
        )}

        <label className="toolbox-field" style={{ marginTop: 12 }}>
          Volume
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
          aria-label="Volume slider"
          disabled={isRunning}
        />

        <label className="toolbox-check" style={{ marginTop: 12 }}>
          <input
            type="checkbox"
            checked={accentDownbeat}
            onChange={(e) => setAccentDownbeat(e.target.checked)}
            disabled={isRunning}
          />
          <span>Accent downbeat</span>
        </label>
      </div>
    </>
  );
}
