'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NOTE_OPTIONS, clamp } from '@/lib/music/notes';

type ScaleChoice = { id: string; label: string };
type ExerciseChoice = { id: string; label: string };
type PatternChoice = { id: string; label: string };
type FocusChoice = { id: string; label: string };

const SCALES: ScaleChoice[] = [
  { id: 'major', label: 'Major' },
  { id: 'minor', label: 'Natural minor' },
  { id: 'harm_minor', label: 'Harmonic minor' },
  { id: 'mel_minor', label: 'Melodic minor' },
  { id: 'dorian', label: 'Dorian' },
  { id: 'mixolydian', label: 'Mixolydian' },
  { id: 'pent_major', label: 'Major pentatonic' },
  { id: 'pent_minor', label: 'Minor pentatonic' },
] as const;

const EXERCISES: ExerciseChoice[] = [
  { id: 'scale', label: 'Scale (2–3 octaves)' },
  { id: 'arpeggio', label: 'Arpeggio (root position)' },
  { id: 'broken3', label: 'Broken 3rds (1-3-2-4...)' },
  { id: 'rhythm', label: 'Rhythm pattern (eighths / triplets / syncopation)' },
  { id: 'shifts', label: 'Shifts (slow gliss or clean jumps)' },
  { id: 'double', label: 'Double-stops / dyads (if applicable)' },
] as const;

const PATTERNS: PatternChoice[] = [
  { id: '2slur2det', label: 'Bowing: 2 slurred, 2 separate' },
  { id: '4slur', label: 'Bowing: 4 slurred' },
  { id: 'spicc', label: 'Articulation: light spiccato' },
  { id: 'det', label: 'Articulation: detache, full tone' },
  { id: 'accents', label: 'Accents: every 4 notes' },
  { id: 'dynamics', label: 'Dynamics: crescendo up, diminuendo down' },
  { id: 'sticking', label: 'Sticking: alternate hands (marimba/keys)' },
] as const;

const FOCUS: FocusChoice[] = [
  { id: 'tone', label: 'Tone (resonant, no crunch)' },
  { id: 'time', label: 'Time (metronome, dead steady)' },
  { id: 'intonation', label: 'Intonation (with drone or reference pitch)' },
  { id: 'even', label: 'Evenness (every note same length/weight)' },
  { id: 'relax', label: 'Relaxation (no extra tension)' },
  { id: 'phrasing', label: 'Phrasing (shape lines, not just notes)' },
] as const;

