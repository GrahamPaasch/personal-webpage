// Stage V: Aurora (tundra). Deep polar night: flowing aurora curtains drawn as vertical ray columns at
// quarter resolution (then scaled up soft), moonlit snowy ranges, a frozen lake mirroring the sky, falling
// snow. Line-clear particles become sparkles woven into the curtain; each one permanently brightens and
// lengthens the curtain around it. Bloom spreads the aurora (more ribbons, violet/pink crowns, light on the
// snow). Danger bleeds the curtain toward blood red. No DOM access at import time.
import {
  TAU, clamp, lerp, smooth, ease, makeCanvas, rgba, mix, shade, rand, glowSprite, drawGlow,
  noise1, fbm1, Ring,
} from '../sceneKit.js';

export const theme = {
  accent: '#8dffd2',
  accent2: '#d3a6ff',
  tints: { I: '#7fe9ff', O: '#ffeaa0', T: '#c69cff', S: '#79ffae', Z: '#ff8fbf', J: '#7d9dff', L: '#ffb486', G: '#93a3bb' },
  panel: { fill: 'rgba(6,14,32,0.66)', grid: 'rgba(170,230,255,0.07)', border: 'rgba(140,255,215,0.55)' },
  particle: {
    colors: ['#9dffd6', '#7fe9ff', '#d3a6ff', '#ff9fd2', '#ffffff'],
    shape: 'flake', gravity: -40, drag: 0.7, size: [2, 5], glow: true,
  },
  text: '#eafcff',
};

// ---------------------------------------------------------------- block skin: faceted ice crystal
function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

