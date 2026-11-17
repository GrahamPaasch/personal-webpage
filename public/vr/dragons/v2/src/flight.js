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
 *             glides when it does not, sets them (spread, cupped, still) where the lane says
 *             so, and pulls up for rising ground. Its path is what gives the motion weight;
 *             the lanes only say where to go.
 */

import {
  clearHeight, ground, forestDensity, lakeDistance, lakePoint, LAKE, LAKE_LEVEL, TREE_MAX, HERO_TREES, GROVE, GROVE_REACH, HeightGrid,
  SUN_DIR,
} from './world.js';
import { makeRng, clamp, lerp, smoothstep } from './rng.js';

const G = 9.81;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
/**
 * The bank the lanes are planned for; the flyer can bank harder (BANK_MAX) when it has to.
 * (It was 40 degrees for the first, smaller pair. The lanes are the same, so these two take
 * their bends more slowly: an animal twenty metres across does not flick round a corner.)
 */
const PLAN_BANK = 34 * DEG;
/** No lane asks for less speed than this (m/s). */
const SLOWEST = 12.5;

/** Where the viewer's head is taken to be. */
export const VIEWER = [0, 1.62, 0];
/**
 * No dragon's body comes nearer to the viewer's head than this (metres). It was 9 m when the
 * big one was 13.6 m across; at 19.7 m its wing is 10 m long, and the body keeps that much
 * further off. (How near a wingtip comes is measured too: see rig.js, reach, and the tests.)
 */
export const KEEP_OUT = 11;
/** The flight floor's dome over the viewer is a little bigger, because a dragon follows the floor loosely. */
const DOME = KEEP_OUT + 1.2;
/**
 * And it has a brim. A body that keeps outside the dome can still point a wing ten metres long
 * at the viewer's head. So wherever a dragon is within BRIM_IN metres of the viewer in plan it
 * flies HEAD_ROOM metres higher than the dome alone would ask (its wing then goes over their
 * head, not at it), easing to nothing BRIM_OUT metres out, where the lanes across the front of
 * the ledge run.
 */
const BRIM_IN = 13;
const BRIM_OUT = 17.5;
const HEAD_ROOM = 5;
/** A dragon within this of the viewer is close enough to be worth watching (metres). */
export const NEAR_RANGE = 80;

const wrap = (a) => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};

/**
 * A grid of the lowest height a dragon's body may fly at, room to spare included: 3.8 m over
 * open water, 6.5 m over bare ground, and over forest 6.5 m above the tallest tree that may
 * stand there. A tree's crown reaches several metres out from its trunk, so "forest" is spread
 * 10 m outward before the heights are taken: the edge of a gap is where the leaves end, not
 * where the trunks do.
 */
/**
 * How far out from a crown by the ledge the body keeps, for its wings (metres): four fifths of
 * the big dragon's half span of 9.9 m (a wing is seldom flat out toward a tree).
 */
const WING_ROOM = 8;
/** How high over open water the body keeps (metres): on the downstroke a wingtip is 5 m under it, but low over the lake the wings are set. */
const WATER_ROOM = 3.8;
/** Beyond this far from the viewer none of the trees by the ledge can count (metres). */
const HERO_REACH = HERO_TREES.reduce((most, t) => Math.max(most, Math.hypot(t.x, t.z) + t.radius), 0) + WING_ROOM + 13;
/**
 * The big trees by the creek are flown between and under, a long way from the viewer, on lanes
 * drawn to the metre: there the room kept for a wing is less, as it was drawn.
 */
const GROVE_WING = 5.5;
/** Beyond this far from the grove's last crown none of its trees can count (metres): a wing's room, and the 13 m the limit takes to fall from a treetop to the creek. */
const GROVE_ROOM = GROVE_WING + 13;
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
      grid.data[k] = base[k] + trees + (water[k] && trees === 0 ? WATER_ROOM : 6.5);
    }
  }
  floorCache = grid;
  return grid;
}

/**
 * The lowest height a dragon's body may fly at over a point: the grid above, the hand-placed
 * trees by the ledge, and a dome (with a brim) around the viewer.
 */
