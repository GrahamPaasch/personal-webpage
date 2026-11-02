// STITCH — an original needle-and-thread dash game. No deps, no build.
// Core verb: aim, dash. Thread the eyes (rings). Every dash spends thread; every stitch earns it back.
(() => {
'use strict';

// ---------- canvas ----------
const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1, MIN = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight; MIN = Math.min(W, H);
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize); resize();

// ---------- helpers ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function segCircle(ax, ay, bx, by, cx, cy) { // distance from circle center to segment
  const dx = bx - ax, dy = by - ay; const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0; t = clamp(t, 0, 1);
  const px = ax + dx * t, py = ay + dy * t; return Math.hypot(cx - px, cy - py);
}

// ---------- persistence ----------
const SAVE_KEY = 'stitch.save.v1';
let save = { best: 0, bestCombo: 0, totalStitches: 0, runs: 0, mods: [false, false, false] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---------- modifiers (unlocks) ----------
const MODS = [
  { name: 'LONG NEEDLE', desc: 'dash 1.35x, costs 1.35x thread, score x1.25', unlock: () => save.best >= 400, hint: 'reach 400 points' },
  { name: 'TANGLE', desc: 'twice the knots, score x1.5', unlock: () => save.totalStitches >= 40, hint: 'stitch 40 eyes total' },
  { name: 'BLINDFOLD', desc: 'far eyes are invisible, score x2', unlock: () => save.best >= 1200, hint: 'reach 1200 points' },
];
const modOn = i => save.mods[i] && MODS[i].unlock();
function scoreMult() { let m = 1; if (modOn(0)) m *= 1.25; if (modOn(1)) m *= 1.5; if (modOn(2)) m *= 2; return m; }

// ---------- stages (mood, key, scale) ----------
const STAGES = [
  { name: 'LINEN', hue: 168, root: 60, scale: [0, 2, 4, 7, 9] },        // C major pent
  { name: 'SILK', hue: 205, root: 62, scale: [0, 2, 3, 7, 9] },         // D "kumoi"-ish
  { name: 'VELVET', hue: 285, root: 57, scale: [0, 3, 5, 7, 10] },      // A minor pent
  { name: 'BROCADE', hue: 35, root: 65, scale: [0, 2, 4, 7, 9] },       // F major pent
  { name: 'GOSSAMER', hue: 120, root: 67, scale: [0, 2, 5, 7, 10] },    // G egyptian
  { name: 'EMBER', hue: 10, root: 64, scale: [0, 3, 5, 8, 10] },        // E man gong
  { name: 'MIDNIGHT', hue: 240, root: 59, scale: [0, 3, 5, 7, 10] },    // B minor pent
  { name: 'GOLDWORK', hue: 50, root: 69, scale: [0, 2, 4, 7, 9] },      // A major pent
];
const STITCHES_PER_STAGE = 10;
const stageOf = n => STAGES[Math.min(n, STAGES.length - 1)];
const stageHue = n => (stageOf(n).hue + Math.max(0, n - STAGES.length + 1) * 47) % 360;

// ---------- audio ----------
let AC = null, master, verb, dryGain, wetGain, droneA, droneB, droneGain, droneFilter, lowTick = 0;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = 0.8;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
  master.connect(comp); comp.connect(AC.destination);
  // reverb: generated impulse
  verb = AC.createConvolver();
  const len = Math.floor(AC.sampleRate * 1.8), buf = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5; }
  verb.buffer = buf;
  dryGain = AC.createGain(); wetGain = AC.createGain(); wetGain.gain.value = 0.32;
  dryGain.connect(master); verb.connect(wetGain); wetGain.connect(master);
  // drone
  droneFilter = AC.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 240; droneFilter.Q.value = 2;
  droneGain = AC.createGain(); droneGain.gain.value = 0;
  droneA = AC.createOscillator(); droneA.type = 'sawtooth'; droneB = AC.createOscillator(); droneB.type = 'sawtooth';
  droneA.connect(droneFilter); droneB.connect(droneFilter); droneFilter.connect(droneGain); droneGain.connect(dryGain); droneGain.connect(verb);
  droneA.start(); droneB.start();
  setDrone(0);
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function setDrone(stage) {
  if (!AC) return; const r = mtof(stageOf(stage).root - 24), t = AC.currentTime;
  droneA.frequency.setTargetAtTime(r, t, 0.3); droneB.frequency.setTargetAtTime(r * 1.004, t, 0.3);
}
function droneLevel(v, filt) {
  if (!AC) return; const t = AC.currentTime;
  droneGain.gain.setTargetAtTime(v, t, 0.2); droneFilter.frequency.setTargetAtTime(filt, t, 0.15);
}
function voice(freq, { type = 'triangle', dur = 0.5, gain = 0.25, when = 0, cutoff = 2600, detune = 0, wet = true } = {}) {
  if (!AC) return; const t = AC.currentTime + when;
  const o = AC.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
  const o2 = AC.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.25), t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  const g2 = AC.createGain(); g2.gain.value = 0.35;
  o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(dryGain); if (wet) g.connect(verb);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function noise({ dur = 0.15, gain = 0.2, from = 3000, to = 400, q = 1, when = 0, type = 'bandpass' } = {}) {
  if (!AC) return; const t = AC.currentTime + when;
  const n = Math.floor(AC.sampleRate * dur), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = AC.createBufferSource(); s.buffer = b;
  const f = AC.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dryGain); g.connect(verb); s.start(t); s.stop(t + dur + 0.02);
}
function scaleNote(stage, degree) { // degree 0.. across octaves
  const s = stageOf(stage); const n = s.scale.length;
  const oct = Math.floor(degree / n), d = degree % n;
  return mtof(s.root + s.scale[d] + 12 * oct);
}
const sfx = {
  dash() { noise({ dur: 0.13, gain: 0.12, from: 2600, to: 500, q: 1.2 }); },
  stitch(stage, combo, perfect, nth) {
    const deg = Math.min(combo, 14); const f = scaleNote(stage, deg);
    voice(f, { gain: 0.26, dur: 0.55 + Math.min(combo, 10) * 0.03, cutoff: 3200 });
    if (nth > 0) voice(scaleNote(stage, deg + 2), { gain: 0.16, dur: 0.5, type: 'sine' });
    if (perfect) { voice(f * 1.5, { gain: 0.14, dur: 0.7, type: 'sine', when: 0.02 }); voice(f * 2, { gain: 0.08, dur: 0.9, type: 'sine', when: 0.05, cutoff: 5000 }); }
  },
  multi(stage, combo, count) { // chord for threading several eyes in one dash
    const deg = Math.min(combo, 14);
    for (let i = 0; i < Math.min(count, 4); i++) voice(scaleNote(stage, deg + i * 2), { gain: 0.14, dur: 1.0, when: 0.06 + i * 0.045, type: i % 2 ? 'sine' : 'triangle' });
  },
  whiff() { voice(110, { type: 'sine', gain: 0.22, dur: 0.22, cutoff: 600, wet: false }); noise({ dur: 0.08, gain: 0.05, from: 600, to: 200 }); },
  knot() { noise({ dur: 0.3, gain: 0.3, from: 1800, to: 120, q: 0.7, type: 'lowpass' }); voice(55, { type: 'sawtooth', gain: 0.25, dur: 0.4, cutoff: 500, detune: 30 }); voice(58, { type: 'sawtooth', gain: 0.15, dur: 0.4, cutoff: 500, detune: -40 }); },
  collapse() { noise({ dur: 0.07, gain: 0.03, from: 5000, to: 2000 }); },
  stage(stage) { for (let i = 0; i < 6; i++) voice(scaleNote(stage, i + 2), { gain: 0.14, dur: 0.6, when: i * 0.07, type: 'triangle' }); },
  overflow(stage) { voice(scaleNote(stage, 9), { gain: 0.1, dur: 0.3, type: 'sine' }); },
  dead() { for (let i = 0; i < 4; i++) voice(mtof(55 - i * 3), { type: 'triangle', gain: 0.18, dur: 0.9, when: i * 0.16, cutoff: 1200 }); noise({ dur: 0.6, gain: 0.08, from: 1200, to: 100, type: 'lowpass' }); },
  lowThread() { voice(mtof(48), { type: 'sine', gain: 0.1, dur: 0.1, wet: false, cutoff: 400 }); },
  ui() { voice(880, { type: 'sine', gain: 0.08, dur: 0.12 }); },
};