export function drawBlock(ctx, s, color, type, variant = 0) {
  const r = rand(hashStr(type) + variant * 977 + 13);
  const m = s * 0.04, i0 = s * 0.2, i1 = s - s * 0.2;
  const o0 = m, o1 = s - m;
  const poly = (pts, fill, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  };
  ctx.save();
  // bevel facets (light from upper-left, like the moon)
  poly([[o0, o0], [o1, o0], [i1, i0], [i0, i0]], shade(color, 0.62), 0.96);
  poly([[o0, o0], [i0, i0], [i0, i1], [o0, o1]], shade(color, 0.3), 0.96);
  poly([[o1, o0], [o1, o1], [i1, i1], [i1, i0]], shade(color, -0.22), 0.96);
  poly([[o0, o1], [i0, i1], [i1, i1], [o1, o1]], shade(color, -0.42), 0.96);
  // inner face: cool frosted gradient
  const g = ctx.createLinearGradient(i0, i0, i1, i1);
  g.addColorStop(0, shade(mix(color, '#dff6ff', 0.25), 0.25));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(mix(color, '#3a5cff', 0.15), -0.2));
  ctx.globalAlpha = 0.97; ctx.fillStyle = g; ctx.fillRect(i0, i0, i1 - i0, i1 - i0);
  // facet seams
  ctx.globalAlpha = 0.5; ctx.strokeStyle = shade(color, 0.8); ctx.lineWidth = Math.max(0.6, s * 0.012);
  ctx.beginPath();
  ctx.moveTo(o0, o0); ctx.lineTo(i0, i0); ctx.moveTo(o1, o0); ctx.lineTo(i1, i0);
  ctx.moveTo(o0, o1); ctx.lineTo(i0, i1); ctx.moveTo(o1, o1); ctx.lineTo(i1, i1); ctx.stroke();
  // inner refraction: clipped to the inner face, prismatic doubled lines
  ctx.save(); ctx.beginPath(); ctx.rect(i0, i0, i1 - i0, i1 - i0); ctx.clip();
  const nLines = 2 + Math.floor(r() * 2);
  for (let k = 0; k < nLines; k++) {
    const a = r() * Math.PI, cx = lerp(i0, i1, 0.25 + r() * 0.5), cy = lerp(i0, i1, 0.25 + r() * 0.5);
    const dx = Math.cos(a) * s, dy = Math.sin(a) * s;
    ctx.lineWidth = Math.max(0.6, s * 0.022);
    ctx.globalAlpha = 0.22; ctx.strokeStyle = '#ff9fe0';
    ctx.beginPath(); ctx.moveTo(cx - dx + s * 0.02, cy - dy); ctx.lineTo(cx + dx + s * 0.02, cy + dy); ctx.stroke();
    ctx.globalAlpha = 0.22; ctx.strokeStyle = '#7ff7ff';
    ctx.beginPath(); ctx.moveTo(cx - dx - s * 0.02, cy - dy); ctx.lineTo(cx + dx - s * 0.02, cy + dy); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.5, s * 0.012);
    ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
  }
  // faint six-ray crystal growth in the core
  ctx.globalAlpha = 0.2; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.5, s * 0.014);
  const cx = s * 0.5, cy = s * 0.5, R = s * 0.2, rot = r() * 0.5;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = rot + k * TAU / 6, ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
    ctx.moveTo(cx, cy); ctx.lineTo(ex, ey);
    const bx = cx + Math.cos(a) * R * 0.6, by = cy + Math.sin(a) * R * 0.6;
    ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + 0.8) * R * 0.3, by + Math.sin(a + 0.8) * R * 0.3);
    ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 0.8) * R * 0.3, by + Math.sin(a - 0.8) * R * 0.3);
  }
  ctx.stroke();
  // frost speckle
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 26; k++) {
    ctx.globalAlpha = 0.08 + r() * 0.18;
    const d = Math.max(0.6, s * (0.01 + r() * 0.015));
    ctx.fillRect(lerp(i0, i1, r()), lerp(i0, i1, r()), d, d);
  }
  ctx.restore();
  // gloss sweep on the top-left of the face
  const gl = ctx.createLinearGradient(i0, i0, s * 0.55, s * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.08)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 1; ctx.fillStyle = gl;
  ctx.beginPath(); ctx.moveTo(i0, i0); ctx.lineTo(i1, i0); ctx.lineTo(i0, i1); ctx.closePath(); ctx.fill();
  // rims
  ctx.globalAlpha = 0.95; ctx.strokeStyle = shade(color, 0.75); ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.strokeRect(o0 + s * 0.015, o0 + s * 0.015, o1 - o0 - s * 0.03, o1 - o0 - s * 0.03);
  ctx.globalAlpha = 0.35; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.6, s * 0.015);
  ctx.strokeRect(i0, i0, i1 - i0, i1 - i0);
  // glint
  const gx = s * 0.27, gy = s * 0.26, gr = s * 0.11;
  ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(gx, gy - gr); ctx.lineTo(gx + gr * 0.18, gy - gr * 0.18); ctx.lineTo(gx + gr, gy); ctx.lineTo(gx + gr * 0.18, gy + gr * 0.18);
  ctx.lineTo(gx, gy + gr); ctx.lineTo(gx - gr * 0.18, gy + gr * 0.18); ctx.lineTo(gx - gr, gy); ctx.lineTo(gx - gr * 0.18, gy - gr * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- scene
const AUR_SCALE = 0.25;           // aurora buffer resolution
const COL_H = 96;                 // ray sprite height

// Ray colour ramp as a premultiplied RGB lookup table (top of the ray = index 0, lower edge = COL_H-1).
function rayLut(stops) {
  const parse = c => c.match(/[\d.]+/g).map(Number);
  const P = stops.map(([t, c]) => [t, parse(c)]);
  const lut = new Float32Array(COL_H * 3);
  for (let i = 0; i < COL_H; i++) {
    const t = i / (COL_H - 1);
    let k = 0; while (k < P.length - 2 && t > P[k + 1][0]) k++;
    const [t0, c0] = P[k], [t1, c1] = P[k + 1];
    const f = clamp((t - t0) / Math.max(1e-6, t1 - t0));
    const al = lerp(c0[3], c1[3], f);
    for (let j = 0; j < 3; j++) lut[i * 3 + j] = lerp(c0[j], c1[j], f) * al;
  }
  return lut;
}

export function createScene({ w, h, seed = 1, reduced = false }) {
  const R0 = rand(seed * 7919 + 5);
  // Ray sprites: index 0 = classic green curtain with violet crown, 1 = violet/pink curtain, 2 = danger red.
  const sprites = [
    rayLut([[0, 'rgba(255,90,200,0)'], [0.18, 'rgba(190,90,255,0.10)'], [0.42, 'rgba(110,120,255,0.20)'],
      [0.66, 'rgba(40,255,170,0.42)'], [0.86, 'rgba(70,255,150,0.9)'], [0.95, 'rgba(170,255,210,0.95)'], [1, 'rgba(90,255,170,0)']]),
    rayLut([[0, 'rgba(255,80,190,0)'], [0.25, 'rgba(255,90,200,0.14)'], [0.55, 'rgba(200,100,255,0.32)'],
      [0.82, 'rgba(255,110,215,0.7)'], [0.94, 'rgba(255,190,240,0.9)'], [1, 'rgba(255,140,220,0)']]),
  ];
  const ribbons = [
    { y: 0.50, hgt: 0.36, cx: 0.30, span: 0.62, f1: 0.010, f2: 0.023, s1: 0.22, s2: 0.13, amp: 0.05, sp: 0, min: 0, ph: R0() * 9 },
    { y: 0.40, hgt: 0.30, cx: 0.72, span: 0.60, f1: 0.008, f2: 0.031, s1: -0.17, s2: 0.21, amp: 0.045, sp: 0, min: 0.18, ph: R0() * 9 },
    { y: 0.31, hgt: 0.26, cx: 0.45, span: 0.85, f1: 0.012, f2: 0.019, s1: 0.12, s2: -0.15, amp: 0.04, sp: 1, min: 0.45, ph: R0() * 9 },
    { y: 0.58, hgt: 0.22, cx: 0.86, span: 0.38, f1: 0.016, f2: 0.04, s1: -0.25, s2: 0.1, amp: 0.03, sp: 1, min: 0.7, ph: R0() * 9 },
  ];
  const rayN = ribbons.map((_, i) => noise1(seed * 31 + i * 17));
  const rayN2 = ribbons.map((_, i) => noise1(seed * 53 + i * 29));
  const hN = ribbons.map((_, i) => fbm1(seed * 71 + i * 11, 3));

  const S = {
    w, h, aw: 1, ah: 1, aur: null, actx: null, sky: null, starsX: null, ground: null, snowGlow: null,
    yH: 0, bloom: 0, danger: 0, energy: 0, t: 0, field: null,
    ribYB: [], ribHT: [], boost: [], flare: [],
    sparkles: new Ring(200), twinkles: [],
    snow: null, snowN: 240,
    get creatures() { return this.sparkles.length; },
  };
  S.snow = { x: new Float32Array(S.snowN), y: new Float32Array(S.snowN), z: new Float32Array(S.snowN), p: new Float32Array(S.snowN) };
  const flake = glowSprite('#dff4ff', 24, 0.3);
  const moonGlow = glowSprite('#bfd8ff', 128, 0.08);

  function ridge(nf, x, scale) { const v = nf(x / scale); return 1 - Math.abs(2 * v - 1); }

  S.resize = (W, H) => {
    S.w = W; S.h = H;
    const yH = S.yH = Math.round(H * 0.8);
    S.aw = Math.ceil(W * AUR_SCALE); S.ah = Math.ceil(H * AUR_SCALE);
    S.aur = makeCanvas(S.aw, S.ah); S.actx = S.aur.getContext('2d');
    S.img = S.actx.createImageData(S.aw, S.ah);
    S.acc = new Float32Array(S.aw * S.ah * 3);
    S.ribYB = ribbons.map(() => new Float32Array(S.aw));
    S.ribHT = ribbons.map(() => new Float32Array(S.aw));
    S.boost = ribbons.map(() => new Float32Array(S.aw));
    S.flare = ribbons.map(() => new Float32Array(S.aw));
    for (const sp of S.sparkles) { sp.col = Math.min(S.aw - 1, sp.col); }
    const r = rand(seed * 1009 + 3);

    // --- sky: gradient, milky band, sparse stars, moon
    S.sky = makeCanvas(W, H);
    const g = S.sky.getContext('2d');
    const sg = g.createLinearGradient(0, 0, 0, yH);
    sg.addColorStop(0, '#01030c'); sg.addColorStop(0.45, '#040c22'); sg.addColorStop(0.8, '#0a1d3c'); sg.addColorStop(1, '#12324f');
    g.fillStyle = sg; g.fillRect(0, 0, W, yH + 2);
    // faint milky way band (diagonal)
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 90; k++) {
      const t = r(), x = t * W, y = lerp(H * 0.05, H * 0.45, t) + (r() - 0.5) * H * 0.14;
      drawGlow(g, glowSprite(r() < 0.5 ? '#3a4f8a' : '#4a3a7a', 64, 0.02), x, y, H * (0.04 + r() * 0.08), 0.12);
    }
    g.restore();
    const star = (ctx, n, aMax) => {
      for (let k = 0; k < n; k++) {
        const x = r() * W, y = Math.pow(r(), 1.2) * yH * 0.98, a = (0.2 + r() * 0.8) * aMax * (1 - 0.5 * y / yH);
        const sz = r() < 0.06 ? 2 : r() < 0.3 ? 1.4 : 1;
        ctx.fillStyle = rgba(r() < 0.2 ? '#ffe6c8' : r() < 0.4 ? '#c8dcff' : '#ffffff', a);
        ctx.fillRect(x, y, sz, sz);
      }
    };
    const area = W * H / (1600 * 900);
    star(g, Math.round(260 * area), 0.85);
    // moon
    const mx = W * 0.115, my = H * 0.15, mr = Math.max(10, H * 0.032);
    g.save(); g.globalCompositeOperation = 'lighter';
    drawGlow(g, moonGlow, mx, my, mr * 9, 0.35); drawGlow(g, moonGlow, mx, my, mr * 3.2, 0.5);
    g.restore();
    const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.7, '#e6eeff'); mg.addColorStop(1, '#b9c8e8');
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(140,160,200,0.12)';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(mx + (r() - 0.5) * mr, my + (r() - 0.5) * mr, mr * (0.12 + r() * 0.2), 0, TAU); g.fill(); }
    S.moon = { x: mx, y: my, r: mr };

    // --- extra stars that fade in with bloom
    S.starsX = makeCanvas(W, H);
    star(S.starsX.getContext('2d'), Math.round(700 * area), 0.9);
    S.twinkles = Array.from({ length: 70 }, () => ({
      x: r() * W, y: Math.pow(r(), 1.4) * yH * 0.85, ph: r() * TAU, sp: 0.6 + r() * 1.8,
      s: 3 + r() * 5, c: r() < 0.3 ? '#ffe2c0' : r() < 0.6 ? '#bcd6ff' : '#ffffff', b: r(),
    }));

    // --- ground: mountain ranges, moonlit snow, shore, frozen lake with reflection
    S.ground = makeCanvas(W, H);
    S.snowGlow = makeCanvas(W, H);
    const gg = S.ground.getContext('2d'), sgc = S.snowGlow.getContext('2d');
    const col = makeCanvas(2, 64), cg = col.getContext('2d');
    const cgr = cg.createLinearGradient(0, 0, 0, 64);
    cgr.addColorStop(0, 'rgba(255,255,255,1)'); cgr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); cgr.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = cgr; cg.fillRect(0, 0, 2, 64);
    const mtn = makeCanvas(W, H), mg2 = mtn.getContext('2d');
    const ranges = [
      { base: yH, amp: H * 0.27, sc: 300, sc2: 70, top: '#22385a', bot: '#14233c', snow: 0.75, glow: 0.5, edge: 0.35, nf: noise1(seed + 401), nf2: fbm1(seed + 409, 3) },
      { base: yH, amp: H * 0.2, sc: 180, sc2: 45, top: '#0d1a30', bot: '#081222', snow: 0.95, glow: 0.8, edge: 0.75, nf: noise1(seed + 503), nf2: fbm1(seed + 509, 3) },
    ];
    let minY = yH;
    for (const R of ranges) {
      const ys = new Float32Array(W + 3);
      for (let x = 0; x <= W + 2; x++) {
        const e = Math.pow(Math.abs(x / W - 0.5) * 2, 1.3);
        const shape = 0.65 * ridge(R.nf, x, R.sc) + 0.35 * R.nf2(x / R.sc2);
        ys[x] = R.base - R.amp * shape * ((1 - R.edge) + R.edge * e) - H * 0.015;
        if (ys[x] < minY) minY = ys[x];
      }
      const fg = mg2.createLinearGradient(0, R.base - R.amp, 0, R.base);
      fg.addColorStop(0, R.top); fg.addColorStop(1, R.bot);
      mg2.fillStyle = fg; mg2.beginPath(); mg2.moveTo(0, R.base + 1);
      for (let x = 0; x <= W + 2; x += 2) mg2.lineTo(x, ys[x]);
      mg2.lineTo(W + 2, R.base + 1); mg2.closePath(); mg2.fill();
      // moonlit snow: left-facing slopes catch the moon, streaky columns fading down
      for (let x = 2; x < W; x += 1) {
        const slope = (ys[x + 2] - ys[x - 2]) / 4;
        const lit = clamp(-slope * 1.6 + 0.12);
        const gully = R.nf(x / 4.5 + 31);
        const depth = (R.amp * (0.06 + 0.32 * R.nf2(x / 23 + 7) * gully)) * (0.4 + lit);
        const a = R.snow * (0.08 + 0.7 * lit) * (0.45 + 0.55 * gully);
        mg2.globalAlpha = a; mg2.drawImage(col, x, ys[x] - 0.5, 1, depth);
        sgc.globalAlpha = a * R.glow; sgc.drawImage(col, x, ys[x] - 0.5, 1, depth);
      }
      mg2.globalAlpha = 1;
      // tint the snow with moon-blue (multiply-ish via source-atop on this range only is costly; use overlay)
    }
    // cool tint over snow (keeps it moonlit, not paper white)
    mg2.globalCompositeOperation = 'source-atop';
    mg2.fillStyle = 'rgba(70,110,170,0.28)'; mg2.fillRect(0, 0, W, H);
    mg2.globalCompositeOperation = 'source-over';
    sgc.globalCompositeOperation = 'source-in';
    sgc.fillStyle = '#5dffb4'; sgc.fillRect(0, 0, W, H);
    sgc.globalCompositeOperation = 'source-over';
    // spruce silhouettes on the shore, only toward the sides
    const tree = (ctx, x, base, ht) => {
      ctx.beginPath(); ctx.moveTo(x, base - ht);
      const tiers = 5;
      for (let k = 1; k <= tiers; k++) { const yy = base - ht + ht * k / tiers; const ww = ht * 0.13 * (0.5 + k / tiers); ctx.lineTo(x + ww, yy); ctx.lineTo(x + ww * 0.35, yy - ht * 0.03); }
      for (let k = tiers; k >= 1; k--) { const yy = base - ht + ht * k / tiers; const ww = ht * 0.13 * (0.5 + k / tiers); ctx.lineTo(x - ww * 0.35, yy - ht * 0.03); ctx.lineTo(x - ww, yy); }
      ctx.closePath(); ctx.fill();
    };
    mg2.fillStyle = '#040a15';
    for (let k = 0; k < 70; k++) {
      const side = r() < 0.5 ? r() * 0.3 : 0.7 + r() * 0.3;
      const x = side * W, ht = H * (0.025 + r() * 0.05) * (0.6 + Math.abs(side - 0.5) * 1.4);
      tree(mg2, x, yH + 2, ht);
    }
    // snowy shoreline
    mg2.fillStyle = 'rgba(200,225,255,0.55)';
    const shN = noise1(seed + 777);
    for (let x = 0; x < W; x += 3) mg2.fillRect(x, yH - 1 - shN(x / 40) * 2, 3, 1.5 + shN(x / 13 + 5) * 2);
    gg.drawImage(mtn, 0, 0);
    S.frontTop = Math.max(0, Math.floor(minY - H * 0.06));
    // lake
    const lg = gg.createLinearGradient(0, yH, 0, H);
    lg.addColorStop(0, '#0f2847'); lg.addColorStop(0.35, '#0a1a33'); lg.addColorStop(1, '#040914');
    gg.fillStyle = lg; gg.fillRect(0, yH, W, H - yH);
    // reflections of sky stars + mountains (vertically mirrored, softened)
    gg.save(); gg.beginPath(); gg.rect(0, yH, W, H - yH); gg.clip();
    gg.setTransform(1, 0, 0, -1, 0, 2 * yH);
    gg.globalAlpha = 0.28; gg.drawImage(S.sky, 0, 0);
    gg.globalAlpha = 0.6; gg.drawImage(mtn, 0, 0);
    gg.restore();
    // ice: pressure cracks + wind-polished streaks
    gg.save(); gg.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 120; k++) {
      const y = yH + Math.pow(r(), 0.8) * (H - yH), x = r() * W, len = W * (0.03 + r() * 0.2) * (0.5 + (y - yH) / (H - yH));
      gg.globalAlpha = 0.03 + r() * 0.07; gg.fillStyle = '#9fc8ff'; gg.fillRect(x, y, len, 1);
    }
    gg.globalAlpha = 0.12; gg.strokeStyle = '#cfe6ff'; gg.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      let x = r() * W, y = yH + 6 + r() * (H - yH - 6); gg.beginPath(); gg.moveTo(x, y);
      for (let j = 0; j < 8; j++) { x += (r() - 0.3) * 40; y += (r() - 0.5) * 8; gg.lineTo(x, Math.max(yH + 3, y)); }
      gg.stroke();
    }
    gg.restore();
    // snow flakes init
    const sn = S.snow;
    for (let k = 0; k < S.snowN; k++) { sn.x[k] = r() * W; sn.y[k] = r() * H; sn.z[k] = Math.pow(r(), 1.8); sn.p[k] = r() * TAU; }
  };

  S.absorbTarget = (rnd = Math.random) => {
    const f = S.field;
    const fcx = f ? (f.x + f.w / 2) : S.w / 2, fw = f ? f.w : S.w * 0.24;
    const vis = ribbons.map((rb, i) => i).filter(i => S.bloom + 0.15 >= ribbons[i].min);
    const ri = vis[Math.floor(rnd() * vis.length)] ?? 0;
    let x = 0;
    for (let tries = 0; tries < 6; tries++) {
      const rb = ribbons[ri];
      x = (rb.cx + (rnd() - 0.5) * rb.span * 0.9) * S.w;
      if (Math.abs(x - fcx) > fw * 0.65 || tries === 5) break;
    }
    x = clamp(x, 8, S.w - 8);
    const c = Math.min(S.aw - 1, Math.max(0, Math.round(x * AUR_SCALE)));
    const yb = S.ribYB[ri]?.[c] ? S.ribYB[ri][c] / AUR_SCALE : S.h * ribbons[ri].y;
    const ht = S.ribHT[ri]?.[c] ? S.ribHT[ri][c] / AUR_SCALE : S.h * 0.2;
    return { x, y: yb - ht * (0.08 + rnd() * 0.35) };
  };

  S.absorb = (x, y, color) => {
    if (!S.aur) return;
    const c = Math.min(S.aw - 1, Math.max(0, Math.round(x * AUR_SCALE)));
    // nearest ribbon by curtain base
    let best = 0, bd = 1e9;
    ribbons.forEach((rb, i) => {
      const yb = S.ribYB[i][c] / AUR_SCALE || S.h * rb.y;
      const d = Math.abs(yb - y) + (S.bloom + 0.15 >= rb.min ? 0 : 1e5);
      if (d < bd) { bd = d; best = i; }
    });
    const yb = S.ribYB[best][c] / AUR_SCALE || S.h * ribbons[best].y;
    const ht = S.ribHT[best][c] / AUR_SCALE || S.h * 0.2;
    const frac = clamp((yb - y) / Math.max(1, ht), 0.02, 0.85);
    S.sparkles.add({ rib: best, col: c, frac, color: color || '#9dffd6', ph: Math.random() * TAU, born: S.t, sp: 1 + Math.random() * 2 });
    const B = S.boost[best], F = S.flare[best], wdt = 10;
    for (let k = -wdt * 2; k <= wdt * 2; k++) {
      const j = c + k; if (j < 0 || j >= S.aw) continue;
      const gk = Math.exp(-(k * k) / (wdt * wdt));
      B[j] = Math.min(0.9, B[j] + 0.07 * gk); F[j] = Math.min(1.5, F[j] + 0.9 * gk);
    }
  };

  S.update = (dt, env) => {
    const red = env.reduced || reduced;
    S.t += dt * (red ? 0.4 : 1);
    S.field = env.field || S.field;
    if (!S.started) { S.started = true; S.bloom = env.bloom ?? 0; S.danger = env.danger ?? 0; }
    S.bloom = ease(S.bloom, env.bloom ?? 0, 2, dt);
    S.danger = ease(S.danger, env.danger ?? 0, 3, dt);
    S.energy = ease(S.energy, (env.beatPulse || 0) * 0.6 + (env.kick || 0) * 0.5, 10, dt);
    const fd = Math.exp(-dt * 0.8);
    for (const F of S.flare) for (let j = 0; j < F.length; j++) F[j] *= fd;
    // snow
    const sn = S.snow, W = S.w, H = S.h, sp = red ? 0.45 : 1, wind = 10 + 6 * Math.sin(S.t * 0.1);
    for (let k = 0; k < S.snowN; k++) {
      const z = sn.z[k];
      sn.y[k] += (14 + 60 * z) * dt * sp;
      sn.x[k] += (wind * (0.3 + z) + Math.sin(S.t * 0.8 + sn.p[k]) * 12 * z) * dt * sp;
      if (sn.y[k] > H + 6) { sn.y[k] = -6; sn.x[k] = Math.random() * W; }
      if (sn.x[k] > W + 6) sn.x[k] -= W + 12;
    }
  };

  // The aurora is accumulated additively on the CPU at quarter resolution (one putImageData per frame
  // instead of ~1500 column blits), then scaled up soft with 'lighter'.
  function paintAurora(env) {
    const aw = S.aw, ah = S.ah, t = S.t, b = S.bloom, acc = S.acc;
    acc.fill(0);
    const f = S.field;
    const fcx = (f ? f.x + f.w / 2 : S.w / 2) * AUR_SCALE, fhw = (f ? f.w / 2 : S.w * 0.12) * AUR_SCALE;
    const pulse = 1 + 0.16 * S.energy;
    for (let i = 0; i < ribbons.length; i++) {
      const rb = ribbons[i];
      const vis = smooth(clamp((b - rb.min) / 0.25 + (i === 0 ? 1 : 0)));
      const YB = S.ribYB[i], HT = S.ribHT[i], B = S.boost[i], F = S.flare[i];
      const amp = rb.amp * ah, y0 = rb.y * ah, h0 = rb.hgt * ah * (0.75 + 0.45 * b);
      const cx = (rb.cx + 0.05 * Math.sin(t * 0.05 + rb.ph)) * aw, half = rb.span * aw / 2;
      const inten = (0.34 + 0.36 * b) * pulse * vis * 255;
      const lut = sprites[rb.sp], rn = rayN[i], rn2 = rayN2[i], hn = hN[i];
      let prev = 0;
      for (let x = 0; x < aw; x++) {
        const X = x / AUR_SCALE;
        const yb = y0 + amp * Math.sin(X * rb.f1 + t * rb.s1 + rb.ph) + amp * 0.6 * Math.sin(X * rb.f2 - t * rb.s2 + rb.ph * 2)
          + amp * 0.5 * (hn(X * 0.004 + t * 0.03) - 0.5) * 2;
        const ht = h0 * (0.55 + 0.6 * hn(X * 0.006 - t * 0.04 + 3)) * (1 + B[x] * 0.6 + F[x] * 0.25);
        YB[x] = yb; HT[x] = ht;
        const dyb = Math.abs(yb - prev); prev = yb;
        if (vis <= 0.001) continue;
        const d = Math.abs(x - cx) / half; if (d >= 1) continue;
        let env1 = smooth(1 - d);
        const fd = Math.abs(x - fcx) / (fhw * 1.3);
        if (fd < 1) env1 *= 0.5 + 0.5 * smooth(fd);
        const rays = 0.25 + 0.75 * Math.pow(rn(X * 0.04 + t * 0.35), 1.5) * (0.45 + 0.55 * rn2(X * 0.22 - t * 0.7));
        const fold = x === 0 ? 1 : 1 + Math.min(1.6, dyb * 1.6);
        const al = inten * env1 * rays * fold * (1 + B[x] * 1.2 + F[x] * 0.9);
        if (al < 2) continue;
        const top = yb - ht, y1 = Math.max(0, Math.ceil(top)), y2 = Math.min(ah - 1, Math.floor(yb + 1));
        const k = (COL_H - 1) / (ht + 1);
        for (let y = y1; y <= y2; y++) {
          const li = Math.min(COL_H - 1, Math.max(0, ((y - top) * k) | 0)) * 3, o = (y * aw + x) * 3;
          acc[o] += lut[li] * al; acc[o + 1] += lut[li + 1] * al; acc[o + 2] += lut[li + 2] * al;
        }
      }
    }
    const data = S.img.data, dg = S.danger, n = aw * ah;
    for (let p = 0, o = 0, q = 0; p < n; p++, o += 3, q += 4) {
      let r = acc[o] / 255, g = acc[o + 1] / 255, bl = acc[o + 2] / 255;
      if (r + g + bl < 0.5) { data[q + 3] = 0; continue; }
      if (dg > 0.01) { const m = Math.max(r, g, bl); r = lerp(r, m * 1.05, dg); g = lerp(g, m * 0.16, dg); bl = lerp(bl, m * 0.28, dg); }
      const A = Math.min(255, Math.max(r, g, bl));
      const s = 255 / A;
      data[q] = r * s; data[q + 1] = g * s; data[q + 2] = bl * s; data[q + 3] = A;
    }
    S.actx.putImageData(S.img, 0, 0);
  }

  // Static layers re-composited only when bloom moves noticeably (saves full-screen blits per frame).
  function composite() {
    const W = S.w, H = S.h, yH = S.yH, b = S.bloom;
    if (!S.back || S.back.width !== Math.ceil(W) || S.back.height !== Math.ceil(H)) { S.back = makeCanvas(W, H); S.front = makeCanvas(W, H); }
    const g = S.back.getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(S.sky, 0, 0);
    g.globalAlpha = 0.2 + 0.8 * b; g.drawImage(S.starsX, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
    const sg = g.createLinearGradient(0, yH * 0.3, 0, yH);
    sg.addColorStop(0, 'rgba(60,255,170,0)'); sg.addColorStop(0.7, `rgba(50,230,170,${0.02 + 0.06 * b})`);
    sg.addColorStop(1, `rgba(90,255,190,${0.05 + 0.14 * b})`);
    g.fillStyle = sg; g.fillRect(0, yH * 0.3, W, yH * 0.7 + 1);
    g.globalCompositeOperation = 'source-over';
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,2,8,${0.6 - 0.2 * b})`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const f = S.front.getContext('2d');
    f.globalCompositeOperation = 'source-over'; f.globalAlpha = 1;
    f.clearRect(0, 0, W, H);
    f.drawImage(S.ground, 0, 0);
    f.globalCompositeOperation = 'lighter'; f.globalAlpha = 0.04 + 0.32 * b; f.drawImage(S.snowGlow, 0, 0);
    f.globalCompositeOperation = 'source-over'; f.globalAlpha = 1;
    S.compB = b;
  }

  S.draw = (ctx, env) => {
    const W = S.w, H = S.h, yH = S.yH, b = S.bloom, t = S.t, dg = S.danger;
    if (!S.sky) S.resize(W, H);
    if (S.compB === undefined || Math.abs(S.compB - b) > 0.02 || !S.back || S.back.width !== Math.ceil(W)) composite();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(S.back, 0, 0);
    paintAurora(env);
    ctx.globalCompositeOperation = 'lighter';
    // twinkling bright stars
    const nTw = Math.round(S.twinkles.length * (0.3 + 0.7 * b));
    for (let k = 0; k < nTw; k++) {
      const s = S.twinkles[k];
      const tw = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
      drawGlow(ctx, glowSprite(s.c, 32, 0.12), s.x, s.y, s.s * (0.7 + 0.3 * tw), 0.3 + 0.5 * tw);
    }
    // aurora (quarter-res buffer scaled up = soft light)
    ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = true;
    const ay = Math.ceil(yH * AUR_SCALE) + 1;
    ctx.drawImage(S.aur, 0, 0, S.aw, ay, 0, 0, W, ay / AUR_SCALE);
    // sparkles woven into the curtain
    for (const sp of S.sparkles) {
      const YB = S.ribYB[sp.rib], HT = S.ribHT[sp.rib];
      const x = sp.col / AUR_SCALE, y = (YB[sp.col] - HT[sp.col] * sp.frac) / AUR_SCALE;
      if (y > yH - 4) continue;
      const age = S.t - sp.born, tw = 0.55 + 0.45 * Math.sin(S.t * sp.sp * 2 + sp.ph);
      const flare = Math.max(0, 1 - age / 1.6);
      const col = dg > 0.6 ? '#ff6a70' : sp.color;
      drawGlow(ctx, glowSprite(col, 48, 0.12), x, y, 6 + 4 * tw + 26 * flare + 3 * S.energy, 0.45 + 0.4 * tw + 0.5 * flare);
      ctx.globalAlpha = 0.7 * tw + 0.3;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // ground (mountains, lake, aurora light on snow, vignette)
    const ft = S.frontTop || 0;
    ctx.drawImage(S.front, 0, ft, W, H - ft, 0, ft, W, H - ft);
    // aurora reflected in the frozen lake (mirrored about the shore, foreshortened)
    ctx.save();
    ctx.beginPath(); ctx.rect(0, yH, W, H - yH); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.setTransform(1, 0, 0, -0.5, 0, 1.5 * yH);
    ctx.globalAlpha = 0.28 + 0.22 * b;
    ctx.drawImage(S.aur, 0, 0, S.aw, S.ah, 0, 0, W, H);
    ctx.restore();
    // falling snow (far = dots, near = soft glows)
    const sn = S.snow;
    const q = env.quality ?? 1, red = env.reduced || reduced;
    const n = Math.min(S.snowN, Math.round((50 + 190 * b) * q * (red ? 0.35 : 1)));
    ctx.fillStyle = '#e8f4ff';
    for (let k = 0; k < n; k++) {
      const z = sn.z[k];
      if (z > 0.55) continue;
      ctx.globalAlpha = 0.25 + 0.6 * z;
      const d = 1 + z * 2.4; ctx.fillRect(sn.x[k], sn.y[k], d, d);
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const z = sn.z[k];
      if (z <= 0.55) continue;
      drawGlow(ctx, flake, sn.x[k], sn.y[k], 3 + z * 6, 0.3 + 0.35 * z);
    }
    // danger: cold blood-red cast
    ctx.globalCompositeOperation = 'source-over';
    if (dg > 0.01) { ctx.globalAlpha = dg * 0.24; ctx.fillStyle = '#3a0010'; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  return S;
}
