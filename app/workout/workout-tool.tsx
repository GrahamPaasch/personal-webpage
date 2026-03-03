'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ── types ── */
interface Exercise {
  id: string;
  label: string;
  workSec: number;
  restSec: number;
}

interface Routine {
  name: string;
  rounds: number;
  exercises: Exercise[];
  restBetweenRoundsSec: number;
}

/* ── presets ── */
const PRESETS: Routine[] = [
  {
    name: 'Quick HIIT (16 min)',
    rounds: 4,
    restBetweenRoundsSec: 60,
    exercises: [
      { id: 'jj', label: 'Jumping jacks', workSec: 40, restSec: 20 },
      { id: 'sq', label: 'Squats', workSec: 40, restSec: 20 },
      { id: 'pu', label: 'Push-ups', workSec: 40, restSec: 20 },
      { id: 'pl', label: 'Plank hold', workSec: 40, restSec: 20 },
    ],
  },
  {
    name: 'Tabata (4 min)',
    rounds: 8,
    restBetweenRoundsSec: 0,
    exercises: [
      { id: 'tab', label: 'All-out effort', workSec: 20, restSec: 10 },
    ],
  },
  {
    name: 'Stretch & Mobility (12 min)',
    rounds: 1,
    restBetweenRoundsSec: 0,
    exercises: [
      { id: 'nk', label: 'Neck rolls', workSec: 60, restSec: 10 },
      { id: 'sh', label: 'Shoulder stretch', workSec: 60, restSec: 10 },
      { id: 'hf', label: 'Hip flexor stretch', workSec: 60, restSec: 10 },
      { id: 'hm', label: 'Hamstring stretch', workSec: 60, restSec: 10 },
      { id: 'sp', label: 'Spinal twist', workSec: 60, restSec: 10 },
      { id: 'cf', label: 'Calf stretch', workSec: 60, restSec: 10 },
      { id: 'dg', label: 'Downward dog', workSec: 60, restSec: 10 },
      { id: 'cb', label: 'Child\'s pose', workSec: 90, restSec: 0 },
    ],
  },
  {
    name: 'Core Blast (10 min)',
    rounds: 3,
    restBetweenRoundsSec: 30,
    exercises: [
      { id: 'cr', label: 'Crunches', workSec: 30, restSec: 15 },
      { id: 'bc', label: 'Bicycle kicks', workSec: 30, restSec: 15 },
      { id: 'lr', label: 'Leg raises', workSec: 30, restSec: 15 },
      { id: 'mp', label: 'Mountain climbers', workSec: 30, restSec: 15 },
    ],
  },
];

/* ── audio helper ── */
function beep(ctx: AudioContext, freq: number, durationMs: number, gain = 0.3) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.05);
}

/* ── format helpers ── */
function fmtTime(ms: number) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function totalRoutineSeconds(r: Routine) {
  const perRound = r.exercises.reduce((sum, e) => sum + e.workSec + e.restSec, 0);
  return perRound * r.rounds + r.restBetweenRoundsSec * Math.max(0, r.rounds - 1);
}

type Phase = 'idle' | 'countdown' | 'work' | 'rest' | 'round-rest' | 'done';

