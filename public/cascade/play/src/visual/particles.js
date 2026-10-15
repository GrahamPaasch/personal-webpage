// Pooled screen-space particles. Two behaviours: free (burst with drag + gravity, fades out) and seek
// (after a short burst, steer into the scene and call onArrive(x, y, color) — line clears feeding the
// background). No per-frame allocation: a fixed array of particle records is recycled.
import { glowSprite, TAU } from './sceneKit.js';

const MAX = 1400;

export class Particles {
  constructor() {
    this.pool = Array.from({ length: MAX }, () => ({ alive: false }));
    this.count = 0;
    this.mult = 1; // quality multiplier (adaptive)
    this.onArrive = null;
  }
  spawn(o) {
    for (let k = 0; k < MAX; k++) {
      const i = (this.cursor = ((this.cursor ?? 0) + 1) % MAX);
      const p = this.pool[i];
      if (!p.alive || k === MAX - 1) {
        p.alive = true;
        p.x = o.x; p.y = o.y; p.vx = o.vx ?? 0; p.vy = o.vy ?? 0;
        p.life = 0; p.max = o.life ?? 1; p.size = o.size ?? 3; p.color = o.color ?? '#ffffff';
        p.drag = o.drag ?? 1.5; p.gravity = o.gravity ?? 0; p.shape = o.shape ?? 'dot';
        p.seek = o.seek ?? null; p.seekAt = o.seekAt ?? 0.5; p.rot = Math.random() * TAU; p.spin = (Math.random() - 0.5) * 6;
        p.glow = o.glow ?? true; p.alpha = o.alpha ?? 1; p.trail = o.trail ?? 0;
        return p;
      }
    }
    return null;
  }
  // Burst of n particles in a style at (x, y).
  burst(x, y, n, style, opts = {}) {
    n = Math.max(1, Math.round(n * this.mult));
    const colors = opts.colors ?? style.colors;
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread ?? 1) : Math.random() * TAU;
      const sp = (opts.speed ?? 120) * (0.3 + Math.random() * 0.9);
      const [s0, s1] = style.size ?? [2, 5];
      this.spawn({
        x: x + (Math.random() - 0.5) * (opts.jitter ?? 6), y: y + (Math.random() - 0.5) * (opts.jitter ?? 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: (opts.life ?? 0.9) * (0.6 + Math.random() * 0.6),
        size: (s0 + Math.random() * (s1 - s0)) * (opts.scale ?? 1), color: colors[Math.floor(Math.random() * colors.length)],
        drag: style.drag ?? 1.6, gravity: opts.gravity ?? style.gravity ?? 0, shape: style.shape, glow: style.glow !== false,
        alpha: opts.alpha ?? 1,
      });
    }
  }
  update(dt) {
    let count = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life += dt;
      if (p.seek && p.life > p.seekAt) {
        const dx = p.seek.x - p.x, dy = p.seek.y - p.y;
        const d = Math.hypot(dx, dy);
        const k = Math.min(1, (p.life - p.seekAt) * 1.6);
        const want = 320 + 900 * k;
        p.vx += ((dx / (d + 1e-3)) * want - p.vx) * Math.min(1, dt * (2 + 6 * k));
        p.vy += ((dy / (d + 1e-3)) * want - p.vy) * Math.min(1, dt * (2 + 6 * k));
        if (d < 14 || p.life > p.max + 4) {
          p.alive = false;
          if (this.onArrive) this.onArrive(p.seek.x, p.seek.y, p.color, p.seek);
          continue;
        }
      } else {
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vy = p.vy * dr + p.gravity * dt;
        if (p.life >= p.max) { p.alive = false; continue; }
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      count++;
    }
    this.count = count;
  }
  draw(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.alive) continue;
      const fade = p.seek ? Math.min(1, 0.4 + p.life * 2) : 1 - p.life / p.max;
      const a = Math.max(0, fade) * p.alpha;
      if (a <= 0.01) continue;
      const r = p.size * (p.seek ? 1.2 : 0.6 + 0.4 * fade);
      if (p.glow) {
        const g = glowSprite(p.color, 48);
        ctx.globalAlpha = a * 0.75;
        ctx.drawImage(g, p.x - r * 3, p.y - r * 3, r * 6, r * 6);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.seek) {
        // streak along velocity
        const sp = Math.hypot(p.vx, p.vy) + 1e-3;
        const l = Math.min(30, sp * 0.03);
        ctx.strokeStyle = p.color; ctx.lineWidth = r * 0.9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * l, p.y - p.vy / sp * l); ctx.stroke();
        continue;
      }
      switch (p.shape) {
        case 'square': ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); break;
        case 'leaf': case 'flake': case 'sand': case 'spark': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          if (p.shape === 'leaf') { ctx.beginPath(); ctx.ellipse(0, 0, r * 1.6, r * 0.7, 0, 0, TAU); ctx.fill(); }
          else if (p.shape === 'flake') { ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.8, r * 0.35); ctx.beginPath(); for (let k = 0; k < 3; k++) { const an = k * Math.PI / 3; ctx.moveTo(-Math.cos(an) * r * 1.4, -Math.sin(an) * r * 1.4); ctx.lineTo(Math.cos(an) * r * 1.4, Math.sin(an) * r * 1.4); } ctx.stroke(); }
          else if (p.shape === 'spark') { ctx.fillRect(-r * 2, -r * 0.25, r * 4, r * 0.5); ctx.fillRect(-r * 0.25, -r * 2, r * 0.5, r * 4); }
          else ctx.fillRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
          ctx.restore();
          break;
        }
        case 'bubble': ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.8, r * 0.3); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke(); break;
        case 'star': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath(); for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.4 : r * 1.5; const an = k * Math.PI / 4; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill();
          ctx.restore(); break;
        }
        default: ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  clear() { for (const p of this.pool) p.alive = false; }
}
