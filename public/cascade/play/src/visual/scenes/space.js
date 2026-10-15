// Stage VI: Space. Deep parallax starfield, layered nebula clouds (a cool base + a vivid bloom layer),
// a distant spiral galaxy, and a ringed gas giant whose banded surface really rotates (texture sliced
// through an arcsin projection). Line-clear particles become new stars that link into faint constellations.
// Bloom lights the planet, blooms the nebula, adds stars and shooting stars. Danger: a red giant swells in
// the corner and the sky dims. No DOM access at import time.
import {
  TAU, clamp, lerp, smooth, ease, makeCanvas, rgba, mix, shade, rand, glowSprite, drawGlow, Ring,
} from '../sceneKit.js';

export const theme = {
  accent: '#9fd2ff',
  accent2: '#e39bff',
  tints: { I: '#4fe3ff', O: '#ffd450', T: '#b56dff', S: '#5cff9a', Z: '#ff5482', J: '#5c84ff', L: '#ff9a45', G: '#7d8499' },
  panel: { fill: 'rgba(3,3,14,0.68)', grid: 'rgba(160,170,255,0.07)', border: 'rgba(175,145,255,0.6)' },
  particle: {
    colors: ['#ffffff', '#a8dcff', '#ffd9a8', '#dcb4ff', '#8ff3ff'],
    shape: 'star', gravity: 0, drag: 0.55, size: [1.5, 4], glow: true,
  },
  text: '#eef0ff',
};

function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

// ---------------------------------------------------------------- block skin: a window onto deep space
export function drawBlock(ctx, s, color, type, variant = 0) {
  const r = rand(hashStr(type) + variant * 613 + 29);
  const m = s * 0.045, w = s - 2 * m;
  ctx.save();
  // dark cosmic core, faintly tinted by the piece colour
  const core = ctx.createRadialGradient(s * 0.42, s * 0.4, s * 0.05, s * 0.5, s * 0.5, s * 0.72);
  core.addColorStop(0, mix(color, '#05030c', 0.55));
  core.addColorStop(0.6, mix(color, '#04030a', 0.8));
  core.addColorStop(1, mix(color, '#020108', 0.9));
  ctx.fillStyle = core; ctx.fillRect(m, m, w, w);
  ctx.beginPath(); ctx.rect(m, m, w, w); ctx.clip();
  // nebula wisps
  ctx.globalCompositeOperation = 'lighter';
  const hue2 = mix(color, r() < 0.5 ? '#ff4fd8' : '#4fd0ff', 0.45);
  for (let k = 0; k < 3; k++) {
    const x = m + r() * w, y = m + r() * w, rr = s * (0.25 + r() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    const c = k === 1 ? hue2 : color;
    g.addColorStop(0, rgba(c, 0.38)); g.addColorStop(0.5, rgba(c, 0.12)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(m, m, w, w);
  }
  // tiny stars
  for (let k = 0; k < 11; k++) {
    const x = m + r() * w, y = m + r() * w, d = Math.max(0.6, s * (0.012 + r() * 0.022));
    ctx.globalAlpha = 0.45 + r() * 0.55;
    ctx.fillStyle = r() < 0.3 ? shade(color, 0.7) : '#ffffff';
    ctx.fillRect(x, y, d, d);
  }
  // one bright star with a diffraction glint
  const bx = m + w * (0.25 + r() * 0.5), by = m + w * (0.25 + r() * 0.5), br = s * 0.16;
  ctx.globalAlpha = 1;
  const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
  bg.addColorStop(0, 'rgba(255,255,255,0.95)'); bg.addColorStop(0.25, rgba(shade(color, 0.5), 0.5)); bg.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = bg; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
  ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.5, s * 0.012);
  ctx.beginPath(); ctx.moveTo(bx - br * 1.2, by); ctx.lineTo(bx + br * 1.2, by); ctx.moveTo(bx, by - br * 1.2); ctx.lineTo(bx, by + br * 1.2); ctx.stroke();
  // inner glow from the rim (piece colour bleeding inward)
  ctx.globalAlpha = 1;
  const edge = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0)); return g;
  };
  const e = s * 0.2;
  ctx.fillStyle = edge(m, 0, m + e, 0); ctx.fillRect(m, m, e, w);
  ctx.fillStyle = edge(s - m, 0, s - m - e, 0); ctx.fillRect(s - m - e, m, e, w);
  ctx.fillStyle = edge(0, m, 0, m + e); ctx.fillRect(m, m, w, e);
  ctx.fillStyle = edge(0, s - m, 0, s - m - e); ctx.fillRect(m, s - m - e, w, e);
  ctx.restore();
  // bright rim in the piece colour
  ctx.save();
  ctx.strokeStyle = shade(color, 0.15); ctx.lineWidth = Math.max(1, s * 0.07);
  ctx.strokeRect(m + s * 0.035, m + s * 0.035, w - s * 0.07, w - s * 0.07);
  ctx.strokeStyle = shade(color, 0.6); ctx.lineWidth = Math.max(0.8, s * 0.025);
  ctx.strokeRect(m + s * 0.035, m + s * 0.035, w - s * 0.07, w - s * 0.07);
  // top-left catch light
  ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.6, s * 0.02);
  ctx.beginPath(); ctx.moveTo(m + s * 0.05, s * 0.55); ctx.lineTo(m + s * 0.05, m + s * 0.05); ctx.lineTo(s * 0.55, m + s * 0.05); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- noise (2-D value noise, x-periodic)
