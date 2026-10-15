// Player-as-instrument pitch logic. Pure: maps game actions to notes in the current stage harmony.
import { chordTonesInRange, nearestPc, scaleNotes, mod12 } from './theory.js';

// Move: one note per column, stepping through the (chord's) scale.
export function moveNote(col, chord, range = [62, 86]) {
  const notes = scaleNotes(0, chord.scalePcs, range[0], range[1] + 12);
  return notes[Math.max(0, Math.min(notes.length - 1, col))];
}

// Rotate: a chord tone chosen by rotation state (and column so it varies across the board).
export function rotateNote(rot, col, chord, range = [62, 86]) {
  const tones = chordTonesInRange(chord.melodyPcs, range[0] + 5, range[1] + 5);
  const i = (rot + Math.floor(col / 3)) % Math.min(tones.length, 6);
  return tones[i];
}

// Lock: percussive hit tuned to the chord root (bass register).
export function lockNote(chord, lo = 36) { return nearestPc(lo + 6, [chord.bass]); }

// Hard drop: low impact (root) + chord stab voicing.
export function stabNotes(chord, lo = 55) {
  const tones = chordTonesInRange(chord.pcs, lo, lo + 14);
  return tones.slice(0, 4);
}

/**
 * Line-clear flourish: ascending chord tones; length grows with lines; combo lifts the start by
 * one scale step per combo. Returns [{ at (in 16th steps from start), midi, vel }].
 */
export const FLOURISH_LEN = [0, 3, 5, 8, 14];
export function flourish(lines, combo, chord, range = [60, 84], tspin = false) {
  const count = FLOURISH_LEN[Math.max(0, Math.min(4, lines))] + (tspin ? 2 : 0);
  if (!count) return [];
  const scale = scaleNotes(0, chord.scalePcs, range[0] - 12, range[1] + 36);
  let startIdx = scale.findIndex(m => m >= range[0]);
  startIdx += Math.max(0, Math.min(10, combo));
  const startMidi = scale[Math.min(scale.length - 1, startIdx)];
  const ladder = chordTonesInRange(chord.melodyPcs, startMidi, startMidi + 40);
  const spacing = lines >= 4 ? 0.5 : lines === 3 ? 0.5 : 1; // 32nds for big clears
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ at: i * spacing, midi: ladder[Math.min(i, ladder.length - 1)], vel: 0.55 + 0.45 * (i / Math.max(1, count - 1)) });
  }
  return out;
}

export function inScalePcs(midi, pcs) { return pcs.includes(mod12(midi)); }
