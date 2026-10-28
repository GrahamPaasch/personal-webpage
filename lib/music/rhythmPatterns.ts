/**
 * Rhythm pattern library, ported from the old GitHub Pages metronome's
 * RhythmLibrary. Each pattern is a list of onsets in beats over `beats`
 * beats, where a beat is whatever the click is counting (a quarter in 4/4,
 * an eighth in 6/8 with the bar set to 3+3). Patterns loop independently of
 * the bar, so a two-bar clave simply spans two bars of 4.
 *
 * Three entries were broken in the old library (son clave had null onsets,
 * hemiola and 4:3 had the wrong onsets); they are corrected here.
 */

export type RhythmPattern = {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Suggested grouping string for the bar, e.g. "4" or "3+2+2". */
  meter: string;
  /** Length of the loop in beats. */
  beats: number;
  /** Onsets in beats, 0 = first beat of the loop. */
  onsets: number[];
  /** Grid resolution per beat for the step display (2, 3 or 4). */
  grid: number;
};

const T = 1 / 3;

export const RHYTHM_PATTERNS: RhythmPattern[] = [
  { id: 'quarters', name: 'Quarter notes', category: 'Basic', description: 'One note per beat.', meter: '4', beats: 4, onsets: [0, 1, 2, 3], grid: 2 },
  { id: 'eighths', name: 'Eighth notes', category: 'Basic', description: 'Two per beat.', meter: '4', beats: 4, onsets: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], grid: 2 },
  { id: 'half-notes', name: 'Half notes', category: 'Basic', description: 'Beats 1 and 3 only.', meter: '4', beats: 4, onsets: [0, 2], grid: 2 },
  { id: 'dotted-quarter-eighth', name: 'Dotted quarter + eighth', category: 'Dotted', description: 'Long-short on each half bar.', meter: '4', beats: 4, onsets: [0, 1.5, 2, 3.5], grid: 2 },
  { id: 'dotted-eighth-sixteenth', name: 'Dotted eighth + sixteenth', category: 'Dotted', description: 'Snappy long-short inside each beat.', meter: '4', beats: 4, onsets: [0, 0.75, 1, 1.75, 2, 2.75, 3, 3.75], grid: 4 },
  { id: 'reverse-dotted', name: 'Scotch snap', category: 'Dotted', description: 'Sixteenth then dotted eighth.', meter: '4', beats: 4, onsets: [0, 0.25, 1, 1.25, 2, 2.25, 3, 3.25], grid: 4 },
  { id: 'basic-syncopation', name: 'Basic syncopation', category: 'Syncopation', description: 'Pushes the "and" of 2.', meter: '4', beats: 4, onsets: [0, 1, 1.5, 2.5, 3], grid: 2 },
  { id: 'offbeat-eighths', name: 'Offbeat eighths', category: 'Syncopation', description: 'Only the "ands". The click keeps the beats.', meter: '4', beats: 4, onsets: [0.5, 1.5, 2.5, 3.5], grid: 2 },
  { id: 'charleston', name: 'Charleston', category: 'Syncopation', description: 'Dotted quarter, eighth tied over, rest.', meter: '4', beats: 4, onsets: [0, 1.5], grid: 2 },
  { id: 'eighth-triplets', name: 'Eighth-note triplets', category: 'Triplets', description: 'Three per beat.', meter: '4', beats: 4, onsets: [0, T, 2 * T, 1, 1 + T, 1 + 2 * T, 2, 2 + T, 2 + 2 * T, 3, 3 + T, 3 + 2 * T], grid: 3 },
  { id: 'quarter-triplets', name: 'Quarter-note triplets', category: 'Triplets', description: 'Three in the space of two beats.', meter: '4', beats: 4, onsets: [0, 2 * T, 4 * T, 2, 2 + 2 * T, 2 + 4 * T], grid: 3 },
  { id: 'triplet-quarter-mix', name: 'Triplets and quarters', category: 'Triplets', description: 'Alternates a triplet beat with a plain beat.', meter: '4', beats: 4, onsets: [0, T, 2 * T, 1, 2, 2 + T, 2 + 2 * T, 3], grid: 3 },
  { id: 'basic-68', name: '6/8 eighths', category: 'Compound', description: 'Six eighths, two groups of three.', meter: '3+3', beats: 6, onsets: [0, 1, 2, 3, 4, 5], grid: 2 },
  { id: 'dotted-quarter-68', name: '6/8 dotted quarters', category: 'Compound', description: 'The two big beats of 6/8.', meter: '3+3', beats: 6, onsets: [0, 3], grid: 2 },
  { id: 'jig', name: 'Jig', category: 'Compound', description: 'Quarter-eighth, quarter-eighth in 6/8.', meter: '3+3', beats: 6, onsets: [0, 2, 3, 5], grid: 2 },
  { id: 'basic-54', name: '5/4 as 3+2', category: 'Odd meters', description: 'Five beats, accents on 1 and 4.', meter: '3+2', beats: 5, onsets: [0, 1, 2, 3, 4], grid: 2 },
  { id: 'take-five', name: 'Take Five', category: 'Odd meters', description: 'The 5/4 jazz groove.', meter: '3+2', beats: 5, onsets: [0, 1.5, 2, 3], grid: 2 },
  { id: 'basic-78', name: '7/8 as 2+2+3', category: 'Odd meters', description: 'Seven eighths; the last group is long.', meter: '2+2+3', beats: 7, onsets: [0, 1, 2, 3, 4, 5, 6], grid: 2 },
  { id: 'clave-32', name: 'Son clave (3-2)', category: 'Latin', description: 'Two-bar Afro-Cuban key pattern.', meter: '4', beats: 8, onsets: [0, 1.5, 3, 5, 6], grid: 2 },
  { id: 'bossa-nova', name: 'Bossa nova', category: 'Latin', description: 'Brazilian two-bar pattern.', meter: '4', beats: 8, onsets: [0, 1.5, 3, 4.5, 6, 7.5], grid: 2 },
  { id: 'tresillo', name: 'Tresillo', category: 'Latin', description: '3+3+2 in eighths.', meter: '4', beats: 4, onsets: [0, 1.5, 3], grid: 2 },
  { id: 'hemiola', name: 'Hemiola (3 against 2)', category: 'Polyrhythm', description: 'Three even notes across every two beats.', meter: '4', beats: 4, onsets: [0, 2 * T, 4 * T, 2, 2 + 2 * T, 2 + 4 * T], grid: 3 },
  { id: 'four-against-three', name: '4 against 3', category: 'Polyrhythm', description: 'Four even notes across a 3/4 bar.', meter: '3', beats: 3, onsets: [0, 0.75, 1.5, 2.25], grid: 4 },
];

export function findPattern(id: string | null | undefined): RhythmPattern | null {
  if (!id) return null;
  return RHYTHM_PATTERNS.find((p) => p.id === id) ?? null;
}

/** Step grid for display: true where an onset lands on the grid. */
export function patternGrid(p: RhythmPattern): boolean[] {
  const steps = Math.round(p.beats * p.grid);
  const cells = Array.from({ length: steps }, () => false);
  for (const onset of p.onsets) {
    const idx = Math.round(onset * p.grid);
    if (idx >= 0 && idx < steps) cells[idx] = true;
  }
  return cells;
}
