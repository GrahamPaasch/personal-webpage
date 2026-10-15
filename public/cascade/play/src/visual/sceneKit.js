// Shared helpers + the SCENE CONTRACT every stage scene implements. No DOM access at import time.
//
// A scene module (src/visual/scenes/<id>.js) exports:
//   theme = {
//     accent, accent2,                 // CSS colours for HUD text, callouts, field border glow
//     tints: { I, O, T, S, Z, J, L },  // stage re-tinted piece colours
//     panel: { fill, grid, border },   // playfield panel colours (fill is translucent so the scene shows)
//     particle: { colors: [..], shape: 'dot'|'bubble'|'leaf'|'spark'|'sand'|'flake'|'star'|'square',
//                 gravity (px/s², + = down), drag (0..1 per s), size: [min,max], glow: bool },
//     text: '#fff',                    // HUD text colour
//   }
//   drawBlock(ctx, s, color, type, variant)  draw ONE playfield cell into a fresh s×s canvas at (0,0).
//     Called once per (piece type, size) and cached as a sprite — so it can be expensive and detailed.
//     type ∈ I O T S Z J L, or 'G' (garbage/ghost-neutral). variant: 0..3 (seeded per-cell variety).
//   createScene({ w, h, seed, reduced }) → scene with:
//     resize(w, h)              buffer size in CSS px (may be scaled down for performance)
//     update(dt, env)           dt in seconds; env (see below)
//     draw(ctx, env)            paint the WHOLE background, opaque, into a w×h canvas context
//     absorbTarget(rand)        → {x, y}: where a line-clear particle should fly to (scene coords)
//     absorb(x, y, color)       a particle arrived: add a persistent creature/light there (cap counts!)
//     creatures                 number of absorbed things currently alive (for tests/screenshots)
//   env = { time (s), beat (float beats), beatPulse (1 on each beat → decays to 0), kick (1 on kick → 0),
//           bar (int), intensity 0..1, bloom 0..1 (stage progress — the world grows with it), danger 0..1,
//           reduced (bool: slow/soft motion, fewer particles), quality 0.3..1 (scale particle counts),
//           field: {x, y, w, h} playfield rect in the same coords, w, h }
//
// Rules: 60 fps budget — keep per-frame work modest (pre-render gradients/sprites to offscreen canvases
// in resize()), no allocation storms, cap particle arrays, use 'lighter' compositing for glow.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const ease = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export function makeCanvas(w, h) {
  const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
  // Regular canvases blit much faster than OffscreenCanvas on Chrome's GPU path; Offscreen is the fallback.
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  return new OffscreenCanvas(W, H);
}

// Colour helpers.
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
export function mix(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return '#' + a.map((x, i) => Math.round(lerp(x, b[i], t)).toString(16).padStart(2, '0')).join('');
}
export const shade = (hex, t) => t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t);

// Seeded random (mulberry32) for scene layout.
export function rand(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cached radial glow sprite (white core → colour → transparent). Draw with 'lighter' for light.
const glowCache = new Map();
export function glowSprite(color, size = 64, core = 0.15) {
  const key = `${color}|${size}|${core}`;
  let c = glowCache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba(mix(color, '#ffffff', 0.7), 1));
  grad.addColorStop(core, rgba(color, 0.85));
  grad.addColorStop(0.45, rgba(color, 0.22));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}
export function drawGlow(ctx, sprite, x, y, radius, alpha = 1) {
  if (alpha <= 0.003 || radius <= 0.2) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
}

// Vertical gradient fill of the whole canvas.
export function vgrad(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// Smooth 1-D value noise (for silhouettes: dunes, hills, skylines).
export function noise1(seed) {
  const r = rand(seed);
  const pts = Array.from({ length: 256 }, () => r());
  return x => {
    const i = Math.floor(x), f = x - i;
    const a = pts[((i % 256) + 256) % 256], b = pts[(((i + 1) % 256) + 256) % 256];
    return lerp(a, b, smooth(f));
  };
}
export function fbm1(seed, oct = 4) {
  const ns = Array.from({ length: oct }, (_, k) => noise1(seed + k * 101));
  return x => { let s = 0, amp = 0.5, f = 1, tot = 0; for (const n of ns) { s += n(x * f) * amp; tot += amp; amp *= 0.5; f *= 2; } return s / tot; };
}

// Fixed-capacity pool helper for scene creatures/particles: add() overwrites the oldest when full.
export class Ring {
  constructor(cap) { this.cap = cap; this.items = []; this.i = 0; }
  add(o) { if (this.items.length < this.cap) this.items.push(o); else { this.items[this.i] = o; this.i = (this.i + 1) % this.cap; } return o; }
  get length() { return this.items.length; }
  [Symbol.iterator]() { return this.items[Symbol.iterator](); }
  filterInPlace(fn) { this.items = this.items.filter(fn); this.i = 0; }
}

// Default glossy block (used by stages as a base or fallback).
export function drawBasicBlock(ctx, s, color) {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, shade(color, 0.35)); g.addColorStop(1, shade(color, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(s * 0.04, s * 0.04, s * 0.92, s * 0.92);
  ctx.strokeStyle = rgba(shade(color, 0.6), 0.9); ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.strokeRect(s * 0.07, s * 0.07, s * 0.86, s * 0.86);
}
