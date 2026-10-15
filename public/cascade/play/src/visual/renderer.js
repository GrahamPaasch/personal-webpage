// Renderer: composes the stage scene (crossfading between stages), the floating playfield, pieces in
// the stage's block skin, particles that feed the scene, HUD, callouts and the stage name card.
import { SHAPES, PIECES } from '../game/pieces.js';
import { COLS, ROWS, HIDDEN, VISIBLE } from '../game/matrix.js';
import { Particles } from './particles.js';
import { makeCanvas, rgba, mix, clamp, ease, smooth, glowSprite, TAU } from './sceneKit.js';

export const FONT = '"Avenir Next", "Segoe UI", "Helvetica Neue", Ubuntu, "Noto Sans", system-ui, sans-serif';
const SPRITE_TYPES = [...PIECES, 'G'];

export class Renderer {
  constructor(canvas, { reduced = false, pinQuality = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.shakeOn = true;
    this.ghostOn = true;
    this.pinQuality = pinQuality;
    this.quality = 1;
    this.bgScale = 1;
    this.particles = new Particles();
    this.particles.onArrive = (x, y, color, seek) => {
      const sc = this.cur?.scene;
      if (sc) sc.absorb(seek.sx, seek.sy, color);
    };
    this.cur = null; // { stage, scene, buf, sprites }
    this.prev = null;
    this.fade = 1; this.fadeDur = 2.5;
    this.time = 0;
    this.kick = 0; this.beatPulse = 0; this.snare = 0; this.impact = 0; this.noteGlow = 0;
    this.shake = 0;
    this.clears = []; this.locks = []; this.trails = []; this.callouts = []; this.card = null;
    this.rowOffset = new Float32Array(ROWS);
    this.frameTimes = []; this.qTimer = 0; this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    this.layout();
  }

  // ---------------------------------------------------------------------------------------------
  layout() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    this.dpr = dpr; this.W = W; this.H = H;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    const cell = Math.max(10, Math.floor(Math.min((H * 0.86) / VISIBLE, (W * 0.94) / 25)));
    this.cell = cell;
    const fw = cell * COLS, fh = cell * VISIBLE;
    this.field = { x: Math.round(W / 2 - fw / 2), y: Math.round((H - fh) / 2 + cell * 0.25), w: fw, h: fh };
    for (const s of [this.cur, this.prev]) if (s) this.sizeScene(s);
    this.prepared = null;
    if (this.cur) this.cur.sprites = this.makeSprites(this.cur.stage);
    if (this.prev) this.prev.sprites = this.makeSprites(this.prev.stage);
  }
  sizeScene(s) {
    const bw = Math.max(1, Math.round(this.W * this.bgScale)), bh = Math.max(1, Math.round(this.H * this.bgScale));
    if (!s.buf || s.buf.width !== bw || s.buf.height !== bh) {
      s.buf = makeCanvas(bw, bh);
      s.bctx = s.buf.getContext('2d');
      s.scene.resize(bw, bh);
    }
  }
  makeSprites(stage) {
    const px = Math.max(4, Math.round(this.cell * this.dpr));
    const sprites = {};
    for (const t of SPRITE_TYPES) {
      sprites[t] = [];
      for (let v = 0; v < 4; v++) {
        const c = makeCanvas(px, px);
        const g = c.getContext('2d');
        try { stage.drawBlock(g, px, stage.theme.tints[t] ?? '#9aa4b8', t, v); } catch (e) { console.warn(e); }
        sprites[t].push(c);
      }
    }
    // ghost: soft outline + faint fill in the tint
    sprites.ghost = {};
    for (const t of PIECES) {
      const c = makeCanvas(px, px); const g = c.getContext('2d');
      const col = stage.theme.tints[t];
      const inset = px * 0.08, r = px * 0.16;
      g.fillStyle = rgba(col, 0.13);
      roundRect(g, inset, inset, px - inset * 2, px - inset * 2, r); g.fill();
      g.strokeStyle = rgba(mix(col, '#ffffff', 0.35), 0.75); g.lineWidth = Math.max(1, px * 0.06);
      roundRect(g, inset, inset, px - inset * 2, px - inset * 2, r); g.stroke();
      sprites.ghost[t] = c;
    }
    return sprites;
  }