// ---------- input ----------
const input = { mx: W / 2, my: H / 2, mouseIn: false, aimX: 1, aimY: 0, aimSrc: 'mouse', press: false, pressEdge: false, restart: false, keys: new Set() };
cv.addEventListener('mousemove', e => { input.mx = e.clientX; input.my = e.clientY; input.mouseIn = true; input.aimSrc = 'mouse'; });
cv.addEventListener('mousedown', e => {
  if (e.button !== 0) return; audioInit(); input.aimSrc = 'mouse';
  if (G.state === 'title') { for (let i = 0; i < 3; i++) { const b = MODS[i]._box; if (b && e.clientX >= b.x && e.clientX <= b.x + b.w && e.clientY >= b.y && e.clientY <= b.y + b.h) { toggleMod(i); return; } } }
  input.press = true; input.pressEdge = true;
});
cv.addEventListener('mouseup', e => { if (e.button === 0) input.press = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('touchstart', e => { e.preventDefault(); audioInit(); const t = e.touches[0]; input.mx = t.clientX; input.my = t.clientY; input.aimSrc = 'mouse'; input.press = true; input.pressEdge = true; }, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; input.mx = t.clientX; input.my = t.clientY; }, { passive: false });
cv.addEventListener('touchend', e => { e.preventDefault(); input.press = false; }, { passive: false });
const AIMKEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
window.addEventListener('keydown', e => {
  if (e.repeat) return; audioInit();
  if (AIMKEYS[e.code]) { input.keys.add(e.code); keyAim(); input.aimSrc = 'keys'; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ' || e.code === 'KeyK') { input.press = true; input.pressEdge = true; e.preventDefault(); }
  if (e.code === 'KeyR') input.restart = true;
  if (e.code === 'Escape') { if (G.state !== 'title') toTitle(); }
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') toggleMod(+e.code.slice(-1) - 1);
  if (e.code === 'KeyM') { if (AC) { master.gain.value = master.gain.value > 0 ? 0 : 0.8; } }
});
window.addEventListener('keyup', e => {
  if (AIMKEYS[e.code]) { input.keys.delete(e.code); keyAim(); }
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ' || e.code === 'KeyK') input.press = false;
});
function keyAim() {
  let x = 0, y = 0; for (const k of input.keys) { x += AIMKEYS[k][0]; y += AIMKEYS[k][1]; }
  if (x || y) { const l = Math.hypot(x, y); input.aimX = x / l; input.aimY = y / l; }
}
// gamepad
const pad = { prev: {}, active: false };
function pollPad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null;
  for (const g of gps) if (g && g.connected) { gp = g; break; }
  if (!gp) return;
  let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (Math.hypot(ax, ay) < 0.25) { ax = gp.axes[2] || 0; ay = gp.axes[3] || 0; }
  if (Math.hypot(ax, ay) >= 0.25) { const l = Math.hypot(ax, ay); input.aimX = ax / l; input.aimY = ay / l; input.aimSrc = 'pad'; pad.active = true; }
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const now = { a: b(0) || b(7) || b(5), start: b(9), x: b(2), du: b(12), dd: b(13), dl: b(14), dr: b(15), back: b(8) };
  if (now.a && !pad.prev.a) { audioInit(); input.press = true; input.pressEdge = true; pad.active = true; }
  if (!now.a && pad.prev.a) input.press = false;
  if (now.start && !pad.prev.start) input.restart = true;
  if (now.back && !pad.prev.back && G.state !== 'title') toTitle();
  if (G.state === 'title') { if (now.dl && !pad.prev.dl) toggleMod(0); if (now.du && !pad.prev.du) toggleMod(1); if (now.dr && !pad.prev.dr) toggleMod(2); }
  pad.prev = now;
}
function toggleMod(i) { if (G.state !== 'title') return; if (!MODS[i].unlock()) { sfx.whiff(); return; } save.mods[i] = !save.mods[i]; persist(); sfx.ui(); }

// ---------- game state ----------
const G = {
  state: 'title', t: 0, score: 0, combo: 0, maxCombo: 0, stitches: 0, stage: 0, thread: 70, perfects: 0, multis: 0,
  px: 0, py: 0, dash: null, queued: false, rings: [], knots: [], parts: [], texts: [], trail: [], waves: [],
  shake: 0, shakeX: 0, shakeY: 0, hitstop: 0, flash: 0, flashHue: 0, spawnT: 0, knotRespawn: [], runTime: 0, newBest: false,
  stageFlash: 0, lowBeat: 0, deadT: 0, titleT: 0, lastDashRings: 0,
};
const DASH_T = 0.19;
const THREAD_MAX = 100;
function dashLen() { return MIN * 0.46 * (modOn(0) ? 1.35 : 1); }
function dashCost() { return (G.stage < 2 ? 4 : 5) * (modOn(0) ? 1.35 : 1); }
// Gentle on-ramp (Graham 11/1: too hard): stages 1-2 are forgiving, then it ramps for strong players.
function drainRate() { return G.stage === 0 ? 1.6 : G.stage === 1 ? 2.4 : 3.2 + (G.stage - 2) * 0.75; }
function ringLife() { return G.stage < 2 ? 7.0 - G.stage * 0.6 : Math.max(2.6, 5.6 - (G.stage - 2) * 0.32); }
function targetRings() { return Math.min(6, 2 + Math.floor(G.stage / 1.5)); }
function targetKnots() { return Math.min(7, Math.floor((G.stage + 1) * 0.9)) * (modOn(1) ? 2 : 1); }

function toTitle() { G.state = 'title'; G.titleT = 0; droneLevel(0.05, 200); }
function startRun() {
  Object.assign(G, { state: 'play', t: 0, score: 0, combo: 0, maxCombo: 0, stitches: 0, stage: 0, thread: 85, perfects: 0, multis: 0,
    px: W / 2, py: H / 2, dash: null, queued: false, rings: [], knots: [], parts: [], texts: [], trail: [], waves: [], shake: 0, hitstop: 0, flash: 0,
    spawnT: 0, knotRespawn: [], runTime: 0, newBest: false, stageFlash: 0, lowBeat: 0, deadT: 0, lastDashRings: 0 });
  for (let i = 0; i < 3; i++) spawnRing(true);
  for (let i = 0; i < targetKnots(); i++) spawnKnot();
  setDrone(0); droneLevel(0.09, 260);
  save.runs++; persist();
}
function die() {
  G.state = 'dead'; G.deadT = 0; sfx.dead(); droneLevel(0.03, 120);
  G.shake = Math.max(G.shake, 10);
  if (G.score > save.best) { save.best = Math.round(G.score); G.newBest = true; }
  if (G.maxCombo > save.bestCombo) save.bestCombo = G.maxCombo;
  persist();
}

// ---------- spawning ----------
function spawnRing(initial) {
  const m = 70; let x, y, tries = 0;
  do { x = rnd(m, W - m); y = rnd(m, H - m); tries++; } while (tries < 20 && (Math.hypot(x - G.px, y - G.py) < MIN * 0.16 || G.rings.some(r => Math.hypot(r.x - x, r.y - y) < 110)));
  const maxR = rnd(MIN * 0.052, MIN * 0.08) * (initial ? 1.1 : 1);
  G.rings.push({ x, y, maxR, r: maxR, age: 0, life: ringLife() * (initial ? 1.4 : 1), born: 0, hit: false, seed: Math.random() * TAU });
}
function spawnKnot() {
  const m = 60; let x, y, tries = 0;
  do { x = rnd(m, W - m); y = rnd(m, H - m); tries++; } while (tries < 20 && Math.hypot(x - G.px, y - G.py) < MIN * 0.3);
  const sp = (18 + G.stage * 6) * rnd(0.7, 1.3), a = rnd(0, TAU);
  G.knots.push({ x, y, r: MIN * 0.022, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ph: rnd(0, TAU), born: 0 });
}
function spawnParts(x, y, n, hue, speed, life, size) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length > 500) G.parts.shift();
    const a = rnd(0, TAU), s = speed * rnd(0.3, 1);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, t: 0, hue: hue + rnd(-14, 14), size: size * rnd(0.6, 1.4) });
  }
}
function addText(x, y, s, hue, big) { G.texts.push({ x, y, s, hue, t: 0, big: !!big }); }

