/**
 * Settings model for the practice tool at /tools/metronome, plus the URL
 * parameter encoding that lets a voice assistant deep-link a setup
 * (?bpm=84&beats=3+2+2&sub=2&drone=D3&ramp=60-120x4@4).
 *
 * Everything here is framework-free so it can be unit-tested and reused by
 * the server page (parsing) and the client component (copy link).
 */

import { clamp, midiToNoteName, parseNoteName } from '@/lib/music/notes';

export type LadderMode = 'off' | 'rate' | 'auto' | 'shuffle';
export type ClickVoice = 'click' | 'wood' | 'beep' | 'tick' | 'bell';
export type DroneWave = 'sine' | 'triangle' | 'sawtooth' | 'square';

export const CLICK_VOICES: { id: ClickVoice; label: string }[] = [
  { id: 'click', label: 'Click' },
  { id: 'wood', label: 'Woodblock' },
  { id: 'beep', label: 'Beep' },
  { id: 'tick', label: 'Tick' },
  { id: 'bell', label: 'Bell' },
];

export const LIMITS = {
  bpm: [20, 300],
  beatsPerBar: [1, 12],
  subdivision: [1, 6],
  swing: [0, 0.45],
  countInBars: [0, 2],
  ladderStep: [1, 40],
  ladderBars: [1, 64],
  gapBars: [1, 32],
  dropout: [0, 0.8],
  drillBars: [1, 16],
  a4: [415, 466],
  poly: [0, 9],
  droneMidi: [24, 84],
} as const;

export type PracticeSettings = {
  bpm: number;
  /** Accent grouping, e.g. [4] or [3, 2, 2]. Beats per bar is the sum. */
  grouping: number[];
  subdivision: number;
  /** 0..0.45, applies when subdivision is 2 (eighths). */
  swing: number;
  accentDownbeat: boolean;
  voice: ClickVoice;
  volume: number;
  accentVolume: number;
  beatVolume: number;
  subVolume: number;
  countInBars: number;

  ladderMode: LadderMode;
  ladderStart: number;
  ladderTarget: number;
  ladderStep: number;
  /** BPM taken back after a missed block in "rate" mode. */
  ladderDrop: number;
  ladderBars: number;
  /** Keep clicking at the target when it is reached (false = stop). */
  ladderHoldAtTarget: boolean;

  gapEnabled: boolean;
  gapPlayBars: number;
  gapMuteBars: number;
  gapCheckpoint: boolean;
  /** 0..0.8 probability that a non-downbeat click is silent. */
  dropout: number;
  drillEnabled: boolean;
  drillBars: number;

  droneOn: boolean;
  droneMidi: number;
  droneWave: DroneWave;
  droneVolume: number;
  a4: number;
  /** Per-bar drone notes like "D3, A3". Empty = fixed note. */
  droneSequence: string;

  patternId: string | null;
  patternVolume: number;
  /** Cross-beats per bar, 0 = off. */
  poly: number;
  polyVolume: number;

  flashDownbeat: boolean;
  sweep: boolean;
  goal: string;
};

export const DEFAULT_SETTINGS: PracticeSettings = {
  bpm: 84,
  grouping: [4],
  subdivision: 1,
  swing: 0.18,
  accentDownbeat: true,
  voice: 'click',
  volume: 0.7,
  accentVolume: 1,
  beatVolume: 0.7,
  subVolume: 0.4,
  countInBars: 0,

  ladderMode: 'off',
  ladderStart: 60,
  ladderTarget: 120,
  ladderStep: 4,
  ladderDrop: 2,
  ladderBars: 4,
  ladderHoldAtTarget: true,

  gapEnabled: false,
  gapPlayBars: 4,
  gapMuteBars: 2,
  gapCheckpoint: true,
  dropout: 0,
  drillEnabled: false,
  drillBars: 2,

  droneOn: false,
  droneMidi: 57, // A3 (viola open A)
  droneWave: 'sine',
  droneVolume: 0.25,
  a4: 440,
  droneSequence: '',

  patternId: null,
  patternVolume: 0.6,
  poly: 0,
  polyVolume: 0.5,

  flashDownbeat: false,
  sweep: true,
  goal: '',
};

export function beatsPerBar(grouping: number[]): number {
  return grouping.reduce((a, b) => a + b, 0);
}