export function flightFloor(x, z) {
  let h;
  if (Math.abs(x) < FLOOR_HALF && Math.abs(z) < FLOOR_HALF) h = floorGrid().at(x, z);
  else h = clearHeight(x, z) + 6.5;
  const r2 = x * x + z * z;
  if (r2 < HERO_REACH * HERO_REACH) {
    for (let i = 0; i < HERO_TREES.length; i++) {
      const t = HERO_TREES[i];
      const d = Math.hypot(x - t.x, z - t.z);
      // Clear air over each crown and for a wing's length round it, so that a dragon going by
      // beside the tree does not sweep a wing through its leaves. Further out the tree does
      // not count: the lanes that pass below the ledge fly under and in front of these crowns.
      const top = t.height + 3 - Math.max(d - t.radius - WING_ROOM, 0) * 3;
      if (top > h) h = top;
    }
    if (r2 < BRIM_OUT * BRIM_OUT) {
      const dome = VIEWER[1] + Math.sqrt(Math.max(DOME * DOME - r2, 0)) + 0.3 + HEAD_ROOM * (1 - smoothstep(BRIM_IN, BRIM_OUT, Math.sqrt(r2)));
      if (dome > h) h = dome;
    }
  }
  // The big trees by the creek, by the same rule. (The forest's grid above knows nothing of
  // them: they stand far taller than it allows for.)
  const gx = x - GROVE_REACH.x;
  const gz = z - GROVE_REACH.z;
  const reach = GROVE_REACH.radius + GROVE_ROOM;
  if (gx * gx + gz * gz < reach * reach) {
    for (let i = 0; i < GROVE.length; i++) {
      const t = GROVE[i];
      const d = Math.hypot(x - t.x, z - t.z);
      const top = t.height + 3 - Math.max(d - t.radius - GROVE_WING, 0) * 3;
      if (top > h) h = top;
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
  low: { p: lake(-85, -4, -41), dir: [-LAKE.ux, 0, -LAKE.uz] },
  // Heading out: away from the viewer.
  out: { p: lake(-48, 60, -11), dir: [LAKE.ux, 0, LAKE.uz] },
};

export class Lane {
  /**
   * points: [x, y, z, speed (m/s), tight (0 or 1), set (0 or 1)] between the two nodes, which
   * are added here. `set` marks a stretch flown with the wings set, not beating: a glide past
   * something close, where a downstroke would bring a wingtip too near it.
   * tight marks places with no room to either side (the gaps in the trees, the dive past the
   * viewer's shoulder): the dragons fly those in single file. A place with rock on one side and
   * open air on the other (the front of the ledge) is not tight: see Director.step.
   * options: { weight, near, away, kin }.
   */
  constructor(name, from, to, points, options) {
    const o = options || {};
    this.name = name;
    this.from = from;
    this.to = to;
    this.weight = o.weight === undefined ? 1 : o.weight;
    this.gap = o.gap || 0; // how far apart the pair should be here, if the lane cares
    this.near = !!o.near; // comes close to the viewer
    this.away = !!o.away; // goes a long way off, and stays there a while
    this.kin = o.kin || ''; // lanes that end the same way share a name here
    const a = NODES[from];
    const b = NODES[to];
    const speedIn = points.length ? points[0][3] : 21;
    const speedOut = points.length ? points[points.length - 1][3] : 21;
    const lead = 42;
    const ctrl = [
      [a.p[0] - a.dir[0] * lead, a.p[1], a.p[2] - a.dir[2] * lead, speedIn, 0, 0],
      [a.p[0], a.p[1], a.p[2], speedIn, 0, 0],
      ...points.map((p) => [p[0], p[1], p[2], p[3] || 21, p[4] || 0, p[5] || 0]),
      [b.p[0], b.p[1], b.p[2], speedOut, 0, 0],
      [b.p[0] + b.dir[0] * lead, b.p[1], b.p[2] + b.dir[2] * lead, speedOut, 0, 0],
    ];
    this.control = ctrl;
    // Catmull-Rom through the control points (from the second to the second last), sampled
    // every couple of metres and indexed by distance travelled.
    const xs = [];
    const ys = [];
    const zs = [];
    const vs = [];
    const ts = [];
    const gs = [];
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
        gs.push(lerp(p1[5], p2[5], t));
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
    // The most speed the bend of the lane allows at each sample, at a bank of PLAN_BANK.
    const cs = new Float64Array(count).fill(99);
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
      cs[i] = Math.min(can, 99);
      if (can < vs[i]) vs[i] = Math.max(can, SLOWEST);
    }
    this.cs = cs;
    this.vs = Float64Array.from(vs);
    this.ts = Float64Array.from(ts);
    this.gs = Float64Array.from(gs);
    this.ss = Float64Array.from(ss);
    this.length = length;
    // Where the last stretch flown with set wings ends (0: the lane has none).
    this.setEnd = 0;
    for (let i = 0; i < gs.length; i++) if (gs[i] > 0) this.setEnd = ss[i];
    // How long the lane takes at its own pace, and how much of that is spent far from the
    // viewer before it first comes within NEAR_RANGE (`lead`) and after it last does (`tail`).
    // A lane that never comes that close is all lead and all tail.
    let time = 0;
    let first = -1;
    let last = 0;
    for (let i = 0; i < count; i++) {
      if (Math.hypot(xs[i] - VIEWER[0], ys[i] - VIEWER[1], zs[i] - VIEWER[2]) < NEAR_RANGE) {
        if (first < 0) first = time;
        last = time;
      }
      if (i + 1 < count) time += (ss[i + 1] - ss[i]) / ((vs[i] + vs[i + 1]) / 2);
    }
    this.time = time;
    this.visits = first >= 0; // does it come close at all?
    this.lead = this.visits ? first : time;
    this.tail = this.visits ? time - last : time;
  }

  /**
   * Find distance s on the lane: leaves the index of the sample at or before it in this.at and
   * how far toward the next one in this.frac. (Kept in fields, not returned: this is asked a
   * couple of hundred times a frame, and a headset should not be given garbage to collect.)
   */
  locate(s) {
    const ss = this.ss;
    const n = ss.length;
    if (s <= 0) {
      this.at = 0;
      this.frac = 0;
      return;
    }
    if (s >= this.length) {
      this.at = n - 2;
      this.frac = 1;
      return;
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ss[mid] <= s) lo = mid;
      else hi = mid;
    }
    this.at = lo;
    this.frac = (s - ss[lo]) / Math.max(ss[lo + 1] - ss[lo], 1e-9);
  }

  pointAt(s, out) {
    this.locate(s);
    const i = this.at;
    const f = this.frac;
    out[0] = lerp(this.xs[i], this.xs[i + 1], f);
    out[1] = lerp(this.ys[i], this.ys[i + 1], f);
    out[2] = lerp(this.zs[i], this.zs[i + 1], f);
    return out;
  }

  speedAt(s) {
    this.locate(s);
    return lerp(this.vs[this.at], this.vs[this.at + 1], this.frac);
  }

  tightAt(s) {
    this.locate(s);
    return lerp(this.ts[this.at], this.ts[this.at + 1], this.frac);
  }

  /** How far the wings are meant to be set (not beating) at s: 0 or 1, and between at the ends of such a stretch. */
  setAt(s) {
    this.locate(s);
    return lerp(this.gs[this.at], this.gs[this.at + 1], this.frac);
  }

  /** The most speed the lane's bend allows at s, at the bank the lanes are planned for (99: it is straight). */
  bendSpeedAt(s) {
    this.locate(s);
    return Math.min(this.cs[this.at], this.cs[this.at + 1]);
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
 * than 35 degrees. (At the speeds the lanes end up with, the hardest turn takes 41.)
 */

// The last stretch of the lanes that come back from the gorge side: round to the right and out.
const FROM_RIGHT = [
  [150, 18, -82, 21],
  [104, 4, -92, 21],
  [70, -4, -104, 21],
  [52, -8, -130, 21],
];
// The last stretch of the lanes that go round to the right of the ledge: over the far bank of
// the creek and out over the lake.
const FROM_FLATS = [
  [101, 4, -70, 20],
  [79, -2, -100, 21],
  [56, -8, -130, 21],
];
// The last stretch of the lanes that leave past the left of the ledge: out along the west shore
// and round to the right over the lake.
const FROM_LEDGE_LEFT = [
  [-70, 9, -30, 19],
  [-94, 4, -54, 20],
  [-110, -2, -88, 21],
  [-112, -7, -124, 21],
  [-104, -11, -158, 21],
  [-80, -13, -180, 21],
  [-50, -14.5, -172, 20],
  [-34, -15, -146, 20],
];
// The dive over the viewer's right shoulder, from over the trees behind them down into the
// valley: the end of the lanes that come round behind.
const OVER_SHOULDER = [
  [40, 38, 76, 17],
  [34, 36, 60, 16, 1],
  [25, 30.5, 46, 15.5, 1],
  [18, 21, 30, 15.5, 1],
  [14.5, 14.5, 13, 16, 1],
  [10.5, 9.6, -7, 17.5, 1],
  [2, 1.5, -29, 20, 1],
  [-9, -12.5, -58, 24],
  [-6, -18, -98, 23],
  [18, -17, -120, 21],
  [38, -14, -142, 21],
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
    ...ring(NODES.in.p[0] + 42, NODES.in.p[2], 42, 180, 720, 45, -15, 10, 16).slice(1),
    [NODES.in.p[0] + 79, 0, NODES.in.p[2] - 24, 18],
  ], { weight: 0.9, near: true }),

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

  // In from the lake, a turn, and straight across the front of the ledge at eye level; then
  // round to the left over the flats and the big trees by the creek, and out over the lake.
  new Lane('cross', 'in', 'out', [
    [-33, -12, -92, 20],
    [-40, -7, -66, 18],
    [-44, -2, -44, 16],
    [-38, 2, -29, 15],
    [-22, 4.2, -20, 15],
    [0, 5, -16.8, 15],
    [27, 6.2, -13, 15],
    [56, 8.5, -2, 16],
    [84, 11, 2, 17],
    [106, 12, -14, 18],
    [112, 10, -42, 19],
    ...FROM_FLATS,
  ], { weight: 2.4, near: true, kin: 'across' }),

  // The same way in, but lower: it passes under the ledge, and the viewer looks down on its
  // back. (Not so close under that the rim of the ledge hides it: see the tests.)
  new Lane('under', 'in', 'out', [
    [-34, -13, -92, 20],
    [-43, -12, -72, 18],
    [-48.5, -12, -56, 17],
    [-47, -12, -44.5, 16],
    [-41.4, -12, -36.6, 16],
    [-33, -12.2, -31, 16],
    [-23, -12.4, -29, 16],
    [-2, -12.5, -29.5, 16],
    [26, -12.5, -24.5, 16],
    [50, -10, -12, 17],
    [76, -5, -3, 17],
    [100, 2, -11, 18],
    [110, 5, -38, 19],
    ...FROM_FLATS,
  ], { weight: 1.6, near: true }),

  // Round behind the viewer over the plateau, then down over their right shoulder into the valley.
  new Lane('shoulder', 'in', 'out', [
    [-42, -9, -88, 21],
    [-70, -1, -52, 20],
    [-92, 10, -14, 19],
    [-98, 29, 28, 18],
    [-82, 39, 66, 18],
    [-48, 41, 92, 18],
    [-8, 42, 104, 17],
    [16, 42, 103, 17],
    [35, 40.5, 93, 17],
    ...OVER_SHOULDER,
  ], { weight: 1.5, near: true, kin: 'dive' }),

  // Down to the valley floor on the left and away along the grassy gap between the trees; a
  // climbing turn at its end, back along the foot of the bluff, and across the front of the ledge.
  new Lane('meadow', 'in', 'out', [
    [-31, -20.5, -103, 19],
    [-35, -27, -87, 18],
    [-43.5, -32.2, -72, 17, 1],
    [-60, -33.5, -61, 16, 1],
    [-84, -33.5, -55, 16, 1],
    [-130, -33.5, -58, 16, 1],
    [-176, -32, -45.5, 16, 1],
    [-210, -19, -36, 16, 1],
    [-234, -6, -16, 17],
    [-232, 3, 14, 17],
    [-208, 8, 40, 17],
    [-170, 11, 48, 18],
    [-130, 12, 34, 18],
    [-96, 10, 12, 18],
    [-70, 8, -4, 17],
    [-46, 6, -15, 16],
    [-24, 4.8, -19.5, 15],
    [0, 5, -16.8, 15],
    [27, 6.2, -13, 15],
    [56, 8.5, -2, 16],
    [84, 11, 2, 17],
    [106, 12, -14, 18],
    [112, 10, -42, 19],
    ...FROM_FLATS,
  ], { weight: 0.8, near: true, kin: 'across' }),

  // Low up the creek under the big trees and out through the gorge on the right; up out of it
  // behind the bluff, round over the trees at the viewer's back, and down over their right shoulder.
  new Lane('gorge', 'in', 'out', [
    [-26.5, -20.5, -103, 19],
    [-18, -27, -87, 18],
    [-5, -32, -75, 17, 1],
    [14, -34.3, -68.5, 17, 1],
    [36, -35.2, -70, 17, 1],
    [60, -35, -69.5, 17, 1],
    [98, -32.5, -49, 17, 1],
    [124.5, -27, -9, 17, 1],
    [140, -17, 38, 17, 1],
    [154, -5, 70, 17],
    [154, 9, 102, 17],
    [138, 23.5, 128, 17],
    [108, 37.5, 143, 17],
    [78, 42, 134, 17],
    [56, 41.5, 104, 17],
    ...OVER_SHOULDER,
  ], { weight: 0.9, near: true, kin: 'dive' }),

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
      // (Wider on the right, round the tall pine that stands below the ledge there.)
      const r = i === 2 || i === 3 ? 47 : i === 1 || i === 4 ? 44 : 42;
      return [Math.cos(a) * r, y, -Math.sin(a) * r, 16, 0];
    }),
    [-8, 3, -56, 18],
    [16, -4, -92, 20],
    [36, -9, -130, 21],
  ], { weight: 2, near: true }),

  // From a skim: up the face of the bluff, rising in front of the ledge, and off to the left.
  new Lane('rise', 'low', 'in', [
    [-10, -40.2, -108, 23],
    [-6, -36, -92, 21],
    [-3, -26, -74, 19],
    [-1.5, -16, -57, 17],
    [-2, -6, -41, 15],
    [-8, 3.5, -27, 14],
    [-22, 9, -18.5, 14],
    [-44, 11.5, -19, 16],
    ...FROM_LEDGE_LEFT,
  ], { weight: 1, near: true }),

  // Through the big trees at the mouth of the creek, at the height of their crowns: the one
  // place where the dragons are seen to fly THROUGH the forest, behind one crown and out from
  // behind the next. Then a climbing turn over the flats on the right, and back across the front
  // of the ledge from right to left.
  new Lane('narrows', 'in', 'in', [
    [-25.5, -17.5, -102, 19],
    [-16, -20, -85, 18],
    [-1, -21.4, -74.5, 17, 1],
    [18, -21.5, -70.3, 16, 1],
    [38, -21.5, -70, 16, 1],
    [58, -21, -69, 16, 1],
    [77, -19.5, -59.5, 16, 1],
    [94, -16, -47, 16, 1],
    [110, -10, -30, 16],
    [114, -3, -9, 16],
    [102, 3, 9, 16],
    [80, 7, 14, 16],
    [56, 9, 6, 16],
    [30, 7.5, -11, 15],
    [3, 5.6, -16.8, 15],
    [-20, 5.6, -19.5, 15],
    [-44, 8, -23, 16],
    ...FROM_LEDGE_LEFT,
  ], { weight: 2.2, near: true }),

  // Out over the lake and straight back: a tight turn, the usual way round.
  new Lane('turn', 'out', 'in', [
    [44, -11.5, -186, 19],
    [30, -12.5, -204, 17],
    [8, -13.5, -209, 17],
    [-14, -14.2, -196, 17],
    [-25, -14.8, -172, 18],
    [-29, -15, -145, 20],
  ], { weight: 3 }),

  // Out over the lake and a wide turn back.
  new Lane('far turn', 'out', 'in', [
    [44, -10, -200, 21],
    [30, -8, -238, 21],
    [4, -5, -262, 21],
    [-30, -5, -266, 21],
    [-58, -8, -244, 21],
    [-62, -12, -205, 21],
    [-46, -15, -164, 21],
  ], { weight: 1.2 }),

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
  ], { weight: 0.5, away: true }),

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
  ], { weight: 0.3, away: true }),

  // The far turn again, but dropping to the water: the start of a skim toward the viewer.
  new Lane('skim', 'out', 'low', [
    [44, -11, -200, 21],
    [30, -13, -240, 21],
    [4, -17, -266, 21],
    [-28, -24, -270, 21],
    [-52, -32, -250, 21],
    [-58, -38.5, -214, 22],
    [-42, -40.6, -172, 24],
  ], { weight: 2 }),

  // The stoop. Up into the sun over the far end of the lake (from the ledge the top of the
  // climb is just over the sun's disc), wings folded, and down through the disc at forty
  // degrees to the water; out of the dive with the spine arched, and in low over the sun's
  // path on the lake, straight for the bluff. (What comes next is always `rise`.)
  new Lane('stoop', 'out', 'low', [
    [45, -6, -196, 21],
    [32, 6, -226, 20],
    [8, 20, -246, 19],
    [-22, 32, -246, 18],
    [-44, 40, -228, 17],
    [-52, 38, -206, 19],
    [-44, 12, -177, 26],
    [-33, -22, -152, 26],
    [-22, -37.5, -136, 25],
  ], { weight: 1.5 }),

  // The sweep. In from the lake and up over the ledge on its left, high; round to the right
  // over the trees behind; then down over the viewer's right shoulder in one long swoop, with
  // the wings set and cupped to slow it: the big one's wing goes over the viewer's head. On
  // out over the valley it crosses the sun's disc, sixty metres off, before it turns away
  // over the lake. This is the close pass of the opening, and it comes round again by chance.
  // (It is marked tight from the top of the climb, long before the gap it comes down through:
  // the swoop is flown one behind the other, and the two need that long to fall into line.)
  new Lane('sweep', 'in', 'out', [
    [-30, -4, -84, 19],
    [-33, 12, -46, 18],
    [-36, 28, -8, 17, 1],
    [-35, 38, 28, 17, 1],
    [-31, 41, 58, 16, 1],
    [-23, 42, 78, 16, 1],
    [-5, 42, 86, 16, 1],
    [13, 40.5, 78, 16, 1],
    [20, 37.5, 66, 15, 1],
    [20.6, 33.2, 51.5, 14.5, 1, 1],
    [17.6, 23, 35, 14, 1, 1],
    [14.2, 15, 14.5, 13, 1, 1],
    [12.5, 11.3, 3, 13, 1, 1],
    [10.8, 9.6, -8, 13, 1, 1],
    [5.5, 8.3, -23, 13.5, 1, 1],
    [-2, 7.9, -40, 14],
    [-12.5, 8.6, -59, 15],
    [-21, 7, -84, 17],
    [-21, 1, -108, 19],
    [-8, -6, -128, 20],
    [14, -10.5, -138, 21],
    [34, -12, -146, 21],
  ], { weight: 1.3, near: true, kin: 'over' }),
];

