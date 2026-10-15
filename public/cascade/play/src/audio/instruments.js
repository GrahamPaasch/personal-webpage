// Synthesized instruments — every sound in CASCADE is made here from oscillators, noise, FM and
// Karplus–Strong buffers. No samples, no network.
// Signature: voice(ac, out, t, midi, dur, vel, opts) where `out` is an AudioNode and t is AudioContext time.
// Pads take `notes` (array of MIDI) instead of a single midi.
import { midiToFreq } from './theory.js';

const caches = new WeakMap();
function cache(ac) {
  let c = caches.get(ac);
  if (!c) { c = { noise: null, ks: new Map(), pulse: new Map() }; caches.set(ac, c); }
  return c;
}

export function noiseBuffer(ac) {
  const c = cache(ac);
  if (c.noise) return c.noise;
  const len = ac.sampleRate * 2;
  const b = ac.createBuffer(1, len, ac.sampleRate);
  const d = b.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
  c.noise = b;
  return b;
}

// Karplus–Strong plucked string, precomputed once per (midi, brightness, decay) and cached.
function ksBuffer(ac, midi, bright = 0.5, decay = 0.996, seconds = 2.4) {
  const key = `${midi}|${bright}|${decay}|${seconds}`;
  const c = cache(ac);
  let buf = c.ks.get(key);
  if (buf) return buf;
  const sr = ac.sampleRate;
  const f = midiToFreq(midi);
  const N = Math.max(2, Math.round(sr / f));
  const len = Math.floor(sr * seconds);
  buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const ring = new Float32Array(N);
  let seed = midi * 7919 + 13;
  let lp = 0;
  for (let i = 0; i < N; i++) {
    seed = (seed * 16807) % 2147483647;
    const w = (seed / 2147483647) * 2 - 1;
    lp = lp + (w - lp) * (0.25 + 0.7 * bright); // excitation brightness
    ring[i] = lp;
  }
  let idx = 0;
  const blend = 0.5 - 0.1 * bright;
  for (let i = 0; i < len; i++) {
    const a = ring[idx], b = ring[(idx + 1) % N];
    const v = (a * (1 - blend) + b * blend) * decay;
    ring[idx] = v;
    d[i] = a;
    idx = (idx + 1) % N;
  }
  // normalise
  let peak = 0;
  for (let i = 0; i < Math.min(len, 4000); i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
  c.ks.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------------------------
function gainNode(ac, v = 0) { const g = ac.createGain(); g.gain.value = v; return g; }
function osc(ac, type, freq, t, stop) {
  const o = ac.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  o.start(t); o.stop(stop);
  return o;
}
function filt(ac, type, freq, q = 0.7) { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
// ADSR on an AudioParam. Returns release end time.
function adsr(p, t, peak, a, d, s, dur, r) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  const rel = t + Math.max(a, dur);
  p.setTargetAtTime(0.0001, rel, Math.max(0.005, r / 4));
  return rel + r;
}
function perc(p, t, peak, a, decay) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(0.0001, t + a, decay / 4);
  return t + a + decay;
}
function noiseSrc(ac, t, stop, rate = 1) {
  const s = ac.createBufferSource();
  s.buffer = noiseBuffer(ac);
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(t, Math.random() * 1.5); s.stop(stop);
  return s;
}
function vibrato(ac, param, t, stop, rate, depthCents, delay = 0.3, freq = 0) {
  const l = ac.createOscillator(); l.frequency.value = rate;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(freq ? freq * (Math.pow(2, depthCents / 1200) - 1) : depthCents, t + delay + 0.4);
  l.connect(g); g.connect(param);
  l.start(t); l.stop(stop);
}
function pan(ac, v) {
  if (!ac.createStereoPanner) return gainNode(ac, 1);
  const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, v)); return p;
}

