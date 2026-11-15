/**
 * flight.js: where the dragons fly and how. Pure (no three.js): the same code runs in the page
 * and in the tests, which fly it for hours to make sure nobody hits a hill, a tree or the viewer.
 *
 * Three layers:
 *
 *   Lanes     hand-drawn curves through the valley: across the front of the ledge, over the
 *             viewer's shoulder, through the meadow gap, through the gorge, low over the lake...
 *             They join at three points over the lake, so any lane can follow any other.
 *   Director  strings lanes together and decides how the two fly them as a pair: one behind
 *             the other, weaving, wingtip to wingtip, corkscrewing round each other, swapping
 *             the lead. Each dragon is given a point to chase (its "carrot") a little way ahead
 *             of itself on the lane, and a speed that depends on whether it is ahead of or
 *             behind its place in the pair. The director also sends one to the viewer when
 *             called.
 *   Flyer     a small flight model that chases its carrot: it has to bank to turn, it loses
 *             speed climbing and gains it diving, beats its wings when it needs the push and
 *             glides when it does not, and pulls up for rising ground. Its path is what gives
 *             the motion weight; the lanes only say where to go.
 */

import {
  clearHeight, ground, forestDensity, lakeDistance, lakePoint, LAKE, LAKE_LEVEL, TREE_MAX, HERO_TREES, HeightGrid,
} from './world.js';
import { makeRng, clamp, lerp, smoothstep } from './rng.js';

const G = 9.81;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
/** The bank the lanes are planned for; the flyer can bank harder (BANK_MAX) when it has to. */
const PLAN_BANK = 40 * DEG;
/** No lane asks for less speed than this (m/s). */
const SLOWEST = 12.5;

/** Where the viewer's head is taken to be. */
export const VIEWER = [0, 1.62, 0];
/** No dragon's body comes nearer to the viewer's head than this (metres). */
export const KEEP_OUT = 9;
/** The flight floor's dome over the viewer is a little bigger, because a dragon follows the floor loosely. */
const DOME = KEEP_OUT + 1.2;

const wrap = (a) => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};

/**
 * A grid of the lowest height a dragon's body may fly at, room to spare included: 2.6 m over
 * open water, 6.5 m over bare ground, and over forest 6.5 m above the tallest tree that may
 * stand there. A tree's crown reaches several metres out from its trunk, so "forest" is spread
 * 10 m outward before the heights are taken: the edge of a gap is where the leaves end, not
 * where the trunks do.
 */
/** How far out from a crown by the ledge the body keeps, for its wings (metres). */
const WING_ROOM = 5.5;
const FLOOR_HALF = 470;
const FLOOR_STEP = 5;
let floorCache = null;

export function floorGrid() {
  if (floorCache) return floorCache;
  const n = Math.round((2 * FLOOR_HALF) / FLOOR_STEP) + 1;
  const base = new Float32Array(n * n);
  const density = new Float32Array(n * n);
  const water = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -FLOOR_HALF + j * FLOOR_STEP;
    for (let i = 0; i < n; i++) {
      const x = -FLOOR_HALF + i * FLOOR_STEP;
      const k = j * n + i;
      const dl = lakeDistance(x, z);
      water[k] = dl < -6 ? 1 : 0;
      base[k] = dl < 0 ? LAKE_LEVEL : ground(x, z);
      density[k] = dl < 0 ? 0 : forestDensity(x, z);
    }
  }
  const grid = Object.create(HeightGrid.prototype);
  grid.half = FLOOR_HALF;
  grid.n = n;
  grid.step = FLOOR_STEP;
  grid.data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let most = 0;
      for (let dj = -2; dj <= 2; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= n) continue;
        for (let di = -2; di <= 2; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= n || di * di + dj * dj > 5) continue;
          const d = density[jj * n + ii];
          if (d > most) most = d;
        }
      }
      const k = j * n + i;
      const trees = TREE_MAX * smoothstep(0.05, 0.5, most);
      grid.data[k] = base[k] + trees + (water[k] && trees === 0 ? 2.6 : 6.5);
    }
  }
  floorCache = grid;
  return grid;
}

/**
 * The lowest height a dragon's body may fly at over a point: the grid above, the hand-placed
 * trees by the ledge, and a dome around the viewer.
 */
export function flightFloor(x, z) {
  let h;
  if (Math.abs(x) < FLOOR_HALF && Math.abs(z) < FLOOR_HALF) h = floorGrid().at(x, z);
  else h = clearHeight(x, z) + 6.5;
  const r2 = x * x + z * z;
  if (r2 < 40 * 40) {
    for (let i = 0; i < HERO_TREES.length; i++) {
      const t = HERO_TREES[i];
      const d = Math.hypot(x - t.x, z - t.z);
      // Clear air over each crown and for a wing's length round it, so that a dragon going by
      // beside the tree does not sweep a wing through its leaves. Further out the tree does
      // not count: the lanes that pass below the ledge fly under and in front of these crowns.
      const top = t.height + 3 - Math.max(d - t.radius - WING_ROOM, 0) * 3;
      if (top > h) h = top;
    }
    if (r2 < DOME * DOME) {
      const dome = VIEWER[1] + Math.sqrt(DOME * DOME - r2) + 0.3;
      if (dome > h) h = dome;
    }
  }
  return h;
}

// ---------------------------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------------------------

const lake = (p, q, y) => {
  const [x, z] = lakePoint(p, q);
  return [x, y, z];
};

/** The three places over the lake where lanes begin and end, with the direction of travel. */
export const NODES = {
  // Heading in: toward the viewer.
  in: { p: lake(-85, -20, -15), dir: [-LAKE.ux, 0, -LAKE.uz] },
  // Low over the water, heading in: the end of a skim.
  low: { p: lake(-85, -4, -42.2), dir: [-LAKE.ux, 0, -LAKE.uz] },
  // Heading out: away from the viewer.
  out: { p: lake(-48, 60, -11), dir: [LAKE.ux, 0, LAKE.uz] },
};