const laneByName = (name) => LANES.find((l) => l.name === name);

/** The lanes that leave each node. */
const LANES_FROM = {};
for (const l of LANES) (LANES_FROM[l.from] || (LANES_FROM[l.from] = [])).push(l);

/**
 * From each node, the least time that has to pass far from the viewer before a dragon can be
 * close again (seconds): straight into a lane that comes close, or round by one that does not.
 */
const WAY_BACK = {};
for (const k of Object.keys(NODES)) WAY_BACK[k] = Infinity;
for (let n = 0; n < 4; n++) for (const l of LANES) WAY_BACK[l.from] = Math.min(WAY_BACK[l.from], l.visits ? l.lead : l.time + WAY_BACK[l.to]);

/**
 * Pacing. Half a minute of two specks over the far end of the lake is a long time in a headset,
 * so the lanes are not strung together blindly:
 *   - no stretch longer than LULL_MAX seconds (at the lanes' own pace) is planned with both
 *     dragons further off than NEAR_RANGE, while there is another lane to choose;
 *   - a lane that goes a long way off (`away`) may stretch that to LULL_AWAY, but there are
 *     never two of them within three lanes, and none in the first minutes;
 *   - no lane that comes close is flown again within three lanes, nor one that ends the same way.
 */
const LULL_MAX = 44;
const LULL_AWAY = 56;
const AWAY_AFTER = 210;

/**
 * How the piece begins, which is the same every time. The two are coming in out of the sunset
 * from the far end of the lake as it opens. They go up over the ledge, round behind it, and
 * sweep back down over the viewer's right shoulder and out across the sun: half a minute in,
 * the big one's wing has been over the viewer's head. A turn over the lake, the figure of
 * eight in front of the ledge, the stoop through the sun to the water, and up the face of the
 * bluff. After that the lanes are chosen by chance.
 */
const OPENING = ['far turn', 'sweep', 'turn', 'eight', 'stoop', 'rise'];
/** How far along the first lane the pair starts (metres). */
const OPENING_START = 150;
/** When the big one first roars (seconds in): 90 m out and coming, a little to the left of the sun. */
const OPENING_ROAR = 9.2;

// ---------------------------------------------------------------------------------------------
// The flyer
// ---------------------------------------------------------------------------------------------

/** Slower than this (m/s) a dragon cannot glide: it beats its wings to stay up, this hard at most. */
const LIFT_BELOW = 17.6;
const LIFT_BEAT = 0.62;
const BANK_MAX = 58 * DEG;
/** How far ahead its own turn is counted when it steers, in units of the time its roll takes (see Flyer.step). */
const ROLL_LEAD = 1.5;
const ROLL_MAX = 80 * DEG; // per second, for a dragon of size 1 (see Flyer: the big one rolls more slowly)
const CLIMB_MAX = 38 * DEG;
const CLIMB_HARD = 58 * DEG; // only when the ground demands it
const DIVE_MAX = 42 * DEG;
const LOOK_TIMES = [0.45, 0.9, 1.5, 2.3, 3.2];

export class Flyer {
  /** spec: { beat: wingbeats a second, size: 1 for the big dragon } */
  constructor(spec, rng) {
    this.beat = spec.beat;
    this.size = spec.size;
    // Weight. A bigger animal answers more slowly: it takes longer to roll into a turn and out
    // of one, longer to get its wings going and to stop them. (1 for a dragon of size 1.)
    this.quick = 1 / Math.sqrt(Math.max(spec.size, 0.6));
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
    this.bearing = null; // where the carrot was last, off the nose (radians), and how fast that is changing
    this.swing = 0;
    this.gammaRate = 0;
    // What the rig needs.
    this.pitch = 0;
    this.flap = 0;
    this.power = 0; // how hard the wings are beating, as seen and heard: the greater of thrust and lift
    this.thrust = 0; // how hard it is pushing itself forward
    this.lift = 0; // how hard it has to beat just to stay up, flying slowly
    this.tuck = 0;
    this.brake = 0;
    this.turn = 0;
    this.arch = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.jaw = 0;
    this.flapping = true;
    this.set = 0; // how far the wings are set and cupped for a glide past something close, 0..1
    this.roar = 0; // seconds of roar left
    this.roarYaw = 0; // where the head points while it roars (radians off its line; positive: its left)
    this.cry = 0; // seconds left of a short call (the jaw opens; no fire)
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
    this.bearing = null;
    this.swing = 0;
  }