// ---------------------------------------------------------------------------------------------
// pads (take an array of notes)
// ---------------------------------------------------------------------------------------------
function padCore(ac, out, t, notes, dur, vel, cfg) {
  const stop = t + dur + cfg.r + 0.2;
  const amp = gainNode(ac);
  const lp = filt(ac, 'lowpass', cfg.cutoff, cfg.q ?? 0.5);
  if (cfg.sweep) {
    lp.frequency.setValueAtTime(cfg.cutoff * 0.5, t);
    lp.frequency.linearRampToValueAtTime(cfg.cutoff * 1.4, t + dur * 0.6);
    lp.frequency.linearRampToValueAtTime(cfg.cutoff * 0.8, t + dur + cfg.r);
  }
  lp.connect(amp); amp.connect(out);
  const per = (vel * cfg.level) / Math.sqrt(notes.length);
  notes.forEach((m, i) => {
    const f = midiToFreq(m);
    const p = pan(ac, ((i / Math.max(1, notes.length - 1)) - 0.5) * (cfg.spread ?? 0.7));
    p.connect(lp);
    for (const [type, det, lvl, mult] of cfg.oscs) {
      const o = osc(ac, type, f * (mult ?? 1), t, stop);
      o.detune.value = det + (i % 2 ? 2 : -2);
      const g = gainNode(ac, per * lvl);
      if (cfg.vib) vibrato(ac, o.detune, t, stop, cfg.vib[0] + i * 0.13, cfg.vib[1], 0.5);
      o.connect(g); g.connect(p);
    }
  });
  return adsr(amp.gain, t, 1, cfg.a, cfg.d ?? 0.5, cfg.s ?? 0.85, dur, cfg.r);
}

function choirPad(ac, out, t, notes, dur, vel) {
  // sawtooth source through parallel vowel formants ("ah" → "oo" drift)
  const stop = t + dur + 2.2;
  const amp = gainNode(ac);
  amp.connect(out);
  const formants = [[730, 1, 8], [1090, 0.5, 9], [2440, 0.25, 12]];
  const bus = gainNode(ac, 1);
  const lp = filt(ac, 'lowpass', 3200);
  for (const [f, lvl, q] of formants) {
    const bp = filt(ac, 'bandpass', f, q);
    bp.frequency.setValueAtTime(f, t);
    bp.frequency.linearRampToValueAtTime(f * 0.82, t + dur);
    const g = gainNode(ac, lvl * 3.2);
    bus.connect(bp); bp.connect(g); g.connect(lp);
  }
  lp.connect(amp);
  const per = vel * 0.55 / Math.sqrt(notes.length);
  notes.forEach((m, i) => {
    for (const det of [-9, 0, 8]) {
      const o = osc(ac, 'sawtooth', midiToFreq(m), t, stop);
      o.detune.value = det;
      vibrato(ac, o.detune, t, stop, 4.6 + i * 0.21 + det * 0.01, 14, 0.6);
      const g = gainNode(ac, per / 3);
      o.connect(g); g.connect(bus);
    }
  });
  return adsr(amp.gain, t, 1, 1.1, 0.6, 0.9, dur, 1.8);
}

export const PADS = {
  glassPad: (ac, out, t, n, d, v) => padCore(ac, out, t, n, d, v, { oscs: [['triangle', 0, 1], ['sine', 3, 0.55, 2], ['sine', -4, 0.25, 4]], cutoff: 2600, a: 1.4, r: 2.4, level: 0.6, vib: [0.25, 6], s: 0.9 }),
  warmPad: (ac, out, t, n, d, v) => padCore(ac, out, t, n, d, v, { oscs: [['sawtooth', -7, 0.5], ['sawtooth', 7, 0.5], ['triangle', 0, 0.6, 0.5]], cutoff: 1100, a: 0.9, r: 1.6, level: 0.5, sweep: true }),
  stringPad: (ac, out, t, n, d, v) => padCore(ac, out, t, n, d, v, { oscs: [['sawtooth', -11, 0.4], ['sawtooth', 0, 0.4], ['sawtooth', 12, 0.4]], cutoff: 1500, a: 0.7, r: 1.4, level: 0.42, vib: [5.2, 9], sweep: true }),
  sawPad: (ac, out, t, n, d, v) => padCore(ac, out, t, n, d, v, { oscs: [['sawtooth', -12, 0.5], ['sawtooth', 12, 0.5], ['square', 0, 0.2, 0.5]], cutoff: 1800, q: 2, a: 0.25, r: 0.9, level: 0.45, sweep: true }),
  spacePad: (ac, out, t, n, d, v) => padCore(ac, out, t, n, d, v, { oscs: [['sawtooth', -6, 0.45], ['triangle', 5, 0.6], ['sine', 0, 0.3, 2]], cutoff: 1300, q: 3, a: 1.2, r: 2.6, level: 0.5, sweep: true, vib: [0.3, 8] }),
  choirPad,
};

