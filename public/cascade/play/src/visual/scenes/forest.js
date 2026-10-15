// FOREST — stage 2 (G major pentatonic, 88 BPM). A green dusk forest seen through layers of trunks and
// canopy fading into haze; a low sun behind the trees throws god-rays through the gaps; leaves drift down,
// pollen hangs in the light, and line-clear particles become fireflies that wander and blink. As the stage
// blooms the dusk warms into a golden sunset, fireflies multiply, and mushrooms and flowers glow on the floor.
import {
  TAU, clamp, lerp, smooth, makeCanvas, rgba, mix, shade, rand, glowSprite, drawGlow, fbm1, Ring,
} from '../sceneKit.js';

export const theme = {
  accent: '#f0dc7a',
  accent2: '#a6e07a',
  tints: {
    I: '#6fd8bc', // mint moss
    O: '#f2c84a', // gold
    T: '#c58ad8', // heather
    S: '#94d44c', // fresh leaf
    Z: '#e2643e', // maple red
    J: '#5b90d2', // dusk blue
    L: '#ef9a3a', // amber
    G: '#80795f',
  },
  panel: { fill: 'rgba(8,20,12,0.58)', grid: 'rgba(210,240,160,0.07)', border: 'rgba(236,220,140,0.55)' },
  particle: {
    colors: ['#eaff8c', '#c9f562', '#ffd66e', '#fff2a8', '#b8ff9a'],
    shape: 'dot', gravity: -12, drag: 0.8, size: [2, 4.5], glow: true,
  },
  text: '#f6f3dc',
};