  /**
   * Chase a point. target: [x, y, z]; wantSpeed: m/s; look: [x, y, z] to look at, or null.
   * set: 0..1, how far the wings are to be set (see Lane): spread, cupped and still, however
   * slowly it is flying. That is how a big bird comes down to land, and how a dragon goes over
   * somebody's head: it is slow, it is quiet, and no downstroke brings a wingtip near them.
   */
  step(dt, target, wantSpeed, look, set) {
    const setWant = set || 0;
    this.set += (setWant - this.set) * (1 - Math.exp(-dt / 0.45));
    const glide = this.set;
    const dx = target[0] - this.x;
    const dy = target[1] - this.y;
    const dz = target[2] - this.z;
    const flat = Math.hypot(dx, dz);
    const v = Math.max(this.speed, 8);

    // --- Turning: bank toward the carrot; the turn comes from the bank. The bank comes slowly
    // (below), so the turn is judged from where the carrot will bear by the time it has come
    // (from how fast its bearing is changing): without that a slow roll chases the carrot
    // from side to side, and the dragon snakes. In a steady turn the bearing holds still, and
    // this changes nothing.
    const kb = 2.8 * this.quick;
    const bearing = wrap(Math.atan2(dx, dz) - this.heading);
    const swing = this.bearing === null ? 0 : clamp(wrap(bearing - this.bearing) / dt, -1.2, 1.2);
    this.swing += (swing - this.swing) * (1 - Math.exp(-dt / 0.15));
    this.bearing = bearing;
    const err = wrap(bearing + this.swing * (ROLL_LEAD / kb));
    const omegaMax = (G * Math.tan(BANK_MAX)) / v;
    // The carrot swings fast when it is close; ease off so the dragon does not snake.
    const gain = 1.5 * clamp(flat / 22, 0.35, 1);
    const omegaWant = clamp(gain * err, -omegaMax, omegaMax);
    const bankWant = Math.atan((omegaWant * v) / G);
    // A creature this size rolls like a big bird, not like a swallow, and the bigger of the
    // two more slowly than the smaller.
    const rollMax = ROLL_MAX * this.quick;
    this.bankRate += (kb * kb * (bankWant - this.bank) - 2 * kb * this.bankRate) * dt;
    this.bankRate = clamp(this.bankRate, -rollMax, rollMax);
    this.bank += this.bankRate * dt;
    this.omega = (G * Math.tan(this.bank)) / v;
    this.heading = wrap(this.heading + this.omega * dt);
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    // --- Up and down: aim at the carrot, but never into rising ground. The ground is checked
    // along the way it is about to fly: along the arc that ends at the carrot, as far round it
    // as it can have turned by then, and no further than the carrot (the lanes themselves are
    // clear, and in a winding gap a straight look ahead would see the trees on the outside of
    // the bend, and climb out of the gap for nothing).
    let gammaWant = clamp(Math.atan2(dy, Math.max(flat, 4)), -DIVE_MAX, CLIMB_MAX);
    let need = -Infinity;
    const reach = flat + 4;
    for (let i = 0; i < LOOK_TIMES.length; i++) {
      const t = LOOK_TIMES[i];
      const d = Math.max(Math.min(v * t, reach), 5);
      const bend = clamp(bearing * (d / reach), -omegaMax * t * 0.5, omegaMax * t * 0.5);
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
    if (setWant > 0.5) {
      // Wings set: no beating, whatever the speed.
      this.flapping = false;
    } else if (this.flapping) {
      if ((this.speed > wantSpeed + 1.1 && this.gamma < 0.07) || this.gamma < -0.2) this.flapping = false;
    } else if ((this.speed < wantSpeed - 1.1 && this.gamma > -0.16) || this.gamma > 0.11) {
      this.flapping = true;
      if (this.power < 0.2) this.flap = 5.3; // start with the wings coming up to the top
    }
    const soften = 1 - Math.exp(-dt / (0.3 / this.quick));
    const thrustWant = this.flapping ? clamp(0.55 + 1.7 * sinG + 0.06 * (wantSpeed - this.speed), 0.45, 1) * (1 - glide) : 0;
    this.thrust += (thrustWant - this.thrust) * soften;
    // A glide needs speed. Flying slowly (as it does wherever it is close to the ledge, to be
    // seen) an animal this size has to keep beating to stay up, whether or not it wants to go
    // faster: those beats hold it up and do not push it on. Not in a dive, and not with its
    // wings set (then it is coming down, and that is what holds its speed).
    const liftWant = this.gamma > -0.2 && setWant < 0.5 ? LIFT_BEAT * clamp((LIFT_BELOW - this.speed) / 2.2, 0, 1) * (1 - glide) : 0;
    this.lift += (liftWant - this.lift) * soften;
    this.power = Math.max(this.thrust, this.lift);
    // Too fast for what is coming: wings up and cupped, like a goose landing. With the wings
    // set they are cupped a little all the time, and more the faster it is going.
    let brakeWant = this.speed > wantSpeed + 1.2 ? clamp((this.speed - wantSpeed - 1.2) / 2.8, 0, 1) : 0;
    brakeWant = Math.max(brakeWant, glide * clamp(0.3 + (this.speed - wantSpeed) / 2.5, 0.22, 1));
    this.brake += (brakeWant - this.brake) * soften;
    // (Wings of that size, cupped, are a great deal of brake: enough to hold its speed down a
    // slope, so that it comes into a bend at the speed the bend was drawn for.)
    let accel = 2.7 * this.thrust - 0.0021 * this.speed * this.speed - 4.6 * this.brake - G * sinG * 0.55;
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
    // Wings swept back in a dive; not while they are set, which is the opposite of a dive.
    const tuckWant = smoothstep(0.26, 0.62, -this.gamma) * (1 - glide);
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
    // A roar (and the fire that comes with it) goes out ahead, head up and turned a little to
    // the side the director chose, whoever it was looking at.
    if (this.roar > 0) {
      yawWant = this.roarYaw;
      pitchWant = 0.12;
    }
    const turnHead = 1 - Math.exp(-dt / 0.3);
    this.lookYaw += (yawWant - this.lookYaw) * turnHead;
    this.lookPitch += (pitchWant - this.lookPitch) * turnHead;

    // The jaw opens for a roar, and for a short call.
    if (this.roar > 0) this.roar = Math.max(0, this.roar - dt);
    if (this.cry > 0) this.cry = Math.max(0, this.cry - dt);
    let jawWant = this.roar > 0 ? Math.min(1, this.roar * 2.2) * Math.min(1, (ROAR_SECONDS - this.roar) * 6) : 0;
    if (this.cry > 0) jawWant = Math.max(jawWant, 0.75 * Math.min(1, this.cry * 5) * Math.min(1, (CRY_SECONDS - this.cry) * 9));
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
/** A short call (the answer to being called) lasts this long (seconds). */
export const CRY_SECONDS = 0.6;
/** How far a dragon can turn its head to one side while it roars. */
const ROAR_YAW = 36 * DEG;
/**
 * A called dragon needs CALL_ROOM metres of its line to turn onto it and come down it. The one
 * of the two that is best placed is the one called: out in front of the ledge between these two
 * bearings (radians right of straight ahead), at least that far off, and not high above it.
 */
const CALL_ROOM = 70;
/** ... and at that distance it may be no further than this to one side of the line (metres): from further off it would come in across the ledge, not past it. */
const CALL_ASIDE = 30;
/** ... and heading no further off the line than this (radians), or a little more from further out. */
const CALL_ACROSS = 65 * DEG;
const CALL_FROM = [-40 * DEG, 22 * DEG];
/** The lines a called dragon comes in along, in turn: where it comes from, in radians right of straight ahead. */
export const CALL_LINES = [-4 * DEG, -15 * DEG, 5 * DEG, -9 * DEG];
/** One that has no room to turn onto its line makes for a gate this far out along it first (metres), at this speed (m/s). */
const CALL_GATE = 96;
const CALL_SLOW = 17.5;
/** Within this of the point where it goes by (metres, over the ground) a called dragon glides with its wings set. */
const PASS_GLIDE = 58;
/** Going out to the gate from beside or behind the ledge, it flies at least this high (metres): over the pine. */
const CALL_OVER = 27;
/**
 * How far above the height of the pass the line in is, `along` metres before it (negative):
 * level for the last 20 m, and a slope of one in eight before that.
 */
const lineRise = (along) => clamp((-along - 20) * 0.125, 0, 14);

/**
 * Where a called dragon goes by. It comes straight at the ledge along (ux, uz), passes to one
 * side of the viewer, and may turn a little as it leaves. Which side, how far out, how high and
 * which way out is settled by what stands in the way: every combination is tried, each as low
 * as the flight floor along it allows (the dragon may still be coming down as it arrives, and
 * may climb steeply once it is past).
 *
 * The one that wins is the one that can be WATCHED best: about 14.5 m from the viewer's head,
 * and between 22 and 32 degrees above their eye level at its nearest, so that somebody looking
 * at it as it comes still has it in view as it goes by. (Nearer the zenith it leaves the top of
 * the picture just as it arrives; lower, its body would be level with the ledge.) From out over
 * the lake that is 13 m to the viewer's right and 6 or 7 m above their head.
 *
 * Returns { point: [x, y, z] beside the viewer, turn: radians to turn after it (positive: left),
 * near: metres from the viewer's head, side: +1 or -1, elevation: radians above eye level }.
 */
export function planPass(ux, uz, size, prefer) {
  const lowest = VIEWER[1] + PASS_OVER + 0.6 * size;
  const best = { point: [0, 0, 0], turn: 0, near: Infinity, side: 0, elevation: 0 };
  let least = Infinity;
  for (let k = -1; k <= 1; k += 2) {
    for (let i = 0; i < PASS_SIDES.length; i++) {
      const off = PASS_SIDES[i];
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
          // It takes a moment to get its nose up, and it is gliding: the climb counts from
          // 10 m past the point, and at one in three. (A way out that asks for more than
          // that is a way out it starts to climb for before it has gone by.)
          const need = flightFloor(px + ex * s, pz + ez * s) + 1 - Math.max(s - 10, 0) * 0.33;
          if (need > y) y = need;
        }
        const near = Math.hypot(off, y - VIEWER[1]);
        // Never planned nearer than the keep-out and the slack a dragon needs to hold a line.
        if (near < KEEP_OUT + 1.6) continue;
        const elevation = Math.atan2(y - VIEWER[1], off);
        const outside = Math.max(PASS_LOW - elevation, 0, elevation - PASS_HIGH) / DEG;
        // Straight on is preferred to a turn that gains next to nothing, and the side already
        // chosen (`prefer`, when the plan is being brought up to date) to one barely better.
        const cost = Math.abs(near - PASS_NEAR) + 0.6 * outside + Math.abs(turn) * 0.8 - (k === prefer ? 1.5 : 0);
        if (cost < least) {
          least = cost;
          best.near = near;
          best.side = k;
          best.turn = turn;
          best.elevation = elevation;
          best.point[0] = px;
          best.point[1] = y;
          best.point[2] = pz;
        }
      }
    }
  }
  return best;
}
/**
 * A called dragon's body is planned to pass this far from the viewer's head (metres), and no
 * lower over it than PASS_OVER. (Twelve metres, for the first pair; these two are half as big
 * again, and a wing ten metres long is to go over the viewer's head, not through it.)
 */
const PASS_NEAR = 14.5;
const PASS_OVER = 4;
/** ... and this far above their eye level, seen from where they stand. */
const PASS_LOW = 22 * DEG;
const PASS_HIGH = 32 * DEG;
const PASS_SIDES = [11, 12, 13, 14, 15, 16];
const PASS_TURNS = [0, 20 * DEG, -20 * DEG, 40 * DEG, -40 * DEG];

// ---------------------------------------------------------------------------------------------
// The director
// ---------------------------------------------------------------------------------------------

/**
 * How far ahead of each dragon its carrot runs (metres), and the least that is where the lane
 * bends hard: a point chased from far off is cut across to, and in the gaps between the trees
 * there is no room to cut a corner.
 */
const CARROT = 25;
const CARROT_BEND = 15;
/**
 * A dragon catching up may take a bend this much faster than the lane is planned for (which
 * takes a bank of 46 degrees where the lane asks for 34).
 */
const CATCH_UP_BEND = Math.sqrt(Math.tan(46 * DEG) / Math.tan(PLAN_BANK));
/**
 * How far ahead of the pair a tight place is seen coming (metres). It takes them that long to
 * fall into line: from side by side to one behind the other is forty metres to open up, at
 * the few metres a second by which one can outfly the other.
 */
const TIGHT_AHEAD = 100;
/**
 * How far each stands off from the lane when the two are side by side (metres), and how near
 * to each other the two may come before they give way (metres between their bodies). Both are
 * for a pair of sizes 1 and 0.78, as the first pair was, and grow with the pair (Director.room).
 */
const STAND_OFF = 8;
const GIVE_WAY = 12.5;
/** The two sizes those distances, and the figures of MODES, were drawn for, added up. */
const PAIR_DRAWN = 1.78;
const TMP = [0, 0, 0];
const TMP2 = [0, 0, 0];

/**
 * The figures the pair flies. `weight` is how often each is chosen; `close` and `far` scale that
 * for where the pair is going to be while it lasts: the figures that are worth watching (side by
 * side, one over the other, round each other) are kept for when they are close enough to be read,
 * and far off over the lake the two mostly follow one another.
 */
const MODES = [
  { name: 'trail', weight: 3, min: 8, max: 15, close: 0.3, far: 1.6 },
  { name: 'weave', weight: 3, min: 11, max: 16, close: 0.7, far: 1 },
  { name: 'wing', weight: 2.2, min: 8, max: 13, close: 2.2, far: 0.6 },
  { name: 'stack', weight: 1.4, min: 7, max: 11, close: 3, far: 0.6 },
  { name: 'helix', weight: 1.6, min: 12.5, max: 13.5, close: 2, far: 0.6 },
  { name: 'swap', weight: 1.6, min: 13, max: 15, close: 1, far: 1 },
];
/**
 * How fast the figures swing (radians a second). They are slow on purpose: a weave of eleven
 * metres to each side, once in twelve seconds, is flown at a bank of fifteen degrees, and the
 * two go round each other once in twelve. (Three times as fast, as they first were, each was
 * rolling from one wingtip to the other every three seconds: darting, not flying.)
 */
const WEAVE_RATE = 0.5;
const HELIX_RATE = 0.5;
/** Within this of the viewer (metres) the pair is close enough for its figures to be read; beyond FIGURES_FAR it is not. */
const FIGURES_CLOSE = 120;
const FIGURES_FAR = 135;
/**
 * Nearer to the viewer than SHY_FAR a figure may not bring a dragon closer in than the lane
 * runs; nearer than SHY_NEAR whatever it asks for on the viewer's side is flown on the other.
 */
const SHY_NEAR = 30;
const SHY_FAR = 52;
/** Where the lane runs within this of the viewer's head (metres), nothing sends a dragon nearer to them than the lane does. */
const CLOSE_LANE = 45;

export class Director {
  /**
   * builds: [{ beat, size }, { beat, size }] for the two dragons. seed: any integer; the same
   * seed always gives the same flight. options: { opening: the names of the lanes to begin with,
   * instead of the usual opening (the tools use it to look at one lane) }.
   */
  constructor(builds, seed, options) {
    this.builds = builds;
    this.seed = seed;
    // How much room this pair needs, against the pair the figures were drawn for: wings twice
    // as long need twice the distance between two bodies flying side by side.
    this.room = Math.max((builds[0].size + builds[1].size) / PAIR_DRAWN, 1);
    this.script = options && options.opening ? options.opening : OPENING;
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
    this.recent = []; // the last few lanes chosen, newest last
    this.lull = 0; // seconds planned far from the viewer at the end of the path so far
    this.planned = 0; // seconds of flight laid out so far
    this.opening = this.script.slice();
    this.center = OPENING_START; // how far along the path the middle of the pair is
    this.lead = 1; // +1: the first dragon is in front
    this.gap = 26 * this.room; // signed: positive when the first dragon is ahead
    this.offsets = [0, 0, 0, 0]; // sideways and up for each dragon, smoothed
    this.standOff = [0, 0, 0, 0]; // sideways and up for each dragon, to keep them apart
    this.axis = Math.PI / 2; // the direction they stand off along (see step)
    this.mode = { name: 'trail', t: 0, length: 8, side: 1 };
    this.jobs = [null, null]; // a fly-past in progress, per dragon
    this.calls = 0; // how many have been answered
    this.callAt = -100;
    this.busyAt = -100;
    // The first roar is part of the opening: the big one, as the two come in over the near
    // end of the lake under the sun, its fire against the sunset. After that, now and then.
    rng();
    this.nextRoar = OPENING_ROAR;
    this.roars = 0;
    this.events = [];
    this.spare = [];
    this.wants = [0, 0, 0, 0, 0, null];
    this.carrots = [[0, 0, 0], [0, 0, 0]];
    this.near = [0, 0]; // how far each is from the viewer
    this.under = [0, 0];
    this.wantSpeed = [20, 20];
    this.setWant = [0, 0]; // how far each is to set its wings (see Flyer.step)
    this.lanePoint = [[0, 0, 0, Infinity], [0, 0, 0, Infinity]]; // where on the lane each one's carrot hangs, and how far that is from the viewer
    this.along = [this.center + this.gap * 0.5, this.center - this.gap * 0.5]; // each one's place on the path
    this.on = [true, true]; // is it following the lane (or away on a call)?
    this.separation = Math.abs(this.gap);
    this.closest = Infinity; // nearest any dragon has come to the viewer
    this.extend();
    // The opening is flown in single file, the big one in front, as far as the end of the
    // swoop over the ledge: that pass is the one thing here that is staged, and it is staged
    // for one dragon at a time. After it the two fly their figures.
    this.fileUntil = 0;
    for (const e of this.path) {
      if (e.lane.setEnd > 0) {
        this.fileUntil = e.start + e.lane.setEnd + 20;
        break;
      }
    }
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
      const lane = this.opening.length ? laneByName(this.opening.shift()) : this.choose();
      this.path.push({ lane, start: this.end });
      this.end += lane.length;
      this.node = lane.to;
      this.last = lane.name;
      this.recent.push(lane);
      if (this.recent.length > 4) this.recent.shift();
      this.lull = lane.visits ? lane.tail : this.lull + lane.time;
      this.planned += lane.time;
    }
    // Forget lanes both dragons have left behind.
    while (this.path.length > 1 && this.path[1].start < this.center - 320) this.path.shift();
    this.base = this.path[0].start;
  }

