// OCEAN — stage 1 (D Dorian, 72 BPM). A deep-blue water column: surface caustics and drifting light
// shafts, layered seafloor / kelp silhouettes with depth haze, bioluminescent plankton, rising bubbles,
// marine snow, and line-clear particles that become glowing fish schooling in bait-ball orbits on either
// side of the playfield. A humpback drifts through the haze as the stage blooms.
import {
  TAU, clamp, lerp, smooth, makeCanvas, rgba, mix, shade, rand, glowSprite, drawGlow, fbm1, Ring,
} from '../sceneKit.js';

export const theme = {
  accent: '#6ff3ff',
  accent2: '#9fc8ff',
  tints: {
    I: '#3fe6ef', // lagoon cyan
    O: '#f4d36c', // sunlit sand
    T: '#b07cff', // violet jelly
    S: '#4ff0a2', // sea-glass green
    Z: '#ff6b81', // coral
    J: '#4a7cff', // deep blue
    L: '#ffa04f', // clownfish orange
    G: '#5f7f96',
  },
  panel: { fill: 'rgba(2,16,34,0.56)', grid: 'rgba(130,220,255,0.075)', border: 'rgba(120,230,255,0.6)' },
  particle: {
    colors: ['#7ff6ff', '#3fd8e6', '#6fb8ff', '#b8fff2', '#5ff0c8'],
    shape: 'bubble', gravity: -40, drag: 0.7, size: [2, 5.5], glow: true,
  },
  text: '#e8fbff',
};