export default function WorkoutTool() {
  const [routine, setRoutine] = useState<Routine>(PRESETS[0]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [round, setRound] = useState(1);
  const [exIdx, setExIdx] = useState(0);
  const [remainMs, setRemainMs] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showCustom, setShowCustom] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const endAtRef = useRef(0);
  const pausedRemainRef = useRef(0);

  /* cleanup */
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      try { ctxRef.current?.close(); } catch { /* */ }
    };
  }, []);

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  /* ── timer engine ── */
  const startInterval = useCallback((durationMs: number) => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    endAtRef.current = Date.now() + durationMs;
    setRemainMs(durationMs);
    intervalRef.current = window.setInterval(() => {
      const left = endAtRef.current - Date.now();
      if (left <= 0) {
        setRemainMs(0);
      } else {
        setRemainMs(left);
      }
    }, 50);
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  /* advance logic — called when remainMs hits 0 */
  const advanceRef = useRef<() => void>(() => {});

  advanceRef.current = () => {
    stopInterval();
    const ctx = getCtx();
    const r = routine;

    if (phase === 'countdown') {
      beep(ctx, 880, 300);
      setPhase('work');
      startInterval(r.exercises[0].workSec * 1000);
      return;
    }

    if (phase === 'work') {
      beep(ctx, 440, 200);
      const ex = r.exercises[exIdx];
      if (ex.restSec > 0) {
        setPhase('rest');
        startInterval(ex.restSec * 1000);
      } else {
        // skip rest, go to next exercise or round
        goNextExercise();
      }
      return;
    }

    if (phase === 'rest') {
      goNextExercise();
      return;
    }

    if (phase === 'round-rest') {
      beep(ctx, 880, 300);
      setExIdx(0);
      setPhase('work');
      startInterval(r.exercises[0].workSec * 1000);
      return;
    }

    function goNextExercise() {
      const nextEx = exIdx + 1;
      if (nextEx < r.exercises.length) {
        beep(ctx, 660, 200);
        setExIdx(nextEx);
        setPhase('work');
        startInterval(r.exercises[nextEx].workSec * 1000);
      } else {
        // end of round
        const nextRound = round + 1;
        if (nextRound <= r.rounds) {
          setRound(nextRound);
          if (r.restBetweenRoundsSec > 0) {
            beep(ctx, 330, 400);
            setPhase('round-rest');
            startInterval(r.restBetweenRoundsSec * 1000);
          } else {
            beep(ctx, 880, 300);
            setExIdx(0);
            setPhase('work');
            startInterval(r.exercises[0].workSec * 1000);
          }
        } else {
          beep(ctx, 880, 500);
          setTimeout(() => beep(ctx, 1100, 500), 300);
          setPhase('done');
        }
      }
    }
  };

  /* watch remainMs to trigger advance */
  useEffect(() => {
    if (remainMs === 0 && phase !== 'idle' && phase !== 'done' && !isPaused) {
      advanceRef.current();
    }
  }, [remainMs, phase, isPaused]);

  /* elapsed tracker */
  useEffect(() => {
    if (phase === 'idle' || phase === 'done' || isPaused) return;
    const id = window.setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [phase, isPaused]);

  /* ── controls ── */
  function handleStart() {
    setPhase('countdown');
    setRound(1);
    setExIdx(0);
    setElapsed(0);
    setIsPaused(false);
    getCtx();
    startInterval(3000); // 3-second countdown
  }

  function handlePause() {
    if (isPaused) {
      // resume
      startInterval(pausedRemainRef.current);
      setIsPaused(false);
    } else {
      pausedRemainRef.current = remainMs;
      stopInterval();
      setIsPaused(true);
    }
  }

  function handleStop() {
    stopInterval();
    setPhase('idle');
    setIsPaused(false);
    setRemainMs(0);
  }

  /* ── phase display ── */
  const phaseLabel: Record<Phase, string> = {
    idle: 'Ready',
    countdown: 'Get ready…',
    work: '💪 Work',
    rest: '😮‍💨 Rest',
    'round-rest': '🔄 Round break',
    done: '🎉 Done!',
  };

  const phaseColor: Record<Phase, string> = {
    idle: 'var(--muted)',
    countdown: '#f59e0b',
    work: '#22c55e',
    rest: '#3b82f6',
    'round-rest': '#a855f7',
    done: '#22c55e',
  };

  const progress = phase === 'idle' || phase === 'done' ? 0 : (() => {
    let total = 0;
    if (phase === 'countdown') total = 3000;
    else if (phase === 'work') total = routine.exercises[exIdx].workSec * 1000;
    else if (phase === 'rest') total = routine.exercises[exIdx].restSec * 1000;
    else if (phase === 'round-rest') total = routine.restBetweenRoundsSec * 1000;
    return total > 0 ? ((total - remainMs) / total) * 100 : 0;
  })();

  return (
    <>
      {/* Header card */}
      <div className="card">
        <h1>🏋️ Workout Timer</h1>
        <p className="muted">Pick a routine or build your own, then hit start.</p>
      </div>

      {/* Routine selector */}
      {phase === 'idle' && (
        <div className="card">
          <h2>Choose a routine</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {PRESETS.map((p, i) => (
              <button
                key={p.name}
                className="button"
                onClick={() => { setRoutine(p); setShowCustom(false); }}
                style={{
                  background: routine.name === p.name && !showCustom ? 'var(--accent)' : undefined,
                  color: routine.name === p.name && !showCustom ? '#fff' : undefined,
                }}
              >
                {p.name}
              </button>
            ))}
            <button
              className="button"
              onClick={() => setShowCustom(!showCustom)}
              style={{
                background: showCustom ? 'var(--accent)' : undefined,
                color: showCustom ? '#fff' : undefined,
              }}
            >
              ✏️ Custom
            </button>
          </div>

          {/* Routine preview */}
          {!showCustom && (
            <div style={{ marginTop: 16 }}>
              <p className="muted" style={{ marginBottom: 4 }}>
                {routine.rounds} round{routine.rounds > 1 ? 's' : ''} · ~{fmtTime(totalRoutineSeconds(routine) * 1000)} total
              </p>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {routine.exercises.map(e => (
                  <li key={e.id} style={{ marginBottom: 2 }}>
                    {e.label} — {e.workSec}s work{e.restSec > 0 ? ` / ${e.restSec}s rest` : ''}
                  </li>
                ))}
              </ol>
              {routine.restBetweenRoundsSec > 0 && (
                <p className="muted" style={{ marginTop: 4 }}>
                  {routine.restBetweenRoundsSec}s rest between rounds
                </p>
              )}
            </div>
          )}

          {/* Custom builder */}
          {showCustom && <CustomBuilder onSave={(r) => { setRoutine(r); setShowCustom(false); }} />}
        </div>
      )}

      {/* Timer display */}
      {phase !== 'idle' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 4 }}>
            {routine.name} · Round {round}/{routine.rounds}
          </p>
          <h2 style={{ color: phaseColor[phase], fontSize: '1.4rem', margin: '8px 0' }}>
            {phaseLabel[phase]}
          </h2>
          {phase !== 'done' && (
            <p style={{ marginBottom: 4 }}>
              {phase === 'work' || phase === 'rest' ? routine.exercises[exIdx].label : ''}
            </p>
          )}

          {/* Progress bar */}
          {phase !== 'done' && (
            <div
              style={{
                width: '100%',
                height: 8,
                borderRadius: 4,
                background: 'var(--border)',
                margin: '12px 0',
                overflow: 'hidden',
              }}
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: phaseColor[phase],
                  borderRadius: 4,
                  transition: 'width 0.1s linear',
                }}
              />
            </div>
          )}

          {/* Big timer */}
          {phase !== 'done' && (
            <p style={{ fontSize: '3rem', fontVariantNumeric: 'tabular-nums', margin: '8px 0', fontWeight: 700 }}>
              {fmtTime(remainMs)}
            </p>
          )}

          {/* Elapsed */}
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Elapsed: {fmtTime(elapsed * 1000)}
          </p>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
            {phase !== 'done' && (
              <button className="button" onClick={handlePause}>
                {isPaused ? '▶ Resume' : '⏸ Pause'}
              </button>
            )}
            <button className="button" onClick={handleStop} style={{ background: '#ef4444', color: '#fff' }}>
              {phase === 'done' ? '↩ Reset' : '⏹ Stop'}
            </button>
          </div>
        </div>
      )}

      {/* Start button */}
      {phase === 'idle' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <button
            className="button"
            onClick={handleStart}
            style={{ fontSize: '1.2rem', padding: '12px 32px', background: '#22c55e', color: '#fff' }}
          >
            ▶ Start Workout
          </button>
        </div>
      )}
    </>
  );
}

