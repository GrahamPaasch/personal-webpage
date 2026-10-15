// A small placement AI (El-Tetris weights) used for ?autoplay=1, screenshots and the title attract demo.
import { SHAPES } from './pieces.js';
import { COLS, ROWS } from './matrix.js';

const W = { height: -4.5, lines: 3.42, rowT: -3.22, colT: -9.35, holes: -7.9, wells: -3.39 };

function evaluate(m, type, rot, x) {
  const cells = SHAPES[type][rot];
  if (!m.fits(cells, x, 0) && !m.fits(cells, x, -1)) return null;
  let y = m.fits(cells, x, 0) ? 0 : -1;
  if (!m.fits(cells, x, y)) return null;
  while (m.fits(cells, x, y + 1)) y++;
  const g = m.cells.map(r => r.slice());
  let minY = ROWS;
  for (const [cx, cy] of cells) { if (y + cy < 0) return null; g[y + cy][x + cx] = 'B'; minY = Math.min(minY, y + cy); }
  const full = [];
  for (let r = 0; r < ROWS; r++) if (g[r].every(c => c !== null)) full.push(r);
  const pieceRowsCleared = cells.filter(([, cy]) => full.includes(y + cy)).length;
  const grid = g.filter((_, r) => !full.includes(r));
  while (grid.length < ROWS) grid.unshift(new Array(COLS).fill(null));
  const landing = ROWS - (y + 1.5);
  let rowT = 0, colT = 0, holes = 0, wells = 0;
  for (let r = 0; r < ROWS; r++) {
    let prev = true;
    for (let c = 0; c < COLS; c++) { const f = grid[r][c] !== null; if (f !== prev) rowT++; prev = f; }
    if (!prev) rowT++;
  }
  for (let c = 0; c < COLS; c++) {
    let prev = false; // above the stack counts as empty
    for (let r = 0; r < ROWS; r++) { const f = grid[r][c] !== null; if (f !== prev) colT++; prev = f; }
    if (!prev) colT++; // the floor counts as filled
  }
  // holes: empty cells with a filled cell above in the same column
  holes = 0;
  for (let c = 0; c < COLS; c++) {
    let seen = false;
    for (let r = 0; r < ROWS; r++) { if (grid[r][c] !== null) seen = true; else if (seen) holes++; }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (grid[r][c] !== null) continue;
      const l = c === 0 || grid[r][c - 1] !== null;
      const rr = c === COLS - 1 || grid[r][c + 1] !== null;
      if (l && rr) { let d = 0; for (let k = r; k < ROWS && grid[k][c] === null; k++) d++; wells += d; }
    }
  }
  return W.height * landing + W.lines * full.length * pieceRowsCleared + W.rowT * rowT + W.colT * colT + W.holes * holes + W.wells * wells;
}

export function bestPlacement(m, type) {
  let best = null;
  const rots = type === 'O' ? [0] : [0, 1, 2, 3];
  for (const rot of rots) {
    for (let x = -2; x < COLS; x++) {
      const s = evaluate(m, type, rot, x);
      if (s === null) continue;
      if (!best || s > best.score) best = { rot, x, score: s };
    }
  }
  return best;
}

// Drives a Game with human-like inputs at a given pace (ms per input).
export class Bot {
  constructor(game, { pace = 70, softDrop = false } = {}) {
    this.game = game; this.pace = pace; this.softDrop = softDrop;
    this.t = 0; this.plan = null; this.planFor = null;
  }
  update(dt) {
    const g = this.game;
    if (g.state !== 'playing' || !g.active) return;
    this.t += dt;
    if (this.t < this.pace) return;
    this.t = 0;
    const p = g.active;
    if (this.planFor !== p) {
      this.planFor = p;
      const a = bestPlacement(g.matrix, p.type);
      let plan = a;
      if (!g.holdUsed) {
        const holdType = g.hold ?? g.next[0];
        const b = bestPlacement(g.matrix, holdType);
        if (b && a && b.score > a.score + 4) { g.press('hold'); return; }
      }
      this.plan = plan;
    }
    const plan = this.plan;
    if (!plan) { g.press('hard'); return; }
    if (p.rot !== plan.rot) { g.press(((plan.rot - p.rot + 4) % 4) === 3 ? 'ccw' : 'cw'); return; }
    if (p.x < plan.x) { if (!g.tryMove(1)) g.press('hard'); return; }
    if (p.x > plan.x) { if (!g.tryMove(-1)) g.press('hard'); return; }
    g.press('hard');
  }
}
