// Seeded, music-theory-aware part generators. Pure and DOM-free.
// Every generator returns { bar(barIndex) -> [{ step, midi | notes | voice, dur, vel }] } for one stage.
import { Rng, hashSeed } from '../game/rng.js';
import { PC, SCALES, parseChord, voiceLead, chordTonesInRange, nearestPc, scaleNotes, mod12 } from './theory.js';

// ---------------------------------------------------------------------------------------------
// Stage music preparation
// ---------------------------------------------------------------------------------------------
export function prepareMusic(music) {
  const tonic = PC[music.key];
  const scale = SCALES[music.scale];
  const melodyScale = SCALES[music.melodyScale ?? music.scale];
  const chords = music.progression.map(entry => {
    const e = typeof entry === 'string' ? { chord: entry } : entry;
    const c = parseChord(e.chord);
    const sRoot = e.scaleRoot ? PC[e.scaleRoot] : tonic;
    const sc = e.scale ? SCALES[e.scale] : melodyScale;
    c.scalePcs = sc.map(i => mod12(sRoot + i));
    // Harmonic (parent) scale: used for passing/approach tones even when the melody scale is pentatonic.
    c.keyPcs = e.scale ? c.scalePcs : scale.map(i => mod12(tonic + i));
    c.colour = !!e.scale;
    const inter = c.pcs.filter(p => c.scalePcs.includes(p));
    c.melodyPcs = inter.length >= 2 ? inter : c.pcs;
    return c;
  });
  return { ...music, tonic, scaleArr: scale, melodyScaleArr: melodyScale, chords, stepsPerBar: 16 };
}

export const chordAt = (M, bar) => M.chords[((bar % M.chords.length) + M.chords.length) % M.chords.length];