export class Lane {
  /**
   * points: [x, y, z, speed (m/s), tight (0 or 1)] between the two nodes, which are added here.
   * tight marks places with little room (the gaps in the trees, close to the viewer): the
   * dragons fly those in single file. options: { weight, gap, first }.
   */
  constructor(name, from, to, points, options) {
    const o = options || {};
    this.name = name;
    this.from = from;
    this.to = to;
    this.weight = o.weight === undefined ? 1 : o.weight;
    this.gap = o.gap || 0; // how far apart the pair should be here, if the lane cares
    this.near = !!o.near; // comes close to the viewer
    const a = NODES[from];
    const b = NODES[to];
    const speedIn = points.length ? points[0][3] : 21;
    const speedOut = points.length ? points[points.length - 1][3] : 21;
    const lead = 42;
    const ctrl = [
      [a.p[0] - a.dir[0] * lead, a.p[1], a.p[2] - a.dir[2] * lead, speedIn, 0],
      [a.p[0], a.p[1], a.p[2], speedIn, 0],
      ...points.map((p) => [p[0], p[1], p[2], p[3] || 21, p[4] || 0]),
      [b.p[0], b.p[1], b.p[2], speedOut, 0],
      [b.p[0] + b.dir[0] * lead, b.p[1], b.p[2] + b.dir[2] * lead, speedOut, 0],
    ];
    this.control = ctrl;
    // Catmull-Rom through the control points (from the second to the second last), sampled
    // every couple of metres and indexed by distance travelled.
    const xs = [];
    const ys = [];
    const zs = [];
    const vs = [];
    const ts = [];
    const ss = [];
    let length = 0;
    for (let i = 1; i + 2 < ctrl.length; i++) {
      const p0 = ctrl[i - 1];
      const p1 = ctrl[i];
      const p2 = ctrl[i + 1];
      const p3 = ctrl[i + 2];
      const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
      const steps = Math.max(2, Math.ceil(chord / 2.5));
      for (let k = 0; k < steps || (i + 3 === ctrl.length && k === steps); k++) {
        const t = k / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        const c = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        const x = c(0);
        const y = c(1);
        const z = c(2);
        if (xs.length) length += Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1], z - zs[zs.length - 1]);
        xs.push(x);
        ys.push(y);
        zs.push(z);
        vs.push(lerp(p1[3], p2[3], t));
        ts.push(lerp(p1[4], p2[4], t));
        ss.push(length);
      }
    }
    this.xs = Float64Array.from(xs);
    this.ys = Float64Array.from(ys);
    this.zs = Float64Array.from(zs);
    // No faster than the turns allow: where the lane bends, the speed is brought down to what
    // a bank of PLAN_BANK can turn at. (So a dragon slows into a tight turn, as a bird does.)
    this.tightest = Infinity; // the smallest turn radius anywhere on the lane, metres
    const count = xs.length;
    for (let i = 0; i < count; i++) {
      const a = Math.max(i - 3, 0);
      const b = Math.min(i + 3, count - 1);
      if (a === i || b === i) continue;
      const h0 = Math.atan2(xs[i] - xs[a], zs[i] - zs[a]);
      const h1 = Math.atan2(xs[b] - xs[i], zs[b] - zs[i]);
      const turn = Math.abs(wrap(h1 - h0));
      const run = (Math.hypot(xs[i] - xs[a], zs[i] - zs[a]) + Math.hypot(xs[b] - xs[i], zs[b] - zs[i])) / 2;
      if (turn < 1e-4) continue;
      const radius = run / turn;
      if (radius < this.tightest) this.tightest = radius;
      const can = Math.sqrt(G * Math.tan(PLAN_BANK) * radius);
      if (can < vs[i]) vs[i] = Math.max(can, SLOWEST);
    }
    this.vs = Float64Array.from(vs);
    this.ts = Float64Array.from(ts);
    this.ss = Float64Array.from(ss);
    this.length = length;
  }

  /** Index of the sample at or before distance s, and how far toward the next one. */
  locate(s) {
    const ss = this.ss;
    const n = ss.length;
    if (s <= 0) return [0, 0];
    if (s >= this.length) return [n - 2, 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ss[mid] <= s) lo = mid;
      else hi = mid;
    }
    return [lo, (s - ss[lo]) / Math.max(ss[lo + 1] - ss[lo], 1e-9)];
  }

  pointAt(s, out) {
    const [i, f] = this.locate(s);
    out[0] = lerp(this.xs[i], this.xs[i + 1], f);
    out[1] = lerp(this.ys[i], this.ys[i + 1], f);
    out[2] = lerp(this.zs[i], this.zs[i + 1], f);
    return out;
  }

  speedAt(s) {
    const [i, f] = this.locate(s);
    return lerp(this.vs[i], this.vs[i + 1], f);
  }

  tightAt(s) {
    const [i, f] = this.locate(s);
    return lerp(this.ts[i], this.ts[i + 1], f);
  }
}

// A circle of points for the two lanes that go round and round.
function ring(cx, cz, radius, fromDeg, toDeg, stepDeg, y0, y1, speed, tight) {
  const out = [];
  const n = Math.round(Math.abs(toDeg - fromDeg) / stepDeg);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const a = lerp(fromDeg, toDeg, f) * DEG;
    // 0 degrees is due east (+x); angles grow counter-clockwise seen from above (toward -z).
    out.push([cx + Math.cos(a) * radius, lerp(y0, y1, f), cz - Math.sin(a) * radius, speed, tight || 0]);
  }
  return out;
}

/** Points on a circle at the given angles (degrees, as in ring()), each with its own height. */
function arc(cx, cz, radius, degs, heights, speed, tight) {
  return degs.map((deg, i) => [cx + Math.cos(deg * DEG) * radius, heights[i], cz - Math.sin(deg * DEG) * radius, speed, tight || 0]);
}

/**
 * The lanes. Coordinates are world metres: x to the viewer's right, y up from the ledge, -z
 * ahead; the lake surface is at y = -46. Each row: x, y, z, speed, tight.
 * The nodes: `in` is at about (-29, -15, -119) heading toward the viewer, `low` at
 * (-13, -42, -121) likewise, `out` at (46, -11, -165) heading away.
 *
 * Rules the lanes keep (tools/flysim.mjs and the tests check them): never under the flight
 * floor, no turn that needs more than a 47 degree bank at the lane's speed, no climb steeper
 * than 35 degrees.
 */

// The last stretch of the lanes that come back from the gorge side: round to the right and out.
const FROM_RIGHT = [
  [150, 18, -82, 21],
  [104, 4, -92, 21],
  [70, -4, -104, 21],
  [52, -8, -130, 21],
];
// The last stretch of the lanes that come back from the west: east over the lake, then a wide
// turn to the right that ends heading for the viewer.
const FROM_LEFT = [
  [-122, -3, -152, 21],
  [-82, -10, -170, 21],
  [-50, -14, -162, 20],
  [-35, -15, -142, 20],
];