type Prompt = {
  id: string;
  keyIndex: number;
  keyLabel: string;
  scale: string;
  exercise: string;
  pattern: string;
  focus: string;
  bpmHint: number;
};

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ScaleRandomizerTool() {
  const [spelling, setSpelling] = useState<'sharp' | 'flat'>('flat');

  const [enabledKeys, setEnabledKeys] = useState<boolean[]>(() => Array.from({ length: 12 }, () => true));
  const [enabledScales, setEnabledScales] = useState<string[]>(() => SCALES.map((s) => s.id));
  const [enabledExercises, setEnabledExercises] = useState<string[]>(() => EXERCISES.map((e) => e.id));
  const [enabledPatterns, setEnabledPatterns] = useState<string[]>(() => PATTERNS.map((p) => p.id));
  const [enabledFocus, setEnabledFocus] = useState<string[]>(() => FOCUS.map((f) => f.id));

  const [lockKey, setLockKey] = useState(false);
  const [lockScale, setLockScale] = useState(false);
  const [lockExercise, setLockExercise] = useState(false);

  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [history, setHistory] = useState<Prompt[]>([]);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const keyPool = useMemo(() => enabledKeys.map((v, i) => (v ? i : null)).filter((v): v is number => v !== null), [enabledKeys]);
  const scalePool = useMemo(() => SCALES.filter((s) => enabledScales.includes(s.id)), [enabledScales]);
  const exercisePool = useMemo(() => EXERCISES.filter((e) => enabledExercises.includes(e.id)), [enabledExercises]);
  const patternPool = useMemo(() => PATTERNS.filter((p) => enabledPatterns.includes(p.id)), [enabledPatterns]);
  const focusPool = useMemo(() => FOCUS.filter((f) => enabledFocus.includes(f.id)), [enabledFocus]);

  const canGenerate = keyPool.length > 0 && scalePool.length > 0 && exercisePool.length > 0 && patternPool.length > 0 && focusPool.length > 0;

  const generate = () => {
    if (!canGenerate) return;
    const prev = prompt;
    const keyIndex = lockKey && prev ? prev.keyIndex : pickRandom(keyPool);
    const scale = lockScale && prev ? prev.scale : pickRandom(scalePool).label;
    const exercise = lockExercise && prev ? prev.exercise : pickRandom(exercisePool).label;
    const pattern = pickRandom(patternPool).label;
    const focus = pickRandom(focusPool).label;
    const bpmHint = clamp(Math.floor(52 + Math.random() * 56), 40, 144);

    const base = NOTE_OPTIONS[keyIndex];
    const keyLabel = spelling === 'flat' ? base.flat : base.sharp;
    const next: Prompt = { id: createId(), keyIndex, keyLabel, scale, exercise, pattern, focus, bpmHint };
    setPrompt(next);
    setHistory((h) => [next, ...h].slice(0, 12));
  };

  const toggleList = (list: string[], id: string, allIds: string[]) => {
    if (list.includes(id)) {
      const next = list.filter((x) => x !== id);
      return next.length ? next : allIds;
    }
    return [...list, id];
  };

  const setCopied = (message: string) => {
    setCopyNote(message);
    window.setTimeout(() => setCopyNote(null), 2200);
  };

  const copyPrompt = async () => {
    if (!prompt) return;
    const lines = [
      `Key: ${prompt.keyLabel} ${prompt.scale}`,
      `Exercise: ${prompt.exercise}`,
      `Pattern: ${prompt.pattern}`,
      `Focus: ${prompt.focus}`,
      `Tempo hint: ${prompt.bpmHint} BPM`,
      '',
      'Tip: pair this with /tools/metronome or /tools/drone.',
    ];
    const ok = await tryCopy(lines.join('\n'));
    setCopied(ok ? 'Copied prompt.' : 'Copy failed.');
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Scale Randomizer</h1>
          <span className="prompt-header-badge">PROMPT</span>
        </div>
        <p className="muted">
          A practice prompt generator for the days when you want structure without decision fatigue.
          Generate a key, scale, and focus, then run it with the metronome or drone.
        </p>

        <div className="toolbox-row">
          <div className="music-quiz-display" aria-live="polite">
            <div className="music-quiz-label">Prompt</div>
            <div className="music-quiz-value">{prompt ? `${prompt.keyLabel} ${prompt.scale}` : '—'}</div>
            <div className="muted small">
              {prompt ? `${prompt.exercise} · ${prompt.pattern} · ${prompt.focus}` : 'Press Generate.'}
            </div>
          </div>

          <div className="toolbox-actions">
            <button className="button primary" type="button" onClick={generate} disabled={!canGenerate}>
              Generate
            </button>
            <button className="button" type="button" onClick={copyPrompt} disabled={!prompt}>
              Copy
            </button>
            <Link className="button" href="/tools#music">
              Back to music tools
            </Link>
          </div>
        </div>

        {copyNote ? <p className="muted small">{copyNote}</p> : null}

        {prompt ? (
          <dl className="toolbox-kv" style={{ marginTop: 12 }}>
            <div>
              <dt>Tempo hint</dt>
              <dd>{prompt.bpmHint} BPM</dd>
            </div>
            <div>
              <dt>Key</dt>
              <dd className="toolbox-mono">{prompt.keyLabel}</dd>
            </div>
            <div>
              <dt>Exercise</dt>
              <dd>{prompt.exercise}</dd>
            </div>
            <div>
              <dt>Focus</dt>
              <dd>{prompt.focus}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Include</h2>
        <div className="toolbox-row">
          <label className="toolbox-field">
            Note spelling
            <select value={spelling} onChange={(e) => setSpelling(e.target.value as 'sharp' | 'flat')}>
              <option value="flat">Flats</option>
              <option value="sharp">Sharps</option>
            </select>
          </label>
        </div>

        <h3 style={{ marginTop: 18 }}>Keys</h3>
        <div className="music-interval-grid">
          {NOTE_OPTIONS.map((opt) => {
            const label = spelling === 'flat' ? opt.flat : opt.sharp;
            const enabled = enabledKeys[opt.index];
            return (
              <label key={opt.index} className="music-interval-toggle">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => {
                    setEnabledKeys((prev) => {
                      const next = [...prev];
                      next[opt.index] = !next[opt.index];
                      // Keep at least one key enabled.
                      if (next.some(Boolean)) return next;
                      return prev;
                    });
                  }}
                />
                <span className="music-interval-pill">
                  <span className="toolbox-mono">{label}</span>
                </span>
              </label>
            );
          })}
        </div>

        <h3 style={{ marginTop: 18 }}>Scales</h3>
        <div className="music-interval-grid">
          {SCALES.map((s) => (
            <label key={s.id} className="music-interval-toggle">
              <input
                type="checkbox"
                checked={enabledScales.includes(s.id)}
                onChange={() => setEnabledScales((prev) => toggleList(prev, s.id, SCALES.map((x) => x.id)))}
              />
              <span className="music-interval-pill">{s.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Locks</h2>
        <p className="muted small">
          Want to keep the same key but vary the exercise? Lock a dimension and hit Generate again.
        </p>

        <div className="toolbox-row">
          <label className="toolbox-check">
            <input type="checkbox" checked={lockKey} onChange={(e) => setLockKey(e.target.checked)} />
            <span>Lock key</span>
          </label>
          <label className="toolbox-check">
            <input type="checkbox" checked={lockScale} onChange={(e) => setLockScale(e.target.checked)} />
            <span>Lock scale</span>
          </label>
          <label className="toolbox-check">
            <input type="checkbox" checked={lockExercise} onChange={(e) => setLockExercise(e.target.checked)} />
            <span>Lock exercise</span>
          </label>
        </div>

        <h3 style={{ marginTop: 18 }}>Exercises</h3>
        <div className="music-interval-grid">
          {EXERCISES.map((e) => (
            <label key={e.id} className="music-interval-toggle">
              <input
                type="checkbox"
                checked={enabledExercises.includes(e.id)}
                onChange={() => setEnabledExercises((prev) => toggleList(prev, e.id, EXERCISES.map((x) => x.id)))}
              />
              <span className="music-interval-pill">{e.label}</span>
            </label>
          ))}
        </div>

        <h3 style={{ marginTop: 18 }}>Patterns + Focus</h3>
        <div className="music-interval-grid">
          {PATTERNS.map((p) => (
            <label key={p.id} className="music-interval-toggle">
              <input
                type="checkbox"
                checked={enabledPatterns.includes(p.id)}
                onChange={() => setEnabledPatterns((prev) => toggleList(prev, p.id, PATTERNS.map((x) => x.id)))}
              />
              <span className="music-interval-pill">{p.label}</span>
            </label>
          ))}
          {FOCUS.map((f) => (
            <label key={f.id} className="music-interval-toggle">
              <input
                type="checkbox"
                checked={enabledFocus.includes(f.id)}
                onChange={() => setEnabledFocus((prev) => toggleList(prev, f.id, FOCUS.map((x) => x.id)))}
              />
              <span className="music-interval-pill">{f.label}</span>
            </label>
          ))}
        </div>

        {history.length ? (
          <>
            <h3 style={{ marginTop: 18 }}>History</h3>
            <ul className="muted small">
              {history.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <span className="toolbox-mono">{p.keyLabel}</span> {p.scale} · {p.exercise}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}