  /**
   * How long both dragons would be far from the viewer if this lane came next: what is planned
   * already, and this lane's way in (or all of it, and the way back from where it ends).
   */
  lullWith(lane, lull) {
    return lull + (lane.visits ? lane.lead : lane.time + WAY_BACK[lane.to]);
  }

  /**
   * May this lane come next? `strict` 2: every rule of the pacing; 1: only the rules about going
   * far away; 0: anything but the lane just flown. `recent`: the lanes before it, newest last.
   */
  suits(lane, strict, recent, lull) {
    const n = recent.length;
    if (n && recent[n - 1] === lane) return false;
    if (strict >= 1 && lane.away) {
      if (this.planned < AWAY_AFTER) return false;
      for (let i = Math.max(n - 2, 0); i < n; i++) if (recent[i].away) return false;
    }
    if (strict >= 2) {
      for (let i = Math.max(n - 3, 0); i < n; i++) {
        if (lane.near && recent[i] === lane) return false;
        if (lane.kin && recent[i].kin === lane.kin) return false;
      }
      if (this.lullWith(lane, lull) > (lane.away ? LULL_AWAY : LULL_MAX)) return false;
    }
    // A lane that ends where only one lane leaves commits the pair to that one as well.
    const on = LANES_FROM[lane.to];
    if (on.length === 1 && on[0] !== lane) return this.suits(on[0], strict, recent.concat(lane), lane.visits ? lane.tail : lull + lane.time);
    return true;
  }