export const LANES = [
  // Round and round over the near end of the lake, climbing past eye level: the opening.
  new Lane('spiral', 'in', 'out', [
    ...ring(NODES.in.p[0] + 38, NODES.in.p[2], 38, 180, 720, 45, -15, 10, 15).slice(1),
    [NODES.in.p[0] + 76, 0, NODES.in.p[2] - 24, 18],
  ], { weight: 1.3 }),

  // A figure of eight in front of the ledge, a little above eye level: first the loop on the
  // viewer's right, then the one on the left. The whole of it is within 85 m, and at the near
  // side of each loop the dragons are 25 m away, banked over, showing their backs.
  new Lane('eight', 'in', 'out', [
    [-24, -10, -93, 19],
    [-11, -2, -69, 17],
    ...arc(29, -46, 29, [180, 225, 270, 315, 360, 405, 450, 495], [4, 5, 6.5, 8, 9, 8.5, 7, 5], 15.5),
    ...arc(-29, -46, 29, [0, -45, -90, -135, -180, -225, -270], [4, 4.5, 6, 8, 9.5, 11, 11.5], 15.5),
    [-4, 9, -80, 17],
    [22, 3, -94, 19],
    [40, -4, -122, 21],
  ], { weight: 2.4, near: true }),

  // In from the lake, a turn, and straight across the front of the ledge at eye level.
  new Lane('cross', 'in', 'out', [
    [-33, -12, -92, 20],
    [-40, -7, -66, 18],
    [-44, -2, -44, 16, 1],
    [-38, 2, -27, 15, 1],
    [-22, 4, -17, 15, 1],
    [0, 4.6, -13.6, 15, 1],
    [27, 6, -11, 15, 1],
    [58, 9, 0, 17],
    [92, 15, 21, 19],
    [130, 23, 26, 20],
    [164, 30, 6, 20],
    [176, 30, -36, 21],
    ...FROM_RIGHT,
  ], { weight: 2, near: true }),

  // The same way in, but lower: it passes under the ledge, and the viewer looks down on its back.
  new Lane('under', 'in', 'out', [
    [-34, -13, -92, 20],
    [-44, -12, -66, 18],
    [-49, -12, -47, 17, 1],
    [-43, -12.5, -32, 16, 1],
    [-27, -13.5, -24, 16, 1],
    [0, -14, -26, 16, 1],
    [26, -13, -22, 16, 1],
    [50, -9, -10, 17],
    [78, -3, 8, 18],
    [108, 7, 26, 19],
    [142, 19, 24, 20],
    [166, 27, -2, 20],
    [172, 27, -42, 21],
    ...FROM_RIGHT,
  ], { weight: 1.6, near: true }),

  // Round behind the viewer over the plateau, then down over their right shoulder into the valley.
  new Lane('shoulder', 'in', 'out', [
    [-42, -9, -88, 21],
    [-70, -1, -52, 20],
    [-92, 10, -14, 19],
    [-98, 29, 28, 18],
    [-82, 39, 66, 18],
    [-48, 41, 92, 18],
    [-8, 42, 102, 17],
    [30, 41, 92, 17],
    [48, 37, 66, 17],
    [42, 31.5, 42, 16, 1],
    [7.5, 14.9, 3, 15, 1],
    [-7, 2.2, -22, 19, 1],
    [-14, -13, -56, 24],
    [-6, -18, -98, 23],
    [18, -17, -120, 21],
    [38, -14, -142, 21],
  ], { weight: 1.6, near: true }),

  // Down to the valley floor on the left, along the grassy gap between the trees, and back.
  new Lane('meadow', 'in', 'in', [
    [-30, -21, -100, 19],
    [-33, -28, -84, 18],
    [-44, -32.5, -70, 17, 1],
    [-62, -33.5, -60, 16, 1],
    [-84, -33.5, -55, 16, 1],
    [-130, -33.5, -58, 16, 1],
    [-180, -33.5, -44.5, 16, 1],
    [-230, -33, -38, 16, 1],
    [-262, -28, -36, 16, 1],
    [-292, -16, -38, 17, 1],
    [-322, 4, -56, 18],
    [-338, 11, -92, 19],
    [-326, 17, -128, 20],
    [-292, 19, -146, 21],
    [-244, 19, -134, 21],
    [-200, 17, -120, 21],
    [-160, 10, -128, 21],
    ...FROM_LEFT,
  ], { weight: 1.2 }),

  // Down at the near end of the lake and out through the gorge on the right, under the treetops.
  new Lane('gorge', 'in', 'out', [
    [-31, -21, -100, 19],
    [-30, -28, -84, 18],
    [-20, -32, -72, 17, 1],
    [-2, -33, -66.5, 17, 1],
    [16, -33, -67, 17, 1],
    [36, -33, -70, 17, 1],
    [60, -33, -69.5, 17, 1],
    [98, -33, -49, 17, 1],
    [124.5, -33, -9, 17, 1],
    [139, -33, 38, 17, 1],
    [168.5, -32, 88.5, 17, 1],
    [227, -28, 128, 17, 1],
    [284, -10, 146, 17],
    [318, 12, 122, 18],
    [318, 31, 76, 19],
    [290, 45, 32, 20],
    [254, 51, -6, 20],
    [222, 47, -50, 21],
    [192, 33, -88, 21],
    [150, 15, -100, 21],
    [104, 2, -100, 21],
    [70, -5, -110, 21],
    [52, -9, -134, 21],
  ], { weight: 1.4 }),

  // Most of a circle round the ledge: across the front, over the gorge, over the trees behind.
  new Lane('orbit', 'in', 'out', [
    [-33, -9, -92, 20],
    [-34, -2, -68, 18],
    [-26, 4, -50, 17],
    [-8, 6.5, -42, 16],
    ...[7, 8, 11, 19, 31, 35, 36, 35, 31, 18, 9].map((y, i) => {
      // Clockwise seen from above, starting ahead and a little to the right; high over the
      // trees behind the viewer, low in front.
      const a = (75 - 30 * i) * DEG;
      return [Math.cos(a) * 42, y, -Math.sin(a) * 42, 16, 0];
    }),
    [-8, 3, -56, 18],
    [16, -4, -92, 20],
    [36, -9, -130, 21],
  ], { weight: 1.3, near: true }),

  // From a skim: up the face of the bluff, rising in front of the ledge, and off to the left.
  new Lane('rise', 'low', 'in', [
    [-10, -41.5, -108, 23],
    [-6, -36, -92, 21],
    [-3, -26, -74, 19],
    [-1.5, -16, -57, 17, 1],
    [-2, -6, -41, 15, 1],
    [-8, 3.5, -27, 14, 1],
    [-22, 9, -18.5, 14, 1],
    [-44, 11.5, -19, 16, 1],
    [-70, 9, -30, 19],
    [-94, 4, -54, 20],
    [-110, -2, -88, 21],
    [-112, -7, -124, 21],
    [-104, -11, -158, 21],
    [-80, -13, -180, 21],
    [-50, -14.5, -172, 20],
    [-34, -15, -146, 20],
  ], { weight: 1, near: true }),

  // Out over the lake and a wide turn back.
  new Lane('far turn', 'out', 'in', [
    [44, -10, -200, 21],
    [30, -8, -238, 21],
    [4, -5, -262, 21],
    [-30, -5, -266, 21],
    [-58, -8, -244, 21],
    [-62, -12, -205, 21],
    [-46, -15, -164, 21],
  ], { weight: 2 }),

  // Over the wooded hill on the left of the lake, close above its trees.
  new Lane('left hill', 'out', 'in', [
    [40, -8, -204, 21],
    [12, -2, -244, 21],
    [-36, 6, -268, 21],
    [-96, 18, -272, 20],
    [-156, 38, -254, 20],
    [-204, 49, -214, 20],
    [-208, 44, -166, 20],
    [-178, 28, -138, 21],
    [-150, 12, -140, 21],
    ...FROM_LEFT,
  ], { weight: 0.9 }),

  // The same on the right, and back to where it started.
  new Lane('right hill', 'out', 'out', [
    [52, -8, -204, 21],
    [76, 2, -240, 21],
    [118, 19, -256, 20],
    [158, 41, -232, 20],
    [172, 39, -180, 20],
    [150, 23, -132, 21],
    [108, 6, -100, 21],
    [72, -3, -100, 21],
    [54, -8, -128, 21],
  ], { weight: 0.8 }),

  // The far turn again, but dropping to the water: the start of a skim toward the viewer.
  new Lane('skim', 'out', 'low', [
    [44, -11, -200, 21],
    [30, -13, -240, 21],
    [4, -17, -266, 21],
    [-28, -24, -270, 21],
    [-52, -32, -250, 21],
    [-58, -39, -214, 22],
    [-42, -42, -172, 24],
  ], { weight: 2 }),
];

