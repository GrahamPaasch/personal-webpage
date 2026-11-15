/**
 * audio.js: everything heard, made with the Web Audio API. There are no sound files.
 *
 *   the air      wind in two slow, unrelated streams (left and right), and the hiss of a whole
 *                forest; both swell and fade with the gusts
 *   the maple    leaves rustling in the tree over the viewer's left shoulder, placed in space
 *   birds        chickadees close by, a white-throated sparrow, a jay, crows far off, a
 *                woodpecker drumming. They fall silent when a dragon is near, and for a while
 *                after a roar.
 *   the dragons  each wingbeat (a rush of air, and under it a thump that is only heard close),
 *                the hiss of a glide, and now and then a roar that comes back off the hills.
 *                Each dragon is a point in space: louder as it comes, duller with distance,
 *                late by the time sound takes to arrive, and a little higher in pitch coming
 *                than going.
 *
 * Browsers only start sound after a tap, click or key press: unlock() must be called from one.
 * Nothing here may stop the picture: main.js calls every method inside a try.
 *
 * The graph is built by attach(), which also takes an OfflineAudioContext, so the tools can
 * render each sound to numbers and check it (tools/sound-check.mjs): nobody can listen to a
 * headless test.
 */

import { makeRng, clamp } from './rng.js';
import { HERO_TREES } from './world.js';

export const SPEED_OF_SOUND = 343;

/** Loudness of each part with everything at full, set from offline renders (see README). */
export const LEVEL = {
  master: 0.9,
  wind: 0.2,
  forest: 0.04,
  maple: 0.26,
  birds: 0.5,
  wing: 1.25,
  thump: 2.2,
  rush: 0.25,
  roar: 1.15,
  whistle: 0.07,
  reverb: 0.55,
  echo: 0.4,
};

/**
 * A roar carries: it is not twenty times quieter from across the lake than from overhead, as a
 * wingbeat is. Its strength at the source is scaled by this, by how far off the dragon is, so
 * that a far one is still heard (but far), and a near one does not hurt.
 */
export function roarReach(distance) {
  return clamp(distance / 60, 0.45, 2.4);
}

/** How a dragon's sounds fall off with distance: full at `ref` metres, then roughly 1/distance. */
const DRAGON_FALLOFF = { ref: 14, rolloff: 1.1 };
const BIRD_FALLOFF = { ref: 12, rolloff: 1 };

/** Birds keep quiet while a dragon is nearer than this, and until it is this far away again. */
const HUSH_NEAR = 75;
const HUSH_FAR = 115;

/** Sound from `distance` metres away arrives this much later (capped: a late wingbeat is fine, a second late is not). */
export function soundDelay(distance) {
  return Math.min(Math.max(distance, 0) / SPEED_OF_SOUND, 0.9);
}

/** Pitch ratio heard from a source moving away at `radial` m/s (negative: coming closer). */
export function dopplerRatio(radial) {
  return SPEED_OF_SOUND / (SPEED_OF_SOUND + clamp(radial, -60, 60));
}

/** Air takes the top off distant sounds: the cutoff (Hz) of the low-pass for a distance. */
export function airCutoff(distance) {
  return 16000 / (1 + Math.max(distance, 0) / 55);
}

/** Gain of the standard "inverse" distance model. */
export function falloffGain(distance, falloff) {
  const d = Math.max(distance, falloff.ref);
  return falloff.ref / (falloff.ref + falloff.rolloff * (d - falloff.ref));
}

// ---------------------------------------------------------------------------------------------
// Bird calls. Each is a list of notes, so that it can be tested without a sound card:
//   { t: start (s), d: length (s), f0, f1: pitch at the start and the end (Hz), gain,
//     kind: 'tone' (a whistle) | 'buzz' (a reedy note with a band of overtones round `band`) |
//           'knock' (a tap on wood), rough: rattle rate in Hz (0 = none), band, q }
// ---------------------------------------------------------------------------------------------

export const BIRD_KINDS = ['chickadeeSong', 'chickadeeCall', 'sparrow', 'jay', 'crow', 'woodpecker'];

