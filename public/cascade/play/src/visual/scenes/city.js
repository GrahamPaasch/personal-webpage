// CITY AT NIGHT — A minor, 110 BPM, synth bass + four-on-the-floor. Rain over a wet neon plaza: layered
// skylines with lit windows, neon blade signs on the framing towers, a scrolling perspective grid that glows
// on the kick, car lights, bokeh and searchlights. As bloom grows the city wakes: more windows, signs, light.
// Line-clear particles become windows that switch on in the skyline.
import {
  TAU, clamp, lerp, smooth, ease, makeCanvas, rgba, mix, shade, rand, glowSprite, drawGlow, Ring,
} from '../sceneKit.js';

const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a)));

export const theme = {
  accent: '#ff3fd0',
  accent2: '#38e8ff',
  tints: { I: '#2ef2ff', O: '#ffd23f', T: '#b05cff', S: '#8dff3a', Z: '#ff2fa6', J: '#3d7bff', L: '#ff7a1f', G: '#6f7a99' },
  panel: { fill: 'rgba(6,4,18,0.64)', grid: 'rgba(170,130,255,0.085)', border: 'rgba(255,70,210,0.72)' },
  particle: {
    colors: ['#ff4fd8', '#38e8ff', '#b56bff', '#ffd36b', '#8dff6a'], shape: 'square',
    gravity: 0, drag: 0.8, size: [1.5, 3.5], glow: true,
  },
  text: '#f2ecff',
};

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- block skin: neon tube on dark glass
export function drawBlock(ctx, s, color, type, variant = 0) {
  const p = Math.max(1, s * 0.05), x0 = p, y0 = p, sz = s - 2 * p, cr = s * 0.13;
  // dark glassy core
  rrect(ctx, x0, y0, sz, sz, cr);
  let g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, mix(color, '#05030c', 0.72)); g.addColorStop(1, mix(color, '#05030c', 0.9));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.62);
  g.addColorStop(0, rgba(color, 0.08)); g.addColorStop(0.7, rgba(color, 0.16)); g.addColorStop(1, rgba(color, 0.42));
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // glass reflection sweep
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.72, 0); ctx.lineTo(0, s * 0.62); ctx.closePath();
  g = ctx.createLinearGradient(0, 0, s * 0.4, s * 0.4);
  g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = g; ctx.fill();
  // faint scanline texture in the glass
  ctx.fillStyle = rgba(color, 0.06);
  for (let y = y0 + s * 0.05; y < s; y += Math.max(2, s * 0.08)) ctx.fillRect(0, y, s, Math.max(0.6, s * 0.02));
  ctx.restore();
  // the neon tube
  const ti = s * 0.16, tw = Math.max(1.2, s * 0.085);
  rrect(ctx, ti, ti, s - 2 * ti, s - 2 * ti, s * 0.1);
  ctx.lineJoin = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = s * 0.28;
  ctx.strokeStyle = rgba(color, type === 'G' ? 0.55 : 0.95); ctx.lineWidth = tw; ctx.stroke();
  ctx.shadowBlur = s * 0.12; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(mix(color, '#ffffff', 0.75), type === 'G' ? 0.5 : 0.95); ctx.lineWidth = Math.max(0.7, tw * 0.38); ctx.stroke();
  // outer glass edge
  rrect(ctx, x0 + 0.5, y0 + 0.5, sz - 1, sz - 1, cr);
  ctx.strokeStyle = rgba(color, 0.38); ctx.lineWidth = Math.max(0.8, s * 0.025); ctx.stroke();
  // tiny specular dot on the tube
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(ti + s * 0.12, ti, Math.max(0.6, tw * 0.3), 0, TAU); ctx.fill();
}

// ---------------------------------------------------------------- scene
const SKY_A = [[0, '#030209'], [0.3, '#07071a'], [0.5, '#0e0c26'], [0.6, '#1c1638'], [0.62, '#221a40'], [1, '#05040b']];
const SKY_B = [[0, '#05031c'], [0.22, '#150a3c'], [0.4, '#36105a'], [0.52, '#7d1a6e'], [0.6, '#e2387e'], [0.62, '#ff6a8a'], [1, '#05040b']];
const NEON = ['#ff2fa6', '#2ef2ff', '#b05cff', '#ffd23f', '#8dff3a', '#ff7a1f', '#ff4fd8'];
const WARM = ['#ffd59a', '#ffe7c0', '#ffc27a', '#a8d8ff', '#ffb0e0'];