const laneByName = (name) => LANES.find((l) => l.name === name);

/**
 * How the piece begins: the two are coming back from the far end of the lake as it opens; they
 * fly the figure of eight in front of the ledge, go round the lake, and come straight across
 * the front. After that the lanes are chosen by chance.
 */
const OPENING = ['far turn', 'eight', 'far turn', 'cross'];
/** How far along the first lane the pair starts (metres). */
const OPENING_START = 150;

// ---------------------------------------------------------------------------------------------
// The flyer
// ---------------------------------------------------------------------------------------------

const BANK_MAX = 58 * DEG;
const ROLL_MAX = 80 * DEG; // per second
const CLIMB_MAX = 38 * DEG;
const CLIMB_HARD = 58 * DEG; // only when the ground demands it
const DIVE_MAX = 42 * DEG;
const LOOK_TIMES = [0.45, 0.9, 1.5, 2.3, 3.2];

export class Flyer {
  /** spec: { beat: wingbeats a second, size: 1 for the big dragon } */
  constructor(spec, rng) {
    this.beat = spec.beat;
    this.size = spec.size;
    this.rng = rng;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.heading = 0; // radians about y; 0 = facing +z; grows turning left
    this.gamma = 0; // which way the path points up or down
    this.bank = 0; // positive: left wing down
    this.bankRate = 0;
    this.speed = 20;
    this.omega = 0; // turn rate, rad/s
    this.gammaRate = 0;
    // What the rig needs.
    this.pitch = 0;
    this.flap = 0;
    this.power = 0;
    this.tuck = 0;
    this.brake = 0;
    this.turn = 0;
    this.arch = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.jaw = 0;
    this.flapping = true;
    this.roar = 0; // seconds of roar left
    this.beats = 0; // counts wingbeats
    this.beatNow = 0; // strength of a downstroke that started this step (0 = none)
    this.floorHits = 0; // steps spent well under the flight floor (should stay 0)
    this.deepest = -Infinity; // furthest it has been under the flight floor, metres
  }

  place(x, y, z, heading, speed) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = heading;
    this.speed = speed;
    this.gamma = 0;
    this.bank = 0;
    this.bankRate = 0;
  }

  /**
   * Chase a point. target: [x, y, z]; wantSpeed: m/s; look: [x, y, z] to look at, or null.
   */
  step(dt, target, wantSpeed, look) {
    const dx = target[0] - this.x;
    const dy = target[1] - this.y;
    const dz = target[2] - this.z;
    const flat = Math.hypot(dx, dz);
    const v = Math.max(this.speed, 8);

    // --- Turning: bank toward the carrot; the turn comes from the bank.
    const err = wrap(Math.atan2(dx, dz) - this.heading);
    const omegaMax = (G * Math.tan(BANK_MAX)) / v;
    // The carrot swings fast when it is close; ease off so the dragon does not snake.
    const gain = 1.5 * clamp(flat / 22, 0.35, 1);
    const omegaWant = clamp(gain * err, -omegaMax, omegaMax);
    const bankWant = Math.atan((omegaWant * v) / G);
    // A creature this size rolls like a big bird, not like a swallow.
    const kb = 2.8;
    this.bankRate += (kb * kb * (bankWant - this.bank) - 2 * kb * this.bankRate) * dt;
    this.bankRate = clamp(this.bankRate, -ROLL_MAX, ROLL_MAX);
    this.bank += this.bankRate * dt;
    this.omega = (G * Math.tan(this.bank)) / v;
    this.heading = wrap(this.heading + this.omega * dt);
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    // --- Up and down: aim at the carrot, but never into rising ground. The ground is checked
    // along the way it is about to fly: curving toward the carrot, and no further than the
    // carrot (the lanes themselves are clear, and in a winding gap a straight look ahead would
    // see the trees on the outside of the bend).
    let gammaWant = clamp(Math.atan2(dy, Math.max(flat, 4)), -DIVE_MAX, CLIMB_MAX);
    let need = -Infinity;
    for (let i = 0; i < LOOK_TIMES.length; i++) {
      const t = LOOK_TIMES[i];
      const d = Math.max(Math.min(v * t, flat + 4), 5);
      const bend = clamp(err, -omegaMax * t, omegaMax * t) * 0.5;
      const qx = this.x + Math.sin(this.heading + bend) * d;
      const qz = this.z + Math.cos(this.heading + bend) * d;
      const g = Math.atan2(flightFloor(qx, qz) - this.y, d);
      if (g > need) need = g;
    }
    const here = flightFloor(this.x, this.z) - 2 - this.y;
    if (here > 0) need = Math.max(need, Math.min(here * 0.12, 0.5));
    let urgent = false;
    if (need > gammaWant) {
      gammaWant = Math.min(need, CLIMB_HARD);
      urgent = need > gammaWant - 0.02 && need > 0.2;
    }
    const kg = urgent ? 3.2 : 1.9;
    const rateMax = (urgent ? 75 : 40) * DEG;
    this.gammaRate = clamp(kg * (gammaWant - this.gamma), -rateMax, rateMax);
    this.gamma += this.gammaRate * dt;

    // --- Speed: beat when it needs the push, glide when it does not.
    const sinG = Math.sin(this.gamma);
    if (this.flapping) {
      if ((this.speed > wantSpeed + 1.1 && this.gamma < 0.07) || this.gamma < -0.2) this.flapping = false;
    } else if ((this.speed < wantSpeed - 1.1 && this.gamma > -0.16) || this.gamma > 0.11) {
      this.flapping = true;
      this.flap = 5.3; // start with the wings coming up to the top
    }
    const powerWant = this.flapping ? clamp(0.55 + 1.7 * sinG + 0.06 * (wantSpeed - this.speed), 0.45, 1) : 0;
    this.power += (powerWant - this.power) * (1 - Math.exp(-dt / 0.3));
    // Too fast for what is coming: wings up and cupped, like a goose landing.
    const brakeWant = this.speed > wantSpeed + 2 ? clamp((this.speed - wantSpeed - 2) / 3, 0, 1) : 0;
    this.brake += (brakeWant - this.brake) * (1 - Math.exp(-dt / 0.3));
    let accel = 2.7 * this.power - 0.0021 * this.speed * this.speed - 3.4 * this.brake - G * sinG * 0.55;
    if (this.speed < 12) accel += (12 - this.speed) * 2;
    this.speed = clamp(this.speed + accel * dt, 9, 38);

    // --- Move.
    const cosG = Math.cos(this.gamma);
    this.x += this.speed * cosG * sinH * dt;
    this.y += this.speed * sinG * dt;
    this.z += this.speed * cosG * cosH * dt;
    // Well under where it should be (the look-ahead above should make this rare): nose up, now.
    // It is never moved by hand: a dragon that jumps would look worse than one that brushes a
    // treetop.
    const under = flightFloor(this.x, this.z) - this.y;
    if (under > this.deepest) this.deepest = under;
    if (under > 4.5) {
      this.gamma += (0.7 - this.gamma) * Math.min(1, dt * 6);
      this.floorHits++;
    }

    // --- What the body shows.
    const slow = clamp((24 - this.speed) / 12, 0, 1);
    this.pitch = this.gamma + (3 + 7 * this.power * slow) * DEG;
    const tuckWant = smoothstep(0.26, 0.62, -this.gamma);
    this.tuck += (tuckWant - this.tuck) * (1 - Math.exp(-dt / 0.35));
    const ease = 1 - Math.exp(-dt / 0.25);
    this.turn += (clamp(this.omega / 0.65, -1, 1) - this.turn) * ease;
    this.arch += (clamp(this.gammaRate / 0.5, -1, 1) - this.arch) * ease;

    // The wingbeat. A beat is counted, and reported, as the downstroke gets going.
    const before = this.flap;
    this.flap += TAU * this.beat * (0.82 + 0.36 * this.power) * dt;
    this.beatNow = 0;
    const mark = 0.3 * Math.PI;
    if (this.flap >= TAU) {
      this.flap -= TAU;
      if (mark <= this.flap) this.countBeat();
    } else if (before < mark && this.flap >= mark) {
      this.countBeat();
    }

    // The head: toward what it is looking at, if that is in front of it.
    let yawWant = 0;
    let pitchWant = 0;
    if (look) {
      const lx = look[0] - this.x;
      const ly = look[1] - this.y;
      const lz = look[2] - this.z;
      const yaw = wrap(Math.atan2(lx, lz) - this.heading);
      if (Math.abs(yaw) < 115 * DEG) {
        yawWant = clamp(yaw, -70 * DEG, 70 * DEG);
        pitchWant = clamp(Math.atan2(ly, Math.hypot(lx, lz)) - this.pitch, -40 * DEG, 45 * DEG);
      }
    }
    const turnHead = 1 - Math.exp(-dt / 0.3);
    this.lookYaw += (yawWant - this.lookYaw) * turnHead;
    this.lookPitch += (pitchWant - this.lookPitch) * turnHead;

    // The jaw opens for a roar.
    if (this.roar > 0) this.roar = Math.max(0, this.roar - dt);
    const jawWant = this.roar > 0 ? Math.min(1, this.roar * 2.2) * Math.min(1, (ROAR_SECONDS - this.roar) * 6) : 0;
    this.jaw += (jawWant - this.jaw) * (1 - Math.exp(-dt / 0.08));
  }

  countBeat() {
    if (this.power > 0.2) {
      this.beats++;
      this.beatNow = this.power;
    }
  }
}