  /** Choose the next lane from where the path ends: by chance, among those the pacing allows. */
  choose() {
    const from = LANES_FROM[this.node];
    const roll = this.rng();
    for (let strict = 2; strict >= 0; strict--) {
      let total = 0;
      let quickest = Infinity;
      for (const l of from) {
        if (!this.suits(l, strict, this.recent, this.lull)) continue;
        total += l.weight;
        quickest = Math.min(quickest, this.lullWith(l, this.lull));
      }
      if (!(total > 0)) continue;
      // Nothing keeps to the time allowed (the last lane went a long way off): then the quick
      // ways back are the only ones considered.
      const hurry = strict < 2 && quickest > LULL_MAX;
      if (hurry) {
        total = 0;
        for (const l of from) if (this.suits(l, strict, this.recent, this.lull) && this.lullWith(l, this.lull) <= quickest + 4) total += l.weight;
      }
      let pick = roll * total;
      let lane = null;
      for (const l of from) {
        if (!this.suits(l, strict, this.recent, this.lull)) continue;
        if (hurry && this.lullWith(l, this.lull) > quickest + 4) continue;
        lane = l;
        pick -= l.weight;
        if (pick <= 0) break;
      }
      return lane;
    }
    return from[0];
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

  setAt(s) {
    const e = this.find(s);
    return e.lane.setAt(s - e.start);
  }

  bendSpeedAt(s) {
    const e = this.find(s);
    return e.lane.bendSpeedAt(s - e.start);
  }

  /**
   * How far ahead of a dragon at s its carrot runs: CARROT on the straight, and as little as
   * CARROT_BEND where the lane turns in less than thirty metres or so just ahead.
   */
  carrotAhead(s) {
    const bend = Math.min(this.bendSpeedAt(s + 6), this.bendSpeedAt(s + 14), this.bendSpeedAt(s + 22));
    const radius = (bend * bend) / (G * Math.tan(PLAN_BANK));
    return clamp(0.75 * radius, CARROT_BEND, CARROT);
  }

  /** How far the path is from the viewer's head at s (metres). */
  rangeAt(s) {
    const p = this.pointAt(s, TMP);
    return Math.hypot(p[0] - VIEWER[0], p[1] - VIEWER[1], p[2] - VIEWER[2]);
  }

  /** The names of the lanes being flown and coming up. */
  program() {
    return this.path.filter((e) => e.start + e.lane.length > this.center).map((e) => e.lane.name);
  }

  // --- Flying together ------------------------------------------------------------------------

  /**
   * Choose how the pair flies next. calm: a tight place is here or close, single file only.
   * soon: one is coming within a quarter of a minute, so nothing that takes long to undo.
   * range: how near the viewer the pair comes while the figure lasts (metres).
   */
  pickMode(calm, soon, range) {
    let name = 'trail';
    const where = range < FIGURES_CLOSE ? 'close' : range > FIGURES_FAR ? 'far' : '';
    if (!calm) {
      const ok = (m) => m.name !== this.mode.name && !(soon && (m.name === 'swap' || m.name === 'helix'));
      let total = 0;
      for (const m of MODES) if (ok(m)) total += m.weight * (where ? m[where] : 1);
      let pick = this.rng() * total;
      for (const m of MODES) {
        if (!ok(m)) continue;
        pick -= m.weight * (where ? m[where] : 1);
        if (pick <= 0) {
          name = m.name;
          break;
        }
      }
    }
    const def = MODES.find((m) => m.name === name);
    this.mode = { name, t: 0, length: lerp(def.min, def.max, this.rng()), side: this.rng() < 0.5 ? -1 : 1, where };
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
    const w = this.wants;
    // Distances are for the pair the figures were drawn for, and grow with this one.
    const k = this.room;
    const set = (gap, leaderSide, leaderUp, chaserSide, chaserUp, axis) => {
      w[0] = gap * k;
      w[1] = leaderSide * k;
      w[2] = leaderUp * k;
      w[3] = chaserSide * k;
      w[4] = chaserUp * k;
      w[5] = axis;
      return w;
    };
    switch (m.name) {
      case 'weave':
        return set(24, 2.5 * Math.sin(WEAVE_RATE * t + 1.6), 0, 8 * Math.sin(WEAVE_RATE * t), 2.5 * Math.sin(0.66 * WEAVE_RATE * t), null);
      case 'wing':
        // Wingtip to wingtip.
        return set(3, 0, 0, 0, 1.2, m.side > 0 ? 0 : Math.PI);
      case 'stack':
        // The leader below, the other riding above and just behind.
        return set(8, 0, 0, 0, 0, firstLeads ? -Math.PI / 2 : Math.PI / 2);
      case 'helix':
        // Round each other: the axis itself turns (in step()).
        return set(0, 0, 0, 0, 0, null);
      case 'swap':
        // The new leader goes over the top.
        return set(26, 0, 0, 0, 0, firstLeads ? Math.PI / 2 : -Math.PI / 2);
      case 'trail':
      default:
        return set(26, 0, 0, 3.5 * Math.sin(0.9 * WEAVE_RATE * t), 2.5 + 1.5 * Math.sin(0.6 * WEAVE_RATE * t), null);
    }
  }

  // --- Calling a dragon -----------------------------------------------------------------------

  /**
   * Is a dragon where a good pass can be flown from: out over the valley in front of the ledge,
   * far enough off to line up, and not high above it? (From anywhere else the trees round the
   * back of the ledge force it over the top of the viewer's head, out of their sight.)
   */
  placed(f) {
    const dx = f.x - VIEWER[0];
    const dz = f.z - VIEWER[2];
    const far = Math.hypot(dx, dz);
    const az = Math.atan2(dx, -dz); // to the right of straight ahead: positive
    return far >= CALL_ROOM && az > CALL_FROM[0] && az < CALL_FROM[1] && f.y < VIEWER[1] + 5 + 0.25 * (far - 30);
  }

  /**
   * Send a dragon past the viewer. Returns its number, or -1 if neither is free (both are
   * already on their way, or the last call was a moment ago). Either way something is heard:
   * the one that comes calls back at once ('call' in the events), and if none can, the one
   * that is already coming says so ('busy').
   */
  call() {
    const free = [];
    for (let i = 0; i < 2; i++) if (!this.jobs[i]) free.push(i);
    const dist = (i) => Math.hypot(this.flyers[i].x - VIEWER[0], this.flyers[i].y - VIEWER[1], this.flyers[i].z - VIEWER[2]);
    if (this.time - this.callAt < 4 || !free.length) {
      // The one that is on its way (the nearer, if both are) lets it be known.
      let busy = -1;
      for (let i = 0; i < 2; i++) if (this.jobs[i] && (busy < 0 || dist(i) < dist(busy))) busy = i;
      if (busy >= 0 && this.time - this.busyAt > 1.5) {
        this.busyAt = this.time;
        this.flyers[busy].cry = CRY_SECONDS;
        this.events.push({ type: 'busy', dragon: busy });
      }
      return -1;
    }
    // The one that is placed to come straight in, if either is; otherwise the nearer.
    const rank = (i) => (this.placed(this.flyers[i]) ? 0 : 1000) + dist(i);
    let who = free[0];
    if (free.length > 1 && rank(free[1]) < rank(who)) who = free[1];
    const f = this.flyers[who];
    // It comes in over the near end of the lake, on one of a few lines a little apart (so that
    // no two calls in a row are answered alike), and goes by where planPass finds is best
    // for that line: to the viewer's right, a little above their head.
    const from = CALL_LINES[this.calls++ % CALL_LINES.length];
    const ux = -Math.sin(from);
    const uz = Math.cos(from);
    const plan = planPass(ux, uz, f.size);
    const job = { phase: 'out', pass: plan.point, turn: plan.turn, side: plan.side, line: [ux, uz], dir: [ux, uz], exit: [ux, uz], t: 0, roared: false };
    // Already far enough out over the valley: then it simply comes.
    if (this.canCome(f, job)) job.phase = 'come';
    this.jobs[who] = job;
    this.callAt = this.time;
    // It answers at once: a short call, and it looks round at the viewer.
    f.cry = CRY_SECONDS;
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
        this.along[i] = this.project(f, this.along[i] - 4, this.along[i] + 24);
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

    // Tight places ahead: single file, and no fancy figures. (They need three seconds' warning
    // to fall into line, no more: single file is the dullest thing the two can do.)
    let tight = 0;
    for (let d = -40; d <= TIGHT_AHEAD; d += 10) tight = Math.max(tight, this.tightAt(this.center + d));
    this.mode.t += dt;
    // How near the viewer the pair comes in the next eight seconds or so.
    let range = Infinity;
    for (let d = 0; d <= 150; d += 30) range = Math.min(range, this.rangeAt(this.center + d));
    if (this.center < this.fileUntil) {
      // (The opening: see reset.)
      if (this.mode.name !== 'trail') this.pickMode(true, true, range);
    } else if (this.mode.t > this.mode.length) {
      let soon = 0;
      for (let d = TIGHT_AHEAD; d <= TIGHT_AHEAD + 180; d += 20) soon = Math.max(soon, this.tightAt(this.center + d));
      this.pickMode(tight > 0.3, soon > 0.3, range);
    } else if (tight > 0.3 && this.mode.name !== 'trail' && this.mode.name !== 'swap') {
      this.pickMode(true, true, range);
    } else if (tight <= 0.3 && range < FIGURES_CLOSE - 15 && this.mode.name === 'trail' && this.mode.where !== 'close' && this.mode.t > 1.5) {
      // Coming in close while only following one another: time for something better.
      this.pickMode(false, false, range);
    }

    const want = this.modeWants();
    const room = this.room;
    let gapWant = want[0];
    if (tight > 0.3) gapWant = Math.max(gapWant, 25 * room);
    // The gap changes at a walking pace relative to the flight, so it reads as one catching up.
    this.gap += clamp(this.lead * gapWant - this.gap, -6 * dt, 6 * dt);
    // Keeping apart. Whenever the two are less than 20 m apart along the lane they stand off
    // from it in opposite directions along `axis`, by more the closer they are: side by side
    // they are 16 m apart, and they are never nearer than about 12. Flying wingtip to wingtip,
    // one above the other, passing, and circling each other are all this one rule with the
    // axis held sideways, held upright, or turning.
    if (this.mode.name === 'helix') this.axis = wrap(this.axis + HELIX_RATE * this.mode.side * dt);
    else if (want[5] !== null) this.axis = wrap(this.axis + clamp(wrap(want[5] - this.axis), -1.1 * dt, 1.1 * dt));
    // How close they really are along the lane (not how close they are meant to be).
    const between = this.on[0] && this.on[1] ? Math.abs(this.along[0] - this.along[1]) : Math.abs(this.gap);
    const apart = STAND_OFF * room * clamp(1 - Math.min(between, Math.abs(this.gap)) / (20 * room), 0, 1);

    // Roars: now and then from a distance, and from one that has been called.
    if (this.time > this.nextRoar) {
      const chance = this.rng() < 0.5 ? 0 : 1;
      const who = this.roars === 0 ? 0 : chance;
      if (!this.jobs[who]) this.roar(who, 'far');
      this.roars++;
      this.nextRoar = this.time + 38 + this.rng() * 50;
    }

    const ease = 1 - Math.exp(-dt / 0.7);
    const p = TMP;
    const q = TMP2;
    const near = this.near;
    const under = this.under;
    under[0] = 0;
    under[1] = 0;
    for (let i = 0; i < 2; i++) {
      const f = flyers[i];
      const carrot = this.carrots[i];
      const job = this.jobs[i];
      const toViewer = Math.hypot(f.x - VIEWER[0], f.y - VIEWER[1], f.z - VIEWER[2]);
      near[i] = toViewer;
      if (toViewer < this.closest) this.closest = toViewer;
      if (job) {
        this.lanePoint[i][3] = Infinity;
        this.wantSpeed[i] = this.flyPast(i, job, dt, toViewer);
        continue;
      }
      // Wings set where the lane says so (and a little before: they take a moment to settle).
      this.setWant[i] = this.on[i] ? Math.max(this.setAt(this.along[i]), this.setAt(this.along[i] + 6)) : 0;
      const should = this.center + (i === 0 ? 0.5 : -0.5) * this.gap;
      const leader = (i === 0 ? 1 : -1) === this.lead;
      const sign = i === 0 ? 1 : -1;
      // The carrot: a fixed distance ahead of the dragon ON THE LANE, so the dragon follows
      // the lane's shape from wherever it is. (Where it should be only sets its speed.) A
      // dragon that is not on the lane yet aims at its place in the pair instead.
      const at = this.on[i] ? this.along[i] : should;
      const s = at + this.carrotAhead(at);
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
      let figure = this.offsets[i * 2];
      let apartSide = this.standOff[i * 2];
      // In front of the ledge there is rock on one side and open air on the other. Whatever
      // a figure asks for on the viewer's side is given up there, and the two stand off from
      // each other wholly on the far side: the one that would have been nearer keeps to the
      // lane, the other goes twice as far out.
      const vx = VIEWER[0] - p[0];
      const vz = VIEWER[2] - p[2];
      const vd = Math.hypot(vx, vz) || 1;
      const shy = 1 - smoothstep(SHY_NEAR * room, SHY_FAR * room, vd);
      if (shy > 0) {
        // +1: the viewer is straight to the left of the lane here; -1: to the right.
        const side = (vx * tz - vz * tx) / (tl * vd);
        if (figure * side > 0) figure *= 1 - shy * Math.abs(side);
        apartSide -= shy * side * Math.abs(apartSide);
      }
      const off = figure + apartSide;
      const hang = this.lanePoint[i];
      hang[0] = p[0];
      hang[1] = p[1];
      hang[2] = p[2];
      hang[3] = Math.hypot(p[0] - VIEWER[0], p[1] - VIEWER[1], p[2] - VIEWER[2]);
      carrot[0] = p[0] + (tz / tl) * off;
      carrot[1] = p[1] + this.offsets[i * 2 + 1] + this.standOff[i * 2 + 1];
      carrot[2] = p[2] - (tx / tl) * off;
      // (Used below: how far this one has been asked under the flight floor, if at all.)
      under[i] = here < 0.5 ? flightFloor(carrot[0], carrot[2]) + 2 - carrot[1] : 0;
      // Speed: what the lane allows here (slowing in time for what is coming), faster when it
      // is behind its place and slower when ahead. No hurrying through the tight places.
      const allowed = this.allowedSpeed(at);
      let tightAhead = here;
      for (let d = 25; d <= 75; d += 25) tightAhead = Math.max(tightAhead, this.tightAt(at + d));
      const late = this.on[i] ? should - this.along[i] : 60;
      // (Gently: one that is behind gains on its place at a few metres a second, it does not
      // sprint for it.)
      let hurry = allowed * (1 + clamp(0.011 * late, -0.28, 0.32 * (1 - tightAhead)));
      // However far behind, no faster than it can still follow the bends just ahead: a dragon
      // that swings wide of a turn ends up further behind, and somewhere it should not be.
      if (hurry > allowed) {
        let bend = 99;
        for (let d = 0; d <= 48; d += 12) bend = Math.min(bend, this.bendSpeedAt(at + d));
        hurry = Math.max(Math.min(hurry, bend * CATCH_UP_BEND), allowed);
      }
      this.wantSpeed[i] = hurry;
    }

    // One above the other, the lower one may have been asked under the flight floor (over a
    // rise, by a tree). Then both fly that much higher: they keep their distance from each
    // other, and nobody has to pull up.
    const lift = Math.max(under[0], under[1]);
    if (lift > 0) {
      if (!this.jobs[0]) this.carrots[0][1] += lift;
      if (!this.jobs[1]) this.carrots[1][1] += lift;
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
    // (One that has been called flies its own way, and may meet the other head on: for those
    // two the look ahead is longer.)
    const away = this.jobs[0] || this.jobs[1];
    const giveWay = GIVE_WAY * room;
    if (sep < giveWay + (away ? 75 : 30)) {
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
      for (let k = 1; k <= (away ? 5 : 3); k++) {
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
    if (sep < giveWay) {
      const push = (giveWay - sep) * 2.4;
      // The one that is higher now stays the higher one.
      const upward = flyers[0].y >= flyers[1].y ? 1 : -1;
      const flat = Math.hypot(sx, sz);
      for (let i = 0; i < 2; i++) {
        const sign = i === 0 ? 1 : -1;
        // One that has been called and is on its way in holds its line (it is being watched,
        // and its pass was planned to the metre): the other one does all of the giving way.
        const coming = (k) => !!this.jobs[k] && this.jobs[k].phase !== 'out';
        if (coming(i) && !coming(1 - i)) continue;
        const share = coming(1 - i) ? 2 : 1;
        // A point that is chased from far off (one that has been called chases such points)
        // has to move further to turn the dragon as much.
        const c = this.carrots[i];
        const reach = Math.max(1, Math.hypot(c[0] - flyers[i].x, c[2] - flyers[i].z) / CARROT) * share;
        c[1] += sign * upward * push * reach;
        if (flat > 0.5) {
          c[0] += ((sign * sx) / flat) * push * 0.6 * reach;
          c[2] += ((sign * sz) / flat) * push * 0.6 * reach;
        }
      }
    }

    // Whatever the figures and the giving way have asked for: close to the ledge nobody is
    // sent nearer to the viewer than the lane itself runs. The lanes were drawn with the
    // viewer's head in mind, wings and all; a point pushed in from one was not. So what was
    // asked for toward the viewer is not flown: not sideways, and not up or down (over the
    // ledge nothing is pushed lower than its lane, and under it nothing higher).
    for (let i = 0; i < 2; i++) {
      const hang = this.lanePoint[i];
      if (hang[3] > CLOSE_LANE) continue;
      const w = 1 - smoothstep(0.6 * CLOSE_LANE, CLOSE_LANE, hang[3]);
      const c = this.carrots[i];
      const other = this.jobs[1 - i] ? null : this.carrots[1 - i];
      const vx = VIEWER[0] - hang[0];
      const vz = VIEWER[2] - hang[2];
      const vd = Math.hypot(vx, vz);
      if (vd > 1e-6) {
        const inward = ((c[0] - hang[0]) * vx + (c[2] - hang[2]) * vz) / vd;
        if (inward > 0) {
          c[0] -= (vx / vd) * inward * w;
          c[2] -= (vz / vd) * inward * w;
          // What this one may not fly, the other flies for it, the other way: the two are
          // then as far apart as they were asked to be.
          if (other) {
            other[0] -= (vx / vd) * inward * w;
            other[2] -= (vz / vd) * inward * w;
          }
        }
      }
      const over = hang[1] - VIEWER[1];
      let lift = 0;
      if (over > 0 && c[1] < hang[1]) lift = (hang[1] - c[1]) * w;
      else if (over < -3 && c[1] > hang[1]) lift = (hang[1] - c[1]) * w;
      c[1] += lift;
      if (other) other[1] += lift;
    }

    for (let i = 0; i < 2; i++) {
      const f = flyers[i];
      // Where to look: at the viewer when close or called, otherwise the chaser watches the leader.
      let look = null;
      if (near[i] < 75 || this.jobs[i]) look = VIEWER;
      else if ((i === 0 ? 1 : -1) !== this.lead && !this.jobs[i]) look = [flyers[1 - i].x, flyers[1 - i].y, flyers[1 - i].z];
      f.step(dt, this.carrots[i], this.wantSpeed[i], look, this.setWant[i]);
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

  /**
   * Has a called dragon room to turn onto the line it is to come in along: far enough out
   * along it, not too far to one side, not too high, and heading roughly the right way?
   */
  canCome(f, job) {
    const u = job.line;
    const rx = f.x - job.pass[0];
    const rz = f.z - job.pass[2];
    const along = rx * u[0] + rz * u[1];
    const aside = Math.abs(rz * u[0] - rx * u[1]);
    // (And it is not flying across the line or away down it: one that is has a turn to make
    // that would carry it wide, and it would come back in across the ledge.)
    const across = Math.abs(wrap(Math.atan2(u[0], u[1]) - f.heading));
    return along < -CALL_ROOM && aside < CALL_ASIDE + 0.45 * (-along - CALL_ROOM) && f.y < job.pass[1] + 14 + 0.3 * -along && across < CALL_ACROSS + 0.012 * (-along - CALL_ROOM);
  }

  /**
   * Carrot and speed for a dragon that has been called. Returns the speed to fly at.
   *
   * 'out'   Called from close by, from one side or from over the trees behind: out over the
   *         valley first, toward a gate on the line it will come in along, until there is
   *         room to turn onto that line. (Coming straight from where it was, it could only go
   *         over the top of the viewer's head and the trees behind them.) Slowly: a slow
   *         dragon turns in less room, and this is done in full view.
   * 'come'  Onto the line and down it, on a gentle slope to the height of the pass.
   * 'go'    Through the point beside the viewer, on past them, and back to the other dragon.
   */
  flyPast(i, job, dt, toViewer) {
    const f = this.flyers[i];
    const carrot = this.carrots[i];
    const u = job.line;
    job.t += dt;
    this.setWant[i] = 0;
    // Where it is by the line: `along` is 0 at the point beside the viewer and negative
    // before it; `aside` is how far off the line it is.
    const rx = f.x - job.pass[0];
    const rz = f.z - job.pass[2];
    const along = rx * u[0] + rz * u[1];
    const aside = Math.abs(rz * u[0] - rx * u[1]);
    if (job.phase === 'out') {
      carrot[0] = job.pass[0] - u[0] * CALL_GATE;
      carrot[2] = job.pass[2] - u[1] * CALL_GATE;
      carrot[1] = Math.max(job.pass[1] + lineRise(-CALL_GATE), flightFloor(carrot[0], carrot[2]) + 3);
      // Beside the ledge or behind it there are trees between it and the valley: over them.
      if (f.z > -12 && toViewer < HERO_REACH + 12) carrot[1] = Math.max(carrot[1], CALL_OVER);
      if (job.t > 18 || this.canCome(f, job)) {
        job.phase = 'come';
        job.t = 0;
      }
      return CALL_SLOW;
    }
    if (job.phase === 'come') {
      // The point it chases runs ahead of it down the line, and stops beside the viewer.
      const at = Math.min(along + 34, 0);
      carrot[0] = job.pass[0] + u[0] * at;
      carrot[2] = job.pass[2] + u[1] * at;
      // From above it comes down the slope of the line. From below (low over the water) it
      // does not climb to the slope first: it rises steadily, to be level 40 m before the pass.
      carrot[1] = job.pass[1] + lineRise(at);
      if (f.y < job.pass[1] + lineRise(along)) carrot[1] = Math.min(carrot[1], lerp(f.y, job.pass[1], clamp(34 / Math.max(-along - 40, 34), 0, 1)));
      const d = Math.hypot(rx, rz);
      const onLine = aside < 14 && Math.abs(wrap(Math.atan2(u[0], u[1]) - f.heading)) < 30 * DEG;
      if (!job.roared && d < 95 && onLine) {
        job.roared = true;
        this.roar(i, 'call');
      }
      if (d < 24 || along > -16 || job.t > 40) {
        // Close: keep the line it is on, straight through the point beside the viewer, and
        // then out the way that was planned.
        job.phase = 'go';
        job.t = 0;
        // (Out along the line as it was planned, with the turn that was planned: the way it
        // happens to be heading may be a few degrees off that, and those few degrees further
        // on are the trees behind the ledge.)
        const h = f.heading;
        const planned = Math.atan2(u[0], u[1]) + job.turn;
        job.dir = [Math.sin(h), Math.cos(h)];
        job.exit = [Math.sin(planned), Math.cos(planned)];
        if (!job.roared) this.roar(i, 'call');
        job.roared = true;
        this.events.push({ type: 'pass', dragon: i });
      }
      // The last stretch it glides: wings set and spread, slowing as it comes, so that what
      // goes by the viewer is a still, wide wing and not a downstroke.
      if (onLine && d < PASS_GLIDE) this.setWant[i] = 1;
      // A long way out there is room for anything, and it hurries. Nearer, slowly until it is
      // on the line; then fast again, and slow enough over the ledge to be seen.
      if (d > 140) return 27;
      if (!onLine && d > 45) return CALL_SLOW;
      return d > 100 ? 24 : lerp(13.5, 24, clamp((d - 40) / 60, 0, 1));
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
    // Wings still set until it is well past the viewer.
    if (gone < 14) this.setWant[i] = 1;
    if (out > 48 || job.t > 12) this.jobs[i] = null;
    return toViewer < 34 ? 13.5 : 20;
  }

  roar(i, kind) {
    const f = this.flyers[i];
    f.roar = ROAR_SECONDS;
    // It turns its head as it roars, as far as its neck allows, so that the fire is seen from
    // the side: a jet breathed straight at the viewer is a small bright tuft and nothing more.
    const dx = VIEWER[0] - f.x;
    const dz = VIEWER[2] - f.z;
    const toViewer = wrap(Math.atan2(dx, dz) - f.heading); // positive: the viewer is to its left
    let away = toViewer > 0 ? -1 : 1;
    if (Math.abs(toViewer) < 0.12) {
      // Coming straight at them: either side would do. The side away from the low sun, as the
      // viewer sees it, where the fire is not lost in the glare.
      away = -dx * SUN_DIR[2] + dz * SUN_DIR[0] > 0 ? 1 : -1;
    }
    f.roarYaw = clamp(toViewer + away * Math.PI * 0.5, -ROAR_YAW, ROAR_YAW);
    this.events.push({ type: 'roar', dragon: i, kind });
  }

  /**
   * Hand back what has happened since the last time, and forget it. The list handed back is
   * used again by the call after next: read it before draining again.
   */
  drain() {
    const e = this.events;
    this.events = this.spare;
    this.events.length = 0;
    this.spare = e;
    return e;
  }
}