// ---------------------------------------------------------------------------------------------
// melodic voices (single note)
// ---------------------------------------------------------------------------------------------
function fmVoice(ac, out, t, midi, dur, vel, { ratio = 3.5, index = 3, decay = 1.6, level = 0.5, type = 'sine', panv = 0, attack = 0.002, sus = 0 }) {
  const f = midiToFreq(midi);
  const stop = t + Math.max(dur, decay) + 0.3;
  const car = osc(ac, type, f, t, stop);
  const mod = osc(ac, 'sine', f * ratio, t, stop);
  const mg = gainNode(ac);
  mg.gain.setValueAtTime(f * index * vel, t);
  mg.gain.setTargetAtTime(f * index * 0.08, t, decay / 5);
  mod.connect(mg); mg.connect(car.frequency);
  const amp = gainNode(ac);
  const p = pan(ac, panv);
  car.connect(amp); amp.connect(p); p.connect(out);
  if (sus > 0) adsr(amp.gain, t, vel * level, attack, decay, sus, dur, decay * 0.6);
  else perc(amp.gain, t, vel * level, attack, decay);
  return stop;
}

function ksVoice(ac, out, t, midi, dur, vel, { bright = 0.5, decay = 0.996, level = 0.7, bend = 0, cutoff = 6000, panv = 0, len = 2.4 }) {
  const s = ac.createBufferSource();
  s.buffer = ksBuffer(ac, midi, bright, decay, len);
  if (bend) {
    s.playbackRate.setValueAtTime(Math.pow(2, -bend / 12), t);
    s.playbackRate.exponentialRampToValueAtTime(1, t + 0.07);
  }
  const lp = filt(ac, 'lowpass', cutoff, 0.8);
  const amp = gainNode(ac);
  const p = pan(ac, panv);
  s.connect(lp); lp.connect(amp); amp.connect(p); p.connect(out);
  amp.gain.setValueAtTime(vel * level, t);
  const end = t + Math.min(len, Math.max(dur * 1.5, 0.6));
  amp.gain.setTargetAtTime(0.0001, end - 0.15, 0.05);
  s.start(t); s.stop(end + 0.1);
  return end;
}

function subtractive(ac, out, t, midi, dur, vel, { types = ['sawtooth'], detune = 8, cutoff = 1200, env = 3000, q = 4, a = 0.005, d = 0.2, s = 0.4, r = 0.15, level = 0.4, glideFrom = 0, vib = null, panv = 0 }) {
  const f = midiToFreq(midi);
  const stop = t + dur + r + 0.3;
  const lp = filt(ac, 'lowpass', cutoff, q);
  lp.frequency.setValueAtTime(cutoff + env * vel, t);
  lp.frequency.setTargetAtTime(cutoff, t + a, d / 2);
  const amp = gainNode(ac);
  const p = pan(ac, panv);
  lp.connect(amp); amp.connect(p); p.connect(out);
  types.forEach((type, i) => {
    const o = osc(ac, type, f, t, stop);
    o.detune.value = (i - (types.length - 1) / 2) * detune;
    if (glideFrom) { o.frequency.setValueAtTime(midiToFreq(midi + glideFrom), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); }
    if (vib) vibrato(ac, o.detune, t, stop, vib[0], vib[1], vib[2] ?? 0.25);
    const g = gainNode(ac, 1 / types.length);
    o.connect(g); g.connect(lp);
  });
  return adsr(amp.gain, t, vel * level, a, d, s, dur, r);
}