// Large / per-frame buffers: prefer a DOM canvas (GPU-backed; OffscreenCanvas may be CPU-backed and
// re-uploaded on every drawImage). Falls back to makeCanvas off the main thread / in node.
function cnv(w, h) {
  if (typeof document === 'undefined') return makeCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
const domGlowCache = new Map();
function glow(color, size, core) {
  const key = color + '|' + size + '|' + core;
  let c = domGlowCache.get(key);
  if (!c) {
    const src = glowSprite(color, size, core);
    if (typeof document === 'undefined') c = src;
    else { c = cnv(size, size); c.getContext('2d').drawImage(src, 0, 0); }
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

// Leaf-veined wood: warm tinted plank with wavy grain, an occasional knot, a leaf midrib with side veins
// pressed into the surface, bevelled light edge and a dark rim.
export function drawBlock(ctx, s, color, type, variant = 0) {
  const p = s * 0.04, r = s * 0.12, w = s - p * 2;
  const R = rand(91 + variant * 57 + (type?.charCodeAt?.(0) ?? 0) * 13);
  ctx.save();
  rrect(ctx, p, p, w, w, r);
  const base = ctx.createLinearGradient(0, 0, s, s);
  base.addColorStop(0, shade(color, 0.22));
  base.addColorStop(0.55, color);
  base.addColorStop(1, shade(color, -0.32));
  ctx.fillStyle = base; ctx.fill();
  ctx.clip();
  // warm wood undertone
  ctx.fillStyle = 'rgba(120,70,20,0.12)'; ctx.fillRect(0, 0, s, s);
  // grain
  ctx.lineCap = 'round';
  const lines = 9;
  // growth-ring bands
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 ? 'rgba(255,240,200,0.07)' : 'rgba(60,30,0,0.08)';
    ctx.fillRect(0, s * k / 4 + R() * s * 0.05, s, s * 0.14);
  }
  for (let k = 0; k < lines; k++) {
    const y0 = s * ((k + 0.3 + R() * 0.5) / lines);
    ctx.strokeStyle = rgba(shade(color, -0.6), 0.3 + R() * 0.22);
    ctx.lineWidth = Math.max(0.7, s * (0.016 + R() * 0.022));
    ctx.beginPath(); ctx.moveTo(-2, y0);
    ctx.bezierCurveTo(s * 0.3, y0 + s * (R() - 0.5) * 0.12, s * 0.65, y0 + s * (R() - 0.5) * 0.12, s + 2, y0 + s * (R() - 0.5) * 0.06);
    ctx.stroke();
  }
  if (variant % 2 === 1) {
    const kx = s * (0.25 + R() * 0.5), ky = s * (0.25 + R() * 0.5);
    ctx.strokeStyle = rgba(shade(color, -0.6), 0.35); ctx.lineWidth = Math.max(0.6, s * 0.02);
    ctx.beginPath(); ctx.ellipse(kx, ky, s * 0.09, s * 0.05, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(kx, ky, s * 0.04, s * 0.02, 0, 0, TAU); ctx.stroke();
  }
  // leaf vein: midrib + side veins (light, pressed in)
  const ax = s * 0.2, ay = s * 0.82, bx = s * 0.82, by = s * 0.2;
  ctx.strokeStyle = rgba(shade(color, 0.7), 0.62); ctx.lineWidth = Math.max(0.9, s * 0.04);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(s * 0.46, s * 0.46, bx, by); ctx.stroke();
  ctx.lineWidth = Math.max(0.6, s * 0.024);
  ctx.strokeStyle = rgba(shade(color, 0.65), 0.45);
  for (let k = 1; k <= 4; k++) {
    const u = k / 5, mx = lerp(ax, bx, u), my = lerp(ay, by, u), len = s * 0.22 * (1 - Math.abs(u - 0.45));
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx + len * 0.2, my + len * 0.05, mx + len * 0.7, my + len * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx - len * 0.05, my - len * 0.2, mx - len * 0.45, my - len * 0.7); ctx.stroke();
  }
  // bevel: lit top-left, shaded bottom-right
  const bev = ctx.createLinearGradient(0, 0, 0, s);
  bev.addColorStop(0, 'rgba(255,248,210,0.38)'); bev.addColorStop(0.16, 'rgba(255,248,210,0)');
  bev.addColorStop(0.82, 'rgba(20,10,0,0)'); bev.addColorStop(1, 'rgba(20,10,0,0.35)');
  ctx.fillStyle = bev; ctx.fillRect(0, 0, s, s);
  ctx.restore();
  ctx.lineWidth = Math.max(1, s * 0.045);
  rrect(ctx, p + ctx.lineWidth / 2, p + ctx.lineWidth / 2, w - ctx.lineWidth, w - ctx.lineWidth, r * 0.8);
  ctx.strokeStyle = rgba(shade(color, -0.68), 0.92); ctx.stroke();
  ctx.lineWidth = Math.max(0.6, s * 0.025);
  ctx.strokeStyle = rgba(shade(color, 0.6), 0.45);
  ctx.beginPath(); ctx.moveTo(p + r, p + s * 0.06); ctx.lineTo(s - p - r, p + s * 0.06); ctx.stroke();
}

// ---------------------------------------------------------------- offscreen art

function raySprite(color) {
  const W = 64, H = 256, c = cnv(W, H), g = c.getContext('2d');
  g.beginPath(); g.moveTo(W * 0.4, 0); g.lineTo(W * 0.6, 0); g.lineTo(W, H); g.lineTo(0, H); g.closePath();
  const hg = g.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, rgba(color, 0)); hg.addColorStop(0.5, rgba(color, 1)); hg.addColorStop(1, rgba(color, 0));
  g.fillStyle = hg; g.fill();
  g.globalCompositeOperation = 'destination-in';
  const vg = g.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0.2)'); vg.addColorStop(0.25, 'rgba(0,0,0,1)'); vg.addColorStop(0.6, 'rgba(0,0,0,0.5)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return c;
}

function leafSprite(color, seed) {
  const S = 32, c = cnv(S, S), g = c.getContext('2d'), R = rand(seed);
  g.translate(S / 2, S / 2); g.rotate(R() * 0.6 - 0.3);
  const L = S * 0.42, Wd = S * (0.16 + R() * 0.08);
  const gr = g.createLinearGradient(-L, 0, L, 0);
  gr.addColorStop(0, shade(color, -0.25)); gr.addColorStop(1, shade(color, 0.2));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(-L, 0);
  g.quadraticCurveTo(-L * 0.1, -Wd * 1.6, L, 0);
  g.quadraticCurveTo(-L * 0.1, Wd * 1.6, -L, 0);
  g.fill();
  g.strokeStyle = rgba(shade(color, 0.45), 0.6); g.lineWidth = 1;
  g.beginPath(); g.moveTo(-L * 1.1, 0); g.lineTo(L * 0.9, 0); g.stroke();
  return c;
}

// ---------------------------------------------------------------- scene