// ---------- dash path with wall ricochet ----------
function buildPath(x, y, dx, dy, len) {
  const pad = 12, pts = [{ x, y }]; let rem = len, b = 0;
  while (rem > 0.5 && b < 8) {
    let t = Infinity, wall = 0;
    if (dx > 0) { const tt = (W - pad - x) / dx; if (tt < t) { t = tt; wall = 1; } }
    if (dx < 0) { const tt = (pad - x) / dx; if (tt < t) { t = tt; wall = 1; } }
    if (dy > 0) { const tt = (H - pad - y) / dy; if (tt < t) { t = tt; wall = 2; } }
    if (dy < 0) { const tt = (pad - y) / dy; if (tt < t) { t = tt; wall = 2; } }
    if (t >= rem) { x += dx * rem; y += dy * rem; pts.push({ x, y, bounce: false }); rem = 0; break; }
    x += dx * t; y += dy * t; rem -= t; pts.push({ x, y, bounce: true });
    if (wall === 1) dx = -dx; else dy = -dy; b++;
  }
  return pts;
}
function pathPoint(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= l || i === pts.length - 1) { const t = l > 0 ? clamp(s / l, 0, 1) : 0; return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), i }; }
    s -= l;
  }
  return { x: pts[0].x, y: pts[0].y, i: 0 };
}

