// DESERT — E Phrygian dominant, 96 BPM. Layered dunes under a huge low sun; as bloom grows the sky deepens
// into dusk, stars and a milky way come out, a caravan crosses the ridge and ruins surface from the haze.
// Line-clear particles become new stars that knit themselves into constellations.
import {
  TAU, clamp, lerp, smooth, ease, makeCanvas, rgba, mix, shade, rand, glowSprite, drawGlow, fbm1, noise1, Ring, hexToRgb,
} from '../sceneKit.js';

const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a)));

export const theme = {
  accent: '#ffb35c',
  accent2: '#5fd8c8',
  tints: { I: '#38c4b6', O: '#e9b73f', T: '#c4689c', S: '#92b356', Z: '#d4553a', J: '#3f6fd0', L: '#f28a30', G: '#9c8b78' },
  panel: { fill: 'rgba(30,16,14,0.6)', grid: 'rgba(255,214,160,0.075)', border: 'rgba(255,186,120,0.6)' },
  particle: {
    colors: ['#ffd27a', '#ffb35c', '#8fe9dd', '#fff0cf', '#f7a08c'], shape: 'sand',
    gravity: -18, drag: 0.6, size: [1.5, 3.6], glow: true,
  },
  text: '#fff1de',
};

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- block skin: carved sandstone
export function drawBlock(ctx, s, color, type, variant = 0) {
  const R = rand(((String(type || 'G').charCodeAt(0) * 9973) + variant * 7919 + Math.round(s) * 31) >>> 0);
  const p = Math.max(1, s * 0.035), x0 = p, y0 = p, sz = s - 2 * p;
  const dark = '#2a1206', light = '#fff3dc';
  ctx.save();
  rrect(ctx, x0, y0, sz, sz, s * 0.07); ctx.clip();
  let g = ctx.createLinearGradient(0, 0, s * 0.35, s);
  g.addColorStop(0, shade(color, 0.2)); g.addColorStop(1, shade(color, -0.22));
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // layered strata
  const tilt = (R() - 0.5) * 0.22, steps = 14, top = new Float32Array(steps + 1);
  let y = -s * 0.04, k = 0;
  while (y < s * 1.1) {
    const th = s * (0.06 + R() * 0.13), tone = (R() - 0.5) * 0.3 + (k % 2 ? 0.05 : -0.05);
    const ph = R() * TAU, amp = s * (0.008 + R() * 0.022), fr = 0.6 + R() * 1.6;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const xx = (i / steps) * s; top[i] = y + tilt * xx + Math.sin(ph + fr * (i / steps) * TAU) * amp;
      i ? ctx.lineTo(xx, top[i]) : ctx.moveTo(xx, top[i]);
    }
    for (let i = steps; i >= 0; i--) {
      const xx = (i / steps) * s; ctx.lineTo(xx, y + th + tilt * xx + Math.sin(ph + 0.6 + fr * (i / steps) * TAU) * amp);
    }
    ctx.closePath();
    ctx.fillStyle = tone >= 0 ? rgba(light, tone * 0.85) : rgba(dark, -tone * 0.85); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const xx = (i / steps) * s; i ? ctx.lineTo(xx, top[i]) : ctx.moveTo(xx, top[i]); }
    ctx.strokeStyle = rgba(dark, 0.2); ctx.lineWidth = Math.max(0.6, s * 0.012); ctx.stroke();
    ctx.translate(0, Math.max(0.5, s * 0.01)); ctx.strokeStyle = rgba(light, 0.12); ctx.stroke(); ctx.translate(0, -Math.max(0.5, s * 0.01));
    y += th; k++;
  }
  // grain speckle
  const n = Math.min(1600, Math.round(s * s * 0.16)), gs = Math.max(0.7, s * 0.018);
  ctx.fillStyle = rgba(light, 0.22);
  for (let i = 0; i < n / 2; i++) ctx.fillRect(R() * s, R() * s, gs, gs);
  ctx.fillStyle = rgba(dark, 0.22);
  for (let i = 0; i < n / 2; i++) ctx.fillRect(R() * s, R() * s, gs, gs);
  // weathered pits
  const pits = 2 + Math.floor(R() * 3);
  for (let i = 0; i < pits; i++) {
    const px = s * (0.2 + R() * 0.6), py = s * (0.2 + R() * 0.6), pr = s * (0.02 + R() * 0.035);
    ctx.fillStyle = rgba(dark, 0.32); ctx.beginPath(); ctx.ellipse(px, py, pr * 1.3, pr, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(light, 0.25); ctx.beginPath(); ctx.ellipse(px + pr * 0.3, py + pr * 0.55, pr * 1.1, pr * 0.4, 0, 0, TAU); ctx.fill();
  }
  // carved bevel (light from top-left, warm)
  const b = s * 0.13, x1 = x0 + sz, y1 = y0 + sz;
  const quad = (ax, ay, bx, by, cx, cy, dx, dy, st) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); ctx.fillStyle = st; ctx.fill();
  };
  quad(x0, y0, x1, y0, x1 - b, y0 + b, x0 + b, y0 + b, rgba('#fff0d0', 0.36));
  quad(x0, y0, x0 + b, y0 + b, x0 + b, y1 - b, x0, y1, rgba('#ffe8c4', 0.17));
  quad(x1, y0, x1, y1, x1 - b, y1 - b, x1 - b, y0 + b, rgba('#30100a', 0.26));
  quad(x0, y1, x0 + b, y1 - b, x1 - b, y1 - b, x1, y1, rgba('#30100a', 0.42));
  // inner face: soft sunlit wash + edge line
  g = ctx.createRadialGradient(s * 0.35, s * 0.3, 0, s * 0.35, s * 0.3, s * 0.75);
  g.addColorStop(0, rgba('#fff2d8', 0.16)); g.addColorStop(1, rgba('#fff2d8', 0));
  ctx.fillStyle = g; ctx.fillRect(x0 + b, y0 + b, sz - 2 * b, sz - 2 * b);
  ctx.lineWidth = Math.max(0.7, s * 0.016);
  ctx.strokeStyle = rgba('#2a0f06', 0.28); ctx.strokeRect(x0 + b, y0 + b, sz - 2 * b, sz - 2 * b);
  ctx.strokeStyle = rgba('#fff5e0', 0.5); ctx.beginPath(); ctx.moveTo(x0 + s * 0.02, y0 + s * 0.02); ctx.lineTo(x1 - s * 0.03, y0 + s * 0.02); ctx.stroke();
  ctx.restore();
  rrect(ctx, x0, y0, sz, sz, s * 0.07);
  ctx.lineWidth = Math.max(1, s * 0.03); ctx.strokeStyle = rgba('#1e0a04', 0.55); ctx.stroke();
}

