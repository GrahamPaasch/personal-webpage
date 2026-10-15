// The playfield. Row 0 is the top; rows 0..HIDDEN-1 are hidden.
export const COLS = 10;
export const ROWS = 22;
export const HIDDEN = 2;
export const VISIBLE = ROWS - HIDDEN;

export class Matrix {
  constructor() {
    this.cells = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  }
  inside(x, y) { return x >= 0 && x < COLS && y < ROWS; }
  // Above the top (y<0) counts as empty but in bounds horizontally.
  occupied(x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y < 0) return false;
    return this.cells[y][x] !== null;
  }
  fits(cells, ox, oy) {
    for (const [cx, cy] of cells) if (this.occupied(ox + cx, oy + cy)) return false;
    return true;
  }
  place(cells, ox, oy, value) {
    for (const [cx, cy] of cells) {
      const y = oy + cy;
      if (y >= 0) this.cells[y][ox + cx] = value;
    }
  }
  fullRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) if (this.cells[y].every(c => c !== null)) rows.push(y);
    return rows;
  }
  // Remove given rows (ascending indices), shift down. Returns the removed row contents.
  clearRows(rows) {
    const removed = rows.map(y => this.cells[y].slice());
    const keep = this.cells.filter((_, y) => !rows.includes(y));
    while (keep.length < ROWS) keep.unshift(new Array(COLS).fill(null));
    this.cells = keep;
    return removed;
  }
  isEmpty() { return this.cells.every(r => r.every(c => c === null)); }
  // Height of the stack in rows counted from the bottom (0 = empty).
  stackHeight() {
    for (let y = 0; y < ROWS; y++) if (this.cells[y].some(c => c !== null)) return ROWS - y;
    return 0;
  }
  clone() {
    const m = new Matrix();
    m.cells = this.cells.map(r => r.slice());
    return m;
  }
  // Build from strings (top→bottom) for tests; '.' empty, anything else filled. Bottom-aligned.
  static fromRows(rows) {
    const m = new Matrix();
    const off = ROWS - rows.length;
    rows.forEach((r, i) => [...r].forEach((c, x) => { if (c !== '.') m.cells[off + i][x] = c === 'X' ? 'G' : c; }));
    return m;
  }
}