// ---------- dash ----------
function tryDash() {
  if (G.dash) { G.queued = true; return; }
  const L = dashLen(); const pts = buildPath(G.px, G.py, input.aimX, input.aimY, L);
  G.dash = { pts, len: L, t: 0, s: 0, hits: 0, lastX: G.px, lastY: G.py, ringsHit: [] };
  G.thread -= dashCost(); sfx.dash();
  spawnParts(G.px, G.py, 6, stageHue(G.stage), 90, 0.35, 2);
}
function stepDash(dt) {
  const d = G.dash; d.t += dt; const u = clamp(d.t / DASH_T, 0, 1);
  const s = d.len * easeOutCubic(u); const p = pathPoint(d.pts, s);
  // bounce particles when passing vertex
  for (let i = 1; i < d.pts.length - 1; i++) {
    const v = d.pts[i]; if (!v.bounce || v.done) continue;
    let acc = 0; for (let k = 1; k <= i; k++) acc += Math.hypot(d.pts[k].x - d.pts[k - 1].x, d.pts[k].y - d.pts[k - 1].y);
    if (s >= acc) { v.done = true; spawnParts(v.x, v.y, 10, stageHue(G.stage) + 40, 160, 0.4, 2); G.shake = Math.max(G.shake, 2.5); noise({ dur: 0.06, gain: 0.08, from: 1400, to: 600 }); }
  }
  // collisions along swept segment
  const ax = d.lastX, ay = d.lastY, bx = p.x, by = p.y;
  for (const r of G.rings) {
    if (r.hit) continue;
    const dist = segCircle(ax, ay, bx, by, r.x, r.y);
    if (dist <= r.r) { r.hit = true; const perfect = dist <= r.r * 0.33; stitch(r, perfect, d.hits); d.hits++; }
  }
  for (let i = G.knots.length - 1; i >= 0; i--) {
    const k = G.knots[i]; if (k.born < 0.6) continue;
    if (segCircle(ax, ay, bx, by, k.x, k.y) <= k.r + 4) { snag(k); G.knots.splice(i, 1); G.knotRespawn.push(2.2); }
  }
  G.trail.push({ x1: ax, y1: ay, x2: bx, y2: by, t: 0 }); if (G.trail.length > 600) G.trail.shift();
  d.lastX = bx; d.lastY = by; G.px = bx; G.py = by;
  if (u >= 1) {
    if (d.hits === 0) { if (G.combo > 0) addText(G.px, G.py - 30, 'whiff', 0, false); G.combo = 0; sfx.whiff(); G.shake = Math.max(G.shake, 2); }
    else if (d.hits >= 2) { G.multis++; sfx.multi(G.stage, G.combo, d.hits); addText(G.px, G.py - 70, d.hits === 2 ? 'DOUBLE STITCH' : d.hits === 3 ? 'TRIPLE STITCH' : 'x' + d.hits + ' STITCH!', 50, true); G.waves.push({ x: G.px, y: G.py, r: 0, max: MIN * 0.3, t: 0, hue: 50 }); }
    G.lastDashRings = d.hits; G.dash = null;
    if (G.queued) { G.queued = false; tryDash(); }
  }
}
function stitch(r, perfect, nth) {
  G.combo++; G.stitches++; save.totalStitches++; G.comboPop = 1; if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  const comboMult = 1 + (Math.min(G.combo, 40) - 1) * 0.25;
  const pts = Math.round(10 * comboMult * (perfect ? 2 : 1) * (nth + 1) * scoreMult());
  G.score += pts; if (perfect) G.perfects++;
  // thread back
  let gain = 9 + (perfect ? 6 : 0) + nth * 4; const before = G.thread; G.thread += gain;
  if (G.thread > THREAD_MAX) { const over = G.thread - THREAD_MAX; G.thread = THREAD_MAX; const bonus = Math.round(over * 6 * scoreMult()); if (bonus > 0) { G.score += bonus; addText(r.x, r.y + 40, 'spool full +' + bonus, 50, false); sfx.overflow(G.stage); } }
  const hue = stageHue(G.stage);
  sfx.stitch(G.stage, G.combo - 1, perfect, nth);
  spawnParts(r.x, r.y, perfect ? 34 : 18, perfect ? 48 : hue, perfect ? 320 : 220, perfect ? 0.8 : 0.55, perfect ? 3.2 : 2.4);
  G.waves.push({ x: r.x, y: r.y, r: r.r, max: r.r * (perfect ? 4 : 2.6), t: 0, hue: perfect ? 48 : hue });
  addText(r.x, r.y - r.r - 14, '+' + pts, perfect ? 48 : hue, perfect);
  if (perfect) { addText(r.x, r.y - r.r - 44, 'PERFECT', 48, true); G.flash = 0.35; G.flashHue = 48; }
  G.hitstop = Math.max(G.hitstop, perfect ? 0.07 : 0.045); G.shake = Math.max(G.shake, perfect ? 5 : 3);
  // stage up
  const ns = Math.floor(G.stitches / STITCHES_PER_STAGE);
  if (ns > G.stage) { G.stage = ns; G.stageFlash = 1.6; sfx.stage(G.stage); setDrone(G.stage); addText(W / 2, H * 0.3, stageOf(G.stage).name, stageHue(G.stage), true); const need = targetKnots() - G.knots.length - G.knotRespawn.length; for (let i = 0; i < need; i++) G.knotRespawn.push(rnd(0.5, 2)); }
  r.popT = 0;
}
function snag(k) {
  const snagCost = G.stage < 2 ? 14 : 22; G.thread -= snagCost; G.combo = 0; sfx.knot(); G.shake = Math.max(G.shake, 16); G.hitstop = Math.max(G.hitstop, 0.09); G.flash = 0.5; G.flashHue = 0;
  spawnParts(k.x, k.y, 40, 0, 260, 0.7, 3); addText(k.x, k.y - 30, 'SNAG -' + snagCost, 0, true);
  G.waves.push({ x: k.x, y: k.y, r: k.r, max: MIN * 0.25, t: 0, hue: 0 });
}