/** Parses "4", "3+2+2" or "7/8" style strings into a grouping. */
export function parseGrouping(raw: string): number[] | null {
  const text = raw.trim();
  if (!text) return null;
  const slash = /^(\d{1,2})\s*\/\s*\d{1,2}$/.exec(text);
  const body = slash ? slash[1] : text;
  const parts = body
    .split(/[+\s,]+/)
    .filter(Boolean)
    .map((p) => Number.parseInt(p, 10));
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 1)) return null;
  const total = parts.reduce((a, b) => a + b, 0);
  if (total < LIMITS.beatsPerBar[0] || total > LIMITS.beatsPerBar[1]) return null;
  return parts;
}

export function groupingLabel(grouping: number[]): string {
  return grouping.length > 1 ? grouping.join('+') : String(grouping[0] ?? 4);
}

/** Beat indices (0-based) that carry an accent for a grouping. */
export function accentedBeats(grouping: number[]): Set<number> {
  const out = new Set<number>();
  let pos = 0;
  for (const g of grouping) {
    out.add(pos);
    pos += g;
  }
  return out;
}

/** Parses a drone sequence like "D3, A3 Bb2" into MIDI numbers (bad tokens skipped). */
export function parseDroneSequence(raw: string): number[] {
  return raw
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(parseNoteName)
    .filter((m): m is number => m !== null);
}

/** Parses "60-120", "60-120x4", "60-120x4@8". */
export function parseRamp(raw: string): { start: number; target: number; step?: number; bars?: number } | null {
  const m = /^\s*(\d{2,3})\s*-\s*(\d{2,3})(?:x(\d{1,2}))?(?:@(\d{1,2}))?\s*$/i.exec(raw);
  if (!m) return null;
  const [b0, b1] = LIMITS.bpm;
  const start = clamp(Number.parseInt(m[1], 10), b0, b1);
  const target = clamp(Number.parseInt(m[2], 10), b0, b1);
  const out: { start: number; target: number; step?: number; bars?: number } = { start, target };
  if (m[3]) out.step = clamp(Number.parseInt(m[3], 10), LIMITS.ladderStep[0], LIMITS.ladderStep[1]);
  if (m[4]) out.bars = clamp(Number.parseInt(m[4], 10), LIMITS.ladderBars[0], LIMITS.ladderBars[1]);
  return out;
}

export type SearchParamsLike = Record<string, string | string[] | undefined>;

function first(sp: SearchParamsLike, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = sp[key];
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string' && s !== '') return s;
  }
  return undefined;
}

function intIn(raw: string | undefined, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? clamp(n, min, max) : undefined;
}

function pctIn(raw: string | undefined, max: number): number | undefined {
  const n = intIn(raw, 0, Math.round(max * 100));
  return n === undefined ? undefined : n / 100;
}

function flag(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  return !(raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'off');
}

/**
 * Reads settings from URL search params. Unknown or invalid values are ignored
 * so a half-right voice command still lands on something sensible. The old
 * metronome's parameter names (beatsPerBar, subdivision, accentDownbeat) are
 * accepted so existing setlist links keep working.
 */