export function birdNotes(kind, rng) {
  const notes = [];
  const tone = (t, d, f0, f1, gain) => notes.push({ t, d, f0, f1: f1 === undefined ? f0 : f1, gain: gain === undefined ? 1 : gain, kind: 'tone', rough: 0 });
  if (kind === 'chickadeeSong') {
    // "Fee-bee": two clear whistles, the second a step lower and with a catch in the middle.
    const f = 3900 + 250 * rng();
    const repeats = rng() < 0.45 ? 2 : 1;
    for (let r = 0; r < repeats; r++) {
      const t = r * 2.3;
      tone(t, 0.37, f, f - 90);
      tone(t + 0.48, 0.17, f * 0.87);
      tone(t + 0.68, 0.21, f * 0.87);
    }
  } else if (kind === 'chickadeeCall') {
    // "Chick-a-dee-dee-dee": two quick falling chips, then a few reedy notes.
    tone(0, 0.05, 7000, 4600, 0.8);
    tone(0.09, 0.06, 6100, 4000, 0.8);
    const dees = 3 + rng.int(3);
    for (let i = 0; i < dees; i++) notes.push({ t: 0.21 + i * 0.17, d: 0.125, f0: 430, f1: 415, gain: 0.9, kind: 'buzz', band: 3700, q: 2.2, rough: 0 });
  } else if (kind === 'sparrow') {
    // White-throated sparrow: two long whistles and then triplets on one note.
    const f = 2750 + 200 * rng();
    tone(0, 0.52, f, f + 25, 0.9);
    tone(0.66, 0.5, f * 1.26, f * 1.26 + 20, 0.9);
    let t = 1.3;
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 3; i++) {
        tone(t, i === 0 ? 0.15 : 0.1, f * 1.26, undefined, 0.85);
        t += i === 0 ? 0.18 : 0.13;
      }
      t += 0.05;
    }
  } else if (kind === 'jay') {
    // Blue jay: "jeer, jeer", harsh and falling.
    const n = 2 + rng.int(2);
    for (let i = 0; i < n; i++) notes.push({ t: i * 0.52, d: 0.3, f0: 2950, f1: 2250, gain: 0.9, kind: 'buzz', band: 3000, q: 1.3, rough: 95 });
  } else if (kind === 'crow') {
    // Crows, far off: three or four caws.
    const n = 3 + rng.int(2);
    const f = 540 + 80 * rng();
    for (let i = 0; i < n; i++) notes.push({ t: i * 0.47, d: 0.27, f0: f, f1: f * 0.82, gain: 1, kind: 'buzz', band: 1350, q: 1.6, rough: 64 });
  } else if (kind === 'woodpecker') {
    // A drum roll on a dead limb: fast, and dying away.
    let t = 0;
    const taps = 13 + rng.int(6);
    for (let i = 0; i < taps; i++) {
      notes.push({ t, d: 0.014, f0: 1150, f1: 1150, gain: 1 - 0.55 * (i / taps), kind: 'knock', band: 1150, q: 7, rough: 0 });
      t += 0.05 + 0.0012 * i;
    }
  }
  return notes;
}

/** Strength of each kind at the bird, set from offline renders so that all sit at a similar level in the ear. */
const BIRD_LOUDNESS = { chickadeeSong: 0.13, chickadeeCall: 0.42, sparrow: 0.3, jay: 1.3, crow: 9, woodpecker: 11 };

/** How long a list of notes lasts. */
export function notesLength(notes) {
  let end = 0;
  for (const n of notes) end = Math.max(end, n.t + n.d);
  return end;
}

/**
 * Where a bird of each kind sits: [x, y, z] in the world. Chickadees are in the trees by the
 * ledge, crows far across the valley, the rest in the woods behind and on the slopes.
 */
export function birdPlace(kind, rng) {
  if (kind === 'chickadeeSong' || kind === 'chickadeeCall') {
    const tree = HERO_TREES[rng.int(HERO_TREES.length)];
    return [tree.x + rng.range(-2, 2), tree.height - rng.range(2, 6), tree.z + rng.range(-2, 2)];
  }
  if (kind === 'crow') {
    const a = rng.range(-1.9, 1.9); // somewhere over the valley
    const d = rng.range(160, 320);
    return [Math.sin(a) * d, rng.range(-10, 40), -Math.cos(a) * d];
  }
  // In the woods behind (more often) or down the slopes to either side.
  const behind = rng() < 0.6;
  const a = behind ? Math.PI + rng.range(-1.1, 1.1) : rng.sign() * rng.range(0.9, 1.7);
  const d = kind === 'woodpecker' ? rng.range(55, 120) : rng.range(28, 80);
  return [Math.sin(a) * d, behind ? rng.range(4, 14) : rng.range(-30, -6), -Math.cos(a) * d];
}