// ---------- update ----------
function update(dt) {
  pollPad();
  if (input.restart) { input.restart = false; startRun(); input.pressEdge = false; }
  if (G.state === 'title') {
    G.titleT += dt;
    if (input.pressEdge) { input.pressEdge = false; if (G.titleT > 0.3) startRun(); }
    updateFx(dt); return;
  }
  if (G.state === 'dead') {
    G.deadT += dt; updateFx(dt);
    if (input.pressEdge) { input.pressEdge = false; if (G.deadT > 0.5) startRun(); }
    return;
  }
  // play
  if (input.aimSrc === 'mouse' && input.mouseIn) { const dx = input.mx - G.px, dy = input.my - G.py, l = Math.hypot(dx, dy); if (l > 2) { input.aimX = dx / l; input.aimY = dy / l; } }
  if (input.pressEdge) { input.pressEdge = false; tryDash(); }
  if (G.hitstop > 0) { G.hitstop -= dt; updateFx(dt * 0.25); return; }
  G.t += dt; G.runTime += dt;
  G.thread -= drainRate() * dt;
  if (G.dash) stepDash(dt);
  // rings
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i]; r.born += dt;
    if (r.hit) { r.popT += dt; if (r.popT > 0.25) G.rings.splice(i, 1); continue; }
    r.age += dt; const u = r.age / r.life; r.r = r.maxR * Math.pow(1 - clamp(u, 0, 1), 0.75) * Math.min(1, r.born * 5);
    if (u >= 1) { G.rings.splice(i, 1); sfx.collapse(); spawnParts(r.x, r.y, 5, 0, 40, 0.5, 1.5); }
  }
  const live = G.rings.filter(r => !r.hit).length;
  G.spawnT -= dt;
  if (live < targetRings() && G.spawnT <= 0) { spawnRing(false); G.spawnT = live === 0 ? 0 : 0.25; }
  // knots
  for (const k of G.knots) {
    k.born += dt; k.x += k.vx * dt; k.y += k.vy * dt; k.ph += dt * 2;
    if (k.x < 40) { k.x = 40; k.vx = Math.abs(k.vx); } if (k.x > W - 40) { k.x = W - 40; k.vx = -Math.abs(k.vx); }
    if (k.y < 40) { k.y = 40; k.vy = Math.abs(k.vy); } if (k.y > H - 40) { k.y = H - 40; k.vy = -Math.abs(k.vy); }
    // knot touching idle needle also snags (slow drift pressure)
    if (!G.dash && k.born > 0.6 && Math.hypot(k.x - G.px, k.y - G.py) < k.r + 6) { snag(k); k.dead = true; }
  }
  for (let i = G.knots.length - 1; i >= 0; i--) if (G.knots[i].dead) { G.knots.splice(i, 1); G.knotRespawn.push(2.2); }
  for (let i = G.knotRespawn.length - 1; i >= 0; i--) { G.knotRespawn[i] -= dt; if (G.knotRespawn[i] <= 0) { G.knotRespawn.splice(i, 1); spawnKnot(); } }
  // low thread heartbeat + drone tension
  if (G.thread < 25) { G.lowBeat -= dt; if (G.lowBeat <= 0) { G.lowBeat = lerp(0.25, 0.6, G.thread / 25); sfx.lowThread(); } droneLevel(0.11, 420 + (25 - G.thread) * 20); }
  else droneLevel(0.09, 260);
  if (G.thread <= 0) { G.thread = 0; die(); }
  updateFx(dt);
}
function updateFx(dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) { const p = G.parts[i]; p.t += dt; if (p.t >= p.life) { G.parts.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.02, dt); p.vy *= Math.pow(0.02, dt); }
  for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.t += dt; if (t.t > (t.big ? 1.3 : 0.9)) G.texts.splice(i, 1); }
  for (let i = G.waves.length - 1; i >= 0; i--) { const w = G.waves[i]; w.t += dt * 2.2; if (w.t >= 1) G.waves.splice(i, 1); }
  for (let i = G.trail.length - 1; i >= 0; i--) { G.trail[i].t += dt; if (G.trail[i].t > 9) G.trail.splice(i, 1); }
  G.shake = Math.max(0, G.shake - dt * 30); const a = rnd(0, TAU); G.shakeX = Math.cos(a) * G.shake; G.shakeY = Math.sin(a) * G.shake;
  G.flash = Math.max(0, G.flash - dt * 2.2); G.stageFlash = Math.max(0, G.stageFlash - dt); G.comboPop = Math.max(0, (G.comboPop || 0) - dt * 4);
}

