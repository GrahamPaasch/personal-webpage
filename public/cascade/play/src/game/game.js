// The rules engine: a pure, DOM-free simulation driven by update(dtMs) and press/release(action).
import { SHAPES, SPAWN_X, SPAWN_Y, getKicks } from './pieces.js';
import { Matrix, COLS, ROWS, HIDDEN } from './matrix.js';
import { Bag } from './bag.js';
import { scoreLock, gravitySeconds } from './scoring.js';
import { Journey } from './journey.js';

export const LOCK_DELAY = 500;
export const MAX_RESETS = 15;
export const NEXT_COUNT = 5;

export class Game {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 1;
    this.das = opts.das ?? 133;
    this.arr = opts.arr ?? 33;
    this.sdf = opts.sdf ?? 20;
    this.journey = opts.journey ?? new Journey([{ target: Infinity, levels: [opts.level ?? 1, opts.level ?? 1] }]);
    this.listeners = [];
    if (opts.onEvent) this.listeners.push(opts.onEvent);
    this.matrix = opts.matrix ?? new Matrix();
    this.bag = new Bag(this.seed);
    this.hold = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.combo = -1;
    this.b2b = false;
    this.state = 'playing'; // 'playing' | 'over' | 'complete'
    this.overReason = null;
    this.time = 0;
    this.stats = { pieces: 0, maxCombo: 0, tspins: 0, quads: 0, perfects: 0, b2bMax: 0, b2bChain: 0 };
    this.held = { left: false, right: false, soft: false };
    this.dasDir = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = 0;
    this.lastAction = null;
    this.lastKick = 0;
    this.active = null;
    if (opts.noSpawn !== true) this.spawn(opts.first ?? this.bag.next());
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { const e = { type, ...data }; for (const l of this.listeners) l(e, this); }

  get level() { return this.journey.level; }
  get next() { return this.bag.peek(NEXT_COUNT); }

