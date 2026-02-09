'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { NOTE_OPTIONS, clamp } from '@/lib/music/notes';
import { PROGRESSION_PRESETS, type ScaleType } from '@/lib/music/harmony';

type StepType = 'metronome' | 'drone' | 'timer' | 'chord' | 'note';

type StepBase = {
  id: string;
  type: StepType;
  title: string;
};

type MetronomeStep = StepBase & {
  type: 'metronome';
  bpm: number;
  beatsPerBar: number;
  subdivision: number;
  swingPct: number;
  volumePct: number;
  accentDownbeat: boolean;
};

type DroneStep = StepBase & {
  type: 'drone';
  noteIndex: number;
  octave: number;
  spelling: 'sharp' | 'flat';
  a4: number;
  volumePct: number;
  waveform: OscillatorType;
};

type TimerStep = StepBase & {
  type: 'timer';
  seconds: number;
};

type ChordStep = StepBase & {
  type: 'chord';
  keyIndex: number;
  spelling: 'sharp' | 'flat';
  scale: ScaleType;
  presetId: string;
  bpm: number;
  beatsPerBar: number;
  barsPerChord: number;
  click: boolean;
  bass: boolean;
};

type NoteStep = StepBase & {
  type: 'note';
  body: string;
};

type Step = MetronomeStep | DroneStep | TimerStep | ChordStep | NoteStep;

const STORAGE_KEY = 'gp_music_setlist_v1';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function defaultSteps(): Step[] {
  return [
    {
      id: createId(),
      type: 'note',
      title: 'Session intention',
      body: 'Two sentences: what is the one thing I am trying to improve today, and what does success sound/feel like?',
    },
    {
      id: createId(),
      type: 'drone',
      title: 'Drone: A4 (intonation)',
      noteIndex: 9,
      octave: 4,
      spelling: 'flat',
      a4: 440,
      volumePct: 18,
      waveform: 'sine',
    },
    {
      id: createId(),
      type: 'metronome',
      title: 'Metronome: slow control',
      bpm: 72,
      beatsPerBar: 4,
      subdivision: 1,
      swingPct: 18,
      volumePct: 70,
      accentDownbeat: true,
    },
    {
      id: createId(),
      type: 'timer',
      title: 'Warm-up',
      seconds: 5 * 60,
    },
    {
      id: createId(),
      type: 'timer',
      title: 'Technique (scales)',
      seconds: 10 * 60,
    },
    {
      id: createId(),
      type: 'chord',
      title: 'Chord loop (ear + groove)',
      keyIndex: 0,
      spelling: 'flat',
      scale: 'major',
      presetId: 'i-v-vi-iv',
      bpm: 92,
      beatsPerBar: 4,
      barsPerChord: 1,
      click: true,
      bass: false,
    },
  ];
}

function stepLabel(step: Step): string {
  if (step.type === 'metronome') return 'METRONOME';
  if (step.type === 'drone') return 'DRONE';
  if (step.type === 'timer') return 'TIMER';
  if (step.type === 'chord') return 'CHORD';
  return 'NOTE';
}

function stepHref(step: Step): string {
  const q = new URLSearchParams();
  if (step.type === 'metronome') {
    q.set('bpm', String(step.bpm));
    q.set('beatsPerBar', String(step.beatsPerBar));
    q.set('subdivision', String(step.subdivision));
    q.set('swing', String(step.swingPct));
    q.set('volume', String(step.volumePct));
    q.set('accentDownbeat', step.accentDownbeat ? '1' : '0');
    return `/tools/metronome?${q.toString()}`;
  }
  if (step.type === 'drone') {
    q.set('noteIndex', String(step.noteIndex));
    q.set('octave', String(step.octave));
    q.set('spelling', step.spelling);
    q.set('a4', String(step.a4));
    q.set('volume', String(step.volumePct));
    q.set('waveform', String(step.waveform));
    return `/tools/drone?${q.toString()}`;
  }
  if (step.type === 'timer') {
    q.set('label', step.title);
    q.set('seconds', String(step.seconds));
    return `/tools/practice-timer?${q.toString()}`;
  }
  if (step.type === 'chord') {
    q.set('keyIndex', String(step.keyIndex));
    q.set('spelling', step.spelling);
    q.set('scale', step.scale);
    q.set('presetId', step.presetId);
    q.set('bpm', String(step.bpm));
    q.set('beatsPerBar', String(step.beatsPerBar));
    q.set('barsPerChord', String(step.barsPerChord));
    q.set('click', step.click ? '1' : '0');
    q.set('bass', step.bass ? '1' : '0');
    return `/tools/chord-looper?${q.toString()}`;
  }
  return '';
}