// ---------- render ----------
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
function render() {
  const hue = stageHue(G.stage);
  // background
  ctx.globalCompositeOperation = 'source-over';
  const bg = ctx.createRadialGradient(W / 2, H / 2, MIN * 0.1, W / 2, H / 2, MIN * 0.9);
  bg.addColorStop(0, hsl(hue, 30, 11)); bg.addColorStop(1, hsl(hue, 40, 4));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(G.shakeX, G.shakeY);
  // weave
  ctx.strokeStyle = hsl(hue, 40, 60, 0.045); ctx.lineWidth = 1; ctx.beginPath();
  const gs = 44, off = (G.t * 6) % gs;
  for (let x = -gs + off; x < W + gs; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -gs + off; y < H + gs; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  if (G.state === 'play' || G.state === 'dead') renderWorld(hue);
  ctx.restore();
  // flash
  if (G.flash > 0) { ctx.fillStyle = hsl(G.flashHue, 90, 70, G.flash * 0.35); ctx.fillRect(0, 0, W, H); }
  if (G.stageFlash > 0) { ctx.fillStyle = hsl(hue, 80, 60, Math.min(0.25, G.stageFlash * 0.2)); ctx.fillRect(0, 0, W, H); }
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, MIN * 0.45, W / 2, H / 2, MIN * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (G.state === 'title') renderTitle(hue); else { renderHUD(hue); if (G.state === 'dead') renderDead(hue); }
  // cursor
  if (input.aimSrc === 'mouse' && input.mouseIn) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(input.mx, input.my, 5, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(input.mx - 9, input.my); ctx.lineTo(input.mx - 3, input.my); ctx.moveTo(input.mx + 3, input.my); ctx.lineTo(input.mx + 9, input.my); ctx.moveTo(input.mx, input.my - 9); ctx.lineTo(input.mx, input.my - 3); ctx.moveTo(input.mx, input.my + 3); ctx.lineTo(input.mx, input.my + 9); ctx.stroke(); }
}
function renderWorld(hue) {
  const L = dashLen();
  // thread trail (the stitching left behind)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of G.trail) { const a = Math.max(0, 1 - s.t / 9); ctx.strokeStyle = hsl(hue, 70, 72, 0.08 + a * 0.5); ctx.lineWidth = 1.2 + a * 1.4; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
  // aim preview
  if (G.state === 'play' && !G.dash) {
    const pts = buildPath(G.px, G.py, input.aimX, input.aimY, L);
    ctx.setLineDash([4, 10]); ctx.lineDashOffset = -(G.t * 90) % 14; ctx.strokeStyle = hsl(hue, 70, 85, 0.35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); ctx.setLineDash([]);
    const e = pts[pts.length - 1]; ctx.fillStyle = hsl(hue, 70, 85, 0.5); ctx.beginPath(); ctx.arc(e.x, e.y, 3, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  // waves
  for (const w of G.waves) { const u = easeOutCubic(w.t), r = lerp(w.r, w.max, u); ctx.strokeStyle = hsl(w.hue, 90, 70, (1 - w.t) * 0.7); ctx.lineWidth = (1 - w.t) * 6 + 1; ctx.beginPath(); ctx.arc(w.x, w.y, r, 0, TAU); ctx.stroke(); }
  // rings
  const blind = modOn(2);
  for (const r of G.rings) {
    let vis = 1;
    if (blind) { const d = Math.hypot(r.x - G.px, r.y - G.py); vis = clamp(1.6 - d / (L * 0.8), 0, 1); }
    if (r.hit) { const u = r.popT / 0.25; ctx.strokeStyle = hsl(hue, 90, 80, (1 - u) * 0.9); ctx.lineWidth = 4 * (1 - u) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 + u * 1.4), 0, TAU); ctx.stroke(); continue; }
    if (vis <= 0.01) continue;
    const urgency = r.age / r.life, pulse = 0.5 + 0.5 * Math.sin(G.t * (4 + urgency * 10) + r.seed);
    const l = 60 + pulse * 15, a = vis * (0.55 + urgency * 0.4);
    ctx.strokeStyle = hsl(hue, 85, l, a * 0.25); ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = hsl(hue, 85, l + 10, a); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
    // perfect zone
    ctx.strokeStyle = hsl(48, 90, 70, vis * (0.25 + pulse * 0.25)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * 0.33, 0, TAU); ctx.stroke();
    ctx.fillStyle = hsl(48, 95, 75, vis * (0.5 + pulse * 0.5)); ctx.beginPath(); ctx.arc(r.x, r.y, 2.2 + pulse, 0, TAU); ctx.fill();
  }
  // knots
  for (const k of G.knots) {
    const a = Math.min(1, k.born * 1.6), r = k.r * a;
    ctx.strokeStyle = hsl(355, 85, 55, 0.9 * a); ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const t = i / 40 * TAU; const rr = r * (0.55 + 0.45 * Math.sin(t * 3 + k.ph) * Math.cos(t * 2 - k.ph * 0.7)); const x = k.x + Math.cos(t * 2 + k.ph * 0.3) * rr, y = k.y + Math.sin(t * 3) * rr; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = hsl(355, 90, 50, 0.22 * a); ctx.beginPath(); ctx.arc(k.x, k.y, r, 0, TAU); ctx.fill();
  }
  // particles
  for (const p of G.parts) { const u = 1 - p.t / p.life; ctx.fillStyle = hsl(p.hue, 90, 70, u); ctx.fillRect(p.x - p.size * u, p.y - p.size * u, p.size * 2 * u, p.size * 2 * u); }
  // needle
  const ax = input.aimX, ay = input.aimY, nl = Math.max(22, MIN * 0.026), nw = nl * 0.24;
  const tipx = G.px + ax * nl, tipy = G.py + ay * nl, tailx = G.px - ax * nl * 0.8, taily = G.py - ay * nl * 0.8;
  ctx.fillStyle = hsl(hue, 60, 85, 0.25); ctx.beginPath(); ctx.arc(G.px, G.py, G.dash ? 14 : 9, 0, TAU); ctx.fill();
  ctx.fillStyle = hsl(45, 90, 92, 1); ctx.beginPath(); ctx.moveTo(tipx, tipy); ctx.lineTo(G.px - ay * nw, G.py + ax * nw); ctx.lineTo(tailx, taily); ctx.lineTo(G.px + ay * nw, G.py - ax * nw); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hsl(hue, 40, 10); ctx.beginPath(); ctx.arc(tailx + ax * 5, taily + ay * 5, 1.6, 0, TAU); ctx.fill(); // eye of the needle
  ctx.globalCompositeOperation = 'source-over';
  // floating text
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const dur = t.big ? 1.3 : 0.9, u = t.t / dur, pop = easeOutBack(Math.min(1, t.t / 0.25));
    ctx.font = `${t.big ? 800 : 700} ${(t.big ? 30 : 18) * pop}px system-ui,sans-serif`;
    ctx.fillStyle = hsl(t.hue, 90, 75, 1 - u * u); ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    const y = t.y - u * 40; ctx.strokeText(t.s, t.x, y); ctx.fillText(t.s, t.x, y);
  }
}
function renderHUD(hue) {
  ctx.textBaseline = 'alphabetic';
  // score
  ctx.textAlign = 'left'; ctx.font = '800 44px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(Math.round(G.score).toLocaleString(), 28, 58);
  ctx.font = '600 16px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('BEST ' + save.best.toLocaleString(), 30, 82);
  if (G.combo >= 2) { const s = 1 + 0.45 * Math.max(0, G.comboPop || 0); ctx.font = `800 ${28 * s}px system-ui,sans-serif`; ctx.fillStyle = hsl(G.combo >= 10 ? 48 : hue, 90, 75); ctx.fillText('x' + G.combo, 30, 118); ctx.font = '600 13px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText('COMBO', 30 + ctx.measureText('x' + G.combo).width * 1.9 + 8, 118); }
  // thread spool bar
  const bw = Math.min(520, W * 0.5), bx = W / 2 - bw / 2, by = 30, bh = 14;
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(bx, by, bw, bh, 7); ctx.fill();
  const u = clamp(G.thread / THREAD_MAX, 0, 1), low = G.thread < 25;
  const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0); grad.addColorStop(0, hsl(low ? 0 : hue, 85, 55)); grad.addColorStop(1, hsl(low ? 20 : hue + 40, 90, 70));
  ctx.fillStyle = grad; if (u > 0) { roundRect(bx, by, Math.max(bh, bw * u), bh, 7); ctx.fill(); }
  if (low) { ctx.strokeStyle = hsl(0, 90, 60, 0.5 + 0.5 * Math.sin(G.t * 12)); ctx.lineWidth = 2; roundRect(bx - 2, by - 2, bw + 4, bh + 4, 9); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.font = '700 12px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('THREAD', W / 2, by + bh + 16);
  // stage
  ctx.textAlign = 'right'; ctx.font = '800 20px system-ui,sans-serif'; ctx.fillStyle = hsl(hue, 80, 75, 0.9); ctx.fillText(stageOf(G.stage).name + (G.stage >= STAGES.length ? ' ' + (G.stage + 1) : ''), W - 28, 50);
  ctx.font = '600 13px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)'; const toNext = STITCHES_PER_STAGE - (G.stitches % STITCHES_PER_STAGE); ctx.fillText(toNext + ' to next', W - 28, 70);
  const mods = MODS.filter((m, i) => modOn(i)).map(m => m.name).join(' + '); if (mods) { ctx.fillStyle = hsl(48, 80, 70, 0.8); ctx.fillText(mods, W - 28, 90); }
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function renderTitle(hue) {
  const t = G.titleT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // decorative drifting rings
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) { const a = t * 0.3 + i * TAU / 6; const x = W / 2 + Math.cos(a) * MIN * 0.36, y = H / 2 + Math.sin(a * 1.3) * MIN * 0.28; ctx.strokeStyle = hsl((hue + i * 40) % 360, 80, 65, 0.25); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 30 + 10 * Math.sin(t * 2 + i), 0, TAU); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
  const pop = easeOutBack(Math.min(1, t / 0.6));
  ctx.font = `900 ${Math.round(MIN * 0.17 * pop)}px system-ui,sans-serif`; ctx.fillStyle = hsl(45, 90, 90); ctx.fillText('STITCH', W / 2, H * 0.3);
  ctx.font = '600 20px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('Aim and dash through the eyes. Every dash spends thread; every stitch earns it back. Walls ricochet. Knots snag.', W / 2, H * 0.43);
  ctx.fillStyle = hsl(hue, 80, 75); ctx.font = '600 17px system-ui,sans-serif';
  ctx.fillText('Hit the gold center for PERFECT. Thread two eyes in one dash for a chord.', W / 2, H * 0.48);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '500 15px system-ui,sans-serif';
  ctx.fillText('MOUSE: aim, click to dash  ·  KEYBOARD: arrows/WASD aim, Space dash  ·  GAMEPAD: stick aim, A dash  ·  R restart  ·  M mute', W / 2, H * 0.55);
  // modifiers
  const mw = Math.min(900, W - 40), mx0 = W / 2 - mw / 2, cw = mw / 3, my = H * 0.64;
  for (let i = 0; i < 3; i++) {
    const m = MODS[i], ul = m.unlock(), on = modOn(i), x = mx0 + cw * i + 8, w = cw - 16;
    ctx.fillStyle = on ? hsl(48, 80, 60, 0.18) : 'rgba(255,255,255,0.05)'; roundRect(x, my, w, 78, 10); ctx.fill();
    ctx.strokeStyle = on ? hsl(48, 90, 70, 0.9) : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; roundRect(x, my, w, 78, 10); ctx.stroke();
    ctx.font = '800 16px system-ui,sans-serif'; ctx.fillStyle = ul ? (on ? hsl(48, 90, 80) : 'rgba(255,255,255,0.85)') : 'rgba(255,255,255,0.3)'; ctx.fillText((i + 1) + '  ' + m.name + (ul ? (on ? '  ON' : '') : '  LOCKED'), x + w / 2, my + 24);
    ctx.font = '500 13px system-ui,sans-serif'; ctx.fillStyle = ul ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)'; ctx.fillText(ul ? m.desc : 'unlock: ' + m.hint, x + w / 2, my + 50);
    m._box = { x, y: my, w, h: 78 };
  }
  ctx.font = '600 14px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText('press 1 / 2 / 3 (or d-pad) to toggle run modifiers', W / 2, my + 100);
  const blink = 0.55 + 0.45 * Math.sin(t * 4);
  ctx.font = '800 24px system-ui,sans-serif'; ctx.fillStyle = hsl(45, 90, 85, blink); ctx.fillText('click  ·  space  ·  A   to begin', W / 2, H * 0.86);
  ctx.font = '500 14px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('best ' + save.best.toLocaleString() + '   ·   best combo x' + save.bestCombo + '   ·   ' + save.totalStitches + ' stitches in ' + save.runs + ' runs', W / 2, H * 0.92);
}
function renderDead(hue) {
  const u = Math.min(1, G.deadT / 0.5), pop = easeOutBack(u);
  ctx.fillStyle = `rgba(0,0,0,${0.55 * u})`; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(56 * pop)}px system-ui,sans-serif`; ctx.fillStyle = hsl(0, 70, 75); ctx.fillText('OUT OF THREAD', W / 2, H * 0.3);
  ctx.font = `800 ${Math.round(72 * pop)}px system-ui,sans-serif`; ctx.fillStyle = 'white'; ctx.fillText(Math.round(G.score).toLocaleString(), W / 2, H * 0.44);
  if (G.newBest) { ctx.font = '800 26px system-ui,sans-serif'; ctx.fillStyle = hsl(48, 95, 70, 0.6 + 0.4 * Math.sin(G.deadT * 8)); ctx.fillText('NEW BEST', W / 2, H * 0.52); }
  else { ctx.font = '600 18px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('best ' + save.best.toLocaleString(), W / 2, H * 0.52); }
  ctx.font = '600 17px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(`${G.stitches} stitches  ·  best combo x${G.maxCombo}  ·  ${G.perfects} perfect  ·  ${G.multis} multi  ·  ${Math.round(G.runTime)}s  ·  reached ${stageOf(G.stage).name}`, W / 2, H * 0.6);
  if (G.deadT > 0.5) { const blink = 0.55 + 0.45 * Math.sin(G.deadT * 5); ctx.font = '800 22px system-ui,sans-serif'; ctx.fillStyle = hsl(45, 90, 85, blink); ctx.fillText('click  ·  space  ·  A   to go again      (Esc: title)', W / 2, H * 0.72); }
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05;
  update(dt); render(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