// ---------------------------------------------------------------- scene
const DUNES = [
  { base: 0.632, amp: 0.06, scale: 0.5, A: { lit: '#c2a08e', sh: '#9a8290', haze: '#d4b2a2' }, B: { lit: '#f0906a', sh: '#8a4472', haze: '#f6956a' } },
  { base: 0.71, amp: 0.085, scale: 0.42, A: { lit: '#c9a383', sh: '#8c7380', haze: '#c4a29a' }, B: { lit: '#f59b55', sh: '#733462', haze: '#e47a5e' } },
  { base: 0.815, amp: 0.11, scale: 0.38, A: { lit: '#cfa67c', sh: '#7e6574', haze: '#b4928e' }, B: { lit: '#ffa955', sh: '#5e2a56', haze: '#c45a58' } },
  { base: 0.95, amp: 0.13, scale: 0.46, A: { lit: '#d2a874', sh: '#6c5664', haze: '#9c8084' }, B: { lit: '#ffb862', sh: '#4a2042', haze: '#a34650' } },
];
const SKY_A = [[0, '#2e2a3e'], [0.28, '#55495f'], [0.46, '#8e7478'], [0.56, '#c49c8a'], [0.63, '#e6bd98'], [1, '#e6bd98']];
const SKY_B = [[0, '#050722'], [0.18, '#141448'], [0.34, '#3a1b62'], [0.46, '#8a2f6c'], [0.54, '#dd5a46'], [0.6, '#ffa257'], [0.66, '#ffd08a'], [1, '#ffd08a']];
const PAD = 40;