// ---------------------------------------------------------------------------------------------

function makeNoise(ctx, seconds, seed) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = makeRng(seed);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

/** The echo of the valley as a convolver's impulse: a few slaps off the hills, then a tail that dulls as it dies. */
function makeImpulse(ctx, seconds, seed) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const rng = makeRng(seed);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      // Slow to start (the hills are far), then dying away over a second or so.
      const env = (1 - Math.exp(-t / 0.05)) * Math.exp(-t / 0.5);
      // The tail loses its top: a low-pass that closes with time.
      const k = 0.5 * Math.exp(-t / 0.5) + 0.04;
      low += k * (rng() * 2 - 1 - low);
      data[i] = low * env;
    }
    // Slaps off the near hillsides, a different set for each ear.
    for (const [at, gain] of c === 0 ? [[0.21, 0.5], [0.47, 0.32], [0.83, 0.2]] : [[0.27, 0.45], [0.55, 0.3], [0.71, 0.22]]) {
      const start = Math.floor(at * rate);
      for (let i = 0; i < 400 && start + i < length; i++) data[start + i] += gain * (rng() * 2 - 1) * Math.exp(-i / 90);
    }
  }
  return buffer;
}

/** A soft clipper: adds the grit of a throat to a plain oscillator. */
function makeGrit(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

function setPosition(node, x, y, z, until) {
  if (node.positionX) {
    node.positionX.linearRampToValueAtTime(x, until);
    node.positionY.linearRampToValueAtTime(y, until);
    node.positionZ.linearRampToValueAtTime(z, until);
  } else if (node.setPosition) {
    node.setPosition(x, y, z);
  }
}

function placeNow(node, x, y, z) {
  if (node.positionX) {
    node.positionX.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
  } else if (node.setPosition) {
    node.setPosition(x, y, z);
  }
}

/** One dragon's sounds, all through one point in space. */
class DragonVoice {
  constructor(board, index, size) {
    const ctx = board.ctx;
    this.board = board;
    this.index = index;
    this.size = size;
    this.distance = 200;
    this.doppler = 1;
    this.placed = false;
    // Lower and longer for the big one.
    this.pitch = 1 / Math.pow(size, 1.4);

    this.panner = ctx.createPanner();
    this.panner.panningModel = board.options.hrtf ? 'HRTF' : 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = DRAGON_FALLOFF.ref;
    this.panner.rolloffFactor = DRAGON_FALLOFF.rolloff;
    this.panner.maxDistance = 10000;
    this.panner.connect(board.master);
    // What the air does to it on the way.
    this.air = ctx.createBiquadFilter();
    this.air.type = 'lowpass';
    this.air.frequency.value = 6000;
    this.air.Q.value = 0.5;
    this.air.connect(this.panner);

    const noise = ctx.createBufferSource();
    noise.buffer = board.noise;
    noise.loop = true;
    noise.loopStart = index * 0.7;
    this.noise = noise;

    // A wingbeat: a band of noise that opens and closes, sliding down as the wing slows.
    this.wingBand = ctx.createBiquadFilter();
    this.wingBand.type = 'bandpass';
    this.wingBand.frequency.value = 300;
    this.wingBand.Q.value = 0.9;
    this.wingGain = ctx.createGain();
    this.wingGain.gain.value = 0;
    noise.connect(this.wingBand).connect(this.wingGain).connect(this.air);
    // The thump of air under it.
    this.thumpLow = ctx.createBiquadFilter();
    this.thumpLow.type = 'lowpass';
    this.thumpLow.frequency.value = 95 * this.pitch;
    this.thumpLow.Q.value = 1.2;
    this.thumpGain = ctx.createGain();
    this.thumpGain.gain.value = 0;
    noise.connect(this.thumpLow).connect(this.thumpGain).connect(this.air);
    // The hiss of its passage through the air: all there is to hear in a glide.
    this.rushBand = ctx.createBiquadFilter();
    this.rushBand.type = 'bandpass';
    this.rushBand.frequency.value = 400;
    this.rushBand.Q.value = 0.8;
    this.rushGain = ctx.createGain();
    this.rushGain.gain.value = 0;
    noise.connect(this.rushBand).connect(this.rushGain).connect(this.air);
    noise.start();

    // Roars arrive here; part of each goes to the hills and comes back.
    this.roarIn = ctx.createGain();
    this.roarIn.connect(this.air);
    this.roarSend = ctx.createGain();
    this.roarSend.gain.value = 1;
    this.roarIn.connect(this.roarSend);
    this.roarSend.connect(board.reverbIn);
    this.roarSend.connect(board.echoIn);
  }

  /** Where it is and how it is moving; called every frame. */
  move(x, y, z, speed, radial, distance, now, dt) {
    const until = now + Math.max(dt, 0.005);
    if (this.placed) setPosition(this.panner, x, y, z, until);
    else placeNow(this.panner, x, y, z);
    this.placed = true;
    this.distance = distance;
    this.doppler = dopplerRatio(radial);
    this.air.frequency.setTargetAtTime(airCutoff(distance), now, 0.1);
    // What comes back off the hills fades with distance too, but more slowly than what comes straight.
    this.roarSend.gain.setTargetAtTime(Math.pow(falloffGain(distance, DRAGON_FALLOFF), 0.75), now, 0.1);
    const rush = clamp((speed - 9) / 19, 0, 1);
    this.rushGain.gain.setTargetAtTime(LEVEL.rush * rush * rush * this.size, now, 0.15);
    this.rushBand.frequency.setTargetAtTime((160 + 14 * speed) * this.pitch * this.doppler, now, 0.1);
  }

  /** One downstroke. strength 0..1. `when`: audio-clock time at which it happens (not heard). */
  beat(strength, when) {
    const t = when + soundDelay(this.distance);
    const s = clamp(strength, 0.3, 1);
    const k = this.pitch * this.doppler;
    const long = this.size;
    const g = this.wingGain.gain;
    g.setTargetAtTime(LEVEL.wing * s * this.size, t, 0.035 * long);
    g.setTargetAtTime(0, t + 0.11 * long, 0.12 * long);
    const f = this.wingBand.frequency;
    f.setValueAtTime(520 * k, t);
    f.exponentialRampToValueAtTime(190 * k, t + 0.42 * long);
    const b = this.thumpGain.gain;
    b.setTargetAtTime(LEVEL.thump * s * this.size, t + 0.02, 0.02);
    b.setTargetAtTime(0, t + 0.09 * long, 0.07 * long);
    this.board.stats.beats++;
  }

  /**
   * A roar, about `seconds` long. kind: 'far' (thrown across the valley) or 'call' (it has been
   * called and is close: less of it).
   */
  roar(kind, when, seconds) {
    const ctx = this.board.ctx;
    const t = when + soundDelay(this.distance);
    const len = seconds;
    const out = ctx.createGain();
    out.gain.value = 0;
    // One that has been called is roaring at the viewer: more of it.
    const peak = LEVEL.roar * roarReach(this.distance) * (kind === 'far' ? 1 : 2.3);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(peak * 0.8, t + 0.1);
    out.gain.linearRampToValueAtTime(peak, t + len * 0.4);
    out.gain.setTargetAtTime(0, t + len * 0.68, len * 0.12);
    out.connect(this.roarIn);

    // The voice: two saws a hair apart and a square an octave down, falling in pitch.
    const base = 96 * this.pitch * this.doppler;
    const grit = ctx.createWaveShaper();
    grit.curve = makeGrit(2.6);
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    mix.connect(grit);
    const sources = [];
    // A throat is not a steady reed: slow noise shakes the pitch, a few percent either way.
    const wander = ctx.createBufferSource();
    wander.buffer = this.board.noise;
    wander.loop = true;
    wander.playbackRate.value = 0.5;
    const wanderLow = ctx.createBiquadFilter();
    wanderLow.type = 'lowpass';
    wanderLow.frequency.value = 22;
    const wanderDepth = ctx.createGain();
    wanderDepth.gain.value = base * 1.1;
    wander.connect(wanderLow).connect(wanderDepth);
    sources.push(wander);
    for (const [type, ratio, level] of [['sawtooth', 1, 0.5], ['sawtooth', 1.012, 0.5], ['square', 0.5, 0.24], ['sawtooth', 1.5, 0.2]]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      wanderDepth.connect(osc.frequency);
      const f = osc.frequency;
      f.setValueAtTime(base * ratio * 0.86, t);
      f.linearRampToValueAtTime(base * ratio * 1.3, t + len * 0.16);
      f.linearRampToValueAtTime(base * ratio * 1.12, t + len * 0.5);
      f.linearRampToValueAtTime(base * ratio * 0.66, t + len);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(mix);
      sources.push(osc);
    }
    // Breath.
    const breath = ctx.createBufferSource();
    breath.buffer = this.board.noise;
    breath.loop = true;
    const breathBand = ctx.createBiquadFilter();
    breathBand.type = 'bandpass';
    breathBand.frequency.value = 1500 * this.pitch;
    breathBand.Q.value = 0.7;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.3;
    breath.connect(breathBand).connect(breathGain);
    sources.push(breath);

    // The throat: a low body and three resonances that open with the jaw and close again.
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 260 * this.pitch;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.3;
    grit.connect(body).connect(bodyGain);
    // The growl: the whole voice shakes thirty-odd times a second.
    const shake = ctx.createGain();
    shake.gain.value = 0.62;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.setValueAtTime(27 * this.pitch, t);
    lfo.frequency.linearRampToValueAtTime(38 * this.pitch, t + len * 0.4);
    lfo.frequency.linearRampToValueAtTime(22 * this.pitch, t + len);
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.38;
    lfo.connect(lfoDepth).connect(shake.gain);
    sources.push(lfo);
    bodyGain.connect(shake);
    breathGain.connect(shake);
    for (const [f0, f1, q, level] of [[380, 620, 1.8, 1.7], [950, 1350, 2.4, 1.5], [2100, 2600, 3, 0.9]]) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = q;
      band.frequency.setValueAtTime(f0 * this.pitch, t);
      band.frequency.linearRampToValueAtTime(f1 * this.pitch, t + len * 0.35);
      band.frequency.linearRampToValueAtTime(f0 * this.pitch * 0.9, t + len);
      const g = ctx.createGain();
      g.gain.value = level;
      grit.connect(band).connect(g).connect(shake);
    }
    shake.connect(out);
    const stop = t + len + 0.6;
    for (const s of sources) {
      s.start(t);
      s.stop(stop);
    }
    sources[0].onended = () => {
      try {
        out.disconnect();
      } catch (err) {
        /* already gone */
      }
    };
    this.board.stats.roars++;
    this.board.hushUntil = Math.max(this.board.hushUntil, when + len + (kind === 'far' ? 7 : 10));
  }
}