// Large / per-frame buffers: prefer a DOM canvas (GPU-backed; OffscreenCanvas may be CPU-backed and
// re-uploaded on every drawImage). Falls back to makeCanvas off the main thread / in node.
function bigCanvas(w, h) {
  if (typeof document === 'undefined') return makeCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// glowSprite() returns an OffscreenCanvas; copy it once into a DOM canvas for the same reason.
const domGlowCache = new Map();
function glow(color, size, core) {
  const key = color + '|' + size + '|' + core;
  let c = domGlowCache.get(key);
  if (!c) {
    const src = glowSprite(color, size, core);
    if (typeof document === 'undefined') c = src;
    else { c = bigCanvas(size, size); c.getContext('2d').drawImage(src, 0, 0); }
    domGlowCache.set(key, c);
  }
  return c;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Glass block: translucent body (fresnel — denser at the rim), an inner glow, a caustic-ish ripple,
// specular highlight and a bright top edge.
export function drawBlock(ctx, s, color, type, variant = 0) {
  const p = s * 0.045, r = s * 0.16, w = s - p * 2;
  const R = rand(17 + variant * 31 + (type?.charCodeAt?.(0) ?? 0));
  ctx.save();
  rrect(ctx, p, p, w, w, r);
  const body = ctx.createRadialGradient(s * 0.5, s * 0.42, s * 0.05, s * 0.5, s * 0.5, s * 0.72);
  body.addColorStop(0, rgba(shade(color, 0.3), 0.5));
  body.addColorStop(0.55, rgba(color, 0.62));
  body.addColorStop(1, rgba(shade(color, -0.45), 0.95));
  ctx.fillStyle = body; ctx.fill();
  ctx.clip();
  // inner glow core
  ctx.globalCompositeOperation = 'lighter';
  const core = ctx.createRadialGradient(s * 0.5, s * 0.58, 0, s * 0.5, s * 0.58, s * 0.45);
  core.addColorStop(0, rgba(shade(color, 0.55), 0.5));
  core.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = core; ctx.fillRect(0, 0, s, s);
  // faint caustic ripples inside the glass
  ctx.strokeStyle = rgba(shade(color, 0.7), 0.16); ctx.lineWidth = Math.max(0.6, s * 0.025);
  for (let k = 0; k < 3; k++) {
    const y0 = s * (0.35 + k * 0.18 + R() * 0.06);
    ctx.beginPath(); ctx.moveTo(0, y0);
    ctx.bezierCurveTo(s * 0.3, y0 - s * (0.08 + R() * 0.08), s * 0.6, y0 + s * (0.08 + R() * 0.08), s, y0 - s * 0.04);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // specular sheen on the upper-left
  const spec = ctx.createLinearGradient(0, p, 0, s * 0.5);
  spec.addColorStop(0, 'rgba(255,255,255,0.55)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.ellipse(s * 0.42, s * 0.16, s * 0.36, s * 0.13, -0.12, 0, TAU);
  ctx.fill();
  // darker lower-right depth
  const dep = ctx.createLinearGradient(s * 0.3, s * 0.3, s, s);
  dep.addColorStop(0, 'rgba(0,10,30,0)');
  dep.addColorStop(1, 'rgba(0,10,30,0.35)');
  ctx.fillStyle = dep; ctx.fillRect(0, 0, s, s);
  ctx.restore();
  // fresnel rim + top edge glint
  ctx.lineWidth = Math.max(1, s * 0.055);
  rrect(ctx, p + ctx.lineWidth / 2, p + ctx.lineWidth / 2, w - ctx.lineWidth, w - ctx.lineWidth, r * 0.85);
  const rim = ctx.createLinearGradient(0, 0, s, s);
  rim.addColorStop(0, rgba(shade(color, 0.75), 0.95));
  rim.addColorStop(0.5, rgba(shade(color, 0.25), 0.55));
  rim.addColorStop(1, rgba(shade(color, 0.5), 0.8));
  ctx.strokeStyle = rim; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(s * 0.24, s * 0.22, Math.max(0.8, s * 0.045), 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------- offscreen art (built lazily, in resize)

function causticTile(N, seed) {
  const c = bigCanvas(N, N), g = c.getContext('2d');
  const img = g.createImageData(N, N), d = img.data;
  const R = rand(seed), P = 18, px = new Float32Array(P), py = new Float32Array(P);
  for (let i = 0; i < P; i++) { px[i] = R() * N; py[i] = R() * N; }
  const half = N / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let f1 = 1e9, f2 = 1e9;
    for (let i = 0; i < P; i++) {
      let dx = Math.abs(x - px[i]); if (dx > half) dx = N - dx;
      let dy = Math.abs(y - py[i]); if (dy > half) dy = N - dy;
      const dd = dx * dx + dy * dy;
      if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
    }
    const e = Math.sqrt(f2) - Math.sqrt(f1);
    const v = Math.exp(-e * 0.42);
    const o = (y * N + x) * 4;
    d[o] = 170; d[o + 1] = 245; d[o + 2] = 255; d[o + 3] = Math.round(v * v * 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}

function shaftSprite(color) {
  const W = 64, H = 256, c = bigCanvas(W, H), g = c.getContext('2d');
  g.beginPath(); g.moveTo(W * 0.36, 0); g.lineTo(W * 0.64, 0); g.lineTo(W, H); g.lineTo(0, H); g.closePath();
  const hg = g.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, rgba(color, 0)); hg.addColorStop(0.5, rgba(color, 1)); hg.addColorStop(1, rgba(color, 0));
  g.fillStyle = hg; g.fill();
  g.globalCompositeOperation = 'destination-in';
  const vg = g.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,1)'); vg.addColorStop(0.35, 'rgba(0,0,0,0.55)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}

function bubbleSprite() {
  const S = 32, c = bigCanvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S * 0.5, S * 0.5, S * 0.2, S * 0.5, S * 0.5, S * 0.48);
  gr.addColorStop(0, 'rgba(160,240,255,0.04)'); gr.addColorStop(0.8, 'rgba(170,240,255,0.22)'); gr.addColorStop(1, 'rgba(200,250,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(210,250,255,0.75)'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.4, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(S * 0.37, S * 0.35, S * 0.08, 0, TAU); g.fill();
  return c;
}

const fishCache = new Map();
function fishFrames(color) {
  let f = fishCache.get(color);
  if (f) return f;
  f = [];
  for (let k = 0; k < 4; k++) {
    const W = 80, H = 40, c = bigCanvas(W, H), g = c.getContext('2d');
    const halo = g.createRadialGradient(W * 0.5, H / 2, 0, W * 0.5, H / 2, H * 0.55);
    halo.addColorStop(0, rgba(color, 0.42)); halo.addColorStop(0.5, rgba(color, 0.12)); halo.addColorStop(1, rgba(color, 0));
    g.fillStyle = halo; g.fillRect(0, 0, W, H);
    g.translate(W * 0.5, H / 2);
    const L = W * 0.46, bend = Math.sin(k / 4 * TAU) * 0.38;
    const bg = g.createLinearGradient(L * 0.55, 0, -L * 0.35, 0);
    bg.addColorStop(0, rgba(mix(color, '#ffffff', 0.8), 0.95)); bg.addColorStop(0.45, rgba(color, 0.9)); bg.addColorStop(1, rgba(color, 0.5));
    g.fillStyle = bg;
    g.beginPath(); g.moveTo(L * 0.55, 0);
    g.quadraticCurveTo(L * 0.2, -H * 0.21, -L * 0.3, -H * 0.035);
    g.lineTo(-L * 0.3, H * 0.035);
    g.quadraticCurveTo(L * 0.2, H * 0.21, L * 0.55, 0);
    g.fill();
    g.save(); g.translate(-L * 0.28, 0); g.rotate(bend);
    g.fillStyle = rgba(color, 0.7);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-L * 0.3, -H * 0.18); g.quadraticCurveTo(-L * 0.2, 0, -L * 0.3, H * 0.18); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(L * 0.36, -H * 0.03, 1.4, 0, TAU); g.fill();
    f.push(c);
  }
  fishCache.set(color, f);
  return f;
}

function whaleSprite(L) {
  const W = Math.ceil(L * 1.12), H = Math.ceil(L * 0.5), c = bigCanvas(W, H), g = c.getContext('2d');
  g.translate(L * 0.08, H * 0.36);
  const X = v => v * L, Y = v => v * L;
  g.beginPath();
  g.moveTo(X(1.0), Y(0.015));
  g.bezierCurveTo(X(0.95), Y(-0.075), X(0.72), Y(-0.105), X(0.5), Y(-0.085));
  g.bezierCurveTo(X(0.33), Y(-0.07), X(0.18), Y(-0.04), X(0.07), Y(-0.012));
  g.quadraticCurveTo(X(0.02), Y(-0.03), X(-0.06), Y(-0.085));
  g.quadraticCurveTo(X(-0.02), Y(-0.01), X(-0.065), Y(0.06));
  g.quadraticCurveTo(X(0.02), Y(0.02), X(0.07), Y(0.012));
  g.bezierCurveTo(X(0.25), Y(0.055), X(0.5), Y(0.1), X(0.7), Y(0.085));
  g.bezierCurveTo(X(0.88), Y(0.07), X(0.98), Y(0.05), X(1.0), Y(0.015));
  g.closePath();
  const bg = g.createLinearGradient(0, Y(-0.1), 0, Y(0.1));
  bg.addColorStop(0, '#2e6f93'); bg.addColorStop(0.35, '#123a58'); bg.addColorStop(1, '#061a2c');
  g.fillStyle = bg; g.fill();
  // long humpback pectoral fin
  g.beginPath();
  g.moveTo(X(0.74), Y(0.07));
  g.quadraticCurveTo(X(0.66), Y(0.2), X(0.5), Y(0.29));
  g.quadraticCurveTo(X(0.6), Y(0.16), X(0.64), Y(0.08));
  g.closePath();
  g.fillStyle = '#0b2a42'; g.fill();
  // throat grooves + dorsal hint
  g.strokeStyle = 'rgba(120,200,240,0.18)'; g.lineWidth = Math.max(1, L * 0.003);
  for (let k = 0; k < 6; k++) {
    g.beginPath(); g.moveTo(X(0.97 - k * 0.012), Y(0.03 + k * 0.008));
    g.quadraticCurveTo(X(0.82), Y(0.075 + k * 0.006), X(0.66), Y(0.075 + k * 0.004)); g.stroke();
  }
  g.fillStyle = '#0d3049';
  g.beginPath(); g.moveTo(X(0.3), Y(-0.06)); g.quadraticCurveTo(X(0.27), Y(-0.095), X(0.24), Y(-0.06)); g.fill();
  // rim light from the surface
  g.globalCompositeOperation = 'source-atop';
  const rim = g.createLinearGradient(0, Y(-0.11), 0, Y(-0.04));
  rim.addColorStop(0, 'rgba(170,240,255,0.55)'); rim.addColorStop(1, 'rgba(170,240,255,0)');
  g.fillStyle = rim; g.fillRect(X(-0.1), Y(-0.12), X(1.2), Y(0.1));
  return c;
}

// ---------------------------------------------------------------- scene

export function createScene({ w, h, seed = 1, reduced = false } = {}) {
  let W = w, H = h;
  let bgDim = null, bgRich = null, farLayer = null, midLayer = null, vignette = null, dangerTex = null;
  let stat = null, statBloom = -1, lightBuf = null, lightCtx = null;
  function buildStatic(bl) {
    if (!stat || stat.width !== Math.ceil(W) || stat.height !== Math.ceil(H)) stat = bigCanvas(W, H);
    const g = stat.getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(bgDim, 0, 0, W, H);
    g.globalAlpha = smooth(clamp(bl * 1.05));
    g.drawImage(bgRich, 0, 0, W, H);
    g.globalAlpha = 1;
    g.drawImage(farLayer, -margin, 0);
    g.drawImage(midLayer, -margin, 0);
    g.globalAlpha = 0.85 - bl * 0.25;
    g.drawImage(vignette, 0, 0, W, H);
    g.globalAlpha = 1;
    statBloom = bl;
  }
  let caustic = null, causticBuf = null, causticPat = null, causticCtx = null;
  let shaftImg = null, bubbleImg = null, whale = null, whaleL = 0;
  const glowCols = theme.particle.colors;
  let plGlow = null, anemoneGlow = null;
  let margin = 0;

  const R = rand(seed * 977 + 13);
  let t = 0, bloomS = 0, dangerS = 0, swell = 0, cam = 0;
  let field = null;

  // ambient pools (fixed, allocated once)
  const PLANK = 150, SNOW = 70, BUB = 48, SHAFTS = 7, KELP = 10;
  const plank = Array.from({ length: PLANK }, () => ({ x: R(), y: R(), ph: R() * TAU, sp: 0.4 + R() * 0.9, c: (R() * glowCols.length) | 0, z: 0.5 + R() * 0.8, k: R() }));
  const snow = Array.from({ length: SNOW }, () => ({ x: R(), y: R(), sp: 0.004 + R() * 0.01, ph: R() * TAU, z: 0.4 + R() * 1.2 }));
  const bubbles = Array.from({ length: BUB }, () => ({ alive: false, x: 0, y: 0, r: 0, vy: 0, ph: 0 }));
  const shafts = Array.from({ length: SHAFTS }, (_, i) => ({ x: (i + 0.3 + R() * 0.5) / SHAFTS, a: (R() - 0.5) * 0.28 + 0.1, wd: 0.05 + R() * 0.07, ph: R() * TAU, sp: 0.08 + R() * 0.12 }));
  const kelp = [];
  const vents = [];
  const anemones = [];
  let bubbleTimer = 0;

  // fish
  const fish = new Ring(120);
  const schools = Array.from({ length: 4 }, (_, i) => ({ bx: 0, by: 0, x: 0, y: 0, rx: 1, ry: 1, ph: R() * TAU, dir: i % 2 ? 1 : -1, spin: 0.35 + R() * 0.2 }));

  function defaultField() {
    const cell = Math.floor(H * 0.84 / 20);
    return { x: Math.round(W / 2 - cell * 5), y: Math.round(H / 2 - cell * 10), w: cell * 10, h: cell * 20 };
  }

  function layoutSchools() {
    const f = field ?? defaultField();
    const lw = Math.max(40, f.x), rw = Math.max(40, W - (f.x + f.w));
    const spots = [[f.x - lw * 0.5, 0.3], [f.x + f.w + rw * 0.5, 0.36], [f.x - lw * 0.52, 0.66], [f.x + f.w + rw * 0.48, 0.7]];
    schools.forEach((s, i) => {
      s.bx = spots[i][0]; s.by = H * spots[i][1];
      const sw = i % 2 ? rw : lw;
      s.rx = sw * 0.3; s.ry = H * 0.09; s.wx = sw * 0.14;
      s.x = s.bx; s.y = s.by;
    });
  }

  function buildBackdrop() {
    // gradients are smooth: render them small and scale up
    const bw = 320, bh = 180;
    bgDim = bigCanvas(bw, bh);
    let g = bgDim.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, bh);
    gr.addColorStop(0, '#0b4766'); gr.addColorStop(0.18, '#073451'); gr.addColorStop(0.5, '#04203a');
    gr.addColorStop(0.8, '#021327'); gr.addColorStop(1, '#010a18');
    g.fillStyle = gr; g.fillRect(0, 0, bw, bh);
    let rg = g.createRadialGradient(bw * 0.5, -bh * 0.25, 0, bw * 0.5, -bh * 0.25, bh * 0.95);
    rg.addColorStop(0, 'rgba(90,190,220,0.35)'); rg.addColorStop(1, 'rgba(90,190,220,0)');
    g.fillStyle = rg; g.fillRect(0, 0, bw, bh);

    bgRich = bigCanvas(bw, bh);
    g = bgRich.getContext('2d');
    gr = g.createLinearGradient(0, 0, 0, bh);
    gr.addColorStop(0, '#22b4c9'); gr.addColorStop(0.16, '#0f7a9e'); gr.addColorStop(0.45, '#0a3f73');
    gr.addColorStop(0.78, '#06224a'); gr.addColorStop(1, '#03122c');
    g.fillStyle = gr; g.fillRect(0, 0, bw, bh);
    rg = g.createRadialGradient(bw * 0.42, -bh * 0.2, 0, bw * 0.42, -bh * 0.2, bh * 1.05);
    rg.addColorStop(0, 'rgba(190,255,250,0.55)'); rg.addColorStop(0.5, 'rgba(80,210,230,0.15)'); rg.addColorStop(1, 'rgba(80,210,230,0)');
    g.fillStyle = rg; g.fillRect(0, 0, bw, bh);
    rg = g.createRadialGradient(bw * 0.15, bh * 0.95, 0, bw * 0.15, bh * 0.95, bh * 0.6);
    rg.addColorStop(0, 'rgba(60,40,140,0.35)'); rg.addColorStop(1, 'rgba(60,40,140,0)');
    g.fillStyle = rg; g.fillRect(0, 0, bw, bh);

    vignette = bigCanvas(bw, bh);
    g = vignette.getContext('2d');
    rg = g.createRadialGradient(bw / 2, bh * 0.48, bh * 0.35, bw / 2, bh * 0.5, bw * 0.62);
    rg.addColorStop(0, 'rgba(0,4,14,0)'); rg.addColorStop(1, 'rgba(0,4,14,0.72)');
    g.fillStyle = rg; g.fillRect(0, 0, bw, bh);

    dangerTex = bigCanvas(bw, bh);
    g = dangerTex.getContext('2d');
    rg = g.createRadialGradient(bw / 2, bh * 0.45, bh * 0.2, bw / 2, bh * 0.5, bw * 0.6);
    rg.addColorStop(0, 'rgba(60,0,12,0)'); rg.addColorStop(0.6, 'rgba(70,0,16,0.35)'); rg.addColorStop(1, 'rgba(40,0,8,0.85)');
    g.fillStyle = rg; g.fillRect(0, 0, bw, bh);
    gr = g.createLinearGradient(0, bh * 0.6, 0, bh);
    gr.addColorStop(0, 'rgba(150,10,30,0)'); gr.addColorStop(1, 'rgba(150,10,30,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, bw, bh);
  }

  function kelpStrand(g, x, base, height, width, col, Rk) {
    const n = 16; let px = x, py = base;
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round';
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const nx = x + Math.sin(u * 3.2 + x * 0.01) * width * 3 * u;
      const ny = base - height * u;
      g.lineWidth = width * (1 - u * 0.6);
      g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      if (i % 2 === 0 && u < 0.95) {
        const side = i % 4 === 0 ? 1 : -1;
        g.beginPath(); g.ellipse(nx + side * width * 1.6, ny + width, width * 1.8 * (1 - u * 0.4), width * 0.6, side * 0.6 - 0.2, 0, TAU); g.fill();
      }
      px = nx; py = ny;
    }
  }

  function buildLayers() {
    margin = Math.ceil(W * 0.03);
    const LW = W + margin * 2;
    const keepL = W / 2 - H * 0.24, keepR = W / 2 + H * 0.24;
    // FAR: distant ridges + kelp forest in deep haze
    farLayer = bigCanvas(LW, H);
    let g = farLayer.getContext('2d');
    const ridge = fbm1(seed * 31 + 5, 5);
    g.fillStyle = 'rgba(14,52,84,0.75)';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= LW; x += 6) g.lineTo(x, H * (0.74 + ridge(x / W * 5) * 0.12));
    g.lineTo(LW, H); g.closePath(); g.fill();
    const Rf = rand(seed * 7 + 3);
    for (let i = 0; i < 38; i++) {
      const x = Rf() * LW;
      const base = H * (0.82 + Rf() * 0.06);
      const ht = H * (0.18 + Rf() * 0.35) * (x > keepL && x < keepR ? 0.5 : 1);
      kelpStrand(g, x, base, ht, H * (0.0035 + Rf() * 0.003), 'rgba(16,58,88,0.55)', Rf);
    }
    let haze = g.createLinearGradient(0, H * 0.55, 0, H);
    haze.addColorStop(0, 'rgba(10,50,80,0)'); haze.addColorStop(1, 'rgba(8,40,70,0.55)');
    g.fillStyle = haze; g.fillRect(0, 0, LW, H);

    // MID: seafloor, rocks, coral fans and anemones
    midLayer = bigCanvas(LW, H);
    g = midLayer.getContext('2d');
    const floor = fbm1(seed * 53 + 9, 5);
    const fy = x => H * (0.86 + floor(x / W * 7) * 0.09);
    const fg = g.createLinearGradient(0, H * 0.82, 0, H);
    fg.addColorStop(0, '#0a2a40'); fg.addColorStop(1, '#03101d');
    g.fillStyle = fg;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= LW; x += 5) g.lineTo(x, fy(x));
    g.lineTo(LW, H); g.closePath(); g.fill();
    // light on the sand crest
    g.strokeStyle = 'rgba(110,200,230,0.18)'; g.lineWidth = 2;
    g.beginPath(); for (let x = 0; x <= LW; x += 5) { const y = fy(x) + 1; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    const Rm = rand(seed * 11 + 1);
    // rocks
    for (let i = 0; i < 14; i++) {
      const x = Rm() * LW; if (x > keepL && x < keepR && Rm() < 0.7) continue;
      const rw = H * (0.03 + Rm() * 0.07), rh = rw * (0.45 + Rm() * 0.3), y = fy(x) + rh * 0.3;
      const rg = g.createLinearGradient(0, y - rh, 0, y + rh * 0.4);
      rg.addColorStop(0, '#174560'); rg.addColorStop(1, '#04121e');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, rw, rh, 0, Math.PI, TAU); g.fill();
    }
    // coral fans (branching)
    const branch = (x, y, ang, len, wd, d) => {
      if (d === 0 || len < 2) return;
      const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
      g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      branch(nx, ny, ang - 0.35 - Rm() * 0.25, len * 0.74, wd * 0.72, d - 1);
      branch(nx, ny, ang + 0.35 + Rm() * 0.25, len * 0.74, wd * 0.72, d - 1);
    };
    g.lineCap = 'round';
    const coralCols = ['#6b2a5c', '#7a3a3f', '#3d3a7a', '#1f5a5a'];
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : 0;
      const x = side ? keepR + H * 0.08 + Rm() * (LW - keepR - H * 0.12) : margin + Rm() * (keepL - H * 0.1 - margin);
      g.strokeStyle = coralCols[i % coralCols.length];
      branch(x, fy(x) + 4, -Math.PI / 2 + (Rm() - 0.5) * 0.4, H * (0.035 + Rm() * 0.03), H * 0.009, 6);
    }
    anemones.length = 0;
    for (let i = 0; i < 16; i++) {
      const x = Rm() * LW; if (x > keepL - 20 && x < keepR + 20) continue;
      const y = fy(x) + 2;
      const c = ['#ff7fd0', '#7ff6ff', '#b58cff', '#6fffc0'][i % 4];
      g.strokeStyle = rgba(mix(c, '#0a2030', 0.55), 0.9); g.lineWidth = 1.5;
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI / 2 + (k - 4) * 0.16;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 12, x + Math.cos(a) * 12, y + Math.sin(a) * 16); g.stroke();
      }
      anemones.push({ x, y: y - 10, c, k: i % 4, ph: Rm() * TAU });
    }
    haze = g.createLinearGradient(0, H * 0.8, 0, H);
    haze.addColorStop(0, 'rgba(2,12,24,0)'); haze.addColorStop(1, 'rgba(2,10,20,0.45)');
    g.fillStyle = haze; g.fillRect(0, 0, LW, H);

    // NEAR kelp strands (animated), only at the sides
    kelp.length = 0;
    const Rk = rand(seed * 5 + 77);
    for (let i = 0; i < KELP; i++) {
      const side = i % 2;
      const x = side ? W - Rk() * W * 0.16 : Rk() * W * 0.16;
      kelp.push({ x, h: H * (0.35 + Rk() * 0.4), wd: H * (0.008 + Rk() * 0.006), ph: Rk() * TAU, sp: 0.5 + Rk() * 0.4 });
    }
    vents.length = 0;
    for (let i = 0; i < 5; i++) {
      const x = i < 3 ? W * (0.05 + Rk() * 0.25) : W * (0.7 + Rk() * 0.25);
      vents.push({ x, y: H * 0.92 });
    }
  }

  const api = {
    get creatures() { return fish.length; },
    resize(nw, nh) {
      W = nw; H = nh;
      if (!caustic) caustic = causticTile(224, seed * 3 + 1);
      if (!shaftImg) shaftImg = shaftSprite('#c8f8ff');
      if (!bubbleImg) bubbleImg = bubbleSprite();
      plGlow = glowCols.map(c => glow(c, 48, 0.12));
      anemoneGlow = ['#ff7fd0', '#7ff6ff', '#b58cff', '#6fffc0'].map(c => glow(c, 64, 0.1));
      whaleL = Math.min(W * 0.42, H * 0.95);
      whale = whaleSprite(whaleL);
      causticBuf = bigCanvas(Math.ceil(W / 2), Math.ceil(H * 0.3));
      causticCtx = causticBuf.getContext('2d');
      causticPat = causticCtx.createPattern(caustic, 'repeat');
      lightBuf = bigCanvas(Math.ceil(W / 2), Math.ceil(H / 2));
      lightCtx = lightBuf.getContext('2d');
      stat = null;
      api._cfade = null;
      buildBackdrop();
      buildLayers();
      layoutSchools();
    },
    absorbTarget(r = Math.random) {
      const s = schools[(r() * schools.length) | 0];
      return { x: s.x + (r() - 0.5) * s.rx, y: s.y + (r() - 0.5) * s.ry };
    },
    absorb(x, y, color) {
      let best = 0, bd = 1e18;
      schools.forEach((s, i) => { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
      const c = color || glowCols[0];
      fishFrames(c);
      fish.add({ x, y, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, ang: Math.random() * TAU, school: best,
        r: 0.25 + Math.random() * 0.75, ph: Math.random() * TAU, sp: 0.8 + Math.random() * 0.4, size: 0.6 + Math.random() * 0.55,
        tail: Math.random() * 4, age: 0, c, dy: (Math.random() - 0.5) * 0.9 });
    },
    update(dt, env) {
      const mo = env.reduced || reduced ? 0.45 : 1;
      t += dt * mo;
      if (env.field) field = env.field;
      bloomS = lerp(bloomS, env.bloom ?? 0, 1 - Math.exp(-2 * dt));
      if (Math.abs(bloomS - (env.bloom ?? 0)) > 0.5) bloomS = env.bloom ?? 0;
      dangerS = lerp(dangerS, env.danger ?? 0, 1 - Math.exp(-3 * dt));
      swell = Math.max((env.beatPulse ?? 0) * 0.6, (env.kick ?? 0));
      cam = Math.sin(t * 0.045) * margin * 0.8;
      // school anchors drift
      layoutSchoolsIfNeeded();
      for (const s of schools) {
        s.x = s.bx + Math.sin(t * 0.07 + s.ph) * s.wx;
        s.y = s.by + Math.cos(t * 0.053 + s.ph * 1.3) * H * 0.07;
      }
      // fish steering: orbit their school's centre in a loose bait ball
      for (const f of fish) {
        const s = schools[f.school];
        f.age += dt;
        const a = t * s.spin * f.sp * s.dir + f.ph;
        const tx = s.x + Math.cos(a) * s.rx * f.r;
        const ty = s.y + Math.sin(a) * s.ry * f.r + f.dy * s.ry * 0.6 + Math.sin(t * 0.9 + f.ph) * 5;
        const ax = (tx - f.x) * 1.6 - f.vx * 1.1, ay = (ty - f.y) * 1.6 - f.vy * 1.1;
        f.vx += ax * dt * mo; f.vy += ay * dt * mo;
        f.x += f.vx * dt * mo; f.y += f.vy * dt * mo;
        const sp = Math.hypot(f.vx, f.vy);
        if (sp > 2) {
          const ta = Math.atan2(f.vy, f.vx);
          let d = ta - f.ang; d -= Math.round(d / TAU) * TAU;
          f.ang += d * Math.min(1, dt * 6);
        }
        f.tail += dt * (5 + sp * 0.06) * mo;
      }
      // bubbles
      bubbleTimer -= dt;
      const bubRate = (0.9 + bloomS * 2.6) * (env.reduced || reduced ? 0.4 : 1) * (env.quality ?? 1);
      if (bubbleTimer <= 0) {
        bubbleTimer = 1 / Math.max(0.1, bubRate);
        const b = bubbles.find(o => !o.alive);
        if (b && vents.length) {
          const v = vents[(Math.random() * vents.length) | 0];
          b.alive = true; b.x = v.x + (Math.random() - 0.5) * 14; b.y = v.y; b.r = H * (0.003 + Math.random() * 0.006);
          b.vy = H * (0.06 + Math.random() * 0.06); b.ph = Math.random() * TAU;
        }
      }
      for (const b of bubbles) {
        if (!b.alive) continue;
        b.y -= b.vy * dt * mo; b.r += dt * 0.6; b.x += Math.sin(t * 3 + b.ph) * 0.4 * mo;
        if (b.y < -20) b.alive = false;
      }
    },
    draw(ctx, env) {
      if (!bgDim) api.resize(W, H);
      const bl = bloomS, dg = dangerS;
      const q = (env.quality ?? 1) * (env.reduced || reduced ? 0.45 : 1);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      if (!stat || Math.abs(bl - statBloom) > 0.015) buildStatic(bl);
      ctx.drawImage(stat, 0, 0);
      // whale in the haze
      const wa = smooth(clamp((bl - 0.55) / 0.35));
      if (wa > 0.01) {
        const period = 150;
        const u = ((t / period) + 0.24) % 1;
        const wx = lerp(-whaleL * 1.15, W + whaleL * 0.1, u);
        const wy = H * 0.17 + Math.sin(t * 0.18) * H * 0.02;
        ctx.save();
        ctx.translate(wx, wy); ctx.rotate(Math.sin(t * 0.18 + 1) * 0.03);
        ctx.globalAlpha = wa * 0.6 * (1 - dg * 0.5);
        ctx.drawImage(whale, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      // light: caustics + shafts composed at half resolution, one additive upscale
      const cg = causticCtx, cw = causticBuf.width, ch = causticBuf.height;
      cg.globalCompositeOperation = 'source-over'; cg.globalAlpha = 1;
      cg.clearRect(0, 0, cw, ch);
      cg.globalCompositeOperation = 'lighter';
      cg.fillStyle = causticPat;
      cg.setTransform(0.75, 0, 0, 0.32, (t * 6) % (224 * 0.75), (t * 2.5) % (224 * 0.32));
      cg.globalAlpha = 0.6; cg.fillRect(-300, -300, cw / 0.75 + 600, ch / 0.32 + 600);
      cg.setTransform(-0.62, 0.05, 0, 0.3, cw + (t * 5) % (224 * 0.62), (t * 2) % (224 * 0.3));
      cg.globalAlpha = 0.5; cg.fillRect(-300, -300, cw / 0.62 + 600, ch / 0.3 + 600);
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.globalCompositeOperation = 'destination-in'; cg.globalAlpha = 1;
      if (!api._cfade) {
        const fg = cg.createLinearGradient(0, 0, 0, ch);
        fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(0.35, 'rgba(0,0,0,0.5)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
        api._cfade = fg;
      }
      cg.fillStyle = api._cfade; cg.fillRect(0, 0, cw, ch);
      const lg = lightCtx, lw = lightBuf.width, lh = lightBuf.height;
      lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
      lg.clearRect(0, 0, lw, lh);
      lg.globalCompositeOperation = 'lighter';
      lg.globalAlpha = clamp((0.3 + 0.55 * bl + swell * 0.1) * (1 - dg * 0.5));
      lg.drawImage(causticBuf, 0, 0, lw, lh * 0.34);
      const shaftA = (0.08 + 0.2 * bl) * (1 - dg * 0.6) + swell * 0.04;
      for (const s of shafts) {
        const sw = lw * s.wd * (1 + bl * 0.6);
        const x = (s.x * W + Math.sin(t * s.sp + s.ph) * W * 0.03) * 0.5;
        const a = s.a + Math.sin(t * s.sp * 0.7 + s.ph) * 0.04;
        const ca = Math.cos(a), sa = Math.sin(a);
        lg.setTransform(ca, sa, -sa, ca, x, -lh * 0.04);
        lg.globalAlpha = clamp(shaftA * (0.55 + 0.45 * Math.sin(t * s.sp * 1.7 + s.ph * 2)));
        lg.drawImage(shaftImg, -sw / 2, 0, sw, lh * (0.75 + bl * 0.4));
      }
      lg.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(lightBuf, 0, 0, W, H);
      // anemone glow — appears with bloom
      const anA = smooth(clamp((bl - 0.15) / 0.6));
      if (anA > 0.01) for (const an of anemones) {
        drawGlow(ctx, anemoneGlow[an.k], an.x - margin, an.y, H * 0.028 * (1 + swell * 0.15), anA * (0.55 + 0.25 * Math.sin(t * 1.3 + an.ph)));
      }
      // plankton (bioluminescent), dimmed behind the field
      const fx0 = field ? field.x : W / 2 - H * 0.21, fx1 = field ? field.x + field.w : W / 2 + H * 0.21;
      const nPl = Math.round(lerp(30, PLANK, bl) * q);
      for (let i = 0; i < nPl; i++) {
        const p = plank[i];
        let x = (p.x * W + Math.sin(t * 0.21 * p.sp + p.ph) * 40 + cam * p.z) % W; if (x < 0) x += W;
        let y = (p.y * H - t * 6 * p.sp) % H; if (y < 0) y += H;
        const tw = 0.5 + 0.5 * Math.sin(t * 1.7 * p.sp + p.ph);
        let a = (0.25 + 0.6 * tw * tw) * (0.5 + 0.5 * bl) + swell * 0.12;
        if (x > fx0 && x < fx1) a *= 0.35;
        drawGlow(ctx, plGlow[p.c], x, y, (2.5 + p.z * 4) * (H / 900) * (1 + tw * 0.5), a);
      }
      // fish
      const fsc = H / 900 * 0.85;
      for (const f of fish) {
        const fr = fishFrames(f.c)[(f.tail | 0) & 3];
        const sc = f.size * fsc;
        const ca = Math.cos(f.ang) * sc, sa = Math.sin(f.ang) * sc;
        if (f.age < 1.2) { // arrival flash
          const k = 1 - f.age / 1.2;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          drawGlow(ctx, plGlow[0], f.x, f.y, 30 * k * (H / 900) + 4, k);
        }
        ctx.globalAlpha = 0.85 + swell * 0.15;
        ctx.setTransform(ca, sa, -sa, ca, f.x, f.y);
        ctx.drawImage(fr, -40, -20);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // bubbles
      ctx.globalAlpha = 0.85;
      for (const b of bubbles) if (b.alive) ctx.drawImage(bubbleImg, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      // marine snow
      ctx.fillStyle = 'rgb(190,230,240)';
      const nSn = Math.round(SNOW * q);
      for (let i = 0; i < nSn; i++) {
        const p = snow[i];
        const x = ((p.x * W + Math.sin(t * 0.3 + p.ph) * 12 + cam * p.z * 1.4) % W + W) % W;
        const y = ((p.y * H + t * p.sp * H) % H);
        ctx.globalAlpha = 0.12 + 0.18 * p.z * (0.6 + bl * 0.4);
        const sz = p.z * 1.6 * (H / 900);
        ctx.fillRect(x, y, sz, sz);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // near kelp (dark foreground silhouettes, swaying)
      ctx.fillStyle = ctx.strokeStyle = 'rgba(3,16,26,0.93)';
      ctx.lineCap = 'round';
      for (const k of kelp) {
        const n = 14, base = H + 6, x0 = k.x + cam * 1.6;
        let px = x0, py = base;
        for (let i = 1; i <= n; i++) {
          const u = i / n;
          const nx = x0 + Math.sin(t * k.sp + k.ph + u * 2.6) * u * u * H * 0.05 + Math.sin(u * 4 + k.ph) * k.wd * 2;
          const ny = base - k.h * u;
          ctx.lineWidth = k.wd * (1 - u * 0.55);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
          if (i % 2 === 0 && i < n) {
            const side = i % 4 ? 1 : -1;
            const ang = -Math.PI / 2 + side * (0.75 + Math.sin(t * k.sp * 1.3 + i + k.ph) * 0.18);
            const bl2 = k.wd * 4.2 * (1 - u * 0.35);
            ctx.beginPath();
            ctx.ellipse(nx + Math.cos(ang) * bl2 * 0.9, ny + Math.sin(ang) * bl2 * 0.9, bl2, k.wd * 0.55, ang, 0, TAU);
            ctx.fill();
          }
          px = nx; py = ny;
        }
      }
      // vignette + danger murk
      if (dg > 0.01) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = dg * 0.55;
        ctx.fillStyle = '#ff7a86';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = dg * (0.75 + 0.15 * Math.sin(t * 2.2));
        ctx.drawImage(dangerTex, 0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  let lastFieldKey = '';
  function layoutSchoolsIfNeeded() {
    const f = field; if (!f) return;
    const key = `${f.x}|${f.w}|${W}|${H}`;
    if (key !== lastFieldKey) { lastFieldKey = key; layoutSchools(); }
  }
  return api;
}