export function createScene({ w, h, seed = 1, reduced = false }) {
  let W = w, H = h, HZ = h * 0.6, U = 1;
  const R = rand(seed * 7 + 3);
  let skyA, skyB, skyM, starsCv, sunA, sunB, sunM, moonCv, ruinCv, veilCv, hazeCv, vignCv, camels = [];
  let layers = [];
  let qBloom = -1, time = 0, inited = false, bloomS = 0, dangerS = 0, gust = 0.5, envRef = null;
  let lastField = null, sway = 0;
  const gustN = noise1(seed * 3 + 11);
  const stars = new Ring(150);
  const PCAP = 340, parts = [];
  for (let i = 0; i < PCAP; i++) parts.push({ x: 0, y: 0, spd: 1, vy: 0, len: 1, sz: 1, c: 0, a: 1, ph: 0 });
  const MCAP = 60, motes = [];
  for (let i = 0; i < MCAP; i++) motes.push({ x: 0, y: 0, vy: 0, ph: 0, life: 0, max: 1, c: 0 });
  const VCAP = 9, veils = [];
  for (let i = 0; i < VCAP; i++) veils.push({ L: 2, x: 0, life: 0, max: 1, wid: 1, ht: 1 });
  const twinkles = [];
  const moteSprites = ['#ffd27a', '#ffe9b8', '#8fe9dd'];
  const pColors = ['#ffe6bb', '#ffc98a', '#fff6e2'];

  function ridge(sd, n, scale) {
    const r = rand(sd), f = fbm1(sd + 5, 3), e = new Float32Array(n + 2), segs = [];
    let s0 = -r() * scale * W;
    while (s0 < n + 2) {
      const len = scale * W * (0.6 + r() * 0.8), a = 0.5 + r() * 0.5, c = 0.24 + r() * 0.16;
      const xa = Math.max(0, Math.ceil(s0)), xb = Math.min(n + 2, s0 + len);
      for (let x = xa; x < xb; x++) {
        const t = (x - s0) / len;
        e[x] = a * (t < c ? Math.pow(t / c, 1.08) : 1 - Math.pow((t - c) / (1 - c), 1.6));
      }
      segs.push({ s0, len, xc: s0 + c * len, sw: 0.1 + r() * 0.14, k: r() });
      s0 += len;
    }
    for (let x = 0; x < n + 2; x++) e[x] = e[x] * 0.8 + f(x / (W * 0.3)) * 0.35 - 0.1;
    return { e, segs };
  }

  function paintLayer(L, pal, li) {
    const cv = makeCanvas(L.cw, L.ch), g = cv.getContext('2d');
    const T = L.top, cw = L.cw, ch = L.ch, depth = L.amp * 1.4;
    const tp = x => T[Math.max(0, Math.min(cw + 1, Math.round(x)))];
    // silhouette, lit (sun-facing) colour
    g.beginPath(); g.moveTo(0, ch + 2);
    for (let x = 0; x <= cw; x += 2) g.lineTo(x, T[x]);
    g.lineTo(cw, ch + 2); g.closePath();
    let gr = g.createLinearGradient(0, L.minTop, 0, L.minTop + depth * 2.2);
    gr.addColorStop(0, shade(pal.lit, 0.08)); gr.addColorStop(0.5, pal.lit); gr.addColorStop(1, mix(pal.lit, pal.sh, 0.45));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    const rim = mix(pal.lit, '#fff6e0', 0.55);
    for (const sg of L.segs) {
      const xc = sg.xc; if (xc < -sg.len || sg.s0 > cw + sg.len) continue;
      const yc = tp(xc), dx = sg.len * sg.sw;
      const c1x = xc + dx * 0.95, c1y = yc + depth * 0.35, c2x = xc + dx * 0.55, c2y = yc + depth * 0.95, ex = xc + dx * 0.1, ey = ch + 4;
      // slip face in shadow (faces away from the low sun on the right)
      const ty = tp(sg.s0);
      g.beginPath(); g.moveTo(sg.s0, ty);
      for (let x = sg.s0; x < xc; x += 2) g.lineTo(x, tp(x));
      g.lineTo(xc, yc); g.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
      g.lineTo(sg.s0 - sg.len * 0.16, ey);
      g.bezierCurveTo(sg.s0 - sg.len * 0.12, ty + depth * 0.7, sg.s0 - sg.len * 0.03, ty + depth * 0.2, sg.s0, ty); g.closePath();
      gr = g.createLinearGradient(sg.s0, 0, xc + dx, 0);
      gr.addColorStop(0, mix(pal.sh, pal.lit, 0.22)); gr.addColorStop(0.75, pal.sh); gr.addColorStop(1, shade(pal.sh, -0.12));
      g.fillStyle = gr; g.fill();
      // reflected sky light pooling low in the slip face
      gr = g.createLinearGradient(0, yc, 0, yc + depth * 1.4);
      gr.addColorStop(0, rgba(pal.haze, 0)); gr.addColorStop(1, rgba(pal.haze, 0.18));
      g.fillStyle = gr; g.fill();
      // sunlit glow hugging the crest line on the lit side, then the crisp rim
      g.beginPath(); g.moveTo(xc, yc); g.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
      g.lineWidth = 9 * U; g.strokeStyle = rgba(rim, 0.1); g.stroke();
      g.lineWidth = 3.5 * U; g.strokeStyle = rgba(rim, 0.16); g.stroke();
      g.lineWidth = 1.2 * U; g.strokeStyle = rgba(rim, 0.55); g.stroke();
    }
    // wind ripples (follow the contour, fade with depth)
    const rr2 = rand(li * 77 + seed);
    const nr = Math.round((cw / 9) * (0.4 + li * 0.35));
    g.lineWidth = Math.max(0.7, 0.9 * U);
    for (let i = 0; i < nr; i++) {
      const sx = rr2() * cw, len = (24 + rr2() * 110) * U * (0.6 + li * 0.25), d = 4 * U + Math.pow(rr2(), 1.6) * depth * 1.3;
      const ph = rr2() * TAU, fq = 0.015 + rr2() * 0.03, am = (1 + rr2() * 2) * U;
      g.beginPath();
      for (let x = sx; x < sx + len; x += 4) { const yy = tp(x) + d + Math.sin(ph + x * fq) * am; x === sx ? g.moveTo(x, yy) : g.lineTo(x, yy); }
      const fa = clamp(1 - d / (depth * 1.4));
      g.strokeStyle = rgba('#fff0d6', 0.07 * fa + 0.02); g.stroke();
      g.translate(0, 1.3 * U); g.strokeStyle = rgba('#1c0a14', 0.09 * fa + 0.02); g.stroke(); g.translate(0, -1.3 * U);
    }
    // grain
    const ng = Math.round(cw * ch * 0.003);
    g.fillStyle = rgba('#fff5e6', 0.07);
    for (let i = 0; i < ng; i++) g.fillRect(rr2() * cw, rr2() * ch, U, U);
    g.fillStyle = rgba('#1a0810', 0.08);
    for (let i = 0; i < ng; i++) g.fillRect(rr2() * cw, rr2() * ch, U, U);
    // aerial perspective: haze toward the crests for far layers, darkening with depth for near ones
    gr = g.createLinearGradient(0, L.minTop, 0, L.minTop + depth * 2);
    gr.addColorStop(0, rgba(pal.haze, 0.4 - li * 0.11)); gr.addColorStop(1, rgba(pal.haze, 0.05));
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    gr = g.createLinearGradient(0, L.minTop, 0, L.minTop + depth * 2.4);
    gr.addColorStop(0, 'rgba(20,6,16,0)'); gr.addColorStop(1, `rgba(20,6,16,${0.2 + li * 0.08})`);
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    g.restore();
    return cv;
  }

  function paintSky(stops, isB) {
    const cv = makeCanvas(W, H), g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const r = rand(seed + (isB ? 91 : 17));
    // long thin clouds near the horizon
    for (let i = 0; i < 9; i++) {
      const cx = r() * W, cy = HZ * (0.55 + r() * 0.35), cw = W * (0.15 + r() * 0.3), ch = H * (0.006 + r() * 0.012);
      const col = isB ? (cy > HZ * 0.75 ? '#ffb070' : '#e0608a') : '#d8bfae';
      const sp = glowSprite(col, 64, 0.3);
      g.globalAlpha = isB ? 0.22 + r() * 0.2 : 0.12 + r() * 0.12;
      g.drawImage(sp, cx - cw / 2, cy - ch / 2, cw, ch);
    }
    g.globalAlpha = 1;
    return cv;
  }

  function paintSun(isB) {
    const S = 256, cv = makeCanvas(S, S), g = cv.getContext('2d'), r = S / 2;
    g.beginPath(); g.arc(r, r, r - 1, 0, TAU);
    let gr;
    if (isB) {
      gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, '#fff4c8'); gr.addColorStop(0.45, '#ffc05a'); gr.addColorStop(0.8, '#ff6a3a'); gr.addColorStop(1, '#f2443a');
    } else {
      gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, '#fbecd8'); gr.addColorStop(1, '#e8c7aa');
    }
    g.fillStyle = gr; g.fill();
    gr = g.createRadialGradient(r, r, r * 0.55, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,240,0)'); gr.addColorStop(1, isB ? 'rgba(255,120,60,0.45)' : 'rgba(230,200,180,0.5)');
    g.fillStyle = gr; g.fill();
    if (isB) { // faint horizontal bands of atmospheric refraction near the bottom
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6; i++) { const yy = S * (0.66 + i * 0.055); g.fillStyle = `rgba(0,0,0,${0.25 + i * 0.1})`; g.fillRect(0, yy, S, S * (0.008 + i * 0.004)); }
      g.globalCompositeOperation = 'source-over';
    }
    return cv;
  }

  function paintCamel(s, frame, person) {
    const cw = Math.ceil(s * 1.5), ch = Math.ceil(s * 1.08), cv = makeCanvas(cw, ch), g = cv.getContext('2d');
    g.fillStyle = '#1d0c1c'; g.strokeStyle = '#1d0c1c'; g.lineCap = 'round';
    if (person) {
      g.beginPath(); g.ellipse(s * 0.5, s * 0.22, s * 0.07, s * 0.08, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(s * 0.4, s * 0.3); g.lineTo(s * 0.6, s * 0.3); g.lineTo(s * 0.66, s * 0.78); g.lineTo(s * 0.34, s * 0.78); g.closePath(); g.fill();
      g.lineWidth = s * 0.05;
      const sw = frame ? 0.06 : -0.06;
      g.beginPath(); g.moveTo(s * 0.46, s * 0.75); g.lineTo(s * (0.44 + sw), s * 1.04); g.moveTo(s * 0.54, s * 0.75); g.lineTo(s * (0.56 - sw), s * 1.04); g.stroke();
      g.lineWidth = s * 0.03; g.beginPath(); g.moveTo(s * 0.3, s * 0.12); g.lineTo(s * 0.26, s * 1.04); g.stroke(); // staff
      return cv;
    }
    g.beginPath(); g.ellipse(s * 0.8, s * 0.5, s * 0.38, s * 0.16, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(s * 0.84, s * 0.36, s * 0.2, s * 0.17, 0, Math.PI, TAU); g.fill();
    g.lineWidth = s * 0.11;
    g.beginPath(); g.moveTo(s * 0.5, s * 0.48); g.quadraticCurveTo(s * 0.32, s * 0.46, s * 0.28, s * 0.2); g.stroke();
    g.beginPath(); g.ellipse(s * 0.21, s * 0.18, s * 0.1, s * 0.05, -0.2, 0, TAU); g.fill();
    g.lineWidth = s * 0.06;
    const sw = frame ? 0.07 : -0.07;
    const legs = [[0.55, sw], [0.66, -sw], [0.98, -sw], [1.08, sw]];
    for (const [lx, d] of legs) { g.beginPath(); g.moveTo(s * lx, s * 0.58); g.lineTo(s * (lx + d), s * 1.04); g.stroke(); }
    g.lineWidth = s * 0.03; g.beginPath(); g.moveTo(s * 1.17, s * 0.46); g.lineTo(s * 1.22, s * 0.7); g.stroke();
    return cv;
  }

  function paintRuins(s) { // a weathered colonnade with a broken pediment and an arched gate
    const cw = Math.ceil(s * 3), ch = Math.ceil(s * 1.15), cv = makeCanvas(cw, ch), g = cv.getContext('2d');
    g.fillStyle = '#ffffff';
    const base = ch, cwid = s * 0.085;
    g.fillRect(s * 0.05, base - s * 0.1, s * 1.55, s * 0.1); // stylobate
    g.fillRect(s * 0.1, base - s * 0.16, s * 1.45, s * 0.07);
    const hts = [0.86, 0.86, 0.6, 0.86, 0.34, 0.86];
    hts.forEach((hh, i) => {
      const x = s * (0.18 + i * 0.24), top = base - s * 0.16 - s * hh * 0.82;
      g.fillRect(x, top, cwid, base - s * 0.16 - top);
      if (hh > 0.8) g.fillRect(x - cwid * 0.35, top - s * 0.04, cwid * 1.7, s * 0.045);
    });
    // surviving entablature over the first columns + broken pediment
    const ty = base - s * 0.16 - s * 0.86 * 0.82 - s * 0.04;
    g.fillRect(s * 0.12, ty - s * 0.08, s * 0.82, s * 0.08);
    g.beginPath(); g.moveTo(s * 0.12, ty - s * 0.08); g.lineTo(s * 0.53, ty - s * 0.3); g.lineTo(s * 0.68, ty - s * 0.22); g.lineTo(s * 0.62, ty - s * 0.16);
    g.lineTo(s * 0.8, ty - s * 0.08); g.closePath(); g.fill();
    // arched gate, right
    const gx = s * 1.95, gw = s * 0.62, gh = s * 0.95;
    g.beginPath(); g.moveTo(gx, base); g.lineTo(gx, base - gh); g.lineTo(gx + gw, base - gh); g.lineTo(gx + gw, base); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(gx + gw * 0.25, base); g.lineTo(gx + gw * 0.25, base - gh * 0.5); g.arc(gx + gw * 0.5, base - gh * 0.5, gw * 0.25, Math.PI, TAU); g.lineTo(gx + gw * 0.75, base); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(gx + gw * 0.55, base - gh - 1); g.lineTo(gx + gw + 2, base - gh - 1); g.lineTo(gx + gw + 2, base - gh * 0.62); g.closePath(); g.fill(); // crumbled corner
    g.globalCompositeOperation = 'source-over';
    g.fillRect(gx + gw + s * 0.1, base - s * 0.12, s * 0.22, s * 0.12); g.fillRect(gx - s * 0.3, base - s * 0.07, s * 0.2, s * 0.07); // fallen blocks
    g.globalCompositeOperation = 'source-in';
    const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, '#6e3a62'); gr.addColorStop(1, '#8a4664');
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
    return cv;
  }

  function resize(w2, h2) {
    W = Math.max(2, w2); H = Math.max(2, h2); HZ = H * 0.6; U = Math.max(0.6, H / 900);
    skyA = paintSky(SKY_A, false); skyB = paintSky(SKY_B, true); skyM = makeCanvas(W, H);
    // stars + milky way (bloom only)
    starsCv = makeCanvas(W, Math.ceil(HZ));
    { const g = starsCv.getContext('2d'), r = rand(seed + 303);
      for (let i = 0; i < 70; i++) { // milky way glow
        const t = r(), bx = lerp(-0.05, 0.62, t) * W + (r() - 0.5) * W * 0.06, by = lerp(0.52, -0.05, t) * HZ + (r() - 0.5) * HZ * 0.08;
        g.globalAlpha = 0.05 + r() * 0.05; const rad = H * (0.04 + r() * 0.07);
        g.drawImage(glowSprite(r() < 0.5 ? '#8a7cff' : '#d48ad8', 64, 0.1), bx - rad, by - rad, rad * 2, rad * 2);
      }
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 900; i++) {
        const t = r(), mw = i < 450;
        const x = mw ? lerp(-0.05, 0.62, t) * W + (r() + r() - 1) * W * 0.05 : r() * W;
        const y = mw ? lerp(0.52, -0.05, t) * HZ + (r() + r() - 1) * HZ * 0.06 : Math.pow(r(), 1.4) * HZ;
        g.globalAlpha = (0.15 + r() * 0.7) * clamp(1.15 - y / HZ) * (mw ? 0.7 : 1);
        const sz = r() < 0.08 ? 1.6 * U : U; g.fillRect(x, y, sz, sz);
      }
      g.globalAlpha = 1; }
    twinkles.length = 0;
    for (let i = 0; i < 70; i++) {
      const y = Math.pow(R(), 1.5) * HZ * 0.85;
      twinkles.push({ x: R() * W, y, ph: R() * TAU, sp: 0.6 + R() * 2, r: (2.5 + R() * 4) * U, c: glowSprite(R() < 0.3 ? '#bfe6ff' : (R() < 0.5 ? '#ffe2b8' : '#ffffff'), 32, 0.12) });
    }
    sunA = paintSun(false); sunB = paintSun(true); sunM = makeCanvas(256, 256);
    // crescent moon
    { const S = 96; moonCv = makeCanvas(S, S); const g = moonCv.getContext('2d');
      g.fillStyle = '#fff6e4'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.42, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(S / 2 + S * 0.17, S / 2 - S * 0.08, S * 0.38, 0, TAU); g.fill(); }
    ruinCv = paintRuins(H * 0.07);
    const cs = Math.max(10, H * 0.026);
    camels = [paintCamel(cs, 0, false), paintCamel(cs, 1, false), paintCamel(cs, 0, true), paintCamel(cs, 1, true)];
    // dune layers
    const geo = DUNES.map((d, i) => {
      const cw = Math.ceil(W + PAD * 2), { e, segs } = ridge(seed * 13 + i * 101, cw, d.scale);
      const amp = d.amp * H, base = d.base * H, topAbs = new Float32Array(cw + 2);
      let minTop = Infinity, maxTop = -Infinity;
      for (let x = 0; x < cw + 2; x++) { topAbs[x] = base - e[x] * amp; minTop = Math.min(minTop, topAbs[x]); maxTop = Math.max(maxTop, topAbs[x]); }
      return { cw, e, segs, amp, topAbs, minTop, maxTop };
    });
    layers = geo.map((G, i) => {
      const d = DUNES[i], y0 = Math.floor(G.minTop - 4);
      const bottom = i < geo.length - 1 ? Math.min(H + 2, geo[i + 1].maxTop + 8 * U) : H + 2; // hidden below the next layer
      const ch = Math.ceil(bottom - y0), top = new Float32Array(G.cw + 2);
      for (let x = 0; x < G.cw + 2; x++) top[x] = G.topAbs[x] - y0;
      const segs = G.segs.map(sg => ({ ...sg }));
      const L = { e: G.e, segs, amp: G.amp, cw: G.cw, ch, y0, top, minTop: G.minTop - y0, par: 0.3 + i * 0.35, ox: -PAD };
      L.A = paintLayer(L, d.A, i); L.B = paintLayer(L, d.B, i); L.M = makeCanvas(L.cw, L.ch);
      return L;
    });
    veilCv = glowSprite('#fff0d8', 64, 0.25);
    hazeCv = makeCanvas(W, H);
    { const g = hazeCv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(110,24,20,0.35)'); gr.addColorStop(0.55, 'rgba(200,70,30,0.55)'); gr.addColorStop(1, 'rgba(120,30,16,0.6)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    vignCv = makeCanvas(W, H);
    { const g = vignCv.getContext('2d'); const gr = g.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, Math.hypot(W, H) * 0.62);
      gr.addColorStop(0, 'rgba(12,4,10,0)'); gr.addColorStop(1, 'rgba(12,4,10,0.6)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    for (const p of parts) spawnPart(p, true);
    for (const m of motes) spawnMote(m, true);
    for (const v of veils) spawnVeil(v, true);
    qBloom = -1;
  }

  const sunGeo = b => { const sr = H * lerp(0.065, 0.17, smooth(b)); return { sx: W * 0.775, sr, sy: H * 0.6 - sr * 0.15 }; };

  function recomposite(q) {
    qBloom = q;
    const mixInto = (M, A, B, ww, hh) => {
      const g = M.getContext('2d'); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, ww, hh);
      g.drawImage(A, 0, 0); g.globalAlpha = q; g.drawImage(B, 0, 0); g.globalAlpha = 1;
      return g;
    };
    // sky + everything static at this bloom level (stars, milky way, moon, sun halo, horizon band, vignette)
    const g = mixInto(skyM, skyA, skyB, W, H);
    g.globalCompositeOperation = 'lighter';
    const starA = sstep(0.2, 0.85, q);
    if (starA > 0.01) {
      g.globalAlpha = starA * 0.9; g.drawImage(starsCv, 0, 0);
      const mA = sstep(0.3, 0.8, q), mx = W * 0.115, my = H * 0.15, mr = H * 0.034;
      drawGlow(g, glowSprite('#ffe8c8', 128, 0.05), mx, my, mr * 5, mA * 0.35);
      g.globalAlpha = mA; g.drawImage(moonCv, mx - mr * 1.15, my - mr * 1.15, mr * 2.3, mr * 2.3);
    }
    const { sx, sy, sr } = sunGeo(q);
    drawGlow(g, glowSprite(mix('#f6d6b6', '#ff8a40', q), 256, 0.08), sx, sy, sr * 3.2, 0.35 + 0.35 * q);
    g.globalAlpha = 0.18 + 0.32 * q;
    g.drawImage(glowSprite(mix('#e6c0a0', '#ff9a50', q), 128, 0.3), sx - W * 0.75, H * 0.6 - H * 0.07, W * 1.5, H * 0.14);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(vignCv, 0, 0);
    mixInto(sunM, sunA, sunB, 256, 256);
    for (const L of layers) {
      const lg = mixInto(L.M, L.A, L.B, L.cw, L.ch);
      lg.globalCompositeOperation = 'source-atop'; lg.drawImage(vignCv, PAD, -L.y0); lg.globalCompositeOperation = 'source-over';
    }
  }

  function ridgeY(i, xs) {
    const L = layers[i]; const xi = Math.max(0, Math.min(L.cw, Math.round(xs - L.ox)));
    return L.y0 + L.top[xi];
  }

  function spawnPart(p, anywhere) {
    p.x = anywhere ? R() * W : W + R() * 60;
    p.y = H * (0.45 + Math.pow(R(), 0.7) * 0.57);
    p.spd = 0.55 + R() * 0.9; p.vy = (R() - 0.5) * 10; p.len = (2 + R() * 9) * U; p.sz = (R() < 0.85 ? 0.9 : 1.6) * U;
    p.c = Math.floor(R() * 3); p.a = 0.15 + R() * 0.4; p.ph = R() * TAU;
  }
  function spawnMote(m, anywhere) {
    m.x = R() * W; m.y = H * (0.62 + R() * 0.3); m.vy = -(6 + R() * 16) * U; m.ph = R() * TAU;
    m.max = 6 + R() * 8; m.life = anywhere ? R() * m.max : 0; m.c = Math.floor(R() * 3);
    if (anywhere) m.y -= R() * H * 0.3;
  }
  function spawnVeil(v, anywhere) {
    v.L = R() < 0.5 ? 2 : 3; v.x = R() * W * 1.1; v.max = 3 + R() * 4; v.life = anywhere ? R() * v.max : 0;
    v.wid = W * (0.08 + R() * 0.14); v.ht = H * (0.02 + R() * 0.03);
  }

  function update(dt, env) {
    envRef = env;
    if (env.field) lastField = env.field;
    if (!inited) { bloomS = env.bloom ?? 0; dangerS = env.danger ?? 0; inited = true; }
    bloomS = ease(bloomS, clamp(env.bloom ?? 0), 1.5, dt);
    dangerS = ease(dangerS, clamp(env.danger ?? 0), 2.5, dt);
    const slow = env.reduced || reduced ? 0.4 : 1;
    time += dt * slow;
    const g0 = gustN(time * 0.13);
    gust = ease(gust, clamp(Math.pow(g0, 2.2) * 1.6 + 0.1), 1.2, dt);
    sway = Math.sin(time * 0.05) * 14 * U;
    const q = Math.round(bloomS * 40) / 40;
    if (q !== qBloom && layers.length) recomposite(q);
    const sp = (60 + 340 * gust * gust) * (1 + 2.2 * dangerS) * slow * U;
    for (const p of parts) {
      p.x -= sp * p.spd * dt;
      p.y += (p.vy + Math.sin(time * 2.2 + p.ph) * 9 * U) * dt * slow;
      if (p.x < -40 || p.y > H + 10) spawnPart(p, false);
    }
    for (const m of motes) {
      m.life += dt * slow; m.y += m.vy * dt * slow; m.x += (Math.sin(time * 0.7 + m.ph) * 6 * U - sp * 0.04) * dt;
      if (m.life > m.max) spawnMote(m, false);
    }
    for (const v of veils) { v.life += dt * slow; v.x -= sp * 0.5 * dt; if (v.life > v.max) spawnVeil(v, false); }
  }

  function absorbTarget(r) {
    const f = lastField || { x: W * 0.38, w: W * 0.24 };
    const m = 30 * U;
    const left = r() < 0.5 && f.x - m > W * 0.06;
    const x = left ? lerp(W * 0.03, f.x - m, r()) : lerp(f.x + f.w + m, W * 0.97, r());
    const y = lerp(H * 0.04, H * 0.4, Math.pow(r(), 1.25));
    return { x, y };
  }

  function absorb(x, y, color) {
    let best = null, bd = (H * 0.17) ** 2;
    for (const s of stars) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd && d > 64) { bd = d; best = s; } }
    stars.add({
      x, y, born: time, ph: Math.random() * TAU, sz: (3 + Math.random() * 3.5) * U,
      spr: glowSprite(color || '#ffd27a', 48, 0.12), lx: best ? best.x : 0, ly: best ? best.y : 0, link: !!best,
    });
  }

  function draw(ctx, env) {
    if (!layers.length) resize(W, H);
    if (qBloom < 0) recomposite(Math.round(bloomS * 40) / 40);
    const b = bloomS, dg = dangerS, t = time, red = env.reduced || reduced;
    const q = (env.quality ?? 1) * (red ? 0.35 : 1);
    const pulse = (env.beatPulse || 0), kick = env.kick || 0;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(skyM, 0, 0);

    // twinkling stars (the static star field, moon and halos are baked into skyM)
    const starA = sstep(0.2, 0.85, b);
    ctx.globalCompositeOperation = 'lighter';
    if (starA > 0.01) for (const s of twinkles) drawGlow(ctx, s.c, s.x, s.y, s.r * (1 + 0.15 * pulse), starA * (0.35 + 0.45 * Math.sin(t * s.sp + s.ph) ** 2));
    // absorbed stars + constellation lines
    if (stars.length) {
      ctx.lineWidth = Math.max(0.8, U); ctx.strokeStyle = '#ffd9a8';
      ctx.globalAlpha = 0.22 + 0.08 * pulse; ctx.beginPath();
      for (const s of stars) if (s.link && t - s.born > 1.2) { ctx.moveTo(s.x, s.y); ctx.lineTo(s.lx, s.ly); }
      ctx.stroke();
      for (const s of stars) if (s.link && t - s.born <= 1.2) {
        const k = (t - s.born) / 1.2; ctx.globalAlpha = 0.3 * k + 0.2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(lerp(s.x, s.lx, k), lerp(s.y, s.ly, k)); ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (const s of stars) {
        const age = t - s.born, flash = Math.exp(-age * 2.2), tw = 0.75 + 0.25 * Math.sin(t * 1.7 + s.ph);
        drawGlow(ctx, s.spr, s.x, s.y, s.sz * (2.2 + 4 * flash + 0.4 * pulse), (0.55 + 0.45 * flash) * tw);
        ctx.globalAlpha = 0.9 * tw; ctx.fillRect(s.x - U, s.y - U, 2 * U, 2 * U);
      }
    }

    // sun
    const { sx, sy, sr } = sunGeo(b);
    drawGlow(ctx, glowSprite('#ffb066', 128, 0.2), sx, sy, sr * 1.6, 0.25 + 0.3 * b + 0.12 * pulse);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55 + 0.45 * b;
    const half = Math.round(sr * 0.9), sl = Math.max(2, Math.round(2.5 * U));
    ctx.drawImage(sunM, 0, 0, 256, 256 * (half / (2 * sr)), sx - sr, sy - sr, 2 * sr, half);
    const shim = (1.2 + 2.5 * dg) * U;
    for (let yy = half; yy < 2 * sr; yy += sl) {
      const k = (yy - half) / (2 * sr - half);
      const off = Math.sin(t * 3.1 + yy * 0.21) * shim * (0.4 + k * 1.6);
      ctx.drawImage(sunM, 0, 256 * yy / (2 * sr), 256, 256 * sl / (2 * sr), sx - sr + off, sy - sr + yy, 2 * sr, sl);
    }
    ctx.globalAlpha = 1;

    // dune layers (with heat shimmer on the farthest)
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      L.ox = sway * L.par - PAD;
      ctx.globalAlpha = 1;
      if (i === 0) {
        const band = Math.round(H * 0.05), step = Math.max(2, Math.round(2 * U));
        const amp = (0.8 + 1.8 * dg + 0.6 * b) * U;
        for (let yy = 0; yy < band; yy += step) {
          const off = Math.sin(t * 2.6 + (L.y0 + yy) * 0.33) * amp * (1 - yy / band);
          ctx.drawImage(L.M, 0, yy, L.cw, step, L.ox + off, L.y0 + yy, L.cw, step);
        }
        ctx.drawImage(L.M, 0, band, L.cw, L.ch - band, L.ox, L.y0 + band, L.cw, L.ch - band);
        const ra = sstep(0.45, 0.85, b);
        if (ra > 0.01) {
          const rx = W * 0.07, ry = ridgeY(0, rx + ruinCv.width * 0.45);
          ctx.globalAlpha = ra * 0.7; ctx.drawImage(ruinCv, rx, ry - ruinCv.height + H * 0.012);
        }
      } else {
        ctx.drawImage(L.M, L.ox, L.y0);
      }
      if (i === 1) drawCaravan(ctx, b, t);
      if (i === 1) { // glowing sand motes drifting up toward the sky
        const n = Math.round(MCAP * sstep(0.1, 1, b) * q);
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < n; k++) {
          const m = motes[k], lf = m.life / m.max, a = Math.sin(Math.PI * lf) * (0.5 + 0.4 * b);
          drawGlow(ctx, glowSprite(moteSprites[m.c], 32, 0.15), m.x, m.y, (3 + 2 * pulse) * U, a);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      if (i >= 2) { // spindrift veils off the crests
        const nv = red ? 3 : VCAP;
        for (let k = 0; k < nv; k++) {
          const v = veils[k]; if (v.L !== i) continue;
          const a = Math.sin(Math.PI * v.life / v.max) * (0.08 + 0.22 * gust) * (0.5 + 0.6 * b + dg);
          const cx = ((v.x % (W + v.wid)) + W + v.wid) % (W + v.wid) - v.wid / 2;
          const yy = ridgeY(i, cx) - v.ht * 0.35;
          ctx.globalAlpha = Math.min(0.6, a); ctx.drawImage(veilCv, cx - v.wid / 2, yy - v.ht / 2, v.wid, v.ht);
        }
      }
    }

    // wind-blown sand
    const np = Math.min(PCAP, Math.round((50 + 130 * b + 160 * dg) * q));
    const stretch = 0.3 + gust * 1.6 + dg;
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = dg > 0.5 && c === 1 ? '#ff9a6a' : pColors[c];
      for (let k = 0; k < np; k++) {
        const p = parts[k]; if (p.c !== c) continue;
        ctx.globalAlpha = p.a * (0.45 + 0.4 * b + 0.3 * dg);
        ctx.fillRect(p.x, p.y, p.len * stretch, p.sz);
      }
    }

    // sandstorm haze under danger
    if (dg > 0.01) {
      ctx.globalAlpha = dg * (0.75 + 0.12 * Math.sin(t * 1.3)); ctx.drawImage(hazeCv, 0, 0);
    }
    // beat warm wash
    if (kick > 0.01 || pulse > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glowSprite('#ff9a50', 128, 0.2), sx, sy, H * 0.9, (0.05 * kick + 0.03 * pulse) * (0.4 + b));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function drawCaravan(ctx, b, t) {
    const a = sstep(0.3, 0.7, b);
    if (a < 0.01) return;
    const span = W + 400 * U, cs = camels[0].height;
    const head = W + 150 * U - ((t * 9 * U + W * 0.72) % span);
    const frame = Math.floor(t * 2.2) % 2;
    ctx.globalAlpha = a;
    for (let k = 0; k < 6; k++) {
      const person = k === 0, x = head + k * cs * (person ? 1.1 : 1.45) + (person ? 0 : cs * 0.3);
      if (x < -60 || x > W + 60) continue;
      const spr = camels[(person ? 2 : 0) + ((frame + k) % 2)];
      const bob = Math.sin(t * 4.4 + k) * 0.6 * U;
      const yy = ridgeY(1, x + spr.width / 2) - spr.height + 2 * U + bob;
      ctx.drawImage(spr, x, yy);
      if (person && b > 0.55) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, glowSprite('#ffb85a', 32, 0.2), x + spr.width * 0.18, yy + spr.height * 0.35, 6 * U, a * (0.8 + 0.2 * Math.sin(t * 7)));
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
      }
    }
    ctx.globalAlpha = 1;
  }

  return {
    resize, update, draw, absorbTarget, absorb,
    get creatures() { return stars.length; },
  };
}