  cells(p = this.active) { return SHAPES[p.type][p.rot]; }
  fits(type, rot, x, y) { return this.matrix.fits(SHAPES[type][rot], x, y); }
  isGrounded(p = this.active) { return !this.fits(p.type, p.rot, p.x, p.y + 1); }
  ghostY(p = this.active) {
    let y = p.y;
    while (this.fits(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }
  // Absolute cells of the active piece (optionally at another y).
  absCells(p = this.active, y = p.y) { return this.cells(p).map(([cx, cy]) => [p.x + cx, y + cy]); }

  spawn(type) {
    const p = { type, rot: 0, x: SPAWN_X[type], y: SPAWN_Y[type] };
    this.active = p;
    if (!this.fits(type, 0, p.x, p.y)) { this.gameOver('blockout'); return false; }
    if (this.fits(type, 0, p.x, p.y + 1)) p.y++;
    this.lowestY = p.y;
    this.lockResets = 0;
    this.lockTimer = 0;
    this.gravityAcc = 0;
    this.lastAction = null;
    this.lastKick = 0;
    this.wasGrounded = false;
    this.emit('spawn', { piece: type });
    // IRS-free, but honour a fully charged DAS with ARR 0 so fast players keep flow.
    if (this.dasDir && this.dasTimer >= this.das && this.arr === 0) this.shiftToWall(this.dasDir);
    return true;
  }

  gameOver(reason) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.overReason = reason;
    this.emit('gameover', { reason });
  }

  // ---- input ----
  press(action) {
    if (this.state !== 'playing' || !this.active) return;
    switch (action) {
      case 'left': case 'right': {
        const dir = action === 'left' ? -1 : 1;
        this.held[action] = true;
        this.dasDir = dir; this.dasTimer = 0; this.arrTimer = 0;
        this.tryMove(dir);
        break;
      }
      case 'soft':
        this.held.soft = true;
        if (this.tryDown(true)) this.gravityAcc = 0;
        break;
      case 'hard': this.hardDrop(); break;
      case 'cw': this.tryRotate(1); break;
      case 'ccw': this.tryRotate(-1); break;
      case 'r180': this.tryRotate(2); break;
      case 'hold': this.doHold(); break;
    }
  }
  release(action) {
    if (action === 'left' || action === 'right') {
      this.held[action] = false;
      const dir = action === 'left' ? -1 : 1;
      if (this.dasDir === dir) {
        const other = action === 'left' ? 'right' : 'left';
        if (this.held[other]) { this.dasDir = -dir; this.dasTimer = 0; this.arrTimer = 0; }
        else this.dasDir = 0;
      }
    } else if (action === 'soft') this.held.soft = false;
  }
  releaseAll() { this.held = { left: false, right: false, soft: false }; this.dasDir = 0; }

  // ---- movement ----
  tryMove(dir, auto = false) {
    const p = this.active;
    if (!this.fits(p.type, p.rot, p.x + dir, p.y)) { if (!auto) this.emit('bump', { dir }); return false; }
    p.x += dir;
    this.lastAction = 'move';
    this.emit('move', { dir, x: p.x, auto });
    this.afterManip();
    return true;
  }
  shiftToWall(dir) {
    let moved = false;
    while (this.active && this.state === 'playing' && this.fits(this.active.type, this.active.rot, this.active.x + dir, this.active.y)) {
      this.active.x += dir; moved = true;
    }
    if (moved) { this.lastAction = 'move'; this.emit('move', { dir, x: this.active.x, auto: true }); this.afterManip(); }
  }
  tryDown(soft) {
    const p = this.active;
    if (!this.fits(p.type, p.rot, p.x, p.y + 1)) return false;
    p.y++;
    this.lastAction = 'down';
    if (soft) { this.score += 1; this.emit('softdrop', { y: p.y }); }
    if (p.y > this.lowestY) { this.lowestY = p.y; this.lockResets = 0; this.lockTimer = 0; }
    return true;
  }
  tryRotate(d) {
    const p = this.active;
    const to = (p.rot + d + 4) % 4;
    const kicks = getKicks(p.type, p.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.fits(p.type, to, p.x + kx, p.y + ky)) {
        p.x += kx; p.y += ky; p.rot = to;
        this.lastAction = 'rotate';
        this.lastKick = i;
        this.emit('rotate', { dir: d, rot: to, kick: i, tspinCandidate: p.type === 'T' && this.detectTSpin() !== null });
        this.afterManip();
        return true;
      }
    }
    this.emit('rotatefail', { dir: d });
    return false;
  }
  afterManip() {
    const p = this.active;
    if (p.y > this.lowestY) { this.lowestY = p.y; this.lockResets = 0; }
    if (this.isGrounded()) {
      if (this.lockResets < MAX_RESETS) { this.lockTimer = 0; this.lockResets++; }
      else this.lockPiece();
    }
  }
  hardDrop() {
    const p = this.active;
    const startY = p.y;
    const gy = this.ghostY();
    const dist = gy - startY;
    if (dist > 0) { p.y = gy; this.lastAction = 'down'; }
    this.score += 2 * dist;
    this.emit('harddrop', { cells: dist, fromY: startY, toY: gy, piece: p.type, x: p.x, rot: p.rot, abs: this.absCells() });
    this.lockPiece();
  }
  doHold() {
    if (this.holdUsed) { this.emit('holdfail'); return; }
    const cur = this.active.type;
    this.holdUsed = true;
    const swap = this.hold;
    this.hold = cur;
    this.emit('hold', { piece: cur });
    this.spawn(swap ?? this.bag.next());
  }