export function createScene({ w, h, seed = 1, reduced = false } = {}) {
  let W = w, H = h;
  let skyDim = null, skyRich = null, fogDim = null, fogRich = null, vignette = null, dangerTex = null;
  let farLayer = null, midLayer = null, nearL = null, nearR = null, nearW = 0;
  let stat = null, statBloom = -1, lightBuf = null, lightCtx = null, rayImg = null;
  let ffGlow = null, mushGlow = null, sunGlow = null, sunCore = null, leafImgs = null;
  const R = rand(seed * 613 + 29);
  let t = 0, bloomS = 0, dangerS = 0, swell = 0, cam = 0, field = null;

  const FF = 90, LEAVES = 42, MOTES = 70, RAYS = 7;
  const ffCols = theme.particle.colors;
  const amb = Array.from({ length: FF }, () => ({ x: R(), y: 0.25 + R() * 0.65, ph: R() * TAU, sp: 0.5 + R() * 0.8, bl: 0.6 + R() * 1.2, c: (R() * ffCols.length) | 0, ax: R() * TAU, z: 0.6 + R() * 0.8 }));
  const leaves = Array.from({ length: LEAVES }, () => ({ x: R(), y: R(), vy: 0.025 + R() * 0.035, ph: R() * TAU, rs: (R() - 0.5) * 2.5, fl: 1.5 + R() * 2, sz: 0.6 + R() * 0.8, k: (R() * 5) | 0, z: 0.5 + R() * 1 }));
  const motes = Array.from({ length: MOTES }, () => ({ x: R(), y: R(), ph: R() * TAU, sp: 0.3 + R() * 0.7 }));
  const rays = Array.from({ length: RAYS }, (_, i) => ({ a: 0.5 + i * 0.13 + (R() - 0.5) * 0.06, wd: 0.05 + R() * 0.08, ph: R() * TAU, sp: 0.07 + R() * 0.1 }));
  const flies = new Ring(120);
  const mush = [];

  function defaultField() {
    const cell = Math.floor(H * 0.84 / 20);
    return { x: Math.round(W / 2 - cell * 5), y: Math.round(H / 2 - cell * 10), w: cell * 10, h: cell * 20 };
  }

  function smallGrad(stops, extra) {
    const bw = 320, bh = 180, c = cnv(bw, bh), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, bh);
    for (const [k, col] of stops) gr.addColorStop(k, col);
    g.fillStyle = gr; g.fillRect(0, 0, bw, bh);
    if (extra) extra(g, bw, bh);
    return c;
  }

  function buildSky() {
    const sun = (g, bw, bh, col, a, rad) => {
      const rg = g.createRadialGradient(bw * 0.68, bh * 0.58, 0, bw * 0.68, bh * 0.58, bh * rad);
      rg.addColorStop(0, rgba(col, a)); rg.addColorStop(1, rgba(col, 0));
      g.fillStyle = rg; g.fillRect(0, 0, bw, bh);
    };
    skyDim = smallGrad([[0, '#08161c'], [0.3, '#122c2c'], [0.56, '#2b3f2c'], [0.7, '#1c2c1c'], [1, '#070f0a']],
      (g, bw, bh) => sun(g, bw, bh, '#8a8a4a', 0.35, 0.55));
    skyRich = smallGrad([[0, '#1a2448'], [0.25, '#3c4a5e'], [0.45, '#b5784e'], [0.58, '#f4b867'], [0.7, '#9a7a3e'], [1, '#1c1c0c']],
      (g, bw, bh) => { sun(g, bw, bh, '#ffe7a8', 0.9, 0.5); sun(g, bw, bh, '#ff9a6a', 0.25, 1.1); });
    fogDim = smallGrad([[0, 'rgba(40,70,60,0)'], [0.45, 'rgba(50,80,64,0.18)'], [0.75, 'rgba(46,72,56,0.42)'], [1, 'rgba(20,40,30,0.3)']]);
    fogRich = smallGrad([[0, 'rgba(240,170,110,0)'], [0.45, 'rgba(230,170,110,0.2)'], [0.72, 'rgba(210,160,100,0.42)'], [1, 'rgba(70,60,30,0.3)']]);
    vignette = cnv(320, 180);
    let g = vignette.getContext('2d');
    let rg = g.createRadialGradient(160, 90, 60, 160, 92, 200);
    rg.addColorStop(0, 'rgba(2,6,3,0)'); rg.addColorStop(1, 'rgba(2,6,3,0.75)');
    g.fillStyle = rg; g.fillRect(0, 0, 320, 180);
    dangerTex = cnv(320, 180);
    g = dangerTex.getContext('2d');
    rg = g.createRadialGradient(160, 85, 40, 160, 90, 190);
    rg.addColorStop(0, 'rgba(60,8,0,0)'); rg.addColorStop(0.6, 'rgba(70,10,0,0.35)'); rg.addColorStop(1, 'rgba(40,4,0,0.85)');
    g.fillStyle = rg; g.fillRect(0, 0, 320, 180);
    const lg = g.createLinearGradient(0, 110, 0, 180);
    lg.addColorStop(0, 'rgba(170,40,10,0)'); lg.addColorStop(1, 'rgba(170,40,10,0.35)');
    g.fillStyle = lg; g.fillRect(0, 0, 320, 180);
  }

  function trunk(g, x, base, top, wd, col, Rt, branches) {
    const lean = (Rt() - 0.5) * wd * 0.8;
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x - wd * 1.5, base);
    g.quadraticCurveTo(x - wd * 0.55, base - wd * 0.6, x - wd * 0.5, base - wd * 2);
    g.quadraticCurveTo(x - wd * 0.42 + lean * 0.5, (base + top) / 2, x - wd * 0.32 + lean, top);
    g.lineTo(x + wd * 0.32 + lean, top);
    g.quadraticCurveTo(x + wd * 0.42 + lean * 0.5, (base + top) / 2, x + wd * 0.5, base - wd * 2);
    g.quadraticCurveTo(x + wd * 0.55, base - wd * 0.6, x + wd * 1.5, base);
    g.closePath(); g.fill();
    g.strokeStyle = col; g.lineCap = 'round';
    for (let i = 0; i < branches; i++) {
      const u = 0.25 + Rt() * 0.55, by = lerp(top, base, u * 0.6), bx = x + lean * (1 - u);
      const side = Rt() < 0.5 ? -1 : 1, len = wd * (2 + Rt() * 4);
      g.lineWidth = wd * 0.22;
      g.beginPath(); g.moveTo(bx, by);
      g.quadraticCurveTo(bx + side * len * 0.6, by - len * 0.1, bx + side * len, by - len * 0.6); g.stroke();
    }
  }

  function canopy(g, LW, y0, y1, col, n, Rc, fb) {
    g.fillStyle = col;
    g.fillRect(0, 0, LW, y0);
    for (let i = 0; i < n; i++) {
      const x = Rc() * LW;
      const y = lerp(y0, y1, Math.pow(Rc(), 1.6)) * (0.7 + fb(x / LW * 6) * 0.6);
      const r = (y1 - y0) * (0.25 + Rc() * 0.5);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  }

  function groundLine(x, fb) { return H * (0.875 + fb(x / W * 5) * 0.06); }

  function buildLayers() {
    const f = field ?? defaultField();
    const keepL = f.x - H * 0.02, keepR = f.x + f.w + H * 0.02;
    const LW = W;
    // FAR — many thin pale trunks under a continuous hazy canopy
    farLayer = cnv(LW, H);
    let g = farLayer.getContext('2d');
    const Rf = rand(seed * 19 + 4), fbf = fbm1(seed * 3 + 1, 4);
    for (let i = 0; i < 30; i++) {
      const x = Rf() * LW;
      trunk(g, x, H * (0.8 + Rf() * 0.04), -10, H * (0.008 + Rf() * 0.008), 'rgba(40,66,58,0.55)', Rf, 2);
    }
    canopy(g, LW, H * 0.03, H * 0.2, 'rgba(30,54,46,0.6)', 70, Rf, fbf);
    g.fillStyle = 'rgba(34,58,46,0.6)';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= LW; x += 8) g.lineTo(x, H * (0.8 + fbf(x / W * 4 + 9) * 0.05));
    g.lineTo(LW, H); g.closePath(); g.fill();

    // MID — fewer, darker trunks at the sides, lower canopy, ground with grass, ferns, mushrooms
    midLayer = cnv(LW, H);
    g = midLayer.getContext('2d');
    const Rm = rand(seed * 41 + 7), fbm = fbm1(seed * 7 + 2, 5);
    const midCol = '#132a20';
    for (let i = 0; i < 12; i++) {
      const side = i % 2;
      const x = side ? keepR + H * 0.04 + Rm() * (LW - keepR - H * 0.04) : Rm() * (keepL - H * 0.04);
      trunk(g, x, groundLine(x, fbm) + 6, -10, H * (0.016 + Rm() * 0.014), midCol, Rm, 3);
    }
    canopy(g, LW, H * 0.0, H * 0.11, midCol, 55, Rm, fbm);
    // hanging leaf clusters from the canopy (sides only)
    for (let i = 0; i < 40; i++) {
      const x = Rm() * LW; if (x > keepL && x < keepR) continue;
      const y = H * (0.08 + Rm() * 0.12);
      g.beginPath(); g.ellipse(x, y, H * (0.012 + Rm() * 0.02), H * (0.008 + Rm() * 0.012), Rm() * 3, 0, TAU); g.fill();
    }
    const gg = g.createLinearGradient(0, H * 0.85, 0, H);
    gg.addColorStop(0, '#12261a'); gg.addColorStop(1, '#060d08');
    g.fillStyle = gg;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= LW; x += 5) g.lineTo(x, groundLine(x, fbm));
    g.lineTo(LW, H); g.closePath(); g.fill();
    // grass blades
    g.strokeStyle = '#0d1f14'; g.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      const x = Rm() * LW, y = groundLine(x, fbm) + 3, hh = H * (0.008 + Rm() * 0.022);
      g.lineWidth = 1 + Rm() * 1.6;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (Rm() - 0.5) * hh * 0.3, y - hh * 0.6, x + (Rm() - 0.5) * hh * 0.8, y - hh); g.stroke();
    }
    // mushrooms + flowers (their glow is drawn live)
    mush.length = 0;
    const mushCols = ['#7ff0e0', '#b9a2ff', '#ffb36a', '#8cf5ff'];
    const flowerCols = ['#ff9ad0', '#fff0b0', '#ffc2e0'];
    for (let i = 0; i < 26; i++) {
      const x = Rm() * LW; if (x > keepL - 10 && x < keepR + 10) continue;
      const y = groundLine(x, fbm) + 4;
      if (i % 3) {
        const cap = H * (0.006 + Rm() * 0.008), st = cap * (1.2 + Rm());
        g.fillStyle = '#0d1d14'; g.fillRect(x - cap * 0.18, y - st, cap * 0.36, st);
        g.fillStyle = '#16291c';
        g.beginPath(); g.ellipse(x, y - st, cap, cap * 0.6, 0, Math.PI, TAU); g.fill();
        mush.push({ x, y: y - st - cap * 0.2, r: cap * 4.5, k: i % 4, ph: Rm() * TAU, flower: false });
      } else {
        const st = H * (0.012 + Rm() * 0.012);
        g.strokeStyle = '#0f2316'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y - st * 0.5, x + 1, y - st); g.stroke();
        mush.push({ x: x + 1, y: y - st, r: H * 0.012, k: i % 3, ph: Rm() * TAU, flower: true });
      }
    }
    // ferns at the sides
    const fern = (x, y, sz, dir) => {
      g.strokeStyle = '#091610'; g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + dir * (0.3 + k * 0.28);
        const ex = x + Math.cos(a) * sz, ey = y + Math.sin(a) * sz;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a - dir * 0.4) * sz * 0.6, y + Math.sin(a - dir * 0.4) * sz * 0.6, ex, ey); g.stroke();
        for (let j = 1; j < 8; j++) {
          const u = j / 8, px = lerp(x, ex, u), py = lerp(y, ey, u) - Math.sin(u * Math.PI) * sz * 0.12, l = sz * 0.16 * (1 - u * 0.7);
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a - 1.2) * l, py + Math.sin(a - 1.2) * l); g.stroke();
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a + 1.2) * l, py + Math.sin(a + 1.2) * l); g.stroke();
        }
      }
    };
    for (let i = 0; i < 8; i++) {
      const side = i % 2;
      const x = side ? keepR + Rm() * (LW - keepR) : Rm() * keepL;
      fern(x, groundLine(x, fbm) + 8, H * (0.05 + Rm() * 0.05), side ? 1 : -1);
    }

    // NEAR — huge dark trunks framing each side + overhanging leaves (drawn live with parallax)
    nearW = Math.ceil(Math.max(W * 0.2, (f.x) * 0.55));
    const mkNear = (right) => {
      const c = cnv(nearW, H), q = c.getContext('2d'), Rn = rand(seed * 101 + (right ? 9 : 3));
      const col = '#040a06';
      const tx = right ? nearW * 0.68 : nearW * 0.3, tw = W * 0.042;
      q.fillStyle = col;
      q.beginPath();
      q.moveTo(tx - tw * 2.2, H); q.quadraticCurveTo(tx - tw * 0.9, H * 0.94, tx - tw * 0.85, H * 0.82);
      q.quadraticCurveTo(tx - tw * 0.7, H * 0.4, tx - tw * 0.62, -5);
      q.lineTo(tx + tw * 0.62, -5);
      q.quadraticCurveTo(tx + tw * 0.75, H * 0.4, tx + tw * 0.85, H * 0.82);
      q.quadraticCurveTo(tx + tw * 0.95, H * 0.94, tx + tw * 2.4, H); q.closePath(); q.fill();
      // bark rim light toward the sun (right side of the trunk)
      q.strokeStyle = 'rgba(150,170,110,0.07)'; q.lineWidth = 2;
      for (let k = 0; k < 14; k++) {
        const bx = tx + (Rn() - 0.5) * tw * 1.1, by = Rn() * H * 0.85;
        q.beginPath(); q.moveTo(bx, by); q.quadraticCurveTo(bx + (Rn() - 0.5) * 6, by + H * 0.04, bx + (Rn() - 0.5) * 4, by + H * (0.06 + Rn() * 0.08)); q.stroke();
      }
      const rim = q.createLinearGradient(tx + tw * 0.2, 0, tx + tw * 0.8, 0);
      rim.addColorStop(0, 'rgba(255,200,120,0)'); rim.addColorStop(1, 'rgba(255,200,120,0.07)');
      q.fillStyle = rim; q.fillRect(tx, 0, tw, H * 0.85);
      // overhanging leaf sprays from the top corner + ivy on the trunk
      q.fillStyle = col;
      for (let i = 0; i < 160; i++) {
        const u = Rn();
        const x = right ? nearW - u * nearW * 1.05 : u * nearW * 1.05;
        const y = Rn() * H * (0.22 - u * 0.14) + 2;
        q.save(); q.translate(x, y); q.rotate(Rn() * TAU);
        q.beginPath(); q.ellipse(0, 0, H * (0.012 + Rn() * 0.012), H * (0.005 + Rn() * 0.004), 0, 0, TAU); q.fill();
        q.restore();
      }
      for (let i = 0; i < 40; i++) {
        const y = H * (0.2 + Rn() * 0.6), x = tx + (Rn() - 0.5) * tw * 1.6;
        q.save(); q.translate(x, y); q.rotate(Rn() * TAU);
        q.beginPath(); q.ellipse(0, 0, H * 0.01, H * 0.005, 0, 0, TAU); q.fill(); q.restore();
      }
      // ground fern clump
      q.strokeStyle = col; q.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        const bx = right ? nearW * (0.2 + Rn() * 0.3) : nearW * (0.5 + Rn() * 0.3);
        const a = -Math.PI / 2 + (Rn() - 0.5) * 1.6, L = H * (0.06 + Rn() * 0.07);
        q.beginPath(); q.moveTo(bx, H + 4); q.quadraticCurveTo(bx + Math.cos(a) * L * 0.5, H + Math.sin(a) * L * 0.8, bx + Math.cos(a) * L, H + Math.sin(a) * L * 0.6); q.stroke();
      }
      return c;
    };
    nearL = mkNear(false); nearR = mkNear(true);
  }

  function buildStatic(bl) {
    if (!stat || stat.width !== Math.ceil(W) || stat.height !== Math.ceil(H)) stat = cnv(W, H);
    const g = stat.getContext('2d');
    const k = smooth(clamp(bl));
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(skyDim, 0, 0, W, H);
    g.globalAlpha = k; g.drawImage(skyRich, 0, 0, W, H);
    g.globalAlpha = 1;
    g.drawImage(farLayer, 0, 0);
    g.globalAlpha = 1 - k; g.drawImage(fogDim, 0, 0, W, H);
    g.globalAlpha = k; g.drawImage(fogRich, 0, 0, W, H);
    g.globalAlpha = 1;
    g.drawImage(midLayer, 0, 0);
    g.globalAlpha = 0.8 - k * 0.25;
    g.drawImage(vignette, 0, 0, W, H);
    g.globalAlpha = 1;
    statBloom = bl;
  }

  const api = {
    get creatures() { return flies.length; },
    resize(nw, nh) {
      W = nw; H = nh;
      if (!rayImg) rayImg = raySprite('#ffe2a0');
      ffGlow = ffCols.map(c => glow(c, 48, 0.1));
      mushGlow = ['#7ff0e0', '#b9a2ff', '#ffb36a', '#8cf5ff', '#ff9ad0', '#fff0b0', '#ffc2e0'].map(c => glow(c, 48, 0.12));
      sunGlow = glow('#ffcf7a', 128, 0.08); sunCore = glow('#fff4d0', 64, 0.3);
      leafImgs = ['#7aa83a', '#c99a2e', '#d8742c', '#a8b83c', '#b0442a'].map((c, i) => leafSprite(c, seed + i * 7));
      lightBuf = cnv(W / 2, H / 2); lightCtx = lightBuf.getContext('2d');
      buildSky(); buildLayers(); stat = null;
    },
    absorbTarget(r = Math.random) {
      const f = field ?? defaultField();
      const left = r() < 0.5;
      const x = left ? lerp(W * 0.04, f.x - W * 0.03, r()) : lerp(f.x + f.w + W * 0.03, W * 0.96, r());
      return { x, y: H * (0.18 + r() * 0.62) };
    },
    absorb(x, y, color) {
      const c = color || ffCols[0];
      let k = ffCols.indexOf(c); if (k < 0) k = (Math.random() * ffCols.length) | 0;
      flies.add({ x, y, hx: x, hy: y, ax: Math.random() * TAU, sp: 18 + Math.random() * 22, ph: Math.random() * TAU, bl: 0.5 + Math.random() * 1.1, k, age: 0 });
    },
    update(dt, env) {
      const mo = env.reduced || reduced ? 0.45 : 1;
      t += dt * mo;
      if (env.field) {
        const nf = env.field;
        if (!field || nf.x !== field.x || nf.w !== field.w) { field = { ...nf }; if (farLayer) { buildLayers(); stat = null; } }
      }
      const tb = env.bloom ?? 0;
      bloomS = Math.abs(bloomS - tb) > 0.5 ? tb : lerp(bloomS, tb, 1 - Math.exp(-2 * dt));
      dangerS = lerp(dangerS, env.danger ?? 0, 1 - Math.exp(-3 * dt));
      swell = Math.max((env.beatPulse ?? 0) * 0.6, env.kick ?? 0);
      cam = Math.sin(t * 0.05) * W * 0.008;
      const f = field ?? defaultField();
      for (const p of flies) {
        p.age += dt;
        p.ax += (Math.sin(t * 0.9 + p.ph) * 1.4 + Math.sin(t * 2.3 + p.ph * 2) * 0.8) * dt * mo;
        // tether to home so the swarm stays in its glade, and keep out of the field
        const dx = p.hx - p.x, dy = p.hy - p.y;
        let vx = Math.cos(p.ax) * p.sp + dx * 0.25, vy = Math.sin(p.ax) * p.sp * 0.7 + dy * 0.25;
        if (p.x > f.x - 10 && p.x < f.x + f.w + 10) vx += (p.x < f.x + f.w / 2 ? -60 : 60);
        p.x += vx * dt * mo; p.y += vy * dt * mo;
      }
    },
    draw(ctx, env) {
      if (!skyDim) api.resize(W, H);
      const bl = bloomS, dg = dangerS, k = smooth(clamp(bl));
      const q = (env.quality ?? 1) * (env.reduced || reduced ? 0.4 : 1);
      const sc = H / 900;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!stat || Math.abs(bl - statBloom) > 0.015) buildStatic(bl);
      ctx.drawImage(stat, 0, 0);
      // sun + god-rays at half resolution, one additive upscale
      const lg = lightCtx, lw = lightBuf.width, lh = lightBuf.height;
      lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
      lg.clearRect(0, 0, lw, lh);
      lg.globalCompositeOperation = 'lighter';
      const sx = lw * 0.68, sy = lh * 0.58;
      const sunA = (0.22 + 0.6 * k) * (1 - dg * 0.5) + swell * 0.06;
      drawGlow(lg, sunGlow, sx, sy, lh * (0.3 + 0.25 * k + swell * 0.02), sunA);
      drawGlow(lg, sunCore, sx, sy, lh * (0.05 + 0.04 * k), sunA * 0.8);
      const ox = lw * 0.86, oy = -lh * 0.22;
      const rayA = (0.09 + 0.24 * k) * (1 - dg * 0.6) + swell * 0.04;
      for (const r of rays) {
        const a = r.a + Math.sin(t * r.sp + r.ph) * 0.025;
        const ca = Math.cos(a), sa = Math.sin(a);
        lg.setTransform(ca, sa, -sa, ca, ox, oy);
        lg.globalAlpha = clamp(rayA * (0.5 + 0.5 * Math.sin(t * r.sp * 2.1 + r.ph)));
        const rw = lw * r.wd;
        lg.drawImage(rayImg, -rw / 2, 0, rw, lh * 1.5);
      }
      lg.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(lightBuf, 0, 0, W, H);
      // mushroom / flower glow — the floor wakes with bloom
      const mA = smooth(clamp((bl - 0.1) / 0.6));
      if (mA > 0.01) for (const m of mush) {
        const img = m.flower ? mushGlow[4 + m.k] : mushGlow[m.k];
        drawGlow(ctx, img, m.x, m.y, m.r * (m.flower ? 1.6 : 1) * (1 + swell * 0.12), mA * (0.6 + 0.3 * Math.sin(t * 1.1 + m.ph)) * (1 - dg * 0.4));
      }
      // pollen motes drifting in the light
      ctx.fillStyle = 'rgb(255,236,180)';
      const nM = Math.round(lerp(20, MOTES, k) * q);
      for (let i = 0; i < nM; i++) {
        const m = motes[i];
        const x = ((m.x * W + Math.sin(t * 0.2 * m.sp + m.ph) * 30) % W + W) % W;
        const y = ((m.y * H + Math.sin(t * 0.15 * m.sp + m.ph * 2) * 40 - t * 3 * m.sp) % H + H) % H;
        ctx.globalAlpha = (0.15 + 0.35 * k) * (0.5 + 0.5 * Math.sin(t * 1.3 + m.ph));
        ctx.fillRect(x, y, 1.6 * sc, 1.6 * sc);
      }
      // ambient fireflies (count grows with bloom), dimmed behind the field
      const f = field ?? defaultField();
      const nA = Math.round(lerp(10, FF, k) * q);
      for (let i = 0; i < nA; i++) {
        const p = amb[i];
        const x = p.x * W + Math.sin(t * 0.13 * p.sp + p.ph) * W * 0.05 + Math.sin(t * 0.37 * p.sp + p.ax) * 20 + cam * p.z;
        const y = p.y * H + Math.cos(t * 0.11 * p.sp + p.ph * 1.7) * H * 0.04 + Math.sin(t * 0.5 + p.ax) * 10;
        const b = Math.pow(Math.max(0, Math.sin(t * p.bl + p.ph)), 4);
        let a = 0.12 + 0.85 * b + swell * 0.1;
        if (x > f.x && x < f.x + f.w) a *= 0.3;
        drawGlow(ctx, ffGlow[p.c], x, y, (3 + 9 * b) * sc * p.z, a * (1 - dg * 0.3));
      }
      // absorbed fireflies (persistent, brighter)
      for (const p of flies) {
        const b = Math.pow(Math.max(0, Math.sin(t * p.bl * 1.3 + p.ph)), 3);
        if (p.age < 1) drawGlow(ctx, ffGlow[p.k], p.x, p.y, 34 * sc * (1 - p.age), 1 - p.age);
        drawGlow(ctx, ffGlow[p.k], p.x, p.y, (9 + 18 * b) * sc, 0.4 + 0.6 * b + swell * 0.15);
        drawGlow(ctx, sunCore, p.x, p.y, (2.5 + 2 * b) * sc, 0.7 + 0.3 * b);
      }
      ctx.globalCompositeOperation = 'source-over';
      // falling leaves
      const nL = Math.round(lerp(10, LEAVES, k) * q);
      for (let i = 0; i < nL; i++) {
        const l = leaves[i];
        const y = ((l.y + t * l.vy) % 1.1) * H - H * 0.05;
        const x = ((l.x * W + Math.sin(t * 0.8 / l.fl + l.ph) * W * 0.03 + cam * l.z * 1.5) % W + W) % W;
        const rot = t * l.rs + l.ph, flip = Math.cos(t * l.fl + l.ph);
        const s2 = l.sz * l.z * sc * 0.9;
        const c = Math.cos(rot), s = Math.sin(rot);
        ctx.setTransform(c * s2 * flip, s * s2 * flip, -s * s2, c * s2, x, y);
        ctx.globalAlpha = 0.85 * (x > f.x && x < f.x + f.w ? 0.45 : 1);
        ctx.drawImage(leafImgs[l.k], -16, -16);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      // near frame (parallax)
      ctx.drawImage(nearL, -W * 0.012 + cam * 1.8, 0);
      ctx.drawImage(nearR, W - nearW + W * 0.012 + cam * 1.8, 0);
      // danger: reddened, smoky dusk
      if (dg > 0.01) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = dg * 0.5;
        ctx.fillStyle = '#e8644c';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = dg * (0.75 + 0.15 * Math.sin(t * 2.2));
        ctx.drawImage(dangerTex, 0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  return api;
}
