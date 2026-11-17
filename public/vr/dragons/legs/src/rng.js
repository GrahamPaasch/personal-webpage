/**
 * rng.js: repeatable randomness. Everything in the valley (hills, trees, leaves, the dragons'
 * choices) is built from these, so the same seed always gives the same world and the same flight,
 * in the browser and in the tests.
 */

/** A small fast generator (mulberry32). Returns a function giving numbers in [0, 1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (n) => Math.floor(next() * n);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

/** A number in [0, 1) from two integers. */
export function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]; one bump is about one unit wide. */
export function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

/** A few octaves of noise2 on top of each other, in about [-1, 1]. */
export function fbm(x, z, octaves) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(fx, fz);
    norm += amp;
    amp *= 0.5;
    // Turn each octave a little so the lattice does not line up.
    const nx = fx * 1.6 - fz * 1.2;
    fz = fx * 1.2 + fz * 1.6;
    fx = nx;
  }
  return sum / norm;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(lo, hi, v) {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
}