function noise2(seed, periodX = 256) {
  const r = rand(seed), N = 256, v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = r();
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const x0 = ((xi % periodX) + periodX) % periodX, x1 = (x0 + 1) % periodX;
    const y0 = ((yi % N) + N) % N, y1 = (y0 + 1) % N;
    const a = v[y0 * N + x0], b = v[y0 * N + x1], c = v[y1 * N + x0], d = v[y1 * N + x1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
}

// ---------------------------------------------------------------- scene
export function createScene({ w, h, seed = 1, reduced = false }) {
  const S = {
    w, h, t: 0, bloom: 0, danger: 0, energy: 0, field: null,
    stars: new Ring(200), links: [], shooters: [], twinkles: [],
    get creatures() { return this.stars.length; },
  };
  const spike = (() => {
    let c = null;
    return () => {
      if (c) return c;
      const n = 64; c = makeCanvas(n, n); const g = c.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const gr = g.createLinearGradient(n / 2 - dx * n / 2, n / 2 - dy * n / 2, n / 2 + dx * n / 2, n / 2 + dy * n / 2);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; if (dx) g.fillRect(0, n / 2 - 0.75, n, 1.5); else g.fillRect(n / 2 - 0.75, 0, 1.5, n);
      }
      return c;
    };
  })();

  function nebula(W, H, r, opts) {
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const pal = opts.pal;
    // a gently curved band from lower-left to upper-right, plus a cluster at one side
    for (let k = 0; k < opts.n; k++) {
      const t = r();
      const bx = t * W, by = lerp(H * 0.88, H * 0.12, t) + Math.sin(t * 5 + opts.ph) * H * 0.1;
      const sp = H * (0.08 + 0.2 * Math.pow(r(), 1.5));
      const a = r() * TAU, d = sp * Math.sqrt(r());
      const x = bx + Math.cos(a) * d * 1.6, y = by + Math.sin(a) * d;
      const pi = Math.min(pal.length - 1, Math.floor((t + (r() - 0.5) * 0.25) * pal.length));
      const col = pal[Math.max(0, pi)];
      const rr = H * (0.03 + 0.16 * Math.pow(r(), 2));
      drawGlow(g, glowSprite(col, 128, 0.0), x, y, rr, opts.alpha * (0.4 + r() * 0.6));
    }
    // filaments
    g.lineCap = 'round';
    for (let k = 0; k < opts.fil; k++) {
      const t = r(), x0 = t * W, y0 = lerp(H * 0.88, H * 0.12, t) + (r() - 0.5) * H * 0.3;
      g.strokeStyle = rgba(pal[Math.floor(r() * pal.length)], opts.alpha * 0.25);
      g.lineWidth = 1 + r() * 3;
      g.beginPath(); g.moveTo(x0, y0);
      g.bezierCurveTo(x0 + (r() - 0.5) * H * 0.4, y0 + (r() - 0.5) * H * 0.3, x0 + (r() - 0.5) * H * 0.4, y0 + (r() - 0.5) * H * 0.3, x0 + (r() - 0.5) * H * 0.5, y0 + (r() - 0.5) * H * 0.4);
      g.stroke();
    }
    // dark dust lanes carved out of the clouds
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < opts.dust; k++) {
      const t = r(), x = t * W, y = lerp(H * 0.88, H * 0.12, t) + Math.sin(t * 5 + opts.ph) * H * 0.1 + (r() - 0.5) * H * 0.12;
      drawGlow(g, glowSprite('#000000', 64, 0.2), x, y, H * (0.02 + r() * 0.06), 0.35 + r() * 0.4);
    }
    // calm the region behind the playfield
    const cg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.22);
    cg.addColorStop(0, 'rgba(0,0,0,0.55)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  function starLayer(W, H, r, n, big) { // far layer (baked)
    const c = makeCanvas(W, H), g = c.getContext('2d');
    for (let k = 0; k < n; k++) {
      const x = r() * W, y = r() * H, roll = r();
      const col = roll < 0.15 ? '#ffd2a8' : roll < 0.35 ? '#a8c8ff' : roll < 0.42 ? '#ffb0c8' : '#ffffff';
      if (big) {
        g.globalCompositeOperation = 'lighter';
        drawGlow(g, glowSprite(col, 32, 0.1), x, y, 3 + r() * 6, 0.6 + r() * 0.4);
        if (r() < 0.25) { const L = 10 + r() * 16; g.globalAlpha = 0.5; g.drawImage(spike(), x - L, y - L, L * 2, L * 2); }
        g.globalCompositeOperation = 'source-over';
      } else {
        g.globalAlpha = 0.35 + r() * 0.65; g.fillStyle = col;
        const d = r() < 0.2 ? 1.6 : 1.1; g.fillRect(x, y, d, d);
      }
    }
    g.globalAlpha = 1;
    return c;
  }

  S.resize = (W, H) => {
    S.w = W; S.h = H;
    const r = rand(seed * 4513 + 11), area = W * H / (1600 * 900);
    // background: deep gradient + far stars + base nebula + galaxy glow
    S.bg = makeCanvas(W, H);
    const g = S.bg.getContext('2d');
    const bgG = g.createRadialGradient(W * 0.55, H * 0.55, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    bgG.addColorStop(0, '#0a0820'); bgG.addColorStop(0.5, '#050414'); bgG.addColorStop(1, '#010108');
    g.fillStyle = bgG; g.fillRect(0, 0, W, H);
    S.nebA = nebula(W, H, r, { n: 160, fil: 0, dust: 50, alpha: 0.2, ph: 1.3, pal: ['#1a2a6a', '#22337a', '#3a2a7a', '#4a2370', '#2a4a7a', '#1f5560'] });
    g.drawImage(S.nebA, 0, 0);
    g.drawImage(starLayer(W, H, r, Math.round(1300 * area), false), 0, 0);
    S.nebB = nebula(W, H, r, { n: 300, fil: 90, dust: 80, alpha: 0.34, ph: 1.3, pal: ['#16d6c8', '#1f8cff', '#5a4dff', '#a03cff', '#ff3fae', '#ff6a5a', '#ffa64a'] });
    const starCol = () => { const q = r(); return q < 0.15 ? '#ffd2a8' : q < 0.35 ? '#a8c8ff' : q < 0.42 ? '#ffb0c8' : '#ffffff'; };
    S.mid = Array.from({ length: Math.round(420 * area) }, (_, k) => ({ x: r() * W, y: r() * H, a: 0.3 + r() * 0.6, d: r() < 0.25 ? 1.7 : 1.15, c: starCol(), on: k / (420 * area) }));
    S.near = Array.from({ length: Math.round(110 * area) }, (_, k) => ({ x: r() * W, y: r() * H, s: 2.5 + r() * 5, a: 0.55 + r() * 0.45, c: starCol(), spk: r() < 0.22 ? 9 + r() * 14 : 0, on: k / (110 * area), ph: r() * TAU, tws: 0.6 + r() * 2 }));
    // galaxy sprite
    const G = Math.round(H * 0.42);
    S.gal = makeCanvas(G, G);
    const gg = S.gal.getContext('2d'); gg.globalCompositeOperation = 'lighter';
    drawGlow(gg, glowSprite('#ffe6c0', 128, 0.05), G / 2, G / 2, G * 0.22, 0.9);
    drawGlow(gg, glowSprite('#8a7cff', 128, 0.0), G / 2, G / 2, G * 0.5, 0.35);
    for (let k = 0; k < 2600; k++) {
      const arm = k % 2, t = Math.pow(r(), 0.8), rad = t * G * 0.47;
      const th = arm * Math.PI + t * 4.4 + (r() - 0.5) * (0.5 + 0.6 * (1 - t));
      const x = G / 2 + Math.cos(th) * rad + (r() - 0.5) * 6, y = G / 2 + Math.sin(th) * rad + (r() - 0.5) * 6;
      gg.globalAlpha = (0.15 + r() * 0.5) * (1 - t * 0.6);
      gg.fillStyle = t < 0.25 ? '#fff0d0' : r() < 0.3 ? '#ff9ad8' : '#9cc4ff';
      const d = r() < 0.08 ? 2 : 1.2; gg.fillRect(x, y, d, d);
      if (r() < 0.04) drawGlow(gg, glowSprite(r() < 0.5 ? '#ff7ad0' : '#7ab8ff', 32, 0.1), x, y, 4 + r() * 6, 0.5);
    }
    gg.globalAlpha = 1;
    S.galPos = { x: W * 0.13, y: H * 0.24, size: G };

    // planet
    const pr = Math.round(H * 0.15);
    S.pl = { x: W * 0.845, y: H * 0.34, r: pr, tilt: -0.36 };
    const L = Math.round(TAU * pr), TH = pr * 2;
    S.texL = L;
    S.tex = makeCanvas(L + Math.ceil(L / 2) + 2, TH);
    const tg = S.tex.getContext('2d');
    const img = tg.createImageData(S.tex.width, TH);
    const nz = noise2(seed * 97 + 3, 16), nz2 = noise2(seed * 131 + 7, 48);
    const pal = [[38, 26, 78], [88, 58, 140], [196, 150, 214], [242, 214, 196], [126, 72, 128], [58, 110, 156], [214, 170, 160]];
    for (let y = 0; y < TH; y++) {
      const lat = Math.asin(clamp((y - pr) / pr, -1, 1));       // sphere latitude → pole compression
      for (let x = 0; x < S.tex.width; x++) {
        const u = (x % L) / L;
        const warp = nz(u * 8, lat * 3) * 0.5 + nz2(u * 48, lat * 26) * 0.14 + Math.sin(u * TAU * 3 + lat * 5) * 0.08;
        let v = (lat / Math.PI + 0.5) * 13 + warp;
        // great storm
        const du = (u - 0.3) * 6, dv = (lat + 0.32) * 9, sd = du * du + dv * dv;
        const storm = Math.exp(-sd * 1.6);
        v += storm * 1.1 * Math.sin(Math.atan2(dv, du) * 2 + sd * 3);
        const fi = ((v % pal.length) + pal.length) % pal.length, i0 = Math.floor(fi), i1 = (i0 + 1) % pal.length, f = smooth(fi - i0);
        const o = (y * S.tex.width + x) * 4;
        const shadeV = 0.85 + 0.25 * nz2(u * 96, lat * 60);
        img.data[o] = clamp(lerp(pal[i0][0], pal[i1][0], f) * shadeV + storm * 40, 0, 255);
        img.data[o + 1] = clamp(lerp(pal[i0][1], pal[i1][1], f) * shadeV + storm * 10, 0, 255);
        img.data[o + 2] = clamp(lerp(pal[i0][2], pal[i1][2], f) * shadeV, 0, 255);
        img.data[o + 3] = 255;
      }
    }
    tg.putImageData(img, 0, 0);
    // planet shading overlay (light from the upper-left, toward the galaxy) + atmosphere rim
    const P = pr * 2 + 8;
    S.shade = makeCanvas(P, P);
    const sh = S.shade.getContext('2d');
    const sg = sh.createRadialGradient(P / 2 - pr * 0.45, P / 2 - pr * 0.5, pr * 0.1, P / 2, P / 2, pr * 1.05);
    sg.addColorStop(0, 'rgba(0,0,10,0)'); sg.addColorStop(0.4, 'rgba(2,0,16,0.3)'); sg.addColorStop(0.72, 'rgba(2,0,14,0.88)'); sg.addColorStop(1, 'rgba(0,0,8,0.98)');
    sh.fillStyle = sg; sh.beginPath(); sh.arc(P / 2, P / 2, pr, 0, TAU); sh.fill();
    S.rim = makeCanvas(P + pr, P + pr);
    const rm = S.rim.getContext('2d'), RC = (P + pr) / 2;
    const rg = rm.createRadialGradient(RC, RC, pr * 0.88, RC, RC, pr * 1.35);
    rg.addColorStop(0, 'rgba(120,200,255,0)'); rg.addColorStop(0.2, 'rgba(140,210,255,0.55)'); rg.addColorStop(0.35, 'rgba(120,150,255,0.18)'); rg.addColorStop(1, 'rgba(90,80,255,0)');
    rm.fillStyle = rg; rm.fillRect(0, 0, P + pr, P + pr);
    // keep the rim mostly on the lit limb
    rm.globalCompositeOperation = 'destination-out';
    const cut = rm.createLinearGradient(RC - pr, RC - pr, RC + pr, RC + pr);
    cut.addColorStop(0, 'rgba(0,0,0,0)'); cut.addColorStop(0.55, 'rgba(0,0,0,0.6)'); cut.addColorStop(1, 'rgba(0,0,0,0.95)');
    rm.fillStyle = cut; rm.fillRect(0, 0, P + pr, P + pr);
    // rings (flat annulus, squashed when drawn)
    const RR = Math.round(pr * 2.35);
    S.ring = makeCanvas(RR * 2, RR * 2);
    const rgx = S.ring.getContext('2d');
    for (let rad = pr * 1.32; rad < RR; rad += 1) {
      const t = (rad - pr * 1.32) / (RR - pr * 1.32);
      const band = 0.5 + 0.5 * Math.sin(t * 40 + Math.sin(t * 13) * 2) * Math.sin(t * 7.3);
      const gap = (t > 0.58 && t < 0.63) ? 0.08 : 1;
      const a = (0.12 + 0.55 * band) * gap * smooth(Math.min(1, t * 6)) * smooth(Math.min(1, (1 - t) * 5));
      rgx.strokeStyle = rgba(mix('#e8cfe8', '#8fb4ff', t), a);
      rgx.lineWidth = 1.2; rgx.beginPath(); rgx.arc(RR, RR, rad, 0, TAU); rgx.stroke();
    }
    // planet's shadow falling across the far side of the ring (lit from upper-left → shadow lower-right)
    rgx.globalCompositeOperation = 'destination-out';
    rgx.save(); rgx.translate(RR, RR); rgx.rotate(Math.PI * 0.25 - 0.36);
    rgx.fillStyle = 'rgba(0,0,0,0.85)'; rgx.fillRect(0, -pr * 0.95, RR, pr * 1.9);
    rgx.restore();
    S.RR = RR;
    // red giant (danger)
    S.giant = { x: W * 0.06, y: H * 0.92, r: H * 0.55 };
    S.compB = undefined;
  };

  S.absorbTarget = (rnd = Math.random) => {
    const f = S.field || { x: S.w * 0.38, y: 0, w: S.w * 0.24, h: S.h };
    let x = 0, y = 0;
    for (let k = 0; k < 8; k++) {
      x = S.w * (0.03 + rnd() * 0.94); y = S.h * (0.05 + rnd() * 0.85);
      const inField = x > f.x - 30 && x < f.x + f.w + 30;
      const pl = S.pl, onPlanet = pl && Math.hypot(x - pl.x, y - pl.y) < pl.r * 1.1;
      if (!inField && !onPlanet) break;
    }
    return { x, y };
  };

  S.absorb = (x, y, color) => {
    const st = { x, y, color: color || '#ffffff', ph: Math.random() * TAU, sp: 0.7 + Math.random() * 1.8, born: S.t, deg: 0, dead: false, size: 0.7 + Math.random() * 0.6 };
    // constellation: link to the nearest living star that still has room
    let best = null, bd = Math.min(S.w, S.h) * 0.2;
    for (const o of S.stars) {
      if (o.dead || o.deg >= 2) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd) { bd = d; best = o; }
    }
    if (S.stars.length >= S.stars.cap) { const old = S.stars.items[S.stars.i]; if (old) old.dead = true; }
    S.stars.add(st);
    if (best) { best.deg++; st.deg++; S.links.push([best, st, S.t]); }
    if (S.links.length > 260) S.links = S.links.filter(([a, b]) => !a.dead && !b.dead);
  };

  S.update = (dt, env) => {
    const red = env.reduced || reduced;
    S.t += dt * (red ? 0.4 : 1);
    S.field = env.field || S.field;
    if (!S.started) { S.started = true; S.bloom = env.bloom ?? 0; S.danger = env.danger ?? 0; }
    S.bloom = ease(S.bloom, env.bloom ?? 0, 2, dt);
    S.danger = ease(S.danger, env.danger ?? 0, 3, dt);
    S.energy = ease(S.energy, (env.beatPulse || 0) * 0.6 + (env.kick || 0) * 0.5, 10, dt);
    // shooting stars at high bloom
    const rate = (S.bloom > 0.4 ? (S.bloom - 0.4) * 0.6 : 0) * (red ? 0.3 : 1);
    if (S.shooters.length < 3 && Math.random() < rate * dt) {
      const a = 0.35 + Math.random() * 0.4, sp = S.h * (1.1 + Math.random() * 0.8);
      S.shooters.push({ x: Math.random() * S.w * 0.9, y: -10 + Math.random() * S.h * 0.3, vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * sp, life: 0, max: 0.7 + Math.random() * 0.5 });
    }
    for (const s of S.shooters) { s.x += s.vx * dt; s.y += s.vy * dt; s.life += dt; }
    S.shooters = S.shooters.filter(s => s.life < s.max);
  };

  function drawPlanet(ctx, b) {
    const { x, y, r, tilt } = S.pl, RR = S.RR, squash = 0.27, t = S.t;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(tilt);
    const ringA = 0.45 + 0.5 * b;
    // far half of the ring
    ctx.save(); ctx.beginPath(); ctx.rect(-RR, -RR, RR * 2, RR); ctx.clip();
    ctx.scale(1, squash); ctx.globalAlpha = ringA; ctx.drawImage(S.ring, -RR, -RR);
    ctx.restore();
    // sphere: texture sliced through an arcsin projection so the bands really turn
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    ctx.globalAlpha = 1;
    const L = S.texL, off = ((t * 9) % L + L) % L, N = 44, TH = r * 2;
    for (let i = 0; i < N; i++) {
      const xa = -r + (2 * r * i) / N, xb = -r + (2 * r * (i + 1)) / N;
      const ua = (Math.asin(clamp(xa / r, -1, 1)) / TAU) * L + L / 4 + off;
      const ub = (Math.asin(clamp(xb / r, -1, 1)) / TAU) * L + L / 4 + off;
      const u0 = ua % L, du = Math.max(0.5, ub - ua);
      ctx.drawImage(S.tex, u0, 0, du, TH, xa, -r, xb - xa + 0.6, TH);
    }
    ctx.restore();
    // terminator: night side deepens when bloom is low
    ctx.rotate(-tilt);
    const P = S.shade.width;
    ctx.globalAlpha = clamp(1.15 - 0.55 * b);
    ctx.drawImage(S.shade, -P / 2, -P / 2);
    if (b < 0.4) { ctx.globalAlpha = (0.4 - b) * 1.2; ctx.drawImage(S.shade, -P / 2, -P / 2); }
    ctx.globalCompositeOperation = 'lighter';
    const Rm = S.rim.width;
    ctx.globalAlpha = 0.25 + 0.75 * b + 0.15 * S.energy;
    ctx.drawImage(S.rim, -Rm / 2, -Rm / 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(tilt);
    // near half of the ring
    ctx.save(); ctx.beginPath(); ctx.rect(-RR, 0, RR * 2, RR); ctx.clip();
    ctx.scale(1, squash); ctx.globalAlpha = ringA; ctx.drawImage(S.ring, -RR, -RR);
    ctx.restore();
    ctx.restore();
  }

  // Static layers (gradient, base nebula, far stars, bloom nebula, vignette) re-composited only when bloom
  // moves noticeably: one full-screen blit per frame.
  function composite() {
    const W = S.w, H = S.h, b = S.bloom;
    if (!S.back || S.back.width !== Math.ceil(W) || S.back.height !== Math.ceil(H)) S.back = makeCanvas(W, H);
    const g = S.back.getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(S.bg, 0, 0);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = Math.min(1, 0.1 + 0.9 * smooth(b)); g.drawImage(S.nebB, 0, 0);
    if (b > 0.6) { g.globalAlpha = (b - 0.6) * 0.9; g.drawImage(S.nebB, 0, 0); }
    g.globalCompositeOperation = 'source-over';
    for (const s of S.mid) {
      if (s.on > 0.45 + 0.55 * b) continue;
      g.globalAlpha = s.a * (0.6 + 0.4 * b); g.fillStyle = s.c; g.fillRect(s.x, s.y, s.d, s.d);
    }
    g.globalAlpha = 1;
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,0.6)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    S.compB = b;
  }

  S.draw = (ctx, env) => {
    const W = S.w, H = S.h, b = S.bloom, t = S.t, dg = S.danger, e = S.energy;
    if (!S.bg) S.resize(W, H);
    if (S.compB === undefined || Math.abs(S.compB - b) > 0.02 || !S.back || S.back.width !== Math.ceil(W)) composite();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.drawImage(S.back, 0, 0);
    // galaxy, slowly turning
    ctx.globalCompositeOperation = 'lighter';
    const gp = S.galPos;
    ctx.save(); ctx.translate(gp.x, gp.y); ctx.rotate(-0.5); ctx.scale(1, 0.42); ctx.rotate(t * 0.012);
    ctx.globalAlpha = 0.35 + 0.65 * b; ctx.drawImage(S.gal, -gp.size / 2, -gp.size / 2);
    ctx.restore();
    // near stars drift past (parallax vs the baked far/mid layers); more light up with bloom
    const ox2 = t * 7;
    const sp = spike();
    for (const s of S.near) {
      if (s.on > 0.3 + 0.7 * b) continue;
      let x = (s.x - ox2) % W; if (x < 0) x += W;
      const tw = 0.6 + 0.4 * Math.sin(t * s.tws + s.ph);
      drawGlow(ctx, glowSprite(s.c, 32, 0.1), x, s.y, s.s * (0.8 + 0.25 * tw + 0.15 * e), s.a * (0.5 + 0.3 * b) * (0.5 + 0.5 * tw));
      if (s.spk) { ctx.globalAlpha = 0.45 * s.a; ctx.drawImage(sp, x - s.spk, s.y - s.spk, s.spk * 2, s.spk * 2); }
    }
    ctx.globalCompositeOperation = 'source-over';
    // planet
    drawPlanet(ctx, b);
    // constellations
    ctx.globalCompositeOperation = 'lighter';
    if (S.links.length) {
      ctx.globalAlpha = Math.min(1, 0.16 + 0.14 * b + 0.12 * (env.beatPulse || 0));
      ctx.strokeStyle = dg > 0.5 ? '#ff8a8a' : '#a9c4ff'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, c, born] of S.links) {
        if (a.dead || c.dead) continue;
        const k = Math.min(1, (S.t - born) / 0.8);
        ctx.moveTo(a.x, a.y); ctx.lineTo(lerp(a.x, c.x, k), lerp(a.y, c.y, k));
      }
      ctx.stroke();
    }
    // absorbed stars
    for (const s of S.stars) {
      const age = S.t - s.born, tw = 0.55 + 0.45 * Math.sin(S.t * s.sp * 2 + s.ph);
      const fl = Math.max(0, 1 - age / 1.8);
      const col = dg > 0.6 ? '#ff7070' : s.color;
      drawGlow(ctx, glowSprite(col, 48, 0.12), s.x, s.y, (5 + 4 * tw) * s.size + 22 * fl + 2 * e, 0.55 + 0.35 * tw + 0.4 * fl);
      const L = (7 + 6 * tw) * s.size + 30 * fl;
      ctx.globalAlpha = 0.35 + 0.35 * tw + 0.3 * fl; ctx.drawImage(sp, s.x - L, s.y - L, L * 2, L * 2);
    }
    // shooting stars
    for (const s of S.shooters) {
      const k = s.life / s.max, a = Math.sin(k * Math.PI);
      const len = 0.09, tx = s.x - s.vx * len, ty = s.y - s.vy * len;
      const g = ctx.createLinearGradient(tx, ty, s.x, s.y);
      g.addColorStop(0, 'rgba(160,200,255,0)'); g.addColorStop(1, `rgba(235,245,255,${0.85 * a})`);
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(s.x, s.y); ctx.stroke();
      drawGlow(ctx, glowSprite('#cfe4ff', 32, 0.15), s.x, s.y, 6, a);
    }
    // danger: the sky dims and a red giant swells from the corner
    ctx.globalCompositeOperation = 'source-over';
    if (dg > 0.01) {
      ctx.globalAlpha = dg * 0.35; ctx.fillStyle = '#05000a'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const G = S.giant, pr = G.r * (0.85 + 0.15 * dg) * (1 + 0.03 * e);
      drawGlow(ctx, glowSprite('#ff3a1e', 128, 0.12), G.x, G.y, pr, dg * 0.85);
      drawGlow(ctx, glowSprite('#ff7a3a', 128, 0.2), G.x, G.y, pr * 0.45, dg * 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };

  return S;
}