  // Build a stage's scene + sprites ahead of time (called during play) so the switch doesn't hitch.
  prepare(stage, seed = 1) {
    if (this.prepared && this.prepared.stage === stage && this.prepared.seed === seed) return;
    const scene = stage.createScene({ w: this.W * this.bgScale, h: this.H * this.bgScale, seed, reduced: this.reduced });
    const s = { stage, seed, scene, buf: null, bctx: null, sprites: this.makeSprites(stage) };
    this.sizeScene(s);
    this.prepared = s;
  }
  setStage(stage, { fade = 2.5, seed = 1 } = {}) {
    this.prepare(stage, seed);
    const s = this.prepared;
    this.prepared = null;
    this.sizeScene(s);
    if (this.cur && fade > 0) { this.prev = this.cur; this.fade = 0; this.fadeDur = fade; }
    else { this.prev = null; this.fade = 1; }
    this.cur = s;
    this.rowOffset.fill(0);
  }
  get theme() { return this.cur.stage.theme; }

  // ---------------------------------------------------------------------------------------------
  // events
  cellCenter(x, y) { return [this.field.x + (x + 0.5) * this.cell, this.field.y + (y - HIDDEN + 0.5) * this.cell]; }

  onAudio(e) {
    switch (e.kind) {
      case 'kick': this.kick = 1; break;
      case 'beat': this.beatPulse = 1; break;
      case 'snare': this.snare = 1; break;
      case 'pnote': case 'lead': this.noteGlow = Math.min(1, this.noteGlow + 0.35); break;
      case 'impact': this.impact = 1; break;
      case 'clearHit': this.impact = 1; break;
    }
  }