function marimba(ac, out, t, midi, dur, vel, { level = 0.6, panv = 0 } = {}) {
  const f = midiToFreq(midi);
  const stop = t + 1.4;
  const amp = gainNode(ac);
  const p = pan(ac, panv);
  amp.connect(p); p.connect(out);
  const parts = [[1, 1, 0.9], [3.93, 0.35, 0.18], [9.2, 0.12, 0.06]];
  for (const [m, l, dcy] of parts) {
    const o = osc(ac, 'sine', f * m, t, stop);
    const g = gainNode(ac);
    perc(g.gain, t, l * vel * level, 0.002, dcy * (midi < 60 ? 1.4 : 1));
    o.connect(g); g.connect(amp);
  }
  amp.gain.value = 1;
  // mallet click
  const n = noiseSrc(ac, t, t + 0.03, 1);
  const bp = filt(ac, 'bandpass', f * 4, 3);
  const ng = gainNode(ac);
  perc(ng.gain, t, 0.08 * vel, 0.001, 0.02);
  n.connect(bp); bp.connect(ng); ng.connect(amp);
  return stop;
}

function kalimba(ac, out, t, midi, dur, vel, { level = 0.55, panv = 0 } = {}) {
  const f = midiToFreq(midi);
  const stop = t + 2.2;
  const amp = gainNode(ac, 1);
  const p = pan(ac, panv);
  amp.connect(p); p.connect(out);
  const o1 = osc(ac, 'sine', f, t, stop);
  const g1 = gainNode(ac); perc(g1.gain, t, vel * level, 0.002, 1.8);
  const o2 = osc(ac, 'sine', f * 5.95, t, stop);
  const g2 = gainNode(ac); perc(g2.gain, t, vel * level * 0.22, 0.001, 0.12);
  const o3 = osc(ac, 'triangle', f * 2, t, stop);
  const g3 = gainNode(ac); perc(g3.gain, t, vel * level * 0.12, 0.002, 0.5);
  o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(amp); g2.connect(amp); g3.connect(amp);
  return stop;
}

function whale(ac, out, t, midi, dur, vel, { level = 0.45 } = {}) {
  // long gliding song: scoop up from below, hold with slow wide vibrato, fall off at the end
  const f = midiToFreq(midi);
  const len = Math.max(0.6, dur);
  const stop = t + len + 1.6;
  const o = osc(ac, 'triangle', f, t, stop);
  const o2 = osc(ac, 'sine', f * 2.003, t, stop);
  o.frequency.setValueAtTime(f * 0.84, t);
  o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.45, len * 0.4));
  o.frequency.setValueAtTime(f, t + len);
  o.frequency.exponentialRampToValueAtTime(f * 0.78, t + len + 1.2);
  o2.frequency.setValueAtTime(f * 1.68, t);
  o2.frequency.exponentialRampToValueAtTime(f * 2.003, t + Math.min(0.45, len * 0.4));
  vibrato(ac, o.detune, t, stop, 3.1, 22, 0.4);
  const bp = filt(ac, 'bandpass', f * 2.2, 0.8);
  const lp = filt(ac, 'lowpass', 2400);
  const amp = gainNode(ac);
  const g2 = gainNode(ac, 0.18);
  o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(lp); lp.connect(amp); amp.connect(out);
  adsr(amp.gain, t, vel * level * 1.6, 0.35, 0.4, 0.8, len, 1.2);
  return stop;
}