export function createScene({ w, h, seed = 1, reduced = false }) {
  let W = w, H = h, HZ = h * 0.62, U = 1;
  const R = rand(seed * 11 + 5);
  let skyA, skyB, skyM, frA, frB, frM, refl, reflSmall, vignCv, dangerCv, beamCv, bokehSpr = [];
  let signs = [], tips = [], winList = [];
  let qBloom = -1, time = 0, inited = false, bloomS = 0, dangerS = 0, lastField = null, beat = 0;
  const lit = new Ring(150);
  const RAIN = 420, rain = [];
  for (let i = 0; i < RAIN; i++) rain.push({ x: 0, y: 0, v: 0, len: 0, near: false });
  const splashes = new Ring(48);
  const BOK = 34, bokeh = [];
  for (let i = 0; i < BOK; i++) bokeh.push({ x: 0, y: 0, r: 0, c: 0, a: 0, vx: 0, vy: 0, ph: 0 });
  const CARS = 18, cars = [];
  for (let i = 0; i < CARS; i++) cars.push({ lane: 0, z: 0, sp: 0 });
  const flyers = [];
  for (let i = 0; i < 4; i++) flyers.push({ x: 0, y: 0, vx: 0, ph: 0 });
  let splashAcc = 0;

  // ---------- builders
  function paintSky(stops, isB) {
    const cv = makeCanvas(W, H), g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const r = rand(seed + (isB ? 41 : 9));
    // smog/cloud banks lit from below by the city
    for (let i = 0; i < 26; i++) {
      const cx = r() * W, cy = HZ * (0.08 + r() * 0.75), cw = W * (0.12 + r() * 0.3), ch = H * (0.02 + r() * 0.05);
      const col = isB ? (cy > HZ * 0.55 ? '#ff4f9a' : (r() < 0.5 ? '#7a3cff' : '#c03a9a')) : '#2a2f5a';
      g.globalAlpha = isB ? 0.07 + r() * 0.1 : 0.06 + r() * 0.08;
      g.drawImage(glowSprite(col, 64, 0.35), cx - cw / 2, cy - ch / 2, cw, ch);
    }
    // moon behind the haze
    const mx = W * 0.285, my = H * 0.13, mr = H * 0.045;
    g.globalCompositeOperation = 'lighter';
    drawGlow(g, glowSprite(isB ? '#ffb0d8' : '#9fb4ff', 128, 0.05), mx, my, mr * 6, isB ? 0.25 : 0.18);
    g.globalAlpha = isB ? 0.85 : 0.6; g.fillStyle = isB ? '#ffe6f2' : '#d8e0ff';
    g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.18; g.fillStyle = '#6a6a9a';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(mx + (r() - 0.5) * mr, my + (r() - 0.5) * mr, mr * (0.1 + r() * 0.2), 0, TAU); g.fill(); }
    // haze band crossing the moon
    g.globalAlpha = isB ? 0.35 : 0.3;
    g.drawImage(glowSprite(isB ? '#3a1050' : '#0c0c22', 64, 0.4), mx - mr * 4, my - mr * 0.1, mr * 8, mr * 0.9);
    // horizon city glow
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = isB ? 0.75 : 0.35;
    g.drawImage(glowSprite(isB ? '#ff4f8a' : '#4a3a8a', 128, 0.25), -W * 0.1, HZ - H * 0.16, W * 1.2, H * 0.28);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // far skyline (hazy)
    const fr = rand(seed * 3 + 7);
    let x = -10;
    while (x < W + 10) {
      const bw = (14 + fr() * 40) * U, bh = H * (0.04 + Math.pow(fr(), 1.6) * 0.17);
      g.fillStyle = isB ? '#2a1648' : '#0f0d24';
      g.fillRect(x, HZ - bh, bw, bh + 1);
      if (fr() < 0.18) { g.fillRect(x + bw * 0.45, HZ - bh - H * 0.03, Math.max(1, U), H * 0.03); if (isB) tips.push([x + bw * 0.45, HZ - bh - H * 0.03, 0]); }
      g.fillStyle = isB ? 'rgba(255,190,150,0.5)' : 'rgba(255,200,150,0.22)';
      const nwin = Math.floor(bw * bh / (90 * U * U) * (isB ? 0.5 : 0.12));
      for (let k = 0; k < nwin; k++) g.fillRect(x + 2 + fr() * (bw - 4), HZ - bh + 3 + fr() * (bh - 4), U, U);
      x += bw + fr() * 4 * U;
    }
    // haze over the far skyline
    const hg = g.createLinearGradient(0, HZ - H * 0.22, 0, HZ);
    hg.addColorStop(0, rgba(isB ? '#ff4f8a' : '#2a2a5a', 0)); hg.addColorStop(1, rgba(isB ? '#ff4f8a' : '#2a2a5a', isB ? 0.35 : 0.25));
    g.fillStyle = hg; g.fillRect(0, HZ - H * 0.22, W, H * 0.22);
    // ground base (wet asphalt) — reflections are drawn over this each frame
    const gg = g.createLinearGradient(0, HZ, 0, H);
    gg.addColorStop(0, isB ? '#2a0e34' : '#0c0a1a'); gg.addColorStop(0.3, '#08060f'); gg.addColorStop(1, '#040308');
    g.fillStyle = gg; g.fillRect(0, HZ, W, H - HZ);
    return cv;
  }

  // Builds mid skyline + framing towers into two canvases (A = few lit windows, B = city awake).
  function paintFront() {
    const A = makeCanvas(W, H), B = makeCanvas(W, H), ga = A.getContext('2d'), gb = B.getContext('2d');
    const r = rand(seed * 5 + 1);
    winList = [];
    const both = fn => { fn(ga, false); fn(gb, true); };
    const windows = (bx, by, bw, bh, cw, chh, gx, gy, pa, pb, store, floorBands) => {
      const cols = Math.max(1, Math.floor((bw - gx) / (cw + gx))), rows = Math.max(1, Math.floor((bh - gy) / (chh + gy)));
      const ox = bx + (bw - cols * (cw + gx) + gx) / 2;
      for (let j = 0; j < rows; j++) {
        const band = floorBands && r() < 0.07;
        for (let i = 0; i < cols; i++) {
          const x = ox + i * (cw + gx), y = by + gy + j * (chh + gy);
          if (y + chh > HZ && by < HZ) continue;
          const rv = r(), col = WARM[Math.floor(r() * WARM.length)];
          ga.fillStyle = '#121026'; ga.fillRect(x, y, cw, chh);
          gb.fillStyle = '#17112c'; gb.fillRect(x, y, cw, chh);
          if (rv < pa) { ga.fillStyle = rgba(col, 0.7); ga.fillRect(x, y, cw, chh); }
          if (rv < pb || band) { gb.fillStyle = rgba(col, 0.55 + r() * 0.4); gb.fillRect(x, y, cw, chh); }
          else if (store) winList.push(x, y, cw, chh);
        }
      }
    };
    // mid skyline
    let x = -20 * U;
    while (x < W + 20) {
      const bw = (36 + r() * 90) * U, bh = H * (0.1 + Math.pow(r(), 1.4) * 0.34), top = HZ - bh, style = r();
      both((g, isB) => {
        const gr = g.createLinearGradient(0, top, 0, HZ);
        gr.addColorStop(0, isB ? '#1a1036' : '#0b0a1a'); gr.addColorStop(1, isB ? '#0c0820' : '#06050f');
        g.fillStyle = gr; g.fillRect(x, top, bw, bh + 1);
        if (style < 0.3) g.fillRect(x + bw * 0.2, top - H * 0.025, bw * 0.6, H * 0.025);
        if (isB) { g.fillStyle = 'rgba(255,90,190,0.35)'; g.fillRect(x, top, Math.max(1, U), bh); g.fillStyle = 'rgba(80,220,255,0.18)'; g.fillRect(x + bw - U, top, U, bh); }
      });
      if (style > 0.78) { const ax = x + bw * 0.5, ah = H * (0.03 + r() * 0.05); both(g => { g.fillStyle = '#0b0a1a'; g.fillRect(ax - U, top - ah, 2 * U, ah); }); tips.push([ax, top - ah, r() * 2]); }
      windows(x + 3 * U, top + 3 * U, bw - 6 * U, bh - 4 * U, 4 * U, 5 * U, 3 * U, 4 * U, 0.05, 0.3, true, true);
      if (style > 0.55 && style < 0.7) both((g, isB) => { // rooftop accent strip
        g.fillStyle = isB ? rgba(NEON[Math.floor(r() * 3)], 0.8) : 'rgba(80,70,120,0.4)'; g.fillRect(x + 2 * U, top + 2 * U, bw - 4 * U, Math.max(1, U * 1.5));
      });
      x += bw + r() * 6 * U;
    }
    // framing towers (left/right), in front
    const towers = [
      { x: -10 * U, w: W * 0.115, top: H * 0.1 }, { x: W * 0.885, w: W * 0.13, top: H * 0.06 },
      { x: W * 0.085, w: W * 0.1, top: H * 0.3 }, { x: W * 0.8, w: W * 0.095, top: H * 0.26 },
    ];
    towers.forEach((t, ti) => {
      both((g, isB) => {
        const gr = g.createLinearGradient(t.x, 0, t.x + t.w, 0);
        gr.addColorStop(0, '#07060e'); gr.addColorStop(0.5, '#0b0916'); gr.addColorStop(1, '#06050c');
        g.fillStyle = gr; g.fillRect(t.x, t.top, t.w, H - t.top);
        g.fillStyle = 'rgba(255,255,255,0.035)';
        for (let y = t.top + 30 * U; y < H; y += 46 * U) g.fillRect(t.x, y, t.w, Math.max(1, U));
        const inner = ti % 2 === 0 ? t.x + t.w - 1.5 * U : t.x;
        g.fillStyle = isB ? 'rgba(255,80,200,0.55)' : 'rgba(120,110,200,0.25)'; g.fillRect(inner, t.top, 1.5 * U, H - t.top);
        g.fillStyle = isB ? 'rgba(80,230,255,0.5)' : 'rgba(120,110,200,0.2)'; g.fillRect(t.x, t.top, t.w, 1.5 * U);
      });
      windows(t.x + 8 * U, t.top + 10 * U, t.w - 16 * U, H - t.top - 10 * U, 9 * U, 12 * U, 6 * U, 10 * U, 0.03, 0.16, true, false);
    });
    // neon signs (off state painted into both canvases, lit sprite drawn per frame)
    signs = [];
    const addSign = (sx, sy, sw, sh, kind, color, thr) => {
      const sg = makeSign(sw, sh, kind, color, r);
      both(g => g.drawImage(sg.off, sx - sg.m, sy - sg.m));
      signs.push({ x: sx - sg.m, y: sy - sg.m, w: sw, h: sh, spr: sg.lit, color, thr, flick: r() < 0.35, ph: r() * 100, cx: sx + sw / 2, cy: sy + sh / 2 });
    };
    addSign(W * 0.135, H * 0.36, W * 0.032, H * 0.3, 'v', '#ff2fa6', 0.0);
    addSign(W * 0.02, H * 0.17, W * 0.07, H * 0.07, 'h', '#2ef2ff', 0.35);
    addSign(W * 0.035, H * 0.55, W * 0.026, H * 0.22, 'v', '#ffd23f', 0.6);
    addSign(W * 0.835, H * 0.33, W * 0.032, H * 0.32, 'v', '#2ef2ff', 0.15);
    addSign(W * 0.9, H * 0.13, W * 0.07, W * 0.07, 'o', '#b05cff', 0.45);
    addSign(W * 0.915, H * 0.5, W * 0.06, H * 0.06, 'h', '#ff7a1f', 0.7);
    addSign(W * 0.955, H * 0.62, W * 0.024, H * 0.2, 'v', '#ff4fd8', 0.85);
    return [A, B];
  }

  function makeSign(sw, sh, kind, color, r) {
    const m = Math.ceil(16 * U), cw = Math.ceil(sw + 2 * m), ch = Math.ceil(sh + 2 * m);
    const off = makeCanvas(cw, ch), on = makeCanvas(cw, ch);
    const path = new Path2D(), tw = Math.max(1.4, 2.2 * U), inset = 5 * U;
    const pr = (x, y, w2, h2) => path.rect(m + x, m + y, w2, h2);
    pr(inset, inset, sw - 2 * inset, sh - 2 * inset);
    if (kind === 'v') {
      const cell = sw - 4 * inset, n = Math.max(1, Math.floor((sh - 3 * inset) / (cell * 1.15)));
      for (let k = 0; k < n; k++) {
        const ox = m + 2 * inset, oy = m + 2 * inset + k * cell * 1.15, pt = i => [ox + (i % 3) * cell / 2, oy + Math.floor(i / 3) * cell / 2];
        const strokes = 2 + Math.floor(r() * 3);
        for (let s2 = 0; s2 < strokes; s2++) {
          const a = pt(Math.floor(r() * 9)), b = pt(Math.floor(r() * 9));
          if (a[0] === b[0] && a[1] === b[1]) continue;
          path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]);
        }
        if (r() < 0.3) { const c = pt(4); path.moveTo(c[0] + cell * 0.22, c[1]); path.arc(c[0], c[1], cell * 0.22, 0, TAU); }
      }
    } else if (kind === 'o') {
      const cx = m + sw / 2, cy = m + sh / 2, rr = Math.min(sw, sh) * 0.32;
      path.moveTo(cx + rr, cy); path.arc(cx, cy, rr, 0, TAU);
      path.moveTo(cx + rr * 0.55, cy); path.arc(cx, cy, rr * 0.55, 0, TAU);
      path.moveTo(cx - rr * 1.25, cy); path.lineTo(cx + rr * 1.25, cy);
    } else {
      const cx = m + sh * 0.5, cy = m + sh / 2, rr = sh * 0.24;
      path.moveTo(cx + rr, cy); path.arc(cx, cy, rr, 0, TAU);
      const x0 = m + sh, x1 = m + sw - 2 * inset, bars = 3;
      for (let i = 0; i < bars; i++) {
        const y = m + sh * (0.3 + i * 0.2), xe = lerp(x0, x1, 0.55 + r() * 0.45);
        path.moveTo(x0, y);
        if (i === 1) for (let xx = x0; xx < xe; xx += sh * 0.12) path.lineTo(xx + sh * 0.06, y + (((xx - x0) / (sh * 0.12)) % 2 ? -1 : 1) * sh * 0.05);
        else path.lineTo(xe, y);
      }
    }
    // off: dark board + dead grey tubes
    let g = off.getContext('2d');
    g.fillStyle = '#0a0814'; g.fillRect(m, m, sw, sh);
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = U; g.strokeRect(m + 0.5, m + 0.5, sw - 1, sh - 1);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = rgba(mix(color, '#3a3550', 0.75), 0.75); g.lineWidth = tw; g.stroke(path);
    // lit: glowing tube
    g = on.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = color; g.shadowBlur = 14 * U; g.strokeStyle = color; g.lineWidth = tw * 1.3; g.stroke(path);
    g.shadowBlur = 5 * U; g.stroke(path);
    g.shadowBlur = 0; g.strokeStyle = mix(color, '#ffffff', 0.72); g.lineWidth = tw * 0.5; g.stroke(path);
    return { off, lit: on, m };
  }

  function makeBokeh(color) {
    const S = 64, cv = makeCanvas(S, S), g = cv.getContext('2d'), r = S / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, rgba(color, 0.35)); gr.addColorStop(0.75, rgba(color, 0.45)); gr.addColorStop(0.9, rgba(mix(color, '#ffffff', 0.3), 0.7)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return cv;
  }

  function resize(w2, h2) {
    W = Math.max(2, w2); H = Math.max(2, h2); HZ = H * 0.62; U = Math.max(0.6, H / 900);
    tips = [];
    skyA = paintSky(SKY_A, false); skyB = paintSky(SKY_B, true); skyM = makeCanvas(W, H);
    [frA, frB] = paintFront(); frM = makeCanvas(W, H);
    const rh = Math.ceil(H - HZ);
    refl = makeCanvas(W, rh);
    reflSmall = makeCanvas(Math.ceil(W / 3), Math.ceil(rh / 7));
    vignCv = makeCanvas(W, H);
    { const g = vignCv.getContext('2d'), gr = g.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, 'rgba(2,1,6,0)'); gr.addColorStop(1, 'rgba(2,1,6,0.6)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    dangerCv = makeCanvas(W, H);
    { const g = dangerCv.getContext('2d');
      let gr = g.createRadialGradient(W / 2, H * 0.5, H * 0.25, W / 2, H * 0.5, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, 'rgba(255,20,40,0)'); gr.addColorStop(1, 'rgba(255,20,40,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      gr = g.createLinearGradient(0, HZ - H * 0.15, 0, HZ + H * 0.1);
      gr.addColorStop(0, 'rgba(255,30,50,0)'); gr.addColorStop(0.6, 'rgba(255,30,50,0.3)'); gr.addColorStop(1, 'rgba(255,30,50,0)');
      g.fillStyle = gr; g.fillRect(0, HZ - H * 0.15, W, H * 0.25); }
    beamCv = makeCanvas(64, 256);
    { const g = beamCv.getContext('2d');
      g.beginPath(); g.moveTo(30, 256); g.lineTo(34, 256); g.lineTo(64, 0); g.lineTo(0, 0); g.closePath();
      const gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, 'rgba(200,220,255,0.9)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
      g.fillStyle = gr; g.fill(); }
    bokehSpr = theme.particle.colors.concat(['#ffb070', '#ff3060']).map(makeBokeh);
    for (const d of rain) spawnRain(d, true);
    for (const b of bokeh) spawnBokeh(b, true);
    for (const c of cars) spawnCar(c, true);
    for (const f of flyers) spawnFlyer(f, true);
    qBloom = -1;
  }

  function recomposite(q) {
    qBloom = q;
    const mixInto = (M, A, B) => {
      const g = M.getContext('2d'); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
      g.drawImage(A, 0, 0); g.globalAlpha = q; g.drawImage(B, 0, 0); g.globalAlpha = 1; return g;
    };
    mixInto(skyM, skyA, skyB);
    const fg = mixInto(frM, frA, frB);
    fg.globalCompositeOperation = 'source-atop'; fg.drawImage(vignCv, 0, 0); fg.globalCompositeOperation = 'source-over';
    // wet-street reflection: flip the skyline about the horizon, smear vertically, darken with distance
    const rh = refl.height, sg = reflSmall.getContext('2d'), rg = refl.getContext('2d');
    sg.globalAlpha = 1; sg.clearRect(0, 0, reflSmall.width, reflSmall.height);
    sg.save(); sg.scale(reflSmall.width / W, -reflSmall.height / rh); sg.translate(0, -HZ);
    sg.drawImage(skyM, 0, 0, W, HZ, 0, 0, W, HZ); sg.drawImage(frM, 0, 0, W, HZ, 0, 0, W, HZ);
    sg.restore();
    rg.globalAlpha = 1; rg.globalCompositeOperation = 'source-over';
    rg.fillStyle = '#05040a'; rg.fillRect(0, 0, W, rh);
    rg.imageSmoothingEnabled = true; rg.globalAlpha = 0.85; rg.drawImage(reflSmall, 0, 0, W, rh);
    rg.globalAlpha = 1;
    const gr = rg.createLinearGradient(0, 0, 0, rh);
    gr.addColorStop(0, 'rgba(4,3,10,0.25)'); gr.addColorStop(0.5, 'rgba(4,3,10,0.6)'); gr.addColorStop(1, 'rgba(4,3,10,0.85)');
    rg.fillStyle = gr; rg.fillRect(0, 0, W, rh);
    rg.globalCompositeOperation = 'source-atop'; rg.drawImage(vignCv, 0, -HZ); rg.globalCompositeOperation = 'source-over';
    // bake vignette into the sky as well
    const kg = skyM.getContext('2d'); kg.drawImage(vignCv, 0, 0);
  }

  // ---------- particles
  function spawnRain(d, anywhere) {
    d.near = R() < 0.3; d.x = R() * (W + 100) - 50; d.y = anywhere ? R() * H : -R() * 80;
    d.v = (d.near ? 900 + R() * 300 : 500 + R() * 200) * U; d.len = (d.near ? 16 + R() * 14 : 7 + R() * 7) * U;
  }
  function spawnBokeh(b, anywhere) {
    b.x = R() * W; b.y = H * (0.25 + R() * 0.8); b.r = (8 + Math.pow(R(), 2.2) * 40) * U; b.c = Math.floor(R() * 7);
    b.a = 0.07 + R() * 0.17; b.vx = (R() - 0.5) * 6 * U; b.vy = -(2 + R() * 6) * U; b.ph = R() * TAU;
    if (!anywhere) b.y = H + b.r;
  }
  function spawnCar(c, anywhere) {
    c.lane = [-2.2, -1.2, 1.2, 2.2][Math.floor(R() * 4)]; c.sp = 2 + R() * 3;
    c.z = c.lane < 0 ? (anywhere ? 1 + R() * 40 : 40) : (anywhere ? 1 + R() * 40 : 0.9);
  }
  function spawnFlyer(f, anywhere) {
    f.vx = (R() < 0.5 ? -1 : 1) * (12 + R() * 18) * U; f.x = anywhere ? R() * W : (f.vx > 0 ? -20 : W + 20); f.y = H * (0.06 + R() * 0.3); f.ph = R() * 2;
  }

  function update(dt, env) {
    if (env.field) lastField = env.field;
    if (!inited) { bloomS = env.bloom ?? 0; dangerS = env.danger ?? 0; inited = true; }
    bloomS = ease(bloomS, clamp(env.bloom ?? 0), 1.5, dt);
    dangerS = ease(dangerS, clamp(env.danger ?? 0), 2.5, dt);
    beat = env.beat ?? time * 110 / 60;
    const slow = env.reduced || reduced ? 0.4 : 1;
    time += dt * slow;
    const q = Math.round(bloomS * 40) / 40;
    if (q !== qBloom && skyA) recomposite(q);
    const wind = 0.16;
    for (const d of rain) {
      d.y += d.v * dt * slow; d.x += d.v * wind * dt * slow;
      if (d.y > H + 20) {
        if (d.near && d.x > 0 && d.x < W) splashAcc += 0.25;
        spawnRain(d, false);
      }
    }
    while (splashAcc >= 1) { splashAcc -= 1; const y = HZ + Math.pow(R(), 0.6) * (H - HZ); splashes.add({ x: R() * W, y, t: time, s: (y - HZ) / (H - HZ) }); }
    for (const b of bokeh) { b.x += b.vx * dt * slow; b.y += b.vy * dt * slow; if (b.y < -b.r || b.x < -b.r || b.x > W + b.r) spawnBokeh(b, false); }
    for (const c of cars) {
      if (c.lane < 0) { c.z -= c.sp * dt * slow * (c.z * 0.25 + 0.3); if (c.z < 0.85) spawnCar(c, false); }
      else { c.z += c.sp * dt * slow * (c.z * 0.25 + 0.3); if (c.z > 45) spawnCar(c, false); }
    }
    for (const f of flyers) { f.x += f.vx * dt * slow; if (f.x < -40 || f.x > W + 40) spawnFlyer(f, false); }
  }

  function absorbTarget(r) {
    const f = lastField || { x: W * 0.38, y: 0, w: W * 0.24, h: H };
    const n = winList.length / 4;
    for (let k = 0; k < 24 && n > 0; k++) {
      const i = Math.floor(r() * n) * 4, x = winList[i] + winList[i + 2] / 2, y = winList[i + 1] + winList[i + 3] / 2;
      if (x > f.x - 8 && x < f.x + f.w + 8) continue;
      return { x, y };
    }
    return { x: r() < 0.5 ? W * 0.25 : W * 0.75, y: H * (0.3 + r() * 0.25) };
  }

  function absorb(x, y, color) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < winList.length; i += 4) {
      const dx = winList[i] + winList[i + 2] / 2 - x, dy = winList[i + 1] + winList[i + 3] / 2 - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; bi = i; }
    }
    const c = mix(color || '#ffd59a', '#ffe6c0', 0.4);
    if (bi >= 0 && bd < (40 * U) ** 2) lit.add({ x: winList[bi], y: winList[bi + 1], w: winList[bi + 2], h: winList[bi + 3], col: c, spr: glowSprite(color || '#ffd59a', 32, 0.15), born: time });
    else lit.add({ x: x - 2 * U, y: y - 3 * U, w: 4 * U, h: 5 * U, col: c, spr: glowSprite(color || '#ffd59a', 32, 0.15), born: time });
  }

  function draw(ctx, env) {
    if (!skyA) resize(W, H);
    if (qBloom < 0) recomposite(Math.round(bloomS * 40) / 40);
    const b = bloomS, dg = dangerS, t = time, red = env.reduced || reduced;
    const q = (env.quality ?? 1) * (red ? 0.35 : 1);
    const pulse = env.beatPulse || 0, kick = env.kick || 0;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(skyM, 0, 0);

    // wet reflection, rippling
    const rh = refl.height, sl = Math.max(3, Math.round(4 * U));
    for (let y = 0; y < rh; y += sl) {
      const k = y / rh, off = Math.sin(t * 1.7 + y * 0.09) * (0.5 + k * 5) * U + Math.sin(t * 0.9 + y * 0.023) * k * 3 * U;
      ctx.drawImage(refl, 0, y, W, sl, off, HZ + y, W, sl);
    }

    ctx.globalCompositeOperation = 'lighter';
    // searchlights sweeping the clouds
    const bA = sstep(0.35, 0.9, b);
    if (bA > 0.01) {
      for (let i = 0; i < 2; i++) {
        const ox = W * (i ? 0.66 : 0.3), ang = Math.sin(t * 0.13 + i * 2.1) * 0.5 + (i ? 0.25 : -0.25);
        ctx.save(); ctx.translate(ox, HZ - H * 0.2); ctx.rotate(ang);
        ctx.globalAlpha = bA * (0.09 + 0.03 * kick); ctx.drawImage(beamCv, -H * 0.12, -H * 0.9, H * 0.24, H * 0.9);
        ctx.restore();
      }
    }
    // aircraft lights
    if (b > 0.3) for (const f of flyers) {
      const bl = Math.exp(-(((t + f.ph) % 1.4)) * 5);
      drawGlow(ctx, glowSprite('#ff4060', 32, 0.2), f.x, f.y, 5 * U, (0.25 + 0.7 * bl) * sstep(0.3, 0.7, b));
      drawGlow(ctx, glowSprite('#ffffff', 32, 0.2), f.x + 6 * U, f.y, 2.5 * U, 0.6 * sstep(0.3, 0.7, b));
    }
    // neon perspective grid on the plaza, scrolling one row per beat
    const vx = W / 2, gh = H - HZ;
    const gc = mix(mix('#7a3cff', '#ff2fa6', 0.5 + 0.5 * Math.sin(t * 0.1)), '#ff2030', dg);
    ctx.strokeStyle = gc; ctx.lineWidth = Math.max(1, U);
    ctx.globalAlpha = (0.08 + 0.3 * b) * (1 + 0.6 * kick);
    ctx.beginPath();
    for (let i = -14; i <= 14; i++) { const xb = vx + i * W * 0.11; ctx.moveTo(vx + (xb - vx) * 0.02, HZ + gh * 0.02); ctx.lineTo(xb, H); }
    const ph = (beat % 1);
    for (let j = 0; j < 16; j++) { const z = 16 - j - ph + 0.6; if (z < 0.6) continue; const y = HZ + gh * (0.9 / z); if (y > H) continue; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // horizon line glow
    ctx.globalAlpha = (0.15 + 0.4 * b) * (1 + 0.5 * kick);
    ctx.drawImage(glowSprite(dg > 0.5 ? '#ff3040' : '#ff4fd8', 64, 0.3), -W * 0.05, HZ - 6 * U, W * 1.1, 12 * U);

    // car lights along the avenue
    const nc = Math.round(CARS * (0.3 + 0.7 * b) * Math.max(0.5, q));
    for (let i = 0; i < nc; i++) {
      const c = cars[i], z = c.z; if (z < 0.85) continue;
      const y = HZ + gh * (0.9 / z), s = 0.9 / z, x = vx + c.lane * gh * 0.5 * s;
      if (y > H + 10) continue;
      const head = c.lane < 0, spr = glowSprite(head ? '#fff1d0' : '#ff2a3a', 32, 0.2), rr = Math.max(1.5, 26 * U * s);
      const a = clamp(1.4 - z / 32) * 0.9, sep = gh * 0.11 * s;
      drawGlow(ctx, spr, x - sep, y, rr, a); drawGlow(ctx, spr, x + sep, y, rr, a);
      ctx.globalAlpha = a * 0.25; ctx.drawImage(spr, x - sep * 1.4, y, sep * 2.8, rr * 5); // smeared reflection
    }

    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(frM, 0, 0);

    // antenna beacons, blinking on alternate beats
    ctx.globalCompositeOperation = 'lighter';
    const bk = Math.exp(-((beat % 2)) * 2.2);
    for (const tp of tips) {
      const ph2 = Math.exp(-(((beat + tp[2]) % 2)) * 2.2);
      drawGlow(ctx, glowSprite('#ff2a40', 32, 0.2), tp[0], tp[1], 5 * U, 0.15 + 0.6 * (tp[2] ? ph2 : bk) * (0.5 + 0.5 * b));
    }
    // neon signs
    const neonGain = 0.85 + 0.15 * kick;
    for (const s of signs) {
      let a = sstep(s.thr - 0.05, s.thr + 0.2, b + 0.08);
      if (a <= 0.01) continue;
      if (s.flick) { const fz = Math.sin(t * 13 + s.ph) + Math.sin(t * 7.3 + s.ph * 2); if (fz > 1.75) a *= 0.45; }
      a *= neonGain;
      ctx.globalAlpha = a; ctx.drawImage(s.spr, s.x, s.y);
      drawGlow(ctx, glowSprite(s.color, 64, 0.2), s.cx, s.cy, Math.max(s.w, s.h) * 0.9, a * 0.22);
    }
    // windows switched on by line clears
    for (const L of lit) {
      const age = t - L.born, fl = Math.exp(-age * 3);
      ctx.globalAlpha = 0.55 + 0.45 * fl; ctx.fillStyle = L.col; ctx.fillRect(L.x, L.y, L.w, L.h);
      drawGlow(ctx, L.spr, L.x + L.w / 2, L.y + L.h / 2, Math.max(L.w, L.h) * (2 + 5 * fl) + pulse * U, 0.35 + 0.5 * fl);
    }
    // splashes on the wet ground
    ctx.strokeStyle = '#a8c8ff'; ctx.lineWidth = Math.max(0.7, U * 0.8);
    for (const s of splashes) {
      const age = t - s.t; if (age > 0.5) continue;
      const rr = (2 + age * 30) * U * (0.3 + s.s);
      ctx.globalAlpha = (1 - age / 0.5) * 0.35;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, rr, rr * 0.25, 0, 0, TAU); ctx.stroke();
    }
    // bokeh drifting in the foreground
    const nb = Math.round(BOK * (0.2 + 0.8 * b) * Math.max(0.4, q));
    const f = lastField;
    for (let i = 0; i < nb; i++) {
      const o = bokeh[i];
      let a = o.a * (0.6 + 0.4 * Math.sin(t * 0.6 + o.ph)) * (1 + 0.3 * kick);
      if (f && o.x > f.x && o.x < f.x + f.w) a *= 0.35;
      drawGlow(ctx, bokehSpr[o.c], o.x, o.y, o.r, a);
    }
    // rain
    ctx.globalCompositeOperation = 'source-over';
    const nr = Math.round(RAIN * (0.45 + 0.25 * b + 0.3 * dg) * q);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < nr; i++) {
        const d = rain[i]; if (d.near !== (pass === 1)) continue;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * 0.16, d.y - d.len);
      }
      ctx.strokeStyle = pass ? 'rgba(200,215,255,0.32)' : 'rgba(170,170,230,0.2)'; ctx.lineWidth = pass ? Math.max(1, 1.2 * U) : Math.max(0.6, 0.8 * U);
      ctx.globalAlpha = 1; ctx.stroke();
    }
    // danger: red warning glow, slow pulse (never strobing)
    if (dg > 0.01) { ctx.globalAlpha = dg * (0.7 + 0.2 * Math.sin(t * 2.2)); ctx.drawImage(dangerCv, 0, 0); }
    // kick: soft magenta bloom from the horizon
    if (kick > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glowSprite('#ff2fa6', 128, 0.2), W / 2, HZ, W * 0.45, 0.06 * kick * (0.4 + b));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  return {
    resize, update, draw, absorbTarget, absorb,
    get creatures() { return lit.length; },
  };
}