export class Soundscape {
  /** options: { hrtf: place the dragons with head-related filters (default true), reverb: true, seed } */
  constructor(options) {
    const o = options || {};
    this.options = { hrtf: o.hrtf !== false, reverb: o.reverb !== false, seed: o.seed || 1 };
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.dragons = [];
    this.stats = { beats: 0, roars: 0, birds: 0, gusts: 0 };
    this.rng = makeRng(this.options.seed * 31 + 5);
    this.gust = 0.4; // how hard the wind is blowing, 0..1 (what was last asked for)
    this.nextGust = 0;
    this.nextBird = 4;
    this.hushUntil = 0;
    this.hushed = false;
    this.nearest = Infinity;
    this.lastBird = null;
  }

  /**
   * Call from a tap, click or key press. Makes the audio context the first time and starts it.
   * Returns true if sound is (about to be) running.
   */
  unlock(sizes) {
    try {
      const activation = typeof navigator !== 'undefined' ? navigator.userActivation : null;
      if (activation && !activation.hasBeenActive) return false;
      if (!this.ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return false;
        this.attach(new Ctor({ latencyHint: 'playback' }), sizes || [1, 0.78]);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch (err) {
      console.warn('Sound is not available:', err);
      return false;
    }
  }

  get running() {
    // An offline context (the tools) counts as running while it is being driven.
    return !!this.ctx && (this.offline || this.ctx.state === 'running');
  }

  /** Build the graph on a context (a live one, or an OfflineAudioContext in the tools). */
  attach(ctx, sizes) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.noise = makeNoise(ctx, 5, 12345);

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : LEVEL.master;
    // A gentle limiter: a roar close by must not hurt.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -17;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(ctx.destination);
    this.master = master;
    this.limiter = limiter;

    // What comes back off the hills: a reverb for everything with a voice, and for the roars
    // one clear echo from the far side of the lake, a second and a bit later.
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = this.options.reverb ? LEVEL.reverb : 0;
    if (this.options.reverb) {
      const reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(ctx, 2.4, 777);
      this.reverbIn.connect(reverb).connect(master);
    }
    this.echoIn = ctx.createGain();
    this.echoIn.gain.value = LEVEL.echo;
    const delay = ctx.createDelay(2.5);
    delay.delayTime.value = 1.15;
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 1500;
    const again = ctx.createGain();
    again.gain.value = 0.3;
    this.echoIn.connect(delay).connect(dull);
    dull.connect(again).connect(delay);
    if (ctx.createStereoPanner) {
      const side = ctx.createStereoPanner();
      side.pan.value = -0.35;
      dull.connect(side).connect(master);
    } else {
      dull.connect(master);
    }

    this.buildAir();
    this.buildMaple();
    this.birdBus = ctx.createGain();
    this.birdBus.gain.value = LEVEL.birds;
    this.birdBus.connect(master);
    this.birdSend = ctx.createGain();
    this.birdSend.gain.value = 0.45;
    this.birdBus.connect(this.birdSend).connect(this.reverbIn);

    this.dragons = sizes.map((size, i) => new DragonVoice(this, i, size));
    this.nextGust = ctx.currentTime;
    this.nextBird = ctx.currentTime + 3 + 3 * this.rng();
  }

  /** Wind and the far forest: not placed in space, but different in each ear. */
  buildAir() {
    const ctx = this.ctx;
    this.windGains = [];
    this.windFilters = [];
    for (let side = 0; side < 2; side++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.playbackRate.value = side === 0 ? 0.93 : 1.07; // so the two never line up
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 420;
      low.Q.value = 0.3;
      // A soft whistle on top, which moves with the gusts.
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 620;
      band.Q.value = 1.6;
      const bandGain = ctx.createGain();
      bandGain.gain.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = LEVEL.wind * 0.4;
      src.connect(low).connect(gain);
      src.connect(band).connect(bandGain).connect(gain);
      this.connectSide(gain, side === 0 ? -0.7 : 0.7);
      src.start(0, side * 1.7);
      this.windGains.push(gain);
      this.windFilters.push(low, band);
    }
    // The hiss of ten thousand trees.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 1.21;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3400;
    band.Q.value = 0.45;
    this.forestGain = ctx.createGain();
    this.forestGain.gain.value = LEVEL.forest * 0.4;
    src.connect(band).connect(this.forestGain).connect(this.master);
    src.start(0, 2.9);
  }

  connectSide(node, pan) {
    const ctx = this.ctx;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p).connect(this.master);
    } else {
      node.connect(this.master);
    }
  }

  /** The maple by the ledge: dry leaves, rattling more in the gusts. Placed where the tree is. */
  buildMaple() {
    const ctx = this.ctx;
    const tree = HERO_TREES[0];
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.83;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 2600;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 5200;
    band.Q.value = 0.5;
    // The rattle: the level jitters, driven by slow noise.
    const flutter = ctx.createGain();
    flutter.gain.value = 0.55;
    const jitter = ctx.createBufferSource();
    jitter.buffer = this.noise;
    jitter.loop = true;
    jitter.playbackRate.value = 0.37;
    const slow = ctx.createBiquadFilter();
    slow.type = 'lowpass';
    slow.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 2.2;
    jitter.connect(slow).connect(depth).connect(flutter.gain);
    this.mapleGain = ctx.createGain();
    this.mapleGain.gain.value = LEVEL.maple * 0.3;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 7;
    panner.rolloffFactor = 1;
    placeNow(panner, tree.x + 1.5, tree.height - 5, tree.z - 1.5);
    src.connect(high).connect(band).connect(flutter).connect(this.mapleGain).connect(panner).connect(this.master);
    src.start(0, 0.4);
    jitter.start(0, 3.1);
    this.maplePanner = panner;
  }

  setMuted(muted) {
    this.muted = !!muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : LEVEL.master, this.ctx.currentTime, 0.05);
  }

  /** A new gust: everything that the wind moves swells or dies down over a few seconds. */
  blow(level, when, seconds) {
    const tau = seconds / 3;
    this.gust = level;
    for (const g of this.windGains) g.gain.setTargetAtTime(LEVEL.wind * (0.3 + 0.9 * level), when, tau);
    this.windFilters[0].frequency.setTargetAtTime(300 + 420 * level, when, tau);
    this.windFilters[2].frequency.setTargetAtTime(300 + 380 * level, when + 0.4, tau);
    this.windFilters[1].frequency.setTargetAtTime(480 + 520 * level, when, tau);
    this.windFilters[3].frequency.setTargetAtTime(440 + 560 * level, when + 0.4, tau);
    this.forestGain.gain.setTargetAtTime(LEVEL.forest * (0.25 + level * level), when + 0.5, tau);
    this.mapleGain.gain.setTargetAtTime(LEVEL.maple * (0.12 + 0.88 * level * level), when + 0.2, tau * 0.8);
    this.stats.gusts++;
  }

  /**
   * One bird call. place: [x, y, z]. Returns how long it lasts (seconds).
   */
  bird(kind, place, when) {
    const ctx = this.ctx;
    const notes = birdNotes(kind, this.rng);
    const length = notesLength(notes);
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = BIRD_FALLOFF.ref;
    panner.rolloffFactor = BIRD_FALLOFF.rolloff;
    placeNow(panner, place[0], place[1], place[2]);
    const distance = Math.hypot(place[0], place[1] - 1.6, place[2]);
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = Math.min(airCutoff(distance) * 1.6, 14000);
    air.connect(panner).connect(this.birdBus);
    const t0 = when + soundDelay(distance);
    // Each kind at the strength that puts it where it belongs: behind everything else. Crows
    // are big birds a long way off, and need the push to be heard at all.
    const loud = BIRD_LOUDNESS[kind] || 1;
    const sources = [];
    for (const n of notes) {
      const t = t0 + n.t;
      const env = ctx.createGain();
      env.gain.value = 0;
      const attack = Math.min(0.03, n.d * 0.3);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(n.gain * loud, t + attack);
      env.gain.setValueAtTime(n.gain * loud, t + Math.max(n.d - attack * 1.5, attack));
      env.gain.linearRampToValueAtTime(0, t + n.d);
      env.connect(air);
      if (n.kind === 'knock') {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = n.band;
        band.Q.value = n.q;
        src.connect(band).connect(env);
        src.start(t, (n.t * 7.3) % 4, n.d + 0.05);
        sources.push(src);
        continue;
      }
      const osc = ctx.createOscillator();
      osc.type = n.kind === 'tone' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(n.f0, t);
      osc.frequency.linearRampToValueAtTime(n.f1, t + n.d);
      let head = osc;
      if (n.kind === 'buzz') {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = n.band;
        band.Q.value = n.q;
        osc.connect(band);
        head = band;
      }
      if (n.rough) {
        // A rattle in the throat.
        const shake = ctx.createGain();
        shake.gain.value = 0.55;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = n.rough;
        const depth = ctx.createGain();
        depth.gain.value = 0.45;
        lfo.connect(depth).connect(shake.gain);
        lfo.start(t);
        lfo.stop(t + n.d + 0.02);
        head.connect(shake);
        head = shake;
      }
      head.connect(env);
      osc.start(t);
      osc.stop(t + n.d + 0.02);
      sources.push(osc);
    }
    const last = sources[sources.length - 1];
    if (last) {
      last.onended = () => {
        try {
          air.disconnect();
          panner.disconnect();
        } catch (err) {
          /* already gone */
        }
      };
    }
    this.stats.birds++;
    this.lastBird = { kind, place, when, length };
    return length;
  }

  /**
   * Once a frame. listener: { position: [x, y, z], forward: [x, y, z], up: [x, y, z] } (the
   * viewer's head). dragons: [{ x, y, z, vx, vy, vz, speed }] in the same order as attach().
   */
  update(dt, listener, dragons) {
    const ctx = this.ctx;
    if (!this.running) return;
    const now = ctx.currentTime;
    const until = now + Math.max(dt, 0.005);
    const l = ctx.listener;
    const p = listener.position;
    const f = listener.forward;
    const u = listener.up;
    if (l.positionX) {
      l.positionX.linearRampToValueAtTime(p[0], until);
      l.positionY.linearRampToValueAtTime(p[1], until);
      l.positionZ.linearRampToValueAtTime(p[2], until);
      l.forwardX.linearRampToValueAtTime(f[0], until);
      l.forwardY.linearRampToValueAtTime(f[1], until);
      l.forwardZ.linearRampToValueAtTime(f[2], until);
      l.upX.linearRampToValueAtTime(u[0], until);
      l.upY.linearRampToValueAtTime(u[1], until);
      l.upZ.linearRampToValueAtTime(u[2], until);
    } else {
      l.setPosition(p[0], p[1], p[2]);
      l.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]);
    }

    let nearest = Infinity;
    for (let i = 0; i < this.dragons.length && i < dragons.length; i++) {
      const d = dragons[i];
      const rx = d.x - p[0];
      const ry = d.y - p[1];
      const rz = d.z - p[2];
      const distance = Math.hypot(rx, ry, rz) || 1;
      const radial = (rx * d.vx + ry * d.vy + rz * d.vz) / distance;
      this.dragons[i].move(d.x, d.y, d.z, d.speed, radial, distance, now, dt);
      if (distance < nearest) nearest = distance;
    }
    this.nearest = nearest;

    // The wind comes and goes.
    if (now >= this.nextGust) {
      const seconds = 3 + 6 * this.rng();
      const level = this.gust < 0.45 ? 0.45 + 0.55 * this.rng() : 0.12 + 0.4 * this.rng();
      this.blow(level, now, seconds);
      this.nextGust = now + seconds * (0.8 + 0.6 * this.rng());
    }

    // Birds: quiet while a dragon is close, and for a while after.
    if (nearest < HUSH_NEAR) this.hushed = true;
    else if (nearest > HUSH_FAR && this.hushed) {
      this.hushed = false;
      this.hushUntil = Math.max(this.hushUntil, now + 4 + 4 * this.rng());
    }
    if (now >= this.nextBird) {
      if (this.hushed || now < this.hushUntil) {
        this.nextBird = now + 1;
      } else {
        const kind = this.pickBird();
        const length = this.bird(kind, birdPlace(kind, this.rng), now + 0.05);
        this.nextBird = now + length + 2.5 + 7 * this.rng();
      }
    }
  }

  pickBird() {
    const r = this.rng();
    if (r < 0.26) return 'chickadeeCall';
    if (r < 0.44) return 'chickadeeSong';
    if (r < 0.6) return 'sparrow';
    if (r < 0.73) return 'jay';
    if (r < 0.9) return 'crow';
    return 'woodpecker';
  }

  /**
   * The viewer whistles for a dragon: two rising notes, which ring across the valley. It is the
   * answer to pulling the trigger, whether or not a dragon comes.
   */
  whistle(when) {
    const ctx = this.ctx;
    const t = when === undefined ? ctx.currentTime + 0.02 : when;
    const out = ctx.createGain();
    out.gain.value = LEVEL.whistle;
    out.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 1.6;
    out.connect(send);
    send.connect(this.reverbIn);
    send.connect(this.echoIn);
    const notes = [[0, 0.17, 1500, 2050], [0.2, 0.3, 2050, 2700]];
    const stop = t + 0.6;
    for (const [at, d, f0, f1] of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, t + at);
      osc.frequency.exponentialRampToValueAtTime(f1, t + at + d * 0.7);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t + at);
      env.gain.linearRampToValueAtTime(1, t + at + 0.03);
      env.gain.setValueAtTime(1, t + at + d - 0.05);
      env.gain.linearRampToValueAtTime(0, t + at + d);
      osc.connect(env).connect(out);
      osc.start(t + at);
      osc.stop(t + at + d + 0.02);
      if (at > 0) {
        osc.onended = () => {
          try {
            out.disconnect();
            send.disconnect();
          } catch (err) {
            /* already gone */
          }
        };
      }
    }
    // The breath in it.
    const breath = ctx.createBufferSource();
    breath.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 1.5;
    const air = ctx.createGain();
    air.gain.setValueAtTime(0, t);
    air.gain.linearRampToValueAtTime(0.22, t + 0.05);
    air.gain.linearRampToValueAtTime(0, stop - 0.08);
    breath.connect(band).connect(air).connect(out);
    breath.start(t, 1.1, 0.6);
    this.stats.whistles = (this.stats.whistles || 0) + 1;
  }

  /** A downstroke of dragon i. */
  beat(i, strength) {
    if (!this.running || !this.dragons[i]) return;
    this.dragons[i].beat(strength, this.ctx.currentTime);
  }

  /** Dragon i roars. */
  roar(i, kind, seconds) {
    if (!this.running || !this.dragons[i]) return;
    this.dragons[i].roar(kind, this.ctx.currentTime, seconds);
  }
}