export function settingsFromParams(sp: SearchParamsLike | undefined): Partial<PracticeSettings> {
  if (!sp) return {};
  const out: Partial<PracticeSettings> = {};
  const set = <K extends keyof PracticeSettings>(k: K, v: PracticeSettings[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };

  set('bpm', intIn(first(sp, 'bpm', 'tempo'), LIMITS.bpm[0], LIMITS.bpm[1]));
  const grouping = first(sp, 'beats', 'beatsPerBar', 'meter');
  if (grouping) set('grouping', parseGrouping(grouping) ?? undefined);
  set('subdivision', intIn(first(sp, 'sub', 'subdivision'), LIMITS.subdivision[0], LIMITS.subdivision[1]));
  set('swing', pctIn(first(sp, 'swing'), LIMITS.swing[1]));
  set('volume', pctIn(first(sp, 'volume', 'vol'), 1));
  set('accentDownbeat', flag(first(sp, 'accent', 'accentDownbeat')));
  const voice = first(sp, 'voice', 'tone');
  if (voice && CLICK_VOICES.some((v) => v.id === voice)) set('voice', voice as ClickVoice);
  set('countInBars', intIn(first(sp, 'countin'), LIMITS.countInBars[0], LIMITS.countInBars[1]));

  const ramp = first(sp, 'ramp', 'ladder');
  if (ramp) {
    const r = parseRamp(ramp);
    if (r) {
      set('ladderStart', r.start);
      set('ladderTarget', r.target);
      set('ladderStep', r.step);
      set('ladderBars', r.bars);
      set('bpm', out.bpm ?? r.start);
      set('ladderMode', 'rate');
    }
  }
  const mode = first(sp, 'mode');
  if (mode && ['off', 'rate', 'auto', 'shuffle'].includes(mode)) set('ladderMode', mode as LadderMode);

  const gap = first(sp, 'gap');
  if (gap) {
    const m = /^(\d{1,2})\s*[\/x]\s*(\d{1,2})$/.exec(gap.trim());
    if (m) {
      set('gapEnabled', true);
      set('gapPlayBars', clamp(Number.parseInt(m[1], 10), LIMITS.gapBars[0], LIMITS.gapBars[1]));
      set('gapMuteBars', clamp(Number.parseInt(m[2], 10), LIMITS.gapBars[0], LIMITS.gapBars[1]));
    } else if (gap === '0' || gap === 'off') {
      set('gapEnabled', false);
    }
  }
  set('dropout', pctIn(first(sp, 'dropout'), LIMITS.dropout[1]));
  const drill = first(sp, 'drill');
  if (drill) {
    const n = intIn(drill, 0, LIMITS.drillBars[1]);
    if (n !== undefined) {
      set('drillEnabled', n > 0);
      if (n > 0) set('drillBars', n);
    }
  }

  const drone = first(sp, 'drone');
  if (drone) {
    if (drone === 'off' || drone === '0') {
      set('droneOn', false);
    } else {
      const midi = parseNoteName(drone);
      if (midi !== null) {
        set('droneOn', true);
        set('droneMidi', clamp(midi, LIMITS.droneMidi[0], LIMITS.droneMidi[1]));
      }
    }
  }
  const seq = first(sp, 'droneSeq', 'drones');
  if (seq && parseDroneSequence(seq).length) {
    set('droneOn', true);
    set('droneSequence', seq);
  }
  set('a4', intIn(first(sp, 'a4'), LIMITS.a4[0], LIMITS.a4[1]));
  set('droneVolume', pctIn(first(sp, 'droneVolume'), 1));

  const pattern = first(sp, 'pattern');
  if (pattern) set('patternId', pattern === 'off' ? null : pattern.slice(0, 40));
  set('poly', intIn(first(sp, 'poly'), LIMITS.poly[0], LIMITS.poly[1]));
  const goal = first(sp, 'goal');
  if (goal) set('goal', goal.slice(0, 120));
  set('flashDownbeat', flag(first(sp, 'flash')));

  return out;
}

/** Encodes the settings that differ from defaults as compact URL params. */
export function settingsToParams(s: PracticeSettings): URLSearchParams {
  const q = new URLSearchParams();
  const d = DEFAULT_SETTINGS;
  q.set('bpm', String(s.bpm));
  if (groupingLabel(s.grouping) !== groupingLabel(d.grouping)) q.set('beats', groupingLabel(s.grouping));
  if (s.subdivision !== d.subdivision) q.set('sub', String(s.subdivision));
  if (s.subdivision === 2 && Math.round(s.swing * 100) !== Math.round(d.swing * 100)) {
    q.set('swing', String(Math.round(s.swing * 100)));
  }
  if (Math.round(s.volume * 100) !== Math.round(d.volume * 100)) q.set('volume', String(Math.round(s.volume * 100)));
  if (s.accentDownbeat !== d.accentDownbeat) q.set('accent', s.accentDownbeat ? '1' : '0');
  if (s.voice !== d.voice) q.set('voice', s.voice);
  if (s.countInBars !== d.countInBars) q.set('countin', String(s.countInBars));
  if (s.ladderMode !== 'off') {
    q.set('ramp', `${s.ladderStart}-${s.ladderTarget}x${s.ladderStep}@${s.ladderBars}`);
    q.set('mode', s.ladderMode);
  }
  if (s.gapEnabled) q.set('gap', `${s.gapPlayBars}/${s.gapMuteBars}`);
  if (s.dropout > 0) q.set('dropout', String(Math.round(s.dropout * 100)));
  if (s.drillEnabled) q.set('drill', String(s.drillBars));
  if (s.droneOn) {
    q.set('drone', midiToNoteName(s.droneMidi, 'flat'));
    if (s.droneSequence.trim()) q.set('droneSeq', s.droneSequence.trim());
  }
  if (s.a4 !== d.a4) q.set('a4', String(s.a4));
  if (s.droneOn && Math.round(s.droneVolume * 100) !== Math.round(d.droneVolume * 100)) {
    q.set('droneVolume', String(Math.round(s.droneVolume * 100)));
  }
  if (s.patternId) q.set('pattern', s.patternId);
  if (s.poly > 0) q.set('poly', String(s.poly));
  if (s.goal.trim()) q.set('goal', s.goal.trim());
  if (s.flashDownbeat) q.set('flash', '1');
  return q;
}

/** Merges a stored or parsed partial into full settings, re-clamping everything. */
export function normalizeSettings(partial: Partial<PracticeSettings> | null | undefined): PracticeSettings {
  const s: PracticeSettings = { ...DEFAULT_SETTINGS, ...(partial ?? {}) };
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
  const d = DEFAULT_SETTINGS;
  s.bpm = Math.round(num(s.bpm, d.bpm, LIMITS.bpm[0], LIMITS.bpm[1]));
  s.grouping =
    Array.isArray(s.grouping) && parseGrouping(s.grouping.join('+')) ? s.grouping.map((g) => Math.round(g)) : [...d.grouping];
  s.subdivision = Math.round(num(s.subdivision, d.subdivision, LIMITS.subdivision[0], LIMITS.subdivision[1]));
  s.swing = num(s.swing, d.swing, LIMITS.swing[0], LIMITS.swing[1]);
  s.volume = num(s.volume, d.volume, 0, 1);
  s.accentVolume = num(s.accentVolume, d.accentVolume, 0, 1);
  s.beatVolume = num(s.beatVolume, d.beatVolume, 0, 1);
  s.subVolume = num(s.subVolume, d.subVolume, 0, 1);
  s.countInBars = Math.round(num(s.countInBars, d.countInBars, LIMITS.countInBars[0], LIMITS.countInBars[1]));
  if (!CLICK_VOICES.some((v) => v.id === s.voice)) s.voice = d.voice;
  if (!['off', 'rate', 'auto', 'shuffle'].includes(s.ladderMode)) s.ladderMode = 'off';
  s.ladderStart = Math.round(num(s.ladderStart, d.ladderStart, LIMITS.bpm[0], LIMITS.bpm[1]));
  s.ladderTarget = Math.round(num(s.ladderTarget, d.ladderTarget, LIMITS.bpm[0], LIMITS.bpm[1]));
  s.ladderStep = Math.round(num(s.ladderStep, d.ladderStep, LIMITS.ladderStep[0], LIMITS.ladderStep[1]));
  s.ladderDrop = Math.round(num(s.ladderDrop, d.ladderDrop, 0, LIMITS.ladderStep[1]));
  s.ladderBars = Math.round(num(s.ladderBars, d.ladderBars, LIMITS.ladderBars[0], LIMITS.ladderBars[1]));
  s.gapPlayBars = Math.round(num(s.gapPlayBars, d.gapPlayBars, LIMITS.gapBars[0], LIMITS.gapBars[1]));
  s.gapMuteBars = Math.round(num(s.gapMuteBars, d.gapMuteBars, LIMITS.gapBars[0], LIMITS.gapBars[1]));
  s.dropout = num(s.dropout, d.dropout, LIMITS.dropout[0], LIMITS.dropout[1]);
  s.drillBars = Math.round(num(s.drillBars, d.drillBars, LIMITS.drillBars[0], LIMITS.drillBars[1]));
  s.droneMidi = Math.round(num(s.droneMidi, d.droneMidi, LIMITS.droneMidi[0], LIMITS.droneMidi[1]));
  if (!['sine', 'triangle', 'sawtooth', 'square'].includes(s.droneWave)) s.droneWave = d.droneWave;
  s.droneVolume = num(s.droneVolume, d.droneVolume, 0, 1);
  s.a4 = Math.round(num(s.a4, d.a4, LIMITS.a4[0], LIMITS.a4[1]));
  s.droneSequence = typeof s.droneSequence === 'string' ? s.droneSequence.slice(0, 200) : '';
  s.patternId = typeof s.patternId === 'string' && s.patternId ? s.patternId : null;
  s.patternVolume = num(s.patternVolume, d.patternVolume, 0, 1);
  s.poly = Math.round(num(s.poly, d.poly, LIMITS.poly[0], LIMITS.poly[1]));
  if (s.poly === 1) s.poly = 0;
  s.polyVolume = num(s.polyVolume, d.polyVolume, 0, 1);
  s.goal = typeof s.goal === 'string' ? s.goal.slice(0, 120) : '';
  for (const key of ['accentDownbeat', 'ladderHoldAtTarget', 'gapEnabled', 'gapCheckpoint', 'drillEnabled', 'droneOn', 'flashDownbeat', 'sweep'] as const) {
    if (typeof s[key] !== 'boolean') (s as Record<typeof key, boolean>)[key] = d[key];
  }
  return s;
}