function ney(ac, out, t, midi, dur, vel, { level = 0.4 } = {}) {
  const f = midiToFreq(midi);
  const stop = t + dur + 0.6;
  const amp = gainNode(ac);
  amp.connect(out);
  const o = osc(ac, 'sine', f, t, stop);
  const o2 = osc(ac, 'triangle', f * 2, t, stop);
  o.frequency.setValueAtTime(f * 0.97, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  vibrato(ac, o.detune, t, stop, 5.4, 18, 0.35);
  const g2 = gainNode(ac, 0.12);
  o2.connect(g2); g2.connect(amp);
  o.connect(amp);
  // breath
  const n = noiseSrc(ac, t, stop);
  const bp = filt(ac, 'bandpass', f * 2, 2.5);
  const ng = gainNode(ac);
  adsr(ng.gain, t, 0.6, 0.05, 0.2, 0.35, dur, 0.3);
  n.connect(bp); bp.connect(ng); ng.connect(amp);
  adsr(amp.gain, t, vel * level, 0.12, 0.3, 0.8, dur, 0.35);
  return stop;
}

function celesta(ac, out, t, midi, dur, vel, o = {}) {
  fmVoice(ac, out, t, midi, dur, vel, { ratio: 4, index: 1.2, decay: 1.4, level: (o.level ?? 0.4), panv: o.panv ?? 0 });
  return fmVoice(ac, out, t, midi + 12, dur, vel * 0.4, { ratio: 1, index: 0.3, decay: 0.6, level: (o.level ?? 0.4) * 0.5, panv: -(o.panv ?? 0) });
}

export const VOICES = {
  fmBell: (ac, out, t, m, d, v, o = {}) => fmVoice(ac, out, t, m, d, v, { ratio: 3.5, index: 2.2, decay: 2.2, level: 0.42, ...o }),
  celesta,
  marimba,
  kalimba,
  whale,
  ney,
  oud: (ac, out, t, m, d, v, o = {}) => ksVoice(ac, out, t, m, d, v, { bright: 0.75, decay: 0.994, level: 0.75, bend: 0.6, cutoff: 3800, ...o }),
  glassPluck: (ac, out, t, m, d, v, o = {}) => {
    ksVoice(ac, out, t, m, d, v, { bright: 0.9, decay: 0.997, level: 0.35, cutoff: 7000, len: 1.6, ...o });
    return fmVoice(ac, out, t, m + 12, d, v, { ratio: 2, index: 0.6, decay: 0.9, level: 0.18, ...o });
  },
  woodBass: (ac, out, t, m, d, v) => {
    ksVoice(ac, out, t, m, d, v, { bright: 0.3, decay: 0.993, level: 0.9, cutoff: 1400, len: 1.6 });
    return subtractive(ac, out, t, m, Math.min(d, 0.4), v, { types: ['sine'], cutoff: 400, env: 200, q: 0.5, a: 0.004, d: 0.25, s: 0.3, r: 0.2, level: 0.55 });
  },
  subBass: (ac, out, t, m, d, v) => subtractive(ac, out, t, m, d, v, { types: ['sine', 'triangle'], detune: 0, cutoff: 320, env: 260, q: 0.6, a: 0.03, d: 0.4, s: 0.85, r: 0.35, level: 0.85 }),
  droneBass: (ac, out, t, m, d, v) => subtractive(ac, out, t, m, d, v, { types: ['sawtooth', 'sine'], detune: 6, cutoff: 380, env: 300, q: 2, a: 0.9, d: 1, s: 0.9, r: 1.5, level: 0.6, vib: [0.2, 7, 1] }),
  sawBass: (ac, out, t, m, d, v) => subtractive(ac, out, t, m, d, v, { types: ['sawtooth', 'square'], detune: 5, cutoff: 320, env: 1600, q: 6, a: 0.004, d: 0.14, s: 0.35, r: 0.08, level: 0.5 }),
  squareArp: (ac, out, t, m, d, v, o = {}) => subtractive(ac, out, t, m, d, v, { types: ['square'], cutoff: 1400, env: 3200, q: 3, a: 0.003, d: 0.09, s: 0.2, r: 0.12, level: 0.4, panv: o.panv ?? ((m % 5) - 2) * 0.18 }),
  squarePluck: (ac, out, t, m, d, v, o = {}) => subtractive(ac, out, t, m, d, v, { types: ['square', 'sawtooth'], detune: 10, cutoff: 1800, env: 4500, q: 4, a: 0.002, d: 0.12, s: 0.1, r: 0.2, level: 0.32, ...o }),
  neonStab: (ac, out, t, m, d, v, o = {}) => subtractive(ac, out, t, m, d, v, { types: ['sawtooth', 'sawtooth'], detune: 14, cutoff: 1200, env: 5000, q: 6, a: 0.003, d: 0.16, s: 0.15, r: 0.25, level: 0.3, ...o }),
  resoArp: (ac, out, t, m, d, v, o = {}) => subtractive(ac, out, t, m, d, v, { types: ['sawtooth'], cutoff: 700, env: 4200, q: 11, a: 0.003, d: 0.12, s: 0.15, r: 0.18, level: 0.4, panv: o.panv ?? ((m % 7) - 3) * 0.15 }),
  resoStab: (ac, out, t, m, d, v, o = {}) => subtractive(ac, out, t, m, d, v, { types: ['sawtooth', 'triangle'], detune: 9, cutoff: 900, env: 3800, q: 9, a: 0.003, d: 0.2, s: 0.2, r: 0.4, level: 0.3, ...o }),
  neonLead: (ac, out, t, m, d, v) => subtractive(ac, out, t, m, d, v, { types: ['sawtooth', 'sawtooth'], detune: 11, cutoff: 1500, env: 1800, q: 2, a: 0.02, d: 0.3, s: 0.7, r: 0.3, level: 0.42, glideFrom: -1, vib: [5.5, 16, 0.35] }),
  spaceLead: (ac, out, t, m, d, v) => subtractive(ac, out, t, m, d, v, { types: ['sine', 'triangle'], detune: 4, cutoff: 2600, env: 800, q: 1, a: 0.06, d: 0.4, s: 0.8, r: 0.6, level: 0.6, glideFrom: -2, vib: [4.8, 22, 0.3] }),
};

// ---------------------------------------------------------------------------------------------
// percussion
// ---------------------------------------------------------------------------------------------
function noiseHit(ac, out, t, vel, { type = 'highpass', freq = 7000, q = 0.7, decay = 0.05, level = 0.3, attack = 0.001, panv = 0, rate = 1 }) {
  const n = noiseSrc(ac, t, t + decay + attack + 0.1, rate);
  const f = filt(ac, type, freq, q);
  const g = gainNode(ac);
  const p = pan(ac, panv);
  n.connect(f); f.connect(g); g.connect(p); p.connect(out);
  return perc(g.gain, t, vel * level, attack, decay);
}
function toneHit(ac, out, t, vel, { f0 = 150, f1 = 45, sweep = 0.08, decay = 0.4, level = 0.9, type = 'sine' }) {
  const o = osc(ac, type, f0, t, t + decay + 0.1);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  const g = gainNode(ac);
  o.connect(g); g.connect(out);
  return perc(g.gain, t, vel * level, 0.002, decay);
}

export const DRUMS = {
  kick: (ac, out, t, v) => { toneHit(ac, out, t, v, { f0: 140, f1: 42, sweep: 0.09, decay: 0.42, level: 1 }); noiseHit(ac, out, t, v, { type: 'lowpass', freq: 1800, decay: 0.012, level: 0.25 }); },
  snare: (ac, out, t, v) => { toneHit(ac, out, t, v, { f0: 240, f1: 180, sweep: 0.05, decay: 0.12, level: 0.35, type: 'triangle' }); noiseHit(ac, out, t, v, { type: 'bandpass', freq: 3200, q: 0.6, decay: 0.18, level: 0.45 }); },
  clap: (ac, out, t, v) => { for (let i = 0; i < 3; i++) noiseHit(ac, out, t + i * 0.011, v * (i === 2 ? 1 : 0.6), { type: 'bandpass', freq: 1500, q: 1.2, decay: i === 2 ? 0.16 : 0.02, level: 0.5 }); },
  hat: (ac, out, t, v) => noiseHit(ac, out, t, v, { type: 'highpass', freq: 8000, decay: 0.035, level: 0.22, panv: 0.25 }),
  hat2: (ac, out, t, v) => noiseHit(ac, out, t, v, { type: 'highpass', freq: 9500, decay: 0.025, level: 0.14, panv: -0.3 }),
  ohat: (ac, out, t, v) => noiseHit(ac, out, t, v, { type: 'highpass', freq: 7000, decay: 0.25, level: 0.16, panv: 0.2 }),
  shaker: (ac, out, t, v) => noiseHit(ac, out, t, v, { type: 'bandpass', freq: 6500, q: 1.5, decay: 0.06, attack: 0.012, level: 0.3, panv: 0.35 }),
  rim: (ac, out, t, v) => { toneHit(ac, out, t, v, { f0: 1700, f1: 1650, sweep: 0.01, decay: 0.03, level: 0.25, type: 'square' }); noiseHit(ac, out, t, v, { type: 'bandpass', freq: 2500, q: 4, decay: 0.02, level: 0.2 }); },
  woodblock: (ac, out, t, v) => { toneHit(ac, out, t, v, { f0: 880, f1: 860, sweep: 0.01, decay: 0.07, level: 0.32 }); toneHit(ac, out, t, v, { f0: 1760, f1: 1700, sweep: 0.01, decay: 0.03, level: 0.12 }); },
  tom: (ac, out, t, v) => toneHit(ac, out, t, v, { f0: 210, f1: 110, sweep: 0.12, decay: 0.35, level: 0.55 }),
  doum: (ac, out, t, v) => { toneHit(ac, out, t, v, { f0: 120, f1: 68, sweep: 0.06, decay: 0.45, level: 0.9 }); noiseHit(ac, out, t, v, { type: 'lowpass', freq: 600, decay: 0.05, level: 0.3 }); },
  tek: (ac, out, t, v) => { noiseHit(ac, out, t, v, { type: 'bandpass', freq: 3400, q: 2, decay: 0.04, level: 0.45, panv: 0.15 }); toneHit(ac, out, t, v, { f0: 620, f1: 560, sweep: 0.02, decay: 0.05, level: 0.15 }); },
  riq: (ac, out, t, v) => { noiseHit(ac, out, t, v, { type: 'bandpass', freq: 9000, q: 3, decay: 0.09, level: 0.25, panv: -0.3 }); },
};

// ---------------------------------------------------------------------------------------------
// effects & SFX
// ---------------------------------------------------------------------------------------------
export function cymbalSwell(ac, out, t, dur, vel = 0.5, reverse = true) {
  const n = noiseSrc(ac, t, t + dur + 0.6);
  const hp = filt(ac, 'highpass', 5000, 0.5);
  const g = gainNode(ac);
  n.connect(hp); hp.connect(g); g.connect(out);
  if (reverse) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, t + dur);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
    hp.frequency.setValueAtTime(2500, t);
    hp.frequency.exponentialRampToValueAtTime(9000, t + dur);
  } else {
    g.gain.setValueAtTime(vel * 0.3, t);
    g.gain.setTargetAtTime(0.0001, t + 0.01, dur / 3);
  }
  return t + dur + 0.6;
}