export const ROAR_SECONDS = 1.9;

/**
 * Where a called dragon goes by. It comes straight at the ledge along (ux, uz), passes to one
 * side of the viewer with a wing over their head, and may turn a little as it leaves. Which
 * side, how far out, how high and which way out is settled by what stands in the way: every
 * combination is tried, each as low as the flight floor along it allows (the dragon may still
 * be coming down as it arrives, and may climb steeply once it is past), and the one that brings
 * it nearest wins.
 * Returns { point: [x, y, z] beside the viewer, turn: radians to turn after it (positive: left),
 * near: metres from the viewer's head, side: +1 or -1 }.
 */
export function planPass(ux, uz, size, prefer) {
  const lowest = VIEWER[1] + 8 + 1.6 * size;
  const best = { point: [0, 0, 0], turn: 0, near: Infinity, side: 0 };
  for (let k = -1; k <= 1; k += 2) {
    for (let i = 0; i < PASS_SIDES.length; i++) {
      const off = PASS_SIDES[i] + 1.2 * size;
      const px = VIEWER[0] + uz * off * k;
      const pz = VIEWER[2] - ux * off * k;
      // Coming in: it can be dropping at about 17 degrees.
      let arrive = lowest;
      for (let s = -30; s <= 0; s += 3) {
        const need = flightFloor(px + ux * s, pz + uz * s) + 1 + s * 0.3;
        if (need > arrive) arrive = need;
      }
      for (let j = 0; j < PASS_TURNS.length; j++) {
        const turn = PASS_TURNS[j];
        // Heading grows turning left, and (sin, cos) of it is the direction of travel.
        const ex = ux * Math.cos(turn) + uz * Math.sin(turn);
        const ez = uz * Math.cos(turn) - ux * Math.sin(turn);
        let y = arrive;
        for (let s = 3; s <= 39; s += 3) {
          // It takes a moment to get its nose up: the climb counts from 6 m past the point.
          const need = flightFloor(px + ex * s, pz + ez * s) + 1 - Math.max(s - 6, 0) * 0.5;
          if (need > y) y = need;
        }
        // Straight on is preferred to a turn that gains next to nothing, and the side already
        // chosen (`prefer`, when the plan is being brought up to date) to one barely better.
        const near = Math.hypot(off, y - VIEWER[1]) + Math.abs(turn) * 0.8 - (k === prefer ? 1.5 : 0);
        if (near < best.near) {
          best.near = near;
          best.side = k;
          best.turn = turn;
          best.point[0] = px;
          best.point[1] = y;
          best.point[2] = pz;
        }
      }
    }
  }
  best.near = Math.hypot(best.point[0] - VIEWER[0], best.point[1] - VIEWER[1], best.point[2] - VIEWER[2]);
  return best;
}
const PASS_SIDES = [4.5, 6, 8, 10.5];
const PASS_TURNS = [0, 20 * DEG, -20 * DEG, 40 * DEG, -40 * DEG];

// ---------------------------------------------------------------------------------------------
// The director
// ---------------------------------------------------------------------------------------------

/** How far ahead of each dragon its carrot runs (metres). */
const CARROT = 25;
/** How far each stands off from the lane when the two are side by side (metres). */
const STAND_OFF = 8;
/** Nearer to each other than this, the two give way (metres between their bodies). */
const GIVE_WAY = 12.5;
const TMP = [0, 0, 0];
const TMP2 = [0, 0, 0];

const MODES = [
  { name: 'trail', weight: 3, min: 8, max: 15 },
  { name: 'weave', weight: 3, min: 8, max: 13 },
  { name: 'wing', weight: 2.2, min: 7, max: 12 },
  { name: 'stack', weight: 1.4, min: 6, max: 10 },
  { name: 'helix', weight: 1.6, min: 10, max: 10.5 },
  { name: 'swap', weight: 1.6, min: 11, max: 13 },
];

export class Director {
  /**
   * builds: [{ beat, size }, { beat, size }] for the two dragons. seed: any integer; the same
   * seed always gives the same flight.
   */
  constructor(builds, seed) {
    this.builds = builds;
    this.seed = seed;
    this.reset();
  }