  // ---- T-spin (3-corner rule) ----
  detectTSpin() {
    const p = this.active;
    if (p.type !== 'T' || this.lastAction !== 'rotate') return null;
    const corners = [[0, 0], [2, 0], [2, 2], [0, 2]]; // TL TR BR BL
    const occ = corners.map(([cx, cy]) => this.matrix.occupied(p.x + cx, p.y + cy));
    const count = occ.filter(Boolean).length;
    if (count < 3) return null;
    const front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.rot];
    const frontCount = (occ[front[0]] ? 1 : 0) + (occ[front[1]] ? 1 : 0);
    if (frontCount === 2 || this.lastKick === 4) return 'full';
    return 'mini';
  }

  lockPiece() {
    const p = this.active;
    const tspin = this.detectTSpin();
    const abs = this.absCells();
    this.matrix.place(this.cells(), p.x, p.y, p.type);
    this.stats.pieces++;
    this.emit('lock', { piece: p.type, abs, tspin, x: p.x, y: p.y, rot: p.rot });
    if (abs.every(([, y]) => y < HIDDEN)) { this.active = null; this.gameOver('lockout'); return; }

    const rows = this.matrix.fullRows();
    const clearedCells = rows.map(y => this.matrix.cells[y].slice());
    const lines = rows.length;
    if (lines > 0) this.matrix.clearRows(rows);
    const perfect = lines > 0 && this.matrix.isEmpty();
    if (lines > 0) this.combo++; else this.combo = -1;
    const level = this.level;
    const res = scoreLock({ lines, tspin, level, b2bActive: this.b2b, combo: this.combo, perfect });
    this.score += res.points;
    if (lines > 0) {
      if (res.difficult) { this.b2b = true; } else { this.b2b = false; }
      this.stats.b2bChain = res.difficult ? (res.b2b ? this.stats.b2bChain + 1 : 0) : 0;
      this.stats.b2bMax = Math.max(this.stats.b2bMax, this.stats.b2bChain);
    }
    if (tspin) this.stats.tspins++;
    if (lines === 4) this.stats.quads++;
    if (perfect) this.stats.perfects++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);

    if (lines > 0 || tspin) {
      this.emit('clear', {
        lines, rows, clearedCells, tspin, b2b: res.b2b, combo: this.combo, perfect,
        points: res.points, level, piece: p.type,
      });
    }
    if (lines > 0) {
      this.lines += lines;
      const prevLevel = this.level;
      const j = this.journey.addLines(lines);
      if (this.level !== prevLevel) this.emit('levelup', { level: this.level });
      if (j.advanced) this.emit('stage', { from: j.from, to: j.to });
      if (j.finished) {
        this.active = null;
        this.state = 'complete';
        this.emit('complete', {});
        return;
      }
    }
    this.holdUsed = false;
    this.active = null;
    this.spawn(this.bag.next());
  }

  // Resume after the journey finale in endless Space.
  continueInSpace() {
    this.journey.continueInSpace();
    this.state = 'playing';
    this.spawn(this.bag.next());
  }

  // ---- time ----
  update(dt) {
    if (this.state !== 'playing' || !this.active) return;
    this.time += dt;
    // Horizontal auto-repeat.
    if (this.dasDir !== 0) {
      const before = this.dasTimer;
      this.dasTimer += dt;
      if (this.dasTimer >= this.das) {
        if (this.arr === 0) { this.shiftToWall(this.dasDir); }
        else {
          let guard = 0;
          if (before < this.das) {
            // DAS just charged: shift once now, then every ARR.
            this.arrTimer = this.dasTimer - this.das;
            if (!this.tryMove(this.dasDir, true)) this.arrTimer = 0;
          } else this.arrTimer += dt;
          while (this.arrTimer >= this.arr && guard++ < COLS) {
            this.arrTimer -= this.arr;
            if (!this.active || this.state !== 'playing' || !this.tryMove(this.dasDir, true)) { this.arrTimer = 0; break; }
          }
        }
      }
      if (!this.active || this.state !== 'playing') return;
    }
    // Gravity / soft drop.
    let interval = gravitySeconds(this.level) * 1000;
    if (this.held.soft) interval = Math.min(interval / this.sdf, 50);
    this.gravityAcc += dt;
    let guard = 0;
    while (this.gravityAcc >= interval && guard++ < ROWS + 2) {
      this.gravityAcc -= interval;
      if (!this.tryDown(this.held.soft)) { this.gravityAcc = 0; break; }
    }
    if (!this.active) return;
    // Lock delay.
    if (this.isGrounded()) {
      if (!this.wasGrounded) { this.wasGrounded = true; this.emit('landed', {}); }
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lockPiece();
    } else {
      this.lockTimer = 0;
      this.wasGrounded = false;
    }
  }
}