export function riser(ac, out, t, dur, vel = 0.4) {
  const n = noiseSrc(ac, t, t + dur + 0.3);
  const bp = filt(ac, 'bandpass', 400, 4);
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
  const g = gainNode(ac);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + dur);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
  n.connect(bp); bp.connect(g); g.connect(out);
}

// Reversed swell (hold): a chord that fades IN and cuts off — sounds like a tape reversed.
export function reverseSwell(ac, out, t, notes, dur, vel = 0.5) {
  const amp = gainNode(ac);
  const lp = filt(ac, 'lowpass', 600, 1);
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.exponentialRampToValueAtTime(5000, t + dur);
  lp.connect(amp); amp.connect(out);
  for (const m of notes) {
    const o = osc(ac, 'sawtooth', midiToFreq(m), t, t + dur + 0.1);
    const o2 = osc(ac, 'triangle', midiToFreq(m + 12), t, t + dur + 0.1);
    const g = gainNode(ac, 0.5 / notes.length);
    o.connect(g); o2.connect(g); g.connect(lp);
  }
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vel * 0.5, t + dur);
  amp.gain.setTargetAtTime(0.0001, t + dur, 0.015);
}

// Impact for hard drop / lock, flavoured per stage.
export const IMPACTS = {
  softThud: (ac, out, t, m, v) => { toneHit(ac, out, t, v, { f0: midiToFreq(m) * 2, f1: midiToFreq(m), sweep: 0.05, decay: 0.5, level: 0.7 }); noiseHit(ac, out, t, v, { type: 'lowpass', freq: 900, decay: 0.08, level: 0.25 }); },
  woodThud: (ac, out, t, m, v) => { marimba(ac, out, t, m + 12, 0.3, v, { level: 0.5 }); toneHit(ac, out, t, v, { f0: midiToFreq(m) * 2, f1: midiToFreq(m), sweep: 0.04, decay: 0.3, level: 0.6 }); },
  frameDrum: (ac, out, t, m, v) => { toneHit(ac, out, t, v, { f0: midiToFreq(m) * 2.2, f1: midiToFreq(m), sweep: 0.05, decay: 0.4, level: 0.8 }); noiseHit(ac, out, t, v, { type: 'bandpass', freq: 900, q: 1, decay: 0.06, level: 0.3 }); },
  synthKick: (ac, out, t, m, v) => { toneHit(ac, out, t, v, { f0: midiToFreq(m) * 4, f1: midiToFreq(m), sweep: 0.07, decay: 0.35, level: 0.85 }); noiseHit(ac, out, t, v, { type: 'highpass', freq: 3000, decay: 0.03, level: 0.2 }); },
  iceThud: (ac, out, t, m, v) => { toneHit(ac, out, t, v, { f0: midiToFreq(m) * 2, f1: midiToFreq(m), sweep: 0.05, decay: 0.45, level: 0.6 }); fmVoice(ac, out, t, m + 36, 0.2, v, { ratio: 5.1, index: 1.5, decay: 0.5, level: 0.15 }); },
  subThud: (ac, out, t, m, v) => { toneHit(ac, out, t, v, { f0: midiToFreq(m) * 3, f1: midiToFreq(m) * 0.5, sweep: 0.15, decay: 0.7, level: 0.85 }); },
};

export function tick(ac, out, t, vel, freq = 5200) { noiseHit(ac, out, t, vel, { type: 'bandpass', freq, q: 6, decay: 0.018, level: 0.35 }); }
export function blip(ac, out, t, midi, vel) { return fmVoice(ac, out, t, midi, 0.1, vel, { ratio: 1, index: 0.2, decay: 0.12, level: 0.2 }); }

// T-spin shimmer: a fast glittering cluster of high bells.
export function shimmer(ac, out, t, notes, vel = 0.6) {
  notes.forEach((m, i) => fmVoice(ac, out, t + i * 0.035, m, 0.2, vel * (1 - i * 0.05), { ratio: 5.01, index: 1.4, decay: 1.2, level: 0.22, panv: (i % 2 ? 1 : -1) * 0.6 }));
  noiseHit(ac, out, t, vel, { type: 'highpass', freq: 9000, decay: 0.6, attack: 0.05, level: 0.08 });
}

export function play(name, ac, out, t, midi, dur, vel, opts) {
  const v = VOICES[name];
  if (v) return v(ac, out, t, midi, dur, vel, opts);
  return VOICES.fmBell(ac, out, t, midi, dur, vel, opts);
}