// ---------------------------------------------------------------------------------------------
// Pad: voice-led sustained chords
// ---------------------------------------------------------------------------------------------
export function genPad(part, M) {
  const [lo, hi] = part.range ?? [52, 76];
  const n = M.chords.length;
  const voicings = [];
  let prev = null;
  // Two passes so the loop's first chord is voice-led from its last.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      prev = voiceLead(prev, M.chords[i], lo, hi, part.voices ?? 4);
      if (pass === 1) voicings[i] = prev;
    }
  }
  const style = part.style ?? 'sustain';
  return {
    voicings,
    bar(b) {
      const i = b % n;
      const v = voicings[i];
      const same = M.chords[(i + n - 1) % n].symbol === M.chords[i].symbol;
      if (style === 'stabs') {
        const rhythm = part.rhythm ?? [0, 3, 6, 10, 14];
        return rhythm.map((s, k) => ({ step: s, notes: v, dur: 2, vel: k === 0 ? 0.9 : 0.7 }));
      }
      if (style === 'breath') {
        return [{ step: 0, notes: v, dur: 8, vel: 0.85 }, { step: 8, notes: v, dur: 8, vel: 0.65 }];
      }
      if (same && b % 2 === 1) return []; // held over from the previous bar
      const len = same ? 32 : 16;
      return [{ step: 0, notes: v, dur: len, vel: 0.8 }];
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Bass
// ---------------------------------------------------------------------------------------------
function bassNote(pc, lo, hi) {
  for (let m = lo; m <= hi; m++) if (mod12(m) === pc) return m;
  return lo;
}

function approachTo(nextBassMidi, scalePcs, fromAbove) {
  for (let d = 1; d <= 2; d++) {
    const c = fromAbove ? nextBassMidi + d : nextBassMidi - d;
    if (scalePcs.includes(mod12(c))) return c;
  }
  return nextBassMidi + (fromAbove ? 7 : -5); // no diatonic neighbour: approach from the fifth
}

const SYNTH_RHYTHMS = [
  [0, 2, 3, 6, 8, 10, 11, 14],
  [0, 3, 6, 8, 11, 14],
  [0, 2, 4, 6, 8, 10, 12, 14],
  [0, 3, 4, 7, 8, 10, 12, 15],
];

export function genBass(part, M, seed) {
  const rng = new Rng(hashSeed(seed, 'bass', M.key, M.bpm));
  const [lo, hi] = part.range ?? [33, 47];
  const style = part.style ?? 'sub';
  const synthRhythm = rng.pick(SYNTH_RHYTHMS);
  const pluckFill = rng.chance(0.5);
  const n = M.chords.length;
  return {
    bar(b) {
      const c = M.chords[b % n];
      const nx = M.chords[(b + 1) % n];
      const root = bassNote(c.bass, lo, hi);
      const fifth = root + 7 <= hi + 5 ? root + 7 : root - 5;
      const nextRoot = bassNote(nx.bass, lo, hi);
      const changes = nx.symbol !== c.symbol;
      const ev = [];
      switch (style) {
        case 'sub':
          ev.push({ step: 0, midi: root, dur: 15, vel: 0.9 });
          break;
        case 'drone': {
          const t = bassNote(M.tonic, lo, hi);
          if (b % 2 === 0) { ev.push({ step: 0, midi: t, dur: 32, vel: 0.8 }, { step: 0, midi: t + 7, dur: 32, vel: 0.55 }); }
          if (c.bass !== M.tonic) ev.push({ step: 0, midi: root + 12, dur: 12, vel: 0.5 });
          break;
        }
        case 'pluck':
          ev.push({ step: 0, midi: root, dur: 5, vel: 1 }, { step: 6, midi: fifth, dur: 2, vel: 0.7 }, { step: 8, midi: root + 12 <= hi + 7 ? root + 12 : root, dur: 4, vel: 0.8 });
          if (changes || pluckFill) ev.push({ step: 14, midi: approachTo(nextRoot, c.keyPcs, nextRoot > root), dur: 2, vel: 0.75 });
          else ev.push({ step: 12, midi: fifth, dur: 4, vel: 0.65 });
          break;
        case 'synth':
          for (const s of synthRhythm) {
            const oct = (s % 4 === 2 && rng.float() < 0.0) ? 12 : 0;
            ev.push({ step: s, midi: root + ((s === 6 || s === 14) ? 12 : 0) + oct, dur: 1.6, vel: s % 4 === 0 ? 1 : 0.72 });
          }
          if (changes) { ev.pop(); ev.push({ step: 15, midi: approachTo(nextRoot, c.keyPcs, nextRoot > root), dur: 1, vel: 0.8 }); }
          break;
        case 'pulse':
          for (let s = 0; s < 16; s += 2) ev.push({ step: s, midi: s % 8 === 6 ? root + 12 : root, dur: 1.5, vel: s % 4 === 0 ? 0.95 : 0.7 });
          break;
        case 'walk': {
          const third = nearestPc(root + 4, c.pcs.filter(p => p !== c.root));
          ev.push({ step: 0, midi: root, dur: 7, vel: 0.9 }, { step: 8, midi: b % 2 ? third : fifth, dur: 6, vel: 0.7 });
          if (changes) ev.push({ step: 14, midi: approachTo(nextRoot, c.keyPcs, nextRoot > root), dur: 2, vel: 0.6 });
          break;
        }
      }
      return ev;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Drums: patterns are data (stage module); generator adds ghost notes, accents and phrase fills.
// ---------------------------------------------------------------------------------------------
export function parsePattern(str) {
  const out = [];
  [...str].forEach((ch, i) => {
    if (ch === 'x' || ch === 'X') out.push({ step: i, vel: ch === 'X' ? 1 : 0.75 });
    else if (ch === 'o') out.push({ step: i, vel: 0.45 });
    else if (ch === '-') out.push({ step: i, vel: 0.25 });
  });
  return out;
}

export function genDrums(part, M, seed) {
  const voices = Object.entries(part.patterns).map(([voice, pat]) => ({
    voice, hits: parsePattern(pat), min: part.layers?.[voice] ?? 0,
  }));
  const fillVoice = part.fill ?? null;
  return {
    bar(b, intensity = 1) {
      const rng = new Rng(hashSeed(seed, 'drums', b % 64));
      const ev = [];
      const phraseEnd = b % 4 === 3;
      const bigEnd = b % 8 === 7;
      for (const v of voices) {
        if (intensity < v.min) continue;
        for (const h of v.hits) {
          if (phraseEnd && fillVoice && h.step >= 12 && v.voice !== 'kick') continue;
          const human = 1 - rng.float() * 0.12;
          ev.push({ step: h.step, voice: v.voice, vel: h.vel * human });
        }
        // Occasional ghost notes on light voices for life.
        if (v.voice.match(/hat|shaker|tek|rim/) && rng.chance(0.35)) {
          const s = rng.int(0, 15);
          if (!v.hits.some(h => h.step === s)) ev.push({ step: s, voice: v.voice, vel: 0.22 });
        }
      }
      if (phraseEnd && fillVoice && intensity >= (part.fillMin ?? 0.5)) {
        const steps = bigEnd ? [12, 13, 14, 15] : [12, 14, 15];
        steps.forEach((s, k) => ev.push({ step: s, voice: fillVoice, vel: 0.45 + 0.15 * k }));
      }
      return ev;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Arpeggio: a seeded motif of chord-tone indices replayed over each chord's tone ladder.
// ---------------------------------------------------------------------------------------------
export function genArp(part, M, seed) {
  const rng = new Rng(hashSeed(seed, 'arp', M.key));
  const [lo, hi] = part.range ?? [62, 86];
  const rate = part.rate ?? 2; // steps per note
  const shape = part.shape ?? 'motif';
  const len = Math.max(4, Math.min(16, Math.round(16 / rate)));
  let motif;
  if (shape === 'up') motif = Array.from({ length: len }, (_, i) => i % (part.span ?? 6));
  else if (shape === 'updown') {
    const span = part.span ?? 4;
    const cyc = [...Array(span).keys(), ...Array.from({ length: span - 2 }, (_, i) => span - 2 - i)];
    motif = Array.from({ length: len }, (_, i) => cyc[i % cyc.length]);
  } else {
    // random walk on the ladder with a return home at the cycle end
    motif = [0];
    for (let i = 1; i < len; i++) {
      const step = rng.weighted([1, 2, -1, -2, 3], [5, 2, 4, 1, 1]);
      motif.push(Math.max(0, Math.min((part.span ?? 6), motif[i - 1] + step)));
    }
  }
  const rests = new Set();
  if (part.rests) for (let i = 0; i < len; i++) if (i % 4 === 3 && rng.chance(part.rests)) rests.add(i);
  const n = M.chords.length;
  let prevBase = null;
  return {
    motif,
    bar(b) {
      const c = M.chords[b % n];
      const ladder = chordTonesInRange(c.melodyPcs, lo, hi);
      // anchor: lowest ladder index whose note is nearest the previous anchor (smooth register)
      let base = 0;
      const want = prevBase ?? lo + 5;
      let bestD = Infinity;
      for (let i = 0; i < ladder.length; i++) { const d = Math.abs(ladder[i] - want); if (d < bestD) { bestD = d; base = i; } }
      base = Math.min(base, Math.max(0, ladder.length - 1 - (part.span ?? 6)));
      prevBase = ladder[base];
      const ev = [];
      for (let i = 0, s = 0; s < 16; i++, s += rate) {
        if (rests.has(i % len)) continue;
        const idx = Math.min(ladder.length - 1, base + motif[i % len]);
        const accent = s % 4 === 0 ? 1 : 0.7;
        ev.push({ step: s, midi: ladder[idx], dur: rate * (part.gate ?? 0.9), vel: accent });
      }
      return ev;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Lead melody: motif-based phrases (A A' B A'' cadence) realised against the chords.
// ---------------------------------------------------------------------------------------------
const CELLS_SLOW = [[0], [0, 4], [0, 6], [0, 2, 4], [0, 3], [], [0, 4, 6]];
const CELLS_FAST = [[0, 2], [0, 2, 4, 6], [0, 3, 6], [0, 4], [0, 2, 3], [0], [], [0, 6]];

function genRhythm(rng, slow) {
  const cells = slow ? CELLS_SLOW : CELLS_FAST;
  // 4 half-bar cells = 2 bars; never start with a rest; finish with a long note or rest (breath).
  const r = [rng.pick(cells.filter(c => c.length)), rng.pick(cells), rng.pick(cells.filter(c => c.length)), rng.pick([[0], []])];
  const onsets = [];
  r.forEach((cell, k) => cell.forEach(s => onsets.push(k * 8 + s)));
  return onsets;
}

function realise(onsets, contour, startBar, M, part, startPitch, cadence, rngVel) {
  const [lo, hi] = part.range ?? [64, 86];
  const notes = [];
  let pitch = startPitch;
  let dir = 1;
  onsets.forEach((t, k) => {
    const bar = startBar + Math.floor(t / 16);
    const step = t % 16;
    const c = M.chords[bar % M.chords.length];
    const scaleList = scaleNotes(0, c.scalePcs, lo - 12, hi + 12);
    const strong = step % 8 === 0;
    if (k === 0) pitch = nearestPc(pitch, c.melodyPcs);
    else {
      const mv = contour[k % contour.length] * dir;
      let idx = scaleList.indexOf(nearestPc(pitch, c.scalePcs));
      idx = Math.max(0, Math.min(scaleList.length - 1, idx + mv));
      pitch = scaleList[idx];
      if (pitch > hi) { dir = -1; pitch = nearestPc(hi - 2, c.scalePcs); }
      if (pitch < lo) { dir = 1; pitch = nearestPc(lo + 2, c.scalePcs); }
      if (strong) pitch = nearestPc(pitch, c.melodyPcs);
    }
    const next = onsets[k + 1];
    const end = next !== undefined ? next : 32;
    let dur = Math.max(1, Math.min(end - t, 8)) * 0.92;
    if (k === onsets.length - 1) {
      if (cadence) {
        pitch = nearestPc(pitch, c.melodyPcs.includes(c.root) ? [c.root] : c.melodyPcs);
      } else pitch = nearestPc(pitch, c.melodyPcs);
      dur = Math.max(dur, Math.min(32 - t, 10));
    }
    if (pitch > hi) pitch -= 12;
    if (pitch < lo) pitch += 12;
    const arch = 0.75 + 0.25 * Math.sin(Math.PI * t / 32);
    notes.push({ abs: (startBar * 16) + t, midi: pitch, dur, vel: arch * (strong ? 1 : 0.8) * (0.9 + 0.1 * rngVel.float()) });
  });
  return { notes, last: pitch };
}

// The lead EVOLVES: the 16-bar theme (cycle 0) returns on every even cycle; odd cycles are fresh
// seeded variations (new rhythms/contours over the same chords), so a long stage never loops verbatim.
export function genLead(part, M, seed) {
  const cycles = new Map();
  let total = 0;
  const cycleFor = c => {
    const key = c % 2 === 0 ? 0 : 1 + ((c - 1) / 2) % 4; // theme, var1, theme, var2, … (4 variations)
    if (!cycles.has(key)) { const r = genLeadCycle(part, M, key === 0 ? seed : hashSeed(seed, 'var', key)); cycles.set(key, r.byBar); total = r.total; }
    return cycles.get(key);
  };
  cycleFor(0);
  return {
    get byBar() { return cycleFor(0); },
    bar(b) { const c = Math.floor(b / total); return cycleFor(c)[b % total]; },
  };
}

function genLeadCycle(part, M, seed) {
  const rng = new Rng(hashSeed(seed, 'lead', M.key, M.bpm));
  const slow = M.bpm < 100;
  const n = M.chords.length;
  const [lo, hi] = part.range ?? [64, 86];
  const all = [];
  const sectionBars = Math.max(8, n);
  for (let section = 0; section < 2; section++) {
    const A = genRhythm(rng, slow);
    const B = genRhythm(rng, slow);
    const contourA = Array.from({ length: 8 }, () => rng.weighted([1, -1, 2, -2, 3, 0], [5, 4, 2, 2, 1, 1]));
    const contourB = Array.from({ length: 8 }, () => rng.weighted([1, -1, 2, -2, -3, 0], [4, 5, 2, 2, 1, 1]));
    let pitch = lo + (section === 0 ? 5 : 10);
    const base = section * sectionBars;
    for (let p = 0; p < sectionBars; p += 2) {
      const which = (p / 2) % 4; // A A' B A''
      let onsets = which === 2 ? B : A;
      const contour = which === 2 ? contourB : contourA;
      if (which === 1) onsets = onsets.filter(t => t < 24).concat([24]); // A': land on a long note
      if (which === 3) onsets = onsets.filter(t => t < 16).concat([16]); // cadence: long tonic
      const r = realise(onsets, contour, base + p, M, part, pitch, which === 3, rng);
      all.push(...r.notes);
      pitch = r.last;
    }
  }
  const total = 2 * sectionBars;
  const byBar = Array.from({ length: total }, () => []);
  for (const nt of all) {
    const bar = Math.floor(nt.abs / 16);
    if (bar < total) byBar[bar].push({ step: nt.abs % 16, midi: Math.max(lo - 5, Math.min(hi + 5, nt.midi)), dur: nt.dur, vel: nt.vel });
  }
  return { byBar, total };
}

// ---------------------------------------------------------------------------------------------
// Build all parts for a stage.
// ---------------------------------------------------------------------------------------------
export function buildArrangement(music, seed) {
  const M = prepareMusic(music);
  const parts = music.parts.map(p => {
    let gen;
    switch (p.role) {
      case 'pad': gen = genPad(p, M); break;
      case 'bass': gen = genBass(p, M, seed); break;
      case 'drums': gen = genDrums(p, M, seed); break;
      case 'arp': gen = genArp(p, M, seed); break;
      case 'lead': gen = genLead(p, M, seed); break;
      default: throw new Error(`unknown role ${p.role}`);
    }
    return { ...p, gen };
  });
  return { M, parts };
}

// Part gain target for an intensity (smooth 0.15-wide fade-in above the threshold).
export function partLevel(threshold, intensity) {
  if (threshold <= 0) return 1;
  const x = (intensity - threshold) / 0.15;
  return Math.max(0, Math.min(1, x));
}
