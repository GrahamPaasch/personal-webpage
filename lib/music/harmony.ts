import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP, type NoteSpelling, clamp } from '@/lib/music/notes';

export type ScaleType = 'major' | 'minor';
export type ChordQuality = 'maj' | 'min' | 'dim';

export type RomanChordToken = string;

export type ProgressionPreset = {
  id: string;
  name: string;
  scale: ScaleType | 'any';
  roman: RomanChordToken[];
};

export const PROGRESSION_PRESETS: ProgressionPreset[] = [
  { id: 'i-v-vi-iv', name: 'I–V–vi–IV (pop)', scale: 'major', roman: ['I', 'V', 'vi', 'IV'] },
  { id: 'ii-v-i', name: 'ii–V–I (jazz cadence)', scale: 'major', roman: ['ii', 'V', 'I'] },
  { id: 'i-iv-v', name: 'I–IV–V (blues-ish)', scale: 'major', roman: ['I', 'IV', 'V', 'I'] },
  { id: 'vi-iv-i-v', name: 'vi–IV–I–V', scale: 'major', roman: ['vi', 'IV', 'I', 'V'] },
  { id: 'i-VI-III-VII', name: 'i–VI–III–VII (minor loop)', scale: 'minor', roman: ['i', 'VI', 'III', 'VII'] },
  { id: 'i-iv-v-i', name: 'i–iv–v–i', scale: 'minor', roman: ['i', 'iv', 'v', 'i'] },
] as const;

export function noteNameFromIndex(noteIndex: number, spelling: NoteSpelling = 'sharp'): string {
  const idx = ((noteIndex % 12) + 12) % 12;
  return spelling === 'flat' ? NOTE_NAMES_FLAT[idx] : NOTE_NAMES_SHARP[idx];
}

export function parseRomanChord(token: RomanChordToken): { degree: number; quality: ChordQuality } | null {
  const raw = token.trim();
  if (!raw) return null;

  const normalized = raw.replace(/[^IViv°]/g, '');
  if (!normalized) return null;

  const dim = normalized.includes('°');
  const letters = normalized.replace(/°/g, '');
  const upper = letters.toUpperCase();

  const degreeMap: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
  };
  const degree = degreeMap[upper];
  if (!degree) return null;

  const quality: ChordQuality = dim ? 'dim' : letters === letters.toLowerCase() ? 'min' : 'maj';
  return { degree, quality };
}

export function scaleDegreeOffset(degree: number, scale: ScaleType): number {
  const d = clamp(Math.round(degree), 1, 7);
  const major = [0, 2, 4, 5, 7, 9, 11] as const;
  const minor = [0, 2, 3, 5, 7, 8, 10] as const;
  return (scale === 'minor' ? minor : major)[d - 1];
}

export function triadSemitoneIntervals(quality: ChordQuality): number[] {
  if (quality === 'maj') return [0, 4, 7];
  if (quality === 'dim') return [0, 3, 6];
  return [0, 3, 7];
}

export function chordForKey(
  keyIndex: number,
  scale: ScaleType,
  token: RomanChordToken,
  opts?: { spelling?: NoteSpelling; rootMidi?: number },
): { name: string; midi: number[] } | null {
  const parsed = parseRomanChord(token);
  if (!parsed) return null;
  const rootMidi = opts?.rootMidi ?? 48; // C3

  const keyRootMidi = rootMidi + ((keyIndex % 12) + 12) % 12;
  const degreeRoot = keyRootMidi + scaleDegreeOffset(parsed.degree, scale);
  const midi = triadSemitoneIntervals(parsed.quality).map((i) => degreeRoot + i);

  const spelling = opts?.spelling ?? 'sharp';
  const rootName = noteNameFromIndex(degreeRoot % 12, spelling);
  const name = parsed.quality === 'maj' ? rootName : parsed.quality === 'min' ? `${rootName}m` : `${rootName}dim`;
  return { name, midi };
}