  reset() {
    const rng = makeRng(this.seed);
    this.rng = rng;
    this.time = 0;
    this.flyers = this.builds.map((b, i) => new Flyer(b, makeRng(this.seed * 7 + i + 1)));
    // The path: lanes laid end to end. `base` is the distance at which the first kept lane starts.
    this.path = [];
    this.base = 0;
    this.end = 0;
    this.node = 'in';
    this.last = '';
    this.opening = OPENING.slice();
    this.center = OPENING_START; // how far along the path the middle of the pair is
    this.lead = 1; // +1: the first dragon is in front
    this.gap = 26; // signed: positive when the first dragon is ahead
    this.offsets = [0, 0, 0, 0]; // sideways and up for each dragon, smoothed
    this.standOff = [0, 0, 0, 0]; // sideways and up for each dragon, to keep them apart
    this.axis = Math.PI / 2; // the direction they stand off along (see step)
    this.mode = { name: 'trail', t: 0, length: 8, side: 1 };
    this.jobs = [null, null]; // a fly-past in progress, per dragon
    this.callAt = -100;
    this.nextRoar = 9 + rng() * 6;
    this.events = [];
    this.carrots = [[0, 0, 0], [0, 0, 0]];
    this.wantSpeed = [20, 20];
    this.along = [this.center + this.gap * 0.5, this.center - this.gap * 0.5]; // each one's place on the path
    this.on = [true, true]; // is it following the lane (or away on a call)?
    this.separation = Math.abs(this.gap);
    this.closest = Infinity; // nearest any dragon has come to the viewer
    this.extend();
    // Start both where they belong on the first lane.
    const tmp = [0, 0, 0];
    const ahead = [0, 0, 0];
    for (let i = 0; i < 2; i++) {
      const s = this.center + (i === 0 ? 1 : -1) * this.gap * 0.5;
      this.pointAt(s, tmp);
      this.pointAt(s + 3, ahead);
      this.flyers[i].place(tmp[0], tmp[1], tmp[2], Math.atan2(ahead[0] - tmp[0], ahead[2] - tmp[2]), this.speedAt(s));
    }
  }

  // --- The path -------------------------------------------------------------------------------

  /** Add lanes until the path reaches well past the pair. */
  extend() {
    while (this.end < this.center + 420) {
      let lane;
      if (this.opening.length) {
        lane = laneByName(this.opening.shift());
      } else {
        const choices = LANES.filter((l) => l.from === this.node && l.name !== this.last);
        let total = 0;
        for (const l of choices) total += l.weight;
        let pick = this.rng() * total;
        lane = choices[choices.length - 1];
        for (const l of choices) {
          pick -= l.weight;
          if (pick <= 0) {
            lane = l;
            break;
          }
        }
      }
      this.path.push({ lane, start: this.end });
      this.end += lane.length;
      this.node = lane.to;
      this.last = lane.name;
    }
    // Forget lanes both dragons have left behind.
    while (this.path.length > 1 && this.path[1].start < this.center - 320) this.path.shift();
    this.base = this.path[0].start;
  }

  /** The lane a distance along the path falls in. */
  find(s) {
    const path = this.path;
    for (let i = path.length - 1; i >= 0; i--) if (s >= path[i].start) return path[i];
    return path[0];
  }

  pointAt(s, out) {
    const e = this.find(s);
    return e.lane.pointAt(s - e.start, out);
  }

  speedAt(s) {
    const e = this.find(s);
    return e.lane.speedAt(s - e.start);
  }

  tightAt(s) {
    const e = this.find(s);
    return e.lane.tightAt(s - e.start);
  }

  /** The names of the lanes being flown and coming up. */
  program() {
    return this.path.filter((e) => e.start + e.lane.length > this.center).map((e) => e.lane.name);
  }

  // --- Flying together ------------------------------------------------------------------------

  /**
   * Choose how the pair flies next. calm: a tight place is here or close, single file only.
   * soon: one is coming within a quarter of a minute, so nothing that takes long to undo.
   */
  pickMode(calm, soon) {
    let name = 'trail';
    if (!calm) {
      const ok = (m) => m.name !== this.mode.name && !(soon && (m.name === 'swap' || m.name === 'helix'));
      let total = 0;
      for (const m of MODES) if (ok(m)) total += m.weight;
      let pick = this.rng() * total;
      for (const m of MODES) {
        if (!ok(m)) continue;
        pick -= m.weight;
        if (pick <= 0) {
          name = m.name;
          break;
        }
      }
    }
    const def = MODES.find((m) => m.name === name);
    this.mode = { name, t: 0, length: lerp(def.min, def.max, this.rng()), side: this.rng() < 0.5 ? -1 : 1 };
    if (name === 'swap') this.lead = -this.lead;
  }

  /**
   * What the current mode asks for:
   *   [gap between them along the lane, leaderSide, leaderUp, chaserSide, chaserUp, axis]
   * `axis` is the direction (radians; 0 = sideways, pi/2 = straight up) along which the FIRST
   * dragon stands off from the lane whenever the two are close along it; the second stands off
   * the opposite way. null: keep whatever it is. See step() for how it keeps them apart.
   */
  modeWants() {
    const m = this.mode;
    const t = m.t;
    const firstLeads = this.lead === 1;
    switch (m.name) {
      case 'weave':
        return [24, 3 * Math.sin(1.05 * t + 1.6), 0, 9 * Math.sin(1.05 * t), 3 * Math.sin(0.7 * t), null];
      case 'wing':
        // Wingtip to wingtip.
        return [3, 0, 0, 0, 1.2, m.side > 0 ? 0 : Math.PI];
      case 'stack':
        // The leader below, the other riding above and just behind.
        return [8, 0, 0, 0, 0, firstLeads ? -Math.PI / 2 : Math.PI / 2];
      case 'helix':
        // Round each other: the axis itself turns (in step()).
        return [0, 0, 0, 0, 0, null];
      case 'swap':
        // The new leader goes over the top.
        return [26, 0, 0, 0, 0, firstLeads ? Math.PI / 2 : -Math.PI / 2];
      case 'trail':
      default:
        return [26, 0, 0, 4 * Math.sin(0.8 * t), 2.5 + 1.5 * Math.sin(0.5 * t), null];
    }
  }

  // --- Calling a dragon -----------------------------------------------------------------------

  /**
   * Send a dragon past the viewer. Returns its number, or -1 if neither is free (one is already
   * on its way, or the last call was a moment ago).
   */
  call() {
    if (this.time - this.callAt < 4) return -1;
    const free = [0, 1].filter((i) => !this.jobs[i]);
    if (!free.length) return -1;
    const dist = (i) => Math.hypot(this.flyers[i].x - VIEWER[0], this.flyers[i].y - VIEWER[1], this.flyers[i].z - VIEWER[2]);
    // The nearer one that still has room to turn toward the viewer.
    free.sort((a, b) => dist(a) - dist(b));
    let who = free[0];
    if (dist(who) < 45 && free.length > 1) who = free[1];
    const f = this.flyers[who];
    const dx = VIEWER[0] - f.x;
    const dz = VIEWER[2] - f.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    const plan = planPass(ux, uz, f.size);
    this.jobs[who] = { phase: 'come', pass: plan.point, turn: plan.turn, side: plan.side, dir: [ux, uz], exit: [ux, uz], t: 0, replan: 0.4, roared: false };
    this.callAt = this.time;
    this.events.push({ type: 'call', dragon: who });
    return who;
  }