/* ── Custom routine builder ── */
function CustomBuilder({ onSave }: { onSave: (r: Routine) => void }) {
  const [name, setName] = useState('My Routine');
  const [rounds, setRounds] = useState(3);
  const [restBetween, setRestBetween] = useState(30);
  const [exercises, setExercises] = useState<Exercise[]>([
    { id: '1', label: 'Exercise 1', workSec: 30, restSec: 15 },
  ]);

  function addExercise() {
    setExercises(prev => [
      ...prev,
      { id: String(Date.now()), label: `Exercise ${prev.length + 1}`, workSec: 30, restSec: 15 },
    ]);
  }

  function removeExercise(id: string) {
    setExercises(prev => prev.filter(e => e.id !== id));
  }

  function updateExercise(id: string, field: keyof Exercise, value: string | number) {
    setExercises(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e)),
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted">Name</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted">Rounds</span>
          <input
            type="number"
            min={1}
            max={50}
            value={rounds}
            onChange={e => setRounds(Math.max(1, +e.target.value))}
            style={{ width: 60, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="muted">Rest between rounds (s)</span>
          <input
            type="number"
            min={0}
            max={300}
            value={restBetween}
            onChange={e => setRestBetween(Math.max(0, +e.target.value))}
            style={{ width: 80, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
          />
        </label>
      </div>

      {exercises.map((ex) => (
        <div key={ex.id} style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 120 }}>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Exercise</span>
            <input
              type="text"
              value={ex.label}
              onChange={e => updateExercise(ex.id, 'label', e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Work (s)</span>
            <input
              type="number"
              min={5}
              max={600}
              value={ex.workSec}
              onChange={e => updateExercise(ex.id, 'workSec', Math.max(5, +e.target.value))}
              style={{ width: 70, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Rest (s)</span>
            <input
              type="number"
              min={0}
              max={300}
              value={ex.restSec}
              onChange={e => updateExercise(ex.id, 'restSec', Math.max(0, +e.target.value))}
              style={{ width: 70, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
            />
          </label>
          <button
            className="button"
            onClick={() => removeExercise(ex.id)}
            style={{ padding: '6px 10px', background: '#ef4444', color: '#fff' }}
            aria-label={`Remove ${ex.label}`}
          >
            ✕
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="button" onClick={addExercise}>+ Add exercise</button>
        <button
          className="button"
          onClick={() =>
            onSave({
              name: name || 'Custom',
              rounds,
              restBetweenRoundsSec: restBetween,
              exercises,
            })
          }
          style={{ background: '#22c55e', color: '#fff' }}
          disabled={exercises.length === 0}
        >
          ✓ Save & select
        </button>
      </div>
    </div>
  );
}