function parseStep(raw: any): Step | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : createId();
  const type = raw.type as StepType;
  const title = typeof raw.title === 'string' ? raw.title : 'Step';

  if (type === 'metronome') {
    return {
      id,
      type,
      title,
      bpm: clamp(Number.parseInt(String(raw.bpm || '84'), 10), 30, 240),
      beatsPerBar: clamp(Number.parseInt(String(raw.beatsPerBar || '4'), 10), 1, 12),
      subdivision: clamp(Number.parseInt(String(raw.subdivision || '1'), 10), 1, 4),
      swingPct: clamp(Number.parseInt(String(raw.swingPct ?? raw.swing ?? '18'), 10), 0, 45),
      volumePct: clamp(Number.parseInt(String(raw.volumePct ?? raw.volume ?? '70'), 10), 0, 100),
      accentDownbeat: Boolean(raw.accentDownbeat ?? true),
    };
  }
  if (type === 'drone') {
    const wf: OscillatorType = raw.waveform || 'sine';
    const safeWf: OscillatorType = ['sine', 'triangle', 'sawtooth', 'square'].includes(wf) ? wf : 'sine';
    const spelling = raw.spelling === 'sharp' ? 'sharp' : 'flat';
    return {
      id,
      type,
      title,
      noteIndex: clamp(Number.parseInt(String(raw.noteIndex ?? 9), 10), 0, 11),
      octave: clamp(Number.parseInt(String(raw.octave ?? 4), 10), 0, 8),
      spelling,
      a4: clamp(Number.parseInt(String(raw.a4 ?? 440), 10), 415, 466),
      volumePct: clamp(Number.parseInt(String(raw.volumePct ?? raw.volume ?? 18), 10), 0, 100),
      waveform: safeWf,
    };
  }
  if (type === 'timer') {
    return {
      id,
      type,
      title,
      seconds: clamp(Number.parseInt(String(raw.seconds ?? 300), 10), 10, 8 * 60 * 60),
    };
  }
  if (type === 'chord') {
    const spelling = raw.spelling === 'sharp' ? 'sharp' : 'flat';
    const scale = raw.scale === 'minor' ? 'minor' : 'major';
    const presetId = typeof raw.presetId === 'string' ? raw.presetId : 'i-v-vi-iv';
    return {
      id,
      type,
      title,
      keyIndex: clamp(Number.parseInt(String(raw.keyIndex ?? 0), 10), 0, 11),
      spelling,
      scale,
      presetId,
      bpm: clamp(Number.parseInt(String(raw.bpm ?? 92), 10), 30, 240),
      beatsPerBar: clamp(Number.parseInt(String(raw.beatsPerBar ?? 4), 10), 1, 12),
      barsPerChord: clamp(Number.parseInt(String(raw.barsPerChord ?? 1), 10), 1, 16),
      click: Boolean(raw.click ?? true),
      bass: Boolean(raw.bass ?? false),
    };
  }
  if (type === 'note') {
    return { id, type, title, body: typeof raw.body === 'string' ? raw.body : '' };
  }
  return null;
}

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SetlistTool() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'edit' | 'run'>('edit');
  const [activeIndex, setActiveIndex] = useState(0);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const loadedRef = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setSteps(defaultSteps());
          return;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setSteps(defaultSteps());
          return;
        }
        const next = parsed.map(parseStep).filter(Boolean) as Step[];
        setSteps(next.length ? next : defaultSteps());
      } catch {
        setSteps(defaultSteps());
      } finally {
        loadedRef.current = true;
        setLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
    } catch {
      // ignore
    }
  }, [steps]);

  const setNote = (msg: string) => {
    setStatusNote(msg);
    window.setTimeout(() => setStatusNote(null), 2200);
  };

  const addStep = (type: StepType) => {
    const base: StepBase = { id: createId(), type, title: 'New step' };
    let step: Step;
    if (type === 'metronome') {
      step = { ...base, type, title: 'Metronome', bpm: 84, beatsPerBar: 4, subdivision: 1, swingPct: 18, volumePct: 70, accentDownbeat: true };
    } else if (type === 'drone') {
      step = { ...base, type, title: 'Drone', noteIndex: 9, octave: 4, spelling: 'flat', a4: 440, volumePct: 18, waveform: 'sine' };
    } else if (type === 'timer') {
      step = { ...base, type, title: 'Timer block', seconds: 5 * 60 };
    } else if (type === 'chord') {
      step = { ...base, type, title: 'Chord loop', keyIndex: 0, spelling: 'flat', scale: 'major', presetId: 'i-v-vi-iv', bpm: 92, beatsPerBar: 4, barsPerChord: 1, click: true, bass: false };
    } else {
      step = { ...base, type, title: 'Note', body: '' };
    }
    setSteps((prev) => [...prev, step]);
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= steps.length) return;
    const next = [...steps];
    const tmp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = tmp;
    setSteps(next);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    const next = steps.filter((_, i) => i !== idx);
    setSteps(next);
    setActiveIndex((prev) => clamp(prev, 0, Math.max(0, next.length - 1)));
  };

  const updateStep = (id: string, patch: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)));
  };

  const totalMinutes = useMemo(() => {
    return steps.reduce((acc, s) => acc + (s.type === 'timer' ? s.seconds / 60 : 0), 0);
  }, [steps]);

  const active = steps[activeIndex] || null;

  const copyLinks = async () => {
    const lines = steps
      .map((s, i) => {
        const href = stepHref(s);
        if (!href) return `${i + 1}. ${s.title} (${stepLabel(s)})`;
        return `${i + 1}. ${s.title} (${stepLabel(s)}) - ${href}`;
      })
      .join('\n');
    const ok = await tryCopy(lines);
    setNote(ok ? 'Copied setlist links.' : 'Copy failed.');
  };

  const resetToTemplate = () => {
    const ok = window.confirm('Replace the current setlist with the default template?');
    if (!ok) return;
    setSteps(defaultSteps());
    setActiveIndex(0);
    setMode('edit');
    setNote('Loaded template.');
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Setlist Mode</h1>
          <span className="prompt-header-badge">FLOW</span>
        </div>
        <p className="muted">
          Build a practice setlist that links out to tool presets (metronome, drone, timer, chord looper).
          Use Run mode to step through it without thinking.
        </p>

        <div className="toolbox-row">
          <div className="music-timer-display" aria-live="polite">
            <div className="music-timer-label">Setlist</div>
            <div className="music-timer-clock" style={{ fontSize: '1.7rem' }}>
              {steps.length} steps
            </div>
            <div className="muted small">{Math.round(totalMinutes)} timed minutes (timer steps only)</div>
          </div>
          <div className="toolbox-actions">
            <button className="button" type="button" onClick={copyLinks} disabled={!steps.length}>
              Copy links
            </button>
            <button className="button" type="button" onClick={resetToTemplate}>
              Load template
            </button>
            <button className={`button primary ${mode === 'run' ? 'music-stop' : ''}`} type="button" onClick={() => setMode(mode === 'run' ? 'edit' : 'run')} disabled={!loaded}>
              {mode === 'run' ? 'Exit run mode' : 'Run mode'}
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        {statusNote ? <p className="muted small">{statusNote}</p> : null}
        {!loaded ? <p className="muted small">Loading…</p> : null}
      </div>

      {mode === 'run' ? (
        <div className="card">
          <div className="prompt-header" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>
              Step {activeIndex + 1}/{steps.length}: {active?.title || '—'}
            </h2>
            <span className="prompt-header-badge">{active ? stepLabel(active) : '—'}</span>
          </div>
          <div className="toolbox-actions" style={{ marginBottom: 10 }}>
            <button className="button" type="button" onClick={() => setActiveIndex((i) => clamp(i - 1, 0, steps.length - 1))} disabled={activeIndex === 0}>
              Prev
            </button>
            <button className="button" type="button" onClick={() => setActiveIndex((i) => clamp(i + 1, 0, steps.length - 1))} disabled={activeIndex >= steps.length - 1}>
              Next
            </button>
            {active && stepHref(active) ? (
              <Link className="button primary" href={stepHref(active)}>
                Open tool
              </Link>
            ) : null}
          </div>

          {active?.type === 'note' ? (
            <div className="music-setlist-note">
              <p className="muted">{active.body || 'Add a note in Edit mode.'}</p>
            </div>
          ) : active ? (
            <div className="music-setlist-preview">
              <p className="muted small">
                This step opens a tool preset. Audio still requires a click inside the tool page (browser policy).
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Steps</h2>
        <div className="toolbox-actions" style={{ marginBottom: 10 }}>
          <button className="button" type="button" onClick={() => addStep('timer')}>
            Add timer
          </button>
          <button className="button" type="button" onClick={() => addStep('metronome')}>
            Add metronome
          </button>
          <button className="button" type="button" onClick={() => addStep('drone')}>
            Add drone
          </button>
          <button className="button" type="button" onClick={() => addStep('chord')}>
            Add chord loop
          </button>
          <button className="button" type="button" onClick={() => addStep('note')}>
            Add note
          </button>
        </div>

        {steps.length === 0 ? (
          <p className="muted">No steps.</p>
        ) : (
          <div className="music-setlist-list">
            {steps.map((s, idx) => (
              <div key={s.id} className={`music-setlist-step ${idx === activeIndex ? 'music-setlist-step-active' : ''}`}>
                <div className="music-setlist-head">
                  <span className="music-block-index">{idx + 1}</span>
                  <input
                    value={s.title}
                    onChange={(e) => updateStep(s.id, { title: e.target.value } as Partial<Step>)}
                    aria-label={`Step ${idx + 1} title`}
                  />
                  <span className="prompt-header-badge">{stepLabel(s)}</span>
                </div>

                <div className="toolbox-actions" style={{ marginTop: 10 }}>
                  <button className="button" type="button" onClick={() => setActiveIndex(idx)}>
                    Select
                  </button>
                  {stepHref(s) ? (
                    <Link className="button" href={stepHref(s)}>
                      Open
                    </Link>
                  ) : null}
                  <button className="button" type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                    Up
                  </button>
                  <button className="button" type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}>
                    Down
                  </button>
                  <button className="button" type="button" onClick={() => removeStep(idx)} disabled={steps.length <= 1}>
                    Remove
                  </button>
                </div>

                {s.type === 'timer' ? (
                  <div className="toolbox-row" style={{ marginTop: 12 }}>
                    <label className="toolbox-field">
                      Minutes
                      <input
                        value={String(Math.round(s.seconds / 60))}
                        onChange={(e) => {
                          const mins = clamp(Number.parseInt(e.target.value || '0', 10), 1, 8 * 60);
                          updateStep(s.id, { seconds: mins * 60 } as Partial<Step>);
                        }}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                ) : null}

                {s.type === 'metronome' ? (
                  <div className="toolbox-row" style={{ marginTop: 12 }}>
                    <label className="toolbox-field">
                      BPM
                      <input
                        value={String(s.bpm)}
                        onChange={(e) => updateStep(s.id, { bpm: clamp(Number.parseInt(e.target.value || '0', 10), 30, 240) } as Partial<Step>)}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="toolbox-field">
                      Beats/bar
                      <input
                        value={String(s.beatsPerBar)}
                        onChange={(e) => updateStep(s.id, { beatsPerBar: clamp(Number.parseInt(e.target.value || '0', 10), 1, 12) } as Partial<Step>)}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="toolbox-field">
                      Subdiv
                      <select value={s.subdivision} onChange={(e) => updateStep(s.id, { subdivision: clamp(Number.parseInt(e.target.value, 10), 1, 4) } as Partial<Step>)}>
                        <option value={1}>Quarter</option>
                        <option value={2}>Eighth</option>
                        <option value={3}>Triplet</option>
                        <option value={4}>Sixteenth</option>
                      </select>
                    </label>
                    <label className="toolbox-field">
                      Swing %
                      <input
                        value={String(s.swingPct)}
                        onChange={(e) => updateStep(s.id, { swingPct: clamp(Number.parseInt(e.target.value || '0', 10), 0, 45) } as Partial<Step>)}
                        inputMode="numeric"
                        disabled={s.subdivision !== 2}
                      />
                    </label>
                  </div>
                ) : null}

                {s.type === 'drone' ? (
                  <div className="toolbox-row" style={{ marginTop: 12 }}>
                    <label className="toolbox-field">
                      Note
                      <select value={s.noteIndex} onChange={(e) => updateStep(s.id, { noteIndex: clamp(Number.parseInt(e.target.value, 10), 0, 11) } as Partial<Step>)}>
                        {NOTE_OPTIONS.map((opt) => (
                          <option key={opt.index} value={opt.index}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="toolbox-field">
                      Octave
                      <input
                        value={String(s.octave)}
                        onChange={(e) => updateStep(s.id, { octave: clamp(Number.parseInt(e.target.value || '0', 10), 0, 8) } as Partial<Step>)}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="toolbox-field">
                      A4
                      <input
                        value={String(s.a4)}
                        onChange={(e) => updateStep(s.id, { a4: clamp(Number.parseInt(e.target.value || '0', 10), 415, 466) } as Partial<Step>)}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                ) : null}

                {s.type === 'chord' ? (
                  <div className="toolbox-row" style={{ marginTop: 12 }}>
                    <label className="toolbox-field">
                      Key
                      <select value={s.keyIndex} onChange={(e) => updateStep(s.id, { keyIndex: clamp(Number.parseInt(e.target.value, 10), 0, 11) } as Partial<Step>)}>
                        {NOTE_OPTIONS.map((opt) => (
                          <option key={opt.index} value={opt.index}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="toolbox-field">
                      Scale
                      <select value={s.scale} onChange={(e) => updateStep(s.id, { scale: e.target.value as ScaleType } as Partial<Step>)}>
                        <option value="major">Major</option>
                        <option value="minor">Minor</option>
                      </select>
                    </label>
                    <label className="toolbox-field">
                      Preset
                      <select value={s.presetId} onChange={(e) => updateStep(s.id, { presetId: e.target.value } as Partial<Step>)}>
                        {PROGRESSION_PRESETS.filter((p) => p.scale === 'any' || p.scale === s.scale).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="toolbox-field">
                      BPM
                      <input
                        value={String(s.bpm)}
                        onChange={(e) => updateStep(s.id, { bpm: clamp(Number.parseInt(e.target.value || '0', 10), 30, 240) } as Partial<Step>)}
                        inputMode="numeric"
                      />
                    </label>
                  </div>
                ) : null}

                {s.type === 'note' ? (
                  <label className="toolbox-field" style={{ marginTop: 12 }}>
                    Note
                    <textarea value={s.body} onChange={(e) => updateStep(s.id, { body: e.target.value } as Partial<Step>)} rows={4} />
                  </label>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>How I Use This</h2>
        <ul>
          <li>Put “effortful” things first: intonation + slow control before rep.</li>
          <li>Use timer steps to stay honest about time on hard passages.</li>
          <li>Make it repeatable: the template is intentionally boring.</li>
        </ul>
        <p className="muted small">
          This page stores your setlist in localStorage as `{STORAGE_KEY}`. Export by copying links, or just bookmark the setlist page.
        </p>
      </div>
    </>
  );
}