  onGame(e, game) {
    const style = this.theme.particle;
    const fx = this.reduced ? 0.35 : 1;
    switch (e.type) {
      case 'move': case 'rotate': {
        if (!game.active) break;
        const cells = game.absCells();
        const [cx, cy] = cells[Math.floor(Math.random() * cells.length)];
        const [x, y] = this.cellCenter(cx, cy);
        this.particles.burst(x, y, (e.type === 'rotate' ? 5 : 2) * fx, style, { speed: e.type === 'rotate' ? 90 : 50, life: 0.6, scale: 0.7 });
        break;
      }
      case 'harddrop': {
        const cols = new Map();
        for (const [x, y] of e.abs) { const top = cols.get(x); cols.set(x, top === undefined ? y : Math.min(top, y)); }
        for (const [x, y] of cols) this.trails.push({ x, y0: e.fromY + (y - e.toY), y1: y, t: 0, color: this.theme.tints[e.piece] });
        for (const [x, y] of e.abs) {
          const [px, py] = this.cellCenter(x, y);
          this.particles.burst(px, py + this.cell * 0.4, 4 * fx, style, { speed: 160, angle: -Math.PI / 2, spread: 2.6, life: 0.7, scale: 0.8 });
        }
        if (this.shakeOn && !this.reduced) this.shake = Math.min(1, this.shake + 0.25 + e.cells * 0.025);
        break;
      }
      case 'lock':
        this.locks.push({ cells: e.abs, t: 0, piece: e.piece });
        break;
      case 'hold': {
        const [x, y] = this.holdCenter();
        this.particles.burst(x, y, 10 * fx, style, { speed: 70, life: 0.7 });
        break;
      }
      case 'clear': {
        if (!e.lines) { this.callout(e.tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN', null); break; }
        const rows = e.rows.map((y, i) => ({ y, cells: e.clearedCells[i] }));
        this.clears.push({ rows, t: 0, lines: e.lines });
        // row easing: surviving rows above cleared ones start higher and settle
        const sorted = [...e.rows].sort((a, b) => a - b);
        this.rowOffset.fill(0);
        for (let old = 0; old < ROWS; old++) {
          if (sorted.includes(old)) continue;
          const below = sorted.filter(c => c > old).length;
          const ny = old + below;
          if (ny < ROWS) this.rowOffset[ny] = below;
        }
        // particles: bursts + seekers that fly into the scene and become part of it
        const seekEvery = e.lines >= 4 ? 1 : 2;
        let k = 0;
        for (const r of rows) {
          for (let x = 0; x < COLS; x++) {
            const [px, py] = this.cellCenter(x, r.y);
            const col = this.theme.tints[r.cells[x]] ?? style.colors[0];
            this.particles.burst(px, py, (3 + e.lines) * fx, style, { speed: 220 + e.lines * 60, life: 0.9, colors: [col, ...style.colors] });
            if ((k++ % seekEvery) === 0) this.seekParticle(px, py, mix(col, '#ffffff', 0.3));
          }
        }
        const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'CASCADE'];
        let title = names[e.lines];
        if (e.tspin) title = `T-SPIN ${e.tspin === 'mini' ? 'MINI ' : ''}${['', 'SINGLE', 'DOUBLE', 'TRIPLE'][e.lines]}`;
        const subs = [];
        if (e.b2b) subs.push('BACK-TO-BACK');
        if (e.combo > 0) subs.push(`${e.combo} COMBO`);
        if (e.lines >= 2 || e.tspin || e.b2b || e.combo > 0) this.callout(title, subs.join('  ·  ') || null, e.lines >= 4 || e.tspin);
        if (e.perfect) this.callout('PERFECT CLEAR', null, true, 0.35);
        if (this.shakeOn && !this.reduced && e.lines >= 4) this.shake = 1;
        break;
      }
    }
  }
  seekParticle(x, y, color) {
    const sc = this.cur?.scene;
    if (!sc) return;
    const tgt = sc.absorbTarget(Math.random);
    const p = this.particles.spawn({
      x, y, vx: (Math.random() - 0.5) * 420, vy: -120 - Math.random() * 260, life: 1.6, size: 2.6 + Math.random() * 1.6,
      color, drag: 2.2, seek: { x: tgt.x / this.bgScale, y: tgt.y / this.bgScale, sx: tgt.x, sy: tgt.y }, seekAt: 0.35 + Math.random() * 0.3,
    });
    return p;
  }
  callout(text, sub, big = false, delay = 0) {
    this.callouts.push({ text, sub, t: -delay, big });
    if (this.callouts.length > 4) this.callouts.shift();
  }
  showCard(stage, index) { this.card = { stage, index, t: 0 }; }
  holdCenter() { const c = this.cell; return [this.field.x - c * 3.1, this.field.y + c * 1.9]; }

  // ---------------------------------------------------------------------------------------------
  adaptQuality(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 1) {
      const avg = this.fpsAcc / this.fpsN;
      this.fps = Math.round(1 / avg);
      if (!this.pinQuality) {
        if (avg > 0.020 && this.quality > 0.35) this.quality = Math.max(0.35, this.quality * 0.85);
        else if (avg < 0.0145 && this.quality < 1) this.quality = Math.min(1, this.quality + 0.03);
        const want = this.quality > 0.8 ? 1 : this.quality > 0.55 ? 0.75 : 0.5;
        if (want !== this.bgScale) {
          this.bgScale = want;
          for (const s of [this.cur, this.prev]) if (s) this.sizeScene(s);
        }
      }
      this.particles.mult = (this.reduced ? 0.35 : 1) * (0.4 + 0.6 * this.quality);
      this.fpsAcc = 0; this.fpsN = 0;
    }
  }