  // --- One step of time -----------------------------------------------------------------------

  step(dt) {
    this.time += dt;
    const flyers = this.flyers;

    // Where each dragon is along the path. A dragon that is off on a call, or still far from
    // the lane on its way back, has no place on it.
    for (let i = 0; i < 2; i++) {
      if (this.jobs[i]) {
        this.on[i] = false;
        continue;
      }
      const f = flyers[i];
      const should = this.center + (i === 0 ? 0.5 : -0.5) * this.gap;
      if (this.on[i]) {
        this.along[i] = this.project(f, this.along[i] - 4, this.along[i] + 45);
      } else {
        // Back from a call: it joins the lane where it is nearest to it, not too far from its
        // place in the pair.
        const s = this.project(f, should - 140, should + 60);
        this.pointAt(s, TMP);
        if (Math.hypot(TMP[0] - f.x, TMP[1] - f.y, TMP[2] - f.z) < 42) {
          this.on[i] = true;
          this.along[i] = s;
        }
      }
    }

    // The pair's place on the path moves at the lane's pace, and waits for a straggler.
    let behind = 0;
    for (let i = 0; i < 2; i++) {
      const should = this.center + (i === 0 ? 0.5 : -0.5) * this.gap;
      if (this.jobs[i]) behind = Math.max(behind, 60);
      else if (this.on[i]) behind = Math.max(behind, should - this.along[i]);
      else behind = Math.max(behind, 80);
    }
    const pace = clamp(1 - 0.006 * (behind - 25), 0.62, 1);
    this.center += this.speedAt(this.center) * pace * dt;
    this.extend();

    // Tight places ahead: single file, and no fancy figures.
    let tight = 0;
    for (let d = -40; d <= 150; d += 15) tight = Math.max(tight, this.tightAt(this.center + d));
    this.mode.t += dt;
    if (this.mode.t > this.mode.length) {
      let soon = 0;
      for (let d = 150; d <= 330; d += 20) soon = Math.max(soon, this.tightAt(this.center + d));
      this.pickMode(tight > 0.3, soon > 0.3);
    } else if (tight > 0.3 && this.mode.name !== 'trail' && this.mode.name !== 'swap') {
      this.pickMode(true, true);
    }

    const want = this.modeWants();
    let gapWant = want[0];
    if (tight > 0.3) gapWant = Math.max(gapWant, 30);
    // The gap changes at a walking pace relative to the flight, so it reads as one catching up.
    this.gap += clamp(this.lead * gapWant - this.gap, -6 * dt, 6 * dt);
    // Keeping apart. Whenever the two are less than 20 m apart along the lane they stand off
    // from it in opposite directions along `axis`, by more the closer they are: side by side
    // they are 16 m apart, and they are never nearer than about 12. Flying wingtip to wingtip,
    // one above the other, passing, and circling each other are all this one rule with the
    // axis held sideways, held upright, or turning.
    if (this.mode.name === 'helix') this.axis = wrap(this.axis + 0.9 * this.mode.side * dt);
    else if (want[5] !== null) this.axis = wrap(this.axis + clamp(wrap(want[5] - this.axis), -1.3 * dt, 1.3 * dt));
    // How close they really are along the lane (not how close they are meant to be).
    const between = this.on[0] && this.on[1] ? Math.abs(this.along[0] - this.along[1]) : Math.abs(this.gap);
    const apart = STAND_OFF * clamp(1 - Math.min(between, Math.abs(this.gap)) / 20, 0, 1);

    // Roars: now and then from a distance, and from one that has been called.
    if (this.time > this.nextRoar) {
      const who = this.rng() < 0.5 ? 0 : 1;
      if (!this.jobs[who]) this.roar(who, 'far');
      this.nextRoar = this.time + 38 + this.rng() * 50;
    }

    const ease = 1 - Math.exp(-dt / 0.7);
    const p = TMP;
    const q = TMP2;
    const near = [0, 0];
    for (let i = 0; i < 2; i++) {
      const f = flyers[i];
      const carrot = this.carrots[i];
      const job = this.jobs[i];
      const toViewer = Math.hypot(f.x - VIEWER[0], f.y - VIEWER[1], f.z - VIEWER[2]);
      near[i] = toViewer;
      if (toViewer < this.closest) this.closest = toViewer;
      if (job) {
        this.wantSpeed[i] = this.flyPast(i, job, dt, toViewer);
        continue;
      }
      const should = this.center + (i === 0 ? 0.5 : -0.5) * this.gap;
      const leader = (i === 0 ? 1 : -1) === this.lead;
      const sign = i === 0 ? 1 : -1;
      // The carrot: a fixed distance ahead of the dragon ON THE LANE, so the dragon follows
      // the lane's shape from wherever it is. (Where it should be only sets its speed.) A
      // dragon that is not on the lane yet aims at its place in the pair instead.
      const at = this.on[i] ? this.along[i] : should;
      const s = at + CARROT;
      const here = Math.max(this.tightAt(at), this.tightAt(s), this.tightAt(at + 12));
      const side = (leader ? want[1] : want[3]) * (1 - here);
      const up = (leader ? want[2] : want[4]) * (1 - 0.6 * here);
      this.offsets[i * 2] += (side - this.offsets[i * 2]) * ease;
      this.offsets[i * 2 + 1] += (up - this.offsets[i * 2 + 1]) * ease;
      this.standOff[i * 2] = sign * apart * Math.cos(this.axis);
      this.standOff[i * 2 + 1] = sign * apart * Math.sin(this.axis);
      this.pointAt(s, p);
      this.pointAt(s + 3, q);
      const tx = q[0] - p[0];
      const tz = q[2] - p[2];
      const tl = Math.hypot(tx, tz) || 1;
      // Left of the direction of travel is (tz, -tx).
      const off = this.offsets[i * 2] + this.standOff[i * 2];
      carrot[0] = p[0] + (tz / tl) * off;
      carrot[1] = p[1] + this.offsets[i * 2 + 1] + this.standOff[i * 2 + 1];
      carrot[2] = p[2] - (tx / tl) * off;
      // Speed: what the lane allows here (slowing in time for what is coming), faster when it
      // is behind its place and slower when ahead. No hurrying through the tight places.
      const allowed = this.allowedSpeed(at);
      let tightAhead = here;
      for (let d = 25; d <= 75; d += 25) tightAhead = Math.max(tightAhead, this.tightAt(at + d));
      const late = this.on[i] ? should - this.along[i] : 60;
      this.wantSpeed[i] = allowed * (1 + clamp(0.014 * late, -0.3, 0.45 * (1 - tightAhead)));
    }

    // The lane keeps the two apart when each is in its place. When one is not (it is catching
    // up, or coming back from a call), they also give way to each other directly: the higher
    // one goes up, the lower one down, and each a little off to its own side.
    // They look a second and a half ahead: two that are closing fast start to give way before
    // they are close.
    let sx = flyers[0].x - flyers[1].x;
    let sy = flyers[0].y - flyers[1].y;
    let sz = flyers[0].z - flyers[1].z;
    let sep = Math.hypot(sx, sy, sz);
    if (sep < GIVE_WAY + 30) {
      const a = flyers[0];
      const b = flyers[1];
      const ca = Math.cos(a.gamma) * a.speed;
      const cb = Math.cos(b.gamma) * b.speed;
      const vx = ca * Math.sin(a.heading) - cb * Math.sin(b.heading);
      const vy = Math.sin(a.gamma) * a.speed - Math.sin(b.gamma) * b.speed;
      const vz = ca * Math.cos(a.heading) - cb * Math.cos(b.heading);
      const x0 = sx;
      const y0 = sy;
      const z0 = sz;
      for (let k = 1; k <= 3; k++) {
        const t = 0.5 * k;
        const px = x0 + vx * t;
        const py = y0 + vy * t;
        const pz = z0 + vz * t;
        // What is further off in time counts as a little further off in space.
        const d = Math.hypot(px, py, pz) + 1.5 * t;
        if (d < sep) {
          sep = d;
          sx = px;
          sy = py;
          sz = pz;
        }
      }
    }
    if (sep < GIVE_WAY) {
      const push = (GIVE_WAY - sep) * 2.4;
      // The one that is higher now stays the higher one.
      const upward = flyers[0].y >= flyers[1].y ? 1 : -1;
      const flat = Math.hypot(sx, sz);
      for (let i = 0; i < 2; i++) {
        const sign = i === 0 ? 1 : -1;
        this.carrots[i][1] += sign * upward * push;
        if (flat > 0.5) {
          this.carrots[i][0] += ((sign * sx) / flat) * push * 0.6;
          this.carrots[i][2] += ((sign * sz) / flat) * push * 0.6;
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const f = flyers[i];
      // Where to look: at the viewer when close, otherwise the chaser watches the leader.
      let look = null;
      if (near[i] < 75) look = VIEWER;
      else if ((i === 0 ? 1 : -1) !== this.lead && !this.jobs[i]) look = [flyers[1 - i].x, flyers[1 - i].y, flyers[1 - i].z];
      f.step(dt, this.carrots[i], this.wantSpeed[i], look);
      if (f.beatNow > 0) this.events.push({ type: 'beat', dragon: i, strength: f.beatNow });
    }

    this.separation = Math.hypot(flyers[0].x - flyers[1].x, flyers[0].y - flyers[1].y, flyers[0].z - flyers[1].z);
  }

  /** The distance along the path, between s0 and s1, of the point nearest to a flyer. */
  project(f, s0, s1) {
    let best = Infinity;
    let at = s0;
    const lo = Math.max(s0, this.base);
    for (let s = lo; s <= s1; s += 3) {
      this.pointAt(s, TMP);
      const d = (TMP[0] - f.x) * (TMP[0] - f.x) + (TMP[1] - f.y) * (TMP[1] - f.y) + (TMP[2] - f.z) * (TMP[2] - f.z);
      if (d < best) {
        best = d;
        at = s;
      }
    }
    const from = at - 2.5;
    for (let s = from; s <= from + 5; s += 0.5) {
      this.pointAt(s, TMP);
      const d = (TMP[0] - f.x) * (TMP[0] - f.x) + (TMP[1] - f.y) * (TMP[1] - f.y) + (TMP[2] - f.z) * (TMP[2] - f.z);
      if (d < best) {
        best = d;
        at = s;
      }
    }
    return at;
  }

  /**
   * The speed the lane allows at s: its own, or less if a slower stretch is close enough that
   * the dragon must already be slowing down for it.
   */
  allowedSpeed(s) {
    let v = this.speedAt(s);
    for (let d = 12; d <= 72; d += 12) {
      const ahead = this.speedAt(s + d);
      const can = Math.sqrt(ahead * ahead + 2 * 2.4 * d);
      if (can < v) v = can;
    }
    return v;
  }

  /** Carrot and speed for a dragon that has been called. Returns the speed to fly at. */
  flyPast(i, job, dt, toViewer) {
    const f = this.flyers[i];
    const carrot = this.carrots[i];
    job.t += dt;
    if (job.phase === 'come') {
      carrot[0] = job.pass[0];
      carrot[1] = job.pass[1];
      carrot[2] = job.pass[2];
      const d = Math.hypot(job.pass[0] - f.x, job.pass[2] - f.z);
      // It was called from wherever it happened to be, and has to turn before it can come:
      // the line it will arrive on is not known at first. The plan is brought up to date as
      // it comes, until it is close.
      job.replan -= dt;
      if (job.replan <= 0 && d > 42) {
        job.replan = 0.4;
        const vx = VIEWER[0] - f.x;
        const vz = VIEWER[2] - f.z;
        const vl = Math.hypot(vx, vz) || 1;
        const plan = planPass(vx / vl, vz / vl, f.size, job.side);
        job.pass = plan.point;
        job.turn = plan.turn;
        job.side = plan.side;
      }
      if (!job.roared && d < 95) {
        job.roared = true;
        this.roar(i, 'call');
      }
      if (d < 24 || job.t > 40) {
        // Close: keep the line it is on, straight through the point beside the viewer, and
        // then out the way that was planned.
        job.phase = 'go';
        job.t = 0;
        const h = f.heading;
        job.dir = [Math.sin(h), Math.cos(h)];
        job.exit = [Math.sin(h + job.turn), Math.cos(h + job.turn)];
        this.events.push({ type: 'pass', dragon: i });
      }
      // Fast on the way in, slow enough over the ledge to be seen.
      return d > 90 ? 27 : lerp(14.5, 27, clamp((d - 30) / 60, 0, 1));
    }
    // 'go': through the point, on past the viewer, then back to the other dragon.
    const gone = (f.x - job.pass[0]) * job.dir[0] + (f.z - job.pass[2]) * job.dir[1];
    if (gone < 0) {
      // Not there yet. The point it chases is kept close in front of it, so that it does not
      // start climbing for the trees beyond until it has gone by.
      carrot[0] = job.pass[0] + job.dir[0] * 8;
      carrot[1] = job.pass[1];
      carrot[2] = job.pass[2] + job.dir[1] * 8;
    } else {
      carrot[0] = job.pass[0] + job.exit[0] * 90;
      carrot[1] = job.pass[1] + 6;
      carrot[2] = job.pass[2] + job.exit[1] * 90;
    }
    const out = (f.x - job.pass[0]) * job.exit[0] + (f.z - job.pass[2]) * job.exit[1];
    if (out > 48 || job.t > 12) this.jobs[i] = null;
    return toViewer < 30 ? 15 : 21;
  }

  roar(i, kind) {
    this.flyers[i].roar = ROAR_SECONDS;
    this.events.push({ type: 'roar', dragon: i, kind });
  }

  /** Hand back what has happened since the last time, and forget it. */
  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
