export const NOTE_NAMES_SHARP = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export const NOTE_NAMES_FLAT = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export type NoteSpelling = 'sharp' | 'flat';

export type NoteName = (typeof NOTE_NAMES_SHARP)[number] | (typeof NOTE_NAMES_FLAT)[number];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function midiToNoteName(midi: number, spelling: NoteSpelling = 'sharp'): string {
  const m = Math.round(midi);
  const octave = Math.floor(m / 12) - 1;
  const idx = ((m % 12) + 12) % 12;
  const name = spelling === 'flat' ? NOTE_NAMES_FLAT[idx] : NOTE_NAMES_SHARP[idx];
  return `${name}${octave}`;
}

export function frequencyFromMidi(midi: number, a4: number = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function midiFromFrequency(freq: number, a4: number = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export type PitchNote = {
  midi: number;
  note: string;
  freq: number;
  targetFreq: number;
  cents: number; // positive = sharp, negative = flat
};

export function pitchToNote(freq: number, opts?: { a4?: number; spelling?: NoteSpelling }): PitchNote {
  const a4 = opts?.a4 ?? 440;
  const spelling = opts?.spelling ?? 'sharp';
  const midiFloat = midiFromFrequency(freq, a4);
  const midi = Math.round(midiFloat);
  const targetFreq = frequencyFromMidi(midi, a4);
  const cents = 1200 * Math.log2(freq / targetFreq);
  return {
    midi,
    note: midiToNoteName(midi, spelling),
    freq,
    targetFreq,
    cents,
  };
}

export type NoteOption = { index: number; label: string; sharp: string; flat: string };

export const NOTE_OPTIONS: NoteOption[] = NOTE_NAMES_SHARP.map((sharp, index) => {
  const flat = NOTE_NAMES_FLAT[index];
  const label = sharp === flat ? sharp : `${sharp} / ${flat}`;
  return { index, label, sharp, flat };
});

export function midiFromNoteIndex(noteIndex: number, octave: number): number {
  // MIDI note 0 = C-1.
  const idx = ((noteIndex % 12) + 12) % 12;
  return (octave + 1) * 12 + idx;
}

