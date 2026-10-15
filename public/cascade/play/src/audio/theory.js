// Music theory helpers. Pure and DOM-free.

export const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

export const QUALITIES = {
  '': [0, 4, 7], m: [0, 3, 7], '5': [0, 7],
  '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], mmaj7: [0, 3, 7, 11],
  '9': [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17],
  add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '69': [0, 4, 7, 9, 14],
  sus2: [0, 2, 7], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10],
  dim: [0, 3, 6], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
  aug: [0, 4, 8], '7#5': [0, 4, 8, 10], '9#5': [0, 4, 8, 10, 14], 'maj7#5': [0, 4, 8, 11],
  'maj7#11': [0, 4, 7, 11, 18], 'add#11': [0, 4, 7, 18], '7b9': [0, 4, 7, 10, 13],
};

export const mod12 = n => ((n % 12) + 12) % 12;
export const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);

export function noteToMidi(name) {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return PC[m[1]] + 12 * (Number(m[2]) + 1);
}

const CHORD_RE = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/;
export function parseChord(symbol) {
  const m = CHORD_RE.exec(symbol);
  if (!m) throw new Error(`bad chord ${symbol}`);
  const root = PC[m[1]];
  const q = m[2];
  if (!(q in QUALITIES)) throw new Error(`unknown chord quality "${q}" in ${symbol}`);
  const intervals = QUALITIES[q];
  const bass = m[3] !== undefined ? PC[m[3]] : root;
  const pcs = [...new Set(intervals.map(i => mod12(root + i)))];
  return { symbol, root, bass, intervals, pcs, quality: q };
}

// All MIDI notes of a scale within [lo, hi].
export function scaleNotes(tonicPc, scale, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (scale.includes(mod12(m - tonicPc))) out.push(m);
  return out;
}
export function inScale(midi, tonicPc, scale) { return scale.includes(mod12(midi - tonicPc)); }

// Nearest MIDI note whose pitch class is in pcs (ties go down).
export function nearestPc(midi, pcs) {
  for (let d = 0; d < 12; d++) {
    if (pcs.includes(mod12(midi - d))) return midi - d;
    if (pcs.includes(mod12(midi + d))) return midi + d;
  }
  return midi;
}

// Chord tones (all octaves) within range, ascending.
export function chordTonesInRange(pcs, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(mod12(m))) out.push(m);
  return out;
}

// Movement cost between two voicings (both sorted ascending).
export function movement(a, b) {
  if (!a || !a.length) return 0;
  const n = Math.max(a.length, b.length);
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const x = a[Math.min(i, a.length - 1)];
    const y = b[Math.min(i, b.length - 1)];
    cost += Math.abs(x - y);
  }
  return cost;
}

// Naive root-position voicing: stack chord tones upward from the lowest root ≥ lo.
export function rootPosition(chord, lo) {
  let r = lo;
  while (mod12(r) !== chord.root) r++;
  return chord.intervals.map(i => r + i).slice(0, 5);
}

/**
 * Voice-lead to a new chord: choose one note per chord tone (max `maxVoices`) inside [lo, hi] that
 * minimises total movement from `prev`, with no semitone clusters and a reasonable spread.
 */
export function voiceLead(prev, chord, lo, hi, maxVoices = 4) {
  // Keep the most characteristic tones when there are too many: root, 3rd, 7th/6th, altered 5ths,
  // extensions, and the plain fifth last (it adds the least colour).
  const rank = i => {
    const r = mod12(i);
    if (r === 0) return 0;
    if (r === 3 || r === 4) return 1;
    if (r === 6 || r === 8) return 1.5;
    if (r === 10 || r === 11 || r === 9) return 2;
    if (r === 2 || r === 1) return 3;
    if (r === 5) return 4;
    return 5; // perfect fifth
  };
  const ordered = [...new Set(chord.intervals.map(mod12))].sort((a, b) => rank(a) - rank(b));
  const pcs = ordered.slice(0, maxVoices).map(i => mod12(chord.root + i));
  const options = pcs.map(pc => chordTonesInRange([pc], lo, hi));
  let best = null, bestCost = Infinity;
  const target = prev && prev.length ? prev : null;
  const centre = (lo + hi) / 2;
  const pick = new Array(options.length);
  const rec = i => {
    if (i === options.length) {
      const v = pick.slice().sort((a, b) => a - b);
      for (let k = 1; k < v.length; k++) if (v[k] - v[k - 1] < 2) return; // no semitone clusters/unisons
      if (v[v.length - 1] - v[0] > 19) return;
      let cost = target ? movement(target, v) : 0;
      const mean = v.reduce((s, x) => s + x, 0) / v.length;
      cost += Math.abs(mean - centre) * (target ? 0.15 : 1);
      if (cost < bestCost) { bestCost = cost; best = v; }
      return;
    }
    for (const m of options[i]) { pick[i] = m; rec(i + 1); }
  };
  rec(0);
  return best ?? rootPosition(chord, lo).filter(m => m <= hi);
}
