// Tetromino definitions and SRS rotation data. Coordinates: x right, y DOWN.
export const PIECES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// Guideline base colours (stages re-tint these).
export const BASE_COLORS = {
  I: '#00d8ff', O: '#ffd400', T: '#b24dff', S: '#3ddc5a', Z: '#ff3b4e', J: '#2f6bff', L: '#ff8c1a',
};

// Spawn shapes in an N×N box.
const SPAWN = {
  I: { n: 4, rows: ['....', 'XXXX', '....', '....'] },
  O: { n: 2, rows: ['XX', 'XX'] },
  T: { n: 3, rows: ['.X.', 'XXX', '...'] },
  S: { n: 3, rows: ['.XX', 'XX.', '...'] },
  Z: { n: 3, rows: ['XX.', '.XX', '...'] },
  J: { n: 3, rows: ['X..', 'XXX', '...'] },
  L: { n: 3, rows: ['..X', 'XXX', '...'] },
};

function rotateCW(cells, n) { return cells.map(([x, y]) => [n - 1 - y, x]); }

// SHAPES[type][state] = [[x,y] x4]; states 0,R=1,2,L=3.
export const SHAPES = {};
export const BOX = {};
for (const t of PIECES) {
  const { n, rows } = SPAWN[t];
  BOX[t] = n;
  let cells = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') cells.push([x, y]); }));
  SHAPES[t] = [];
  for (let s = 0; s < 4; s++) {
    SHAPES[t].push(cells.map(c => [...c]));
    cells = rotateCW(cells, n);
  }
}

export const SPAWN_X = { I: 3, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
export const SPAWN_Y = { I: -1, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 };

// SRS kick tables in guideline notation (x right, y UP). Converted to y-down on lookup.
const JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
// 180° kicks (TETR.IO SRS+), y UP.
const KICKS_180 = {
  '0>2': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
  '2>0': [[0, 0], [0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0]],
  '1>3': [[0, 0], [1, 0], [1, 2], [1, 1], [0, 2], [0, 1]],
  '3>1': [[0, 0], [-1, 0], [-1, 2], [-1, 1], [0, 2], [0, 1]],
};
export const KICK_TABLES = { JLSTZ, I: I_KICKS, R180: KICKS_180 };

// Returns kick offsets in y-DOWN coordinates.
export function getKicks(type, from, to) {
  if (type === 'O') return [[0, 0]];
  const key = `${from}>${to}`;
  let table;
  if ((from + 2) % 4 === to) table = KICKS_180;
  else table = type === 'I' ? I_KICKS : JLSTZ;
  const k = table[key];
  return k.map(([x, y]) => [x, -y]);
}