  // view = { game, showField, bloom, intensity, danger, beat, bar, paused }
  frame(dt, view) {
    this.time += dt;
    this.adaptQuality(dt);
    const ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr;
    const decay = r => Math.exp(-r * dt);
    this.kick *= decay(5); this.beatPulse *= decay(4); this.snare *= decay(7); this.impact *= decay(6); this.noteGlow *= decay(3);
    this.shake *= decay(9);
    for (let i = 0; i < ROWS; i++) this.rowOffset[i] *= decay(16);
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt / this.fadeDur); if (this.fade >= 1) this.prev = null; }

    const env = {
      time: this.time, beat: view.beat ?? 0, beatPulse: this.beatPulse, kick: this.kick, bar: view.bar ?? 0,
      intensity: view.intensity ?? 0, bloom: view.bloom ?? 0, danger: view.danger ?? 0, reduced: this.reduced,
      quality: this.quality, w: 0, h: 0, field: null,
    };
    const drawScene = (s, alpha) => {
      const sc = this.bgScale;
      env.w = s.buf.width; env.h = s.buf.height;
      env.field = { x: this.field.x * sc, y: this.field.y * sc, w: this.field.w * sc, h: this.field.h * sc };
      s.scene.update(view.paused ? 0 : dt, env);
      s.scene.draw(s.bctx, env);
      ctx.globalAlpha = alpha;
      ctx.drawImage(s.buf, 0, 0, W, H);
      ctx.globalAlpha = 1;
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const pr = this.prof ??= { scene: 0, field: 0, fx: 0, n: 0 };
    let t0 = performance.now();
    if (this.prev) drawScene(this.prev, 1);
    if (this.cur) drawScene(this.cur, this.prev ? smooth(this.fade) : 1);
    let t1 = performance.now(); pr.scene += t1 - t0; pr.n++;
    if (!this.cur) return;
    const T = this.theme;

    // light swell on the beat + vignette
    ctx.globalCompositeOperation = 'lighter';
    const swell = (this.kick * 0.09 + this.noteGlow * 0.04 + this.impact * 0.05) * (this.reduced ? 0.4 : 1);
    if (swell > 0.005) {
      const g = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.7);
      g.addColorStop(0, rgba(T.accent, swell)); g.addColorStop(1, rgba(T.accent, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.45 + (view.danger ?? 0) * 0.2})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    if (view.showField && view.game) {
      const sx = this.shake > 0.01 ? (Math.random() - 0.5) * this.shake * 6 : 0;
      const sy = this.shake > 0.01 ? (Math.random() - 0.3) * this.shake * 8 : 0;
      ctx.save(); ctx.translate(sx, sy);
      this.drawField(ctx, view, dt);
      ctx.restore();
      this.drawHud(ctx, view);
    }
    t0 = performance.now(); pr.field += t0 - t1;
    this.particles.update(view.paused ? 0 : dt);
    this.particles.draw(ctx);
    if (view.showField) this.drawCallouts(ctx, dt);
    if (!view.hideCard) this.drawCard(ctx, dt);
    pr.fx += performance.now() - t0;
    if (view.showFps) { ctx.font = `12px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(`${this.fps} fps  q${this.quality.toFixed(2)}  bg${this.bgScale}  p${this.particles.count}  c${this.cur.scene.creatures ?? 0}`, 10, H - 10); }
  }

  // ---------------------------------------------------------------------------------------------
  drawField(ctx, view, dt) {
    const { x: fx, y: fy, w: fw, h: fh } = this.field;
    const c = this.cell, T = this.theme, g = view.game;
    const danger = view.danger ?? 0;
    // panel + glow border pulsing with the kick
    ctx.save();
    ctx.shadowColor = rgba(danger > 0.2 ? mix(T.accent, '#ff3040', danger) : T.accent, 0.55 + this.kick * 0.35);
    ctx.shadowBlur = (18 + this.kick * 26) * (this.reduced ? 0.5 : 1);
    ctx.fillStyle = T.panel.fill;
    roundRect(ctx, fx - 4, fy - 4, fw + 8, fh + 8, 10); ctx.fill();
    ctx.restore();
    // inner gradient for depth
    const ig = ctx.createLinearGradient(0, fy, 0, fy + fh);
    ig.addColorStop(0, 'rgba(255,255,255,0.025)'); ig.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = ig; ctx.fillRect(fx, fy, fw, fh);
    if (danger > 0) {
      const dg = ctx.createLinearGradient(0, fy, 0, fy + fh * 0.5);
      dg.addColorStop(0, `rgba(255,40,60,${0.22 * danger * (0.75 + 0.25 * this.beatPulse)})`); dg.addColorStop(1, 'rgba(255,40,60,0)');
      ctx.fillStyle = dg; ctx.fillRect(fx, fy, fw, fh * 0.5);
    }
    // grid
    ctx.strokeStyle = T.panel.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(fx + x * c + 0.5, fy); ctx.lineTo(fx + x * c + 0.5, fy + fh); }
    for (let y = 1; y < VISIBLE; y++) { ctx.moveTo(fx, fy + y * c + 0.5); ctx.lineTo(fx + fw, fy + y * c + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = rgba(T.accent, 0.35 + this.kick * 0.4); ctx.lineWidth = 1.5;
    roundRect(ctx, fx - 4, fy - 4, fw + 8, fh + 8, 10); ctx.stroke();

    ctx.save();
    ctx.beginPath(); ctx.rect(fx, fy - c * 2, fw, fh + c * 2); ctx.clip();
    const sprites = this.cur.sprites, prevSprites = this.prev && this.fade < 1 ? this.prev.sprites : null;
    const blend = smooth(this.fade);
    const drawCell = (type, x, y, alpha = 1, variant = 0) => {
      const px = fx + x * c, py = fy + (y - HIDDEN) * c;
      if (prevSprites) {
        ctx.globalAlpha = alpha * (1 - blend); ctx.drawImage(prevSprites[type][variant], px, py, c, c);
        ctx.globalAlpha = alpha * blend; ctx.drawImage(sprites[type][variant], px, py, c, c);
      } else { ctx.globalAlpha = alpha; ctx.drawImage(sprites[type][variant], px, py, c, c); }
    };
    // stack
    const m = g.matrix.cells;
    for (let y = 0; y < ROWS; y++) {
      const off = this.rowOffset[y];
      for (let x = 0; x < COLS; x++) {
        const v = m[y][x];
        if (v) drawCell(v, x, y - off, y < HIDDEN ? 0.5 : 1, (x * 7 + y * 3) & 3);
      }
    }
    // active piece: drop guide, ghost, piece
    if (g.active && g.state === 'playing') {
      const p = g.active;
      const cells = g.absCells();
      const gy = g.ghostY();
      const col = T.tints[p.type];
      const minX = Math.min(...cells.map(q => q[0])), maxX = Math.max(...cells.map(q => q[0]));
      const topY = Math.min(...cells.map(q => q[1]));
      // drop guide: a soft beam from the piece down to where it will land
      const botY = Math.max(...cells.map(q => q[1])) + 1;
      const gTop = Math.min(...g.cells().map(q => q[1])) + gy;
      if (gTop > botY) {
        const y0 = fy + (botY - HIDDEN) * c, y1 = fy + (gTop - HIDDEN) * c;
        const guide = ctx.createLinearGradient(0, y0, 0, y1);
        guide.addColorStop(0, rgba(col, 0.1 + this.noteGlow * 0.05)); guide.addColorStop(1, rgba(col, 0.03));
        ctx.fillStyle = guide;
        ctx.fillRect(fx + minX * c + 1, y0, (maxX - minX + 1) * c - 2, y1 - y0);
      }
      if (this.ghostOn && gy !== p.y) {
        for (const [cx, cy] of g.cells()) {
          const px = fx + (p.x + cx) * c, py = fy + (gy + cy - HIDDEN) * c;
          ctx.globalAlpha = 0.85; ctx.drawImage(sprites.ghost[p.type], px, py, c, c);
        }
      }
      // piece with soft glow underlay
      ctx.globalCompositeOperation = 'lighter';
      const gs = glowSprite(col, 64);
      for (const [x, y] of cells) {
        const [px, py] = this.cellCenter(x, y);
        ctx.globalAlpha = 0.18 + this.noteGlow * 0.12;
        ctx.drawImage(gs, px - c * 1.2, py - c * 1.2, c * 2.4, c * 2.4);
      }
      ctx.globalCompositeOperation = 'source-over';
      const lockGlow = g.isGrounded() ? g.lockTimer / 500 : 0;
      for (const [x, y] of cells) drawCell(p.type, x, y, 1, 0);
      if (lockGlow > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = lockGlow * 0.35;
        ctx.fillStyle = '#ffffff';
        for (const [x, y] of cells) ctx.fillRect(fx + x * c, fy + (y - HIDDEN) * c, c, c);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
    // hard drop trails
    ctx.globalCompositeOperation = 'lighter';
    this.trails = this.trails.filter(t => (t.t += dt) < 0.22);
    for (const t of this.trails) {
      const a = (1 - t.t / 0.22) * 0.7;
      const y0 = fy + (t.y0 - HIDDEN) * c, y1 = fy + (t.y1 - HIDDEN) * c;
      const tg = ctx.createLinearGradient(0, y0, 0, y1);
      tg.addColorStop(0, rgba(t.color, 0)); tg.addColorStop(1, rgba(t.color, 0.45 * a));
      ctx.fillStyle = tg;
      ctx.fillRect(fx + t.x * c + c * 0.2, y0, c * 0.6, y1 - y0);
    }
    // lock flashes
    this.locks = this.locks.filter(l => (l.t += dt) < 0.18);
    for (const l of this.locks) {
      ctx.globalAlpha = (1 - l.t / 0.18) * 0.55;
      ctx.fillStyle = '#ffffff';
      for (const [x, y] of l.cells) ctx.fillRect(fx + x * c, fy + (y - HIDDEN) * c, c, c);
    }
    // line clear: rows flare into light and collapse
    this.clears = this.clears.filter(cl => (cl.t += dt) < 0.38);
    for (const cl of this.clears) {
      const k = cl.t / 0.38;
      for (const r of cl.rows) {
        const py = fy + (r.y - HIDDEN) * c;
        const sh = 1 - smooth(Math.min(1, k * 1.4));
        ctx.globalCompositeOperation = 'source-over';
        for (let x = 0; x < COLS; x++) {
          if (!r.cells[x]) continue;
          ctx.globalAlpha = sh;
          ctx.drawImage(sprites[r.cells[x]][0], fx + x * c, py + c * (1 - sh) / 2, c, c * sh);
        }
        ctx.globalCompositeOperation = 'lighter';
        const beam = (1 - k) * (cl.lines >= 4 ? 1 : 0.75);
        const bw = fw * (1 + k * (cl.lines >= 4 ? 2.4 : 1.2));
        const bg = ctx.createLinearGradient(fx + fw / 2 - bw / 2, 0, fx + fw / 2 + bw / 2, 0);
        bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(0.5, `rgba(255,255,255,${beam})`); bg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalAlpha = 1; ctx.fillStyle = bg;
        ctx.fillRect(fx + fw / 2 - bw / 2, py + c * 0.5 - c * 0.5 * (1 - k * 0.6), bw, c * (1 - k * 0.6));
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  drawMini(ctx, type, cx, cy, size, alpha = 1) {
    const cells = SHAPES[type][0];
    const xs = cells.map(q => q[0]), ys = cells.map(q => q[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = cx - (w * size) / 2 - Math.min(...xs) * size, oy = cy - (h * size) / 2 - Math.min(...ys) * size;
    ctx.globalAlpha = alpha;
    for (const [x, y] of cells) ctx.drawImage(this.cur.sprites[type][0], ox + x * size, oy + y * size, size, size);
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, view) {
    const g = view.game, T = this.theme, c = this.cell;
    const { x: fx, y: fy, w: fw, h: fh } = this.field;
    const text = T.text ?? '#ffffff';
    const label = (s, x, y, align = 'left') => {
      ctx.font = `600 ${Math.round(c * 0.36)}px ${FONT}`; ctx.textAlign = align;
      ctx.fillStyle = rgba(T.accent, 0.85);
      ctx.letterSpacing = `${Math.round(c * 0.08)}px`;
      ctx.fillText(s, x, y);
      ctx.letterSpacing = '0px';
    };
    const panel = (x, y, w, h) => {
      ctx.fillStyle = T.panel.fill; roundRect(ctx, x, y, w, h, 8); ctx.fill();
      ctx.strokeStyle = rgba(T.accent, 0.22); ctx.lineWidth = 1; roundRect(ctx, x, y, w, h, 8); ctx.stroke();
    };
    // HOLD
    const hx = fx - c * 5.4, hw = c * 4.6;
    panel(hx, fy, hw, c * 3.4);
    label('HOLD', hx + c * 0.4, fy + c * 0.62);
    if (g.hold) this.drawMini(ctx, g.hold, hx + hw / 2, fy + c * 2, c * 0.78, g.holdUsed ? 0.35 : 1);
    // NEXT
    const nx = fx + fw + c * 0.8, nw = c * 4.2;
    panel(nx, fy, nw, c * 13.6);
    label('NEXT', nx + c * 0.4, fy + c * 0.62);
    g.next.forEach((t, i) => {
      const size = i === 0 ? c * 0.8 : c * 0.6;
      const cy = i === 0 ? fy + c * 2.2 : fy + c * (4.6 + (i - 1) * 2.35);
      this.drawMini(ctx, t, nx + nw / 2, cy, size, i === 0 ? 1 : 0.8);
    });
    // stats (on their own translucent panel so they read over any scene)
    panel(hx, fy + c * 3.9, hw, c * 9.7);
    const sy = fy + c * 4.7;
    const sxr = hx + hw - c * 0.45;
    const stat = (name, value, y, big = false) => {
      label(name, sxr, y, 'right');
      ctx.font = `${big ? 300 : 400} ${Math.round(c * (big ? 0.95 : 0.7))}px ${FONT}`;
      ctx.fillStyle = text; ctx.textAlign = 'right';
      ctx.shadowColor = rgba(T.accent, 0.6); ctx.shadowBlur = 10;
      ctx.fillText(value, sxr, y + c * (big ? 1.05 : 0.85));
      ctx.shadowBlur = 0;
    };
    stat('SCORE', g.score.toLocaleString('en-US'), sy, true);
    stat('LEVEL', String(g.level), sy + c * 2.3);
    const j = g.journey;
    const tgt = j.target === Infinity ? '∞' : j.target;
    stat('LINES', j.target === Infinity ? String(g.lines) : `${Math.min(j.stageLines, j.target)} / ${tgt}`, sy + c * 4.1);
    const secs = Math.floor(g.time / 1000);
    stat('TIME', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, sy + c * 5.9);
    if (g.combo > 0) stat('COMBO', `×${g.combo}`, sy + c * 7.6);
    // stage name + numeral above the field, progress bar below
    ctx.textAlign = 'left';
    ctx.font = `300 ${Math.round(c * 0.5)}px ${FONT}`;
    ctx.fillStyle = rgba(text, 0.9);
    ctx.letterSpacing = `${Math.round(c * 0.12)}px`;
    ctx.fillText(`${this.cur.stage.numeral ?? ''}  ${this.cur.stage.name.toUpperCase()}`, hx + 2, fy - c * 0.45);
    ctx.letterSpacing = '0px';
    const prog = clamp(j.progress);
    const by = fy + fh + c * 0.38;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(ctx, fx, by, fw, 4, 2); ctx.fill();
    ctx.save(); ctx.shadowColor = T.accent; ctx.shadowBlur = 12;
    ctx.fillStyle = T.accent; roundRect(ctx, fx, by, Math.max(4, fw * prog), 4, 2); ctx.fill(); ctx.restore();
  }

  drawCallouts(ctx, dt) {
    const T = this.theme, c = this.cell;
    const cx = this.field.x + this.field.w / 2;
    this.callouts = this.callouts.filter(o => (o.t += dt) < 1.9);
    let slot = 0;
    for (const o of this.callouts) {
      if (o.t < 0) continue;
      const k = o.t / 1.9;
      const a = o.t < 0.12 ? o.t / 0.12 : 1 - smooth(clamp((k - 0.55) / 0.45));
      const y = this.field.y + this.field.h * 0.62 - k * c * 1.6 + slot * c * 1.8;
      const scale = 1 + (o.big ? 0.25 : 0.12) * Math.exp(-o.t * 9);
      ctx.save();
      ctx.translate(cx, y); ctx.scale(scale, scale);
      ctx.globalAlpha = a; ctx.textAlign = 'center';
      ctx.font = `${o.big ? 600 : 500} ${Math.round(c * (o.big ? 1.15 : 0.85))}px ${FONT}`;
      ctx.letterSpacing = `${Math.round(c * 0.16)}px`;
      ctx.shadowColor = T.accent; ctx.shadowBlur = 24;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(o.text, 0, 0);
      ctx.shadowBlur = 12; ctx.fillStyle = mix(T.accent, '#ffffff', 0.55);
      if (o.sub) { ctx.font = `500 ${Math.round(c * 0.42)}px ${FONT}`; ctx.letterSpacing = `${Math.round(c * 0.1)}px`; ctx.fillText(o.sub, 0, c * 0.8); }
      ctx.restore();
      slot++;
    }
    ctx.letterSpacing = '0px';
  }

  drawCard(ctx, dt) {
    const cd = this.card;
    if (!cd) return;
    cd.t += dt;
    const t = cd.t;
    if (t > 4.6) { this.card = null; return; }
    const a = t < 1.5 ? smooth(t / 1.5) : t < 3.1 ? 1 : 1 - smooth((t - 3.1) / 1.5);
    const T = cd.stage.theme, W = this.W, H = this.H, c = this.cell;
    const y = this.field.y + this.field.h * 0.3;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    const band = ctx.createLinearGradient(0, y - c * 3, 0, y + c * 3);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(0.5, 'rgba(0,0,0,0.6)'); band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band; ctx.fillRect(0, y - c * 3, W, c * 6);
    ctx.globalAlpha = a; ctx.textAlign = 'center';
    ctx.shadowColor = T.accent; ctx.shadowBlur = 30;
    ctx.fillStyle = mix(T.accent, '#ffffff', 0.4);
    ctx.font = `500 ${Math.round(c * 0.5)}px ${FONT}`; ctx.letterSpacing = `${Math.round(c * 0.5)}px`;
    ctx.fillText(`STAGE ${cd.stage.numeral}`, W / 2, y - c * 1.5);
    ctx.fillStyle = '#ffffff';
    // name sized to sit inside the playfield column (long names shrink rather than spill over the HUD)
    const name = cd.stage.name.toUpperCase();
    let fs = c * 2.1;
    ctx.font = `200 ${Math.round(fs)}px ${FONT}`; ctx.letterSpacing = `${Math.round(fs * 0.17)}px`;
    const wNow = ctx.measureText(name).width;
    if (wNow > this.field.w * 1.02) fs *= (this.field.w * 1.02) / wNow;
    ctx.font = `200 ${Math.round(fs)}px ${FONT}`; ctx.letterSpacing = `${Math.round(fs * (0.17 + 0.07 * smooth(clamp(t / 4.6))))}px`;
    ctx.fillText(name, W / 2, y + c * 0.6);
    ctx.shadowBlur = 14; ctx.fillStyle = rgba('#ffffff', 0.85);
    ctx.font = `italic 300 ${Math.round(c * 0.55)}px ${FONT}`; ctx.letterSpacing = `${Math.round(c * 0.08)}px`;
    ctx.fillText(cd.stage.subtitle, W / 2, y + c * 1.7);
    ctx.restore();
    ctx.letterSpacing = '0px';
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
