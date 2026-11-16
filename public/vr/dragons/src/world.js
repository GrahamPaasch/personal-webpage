/**
 * world.js: the valley as plain functions of position. No three.js and no DOM in here, so the
 * terrain, the forest and the light can be checked by the tests and shared by the picture, the
 * flight and the sound.
 *
 * Frame: metres, y up. The viewer stands at the origin on a rock ledge (floor at y = 0) and looks
 * along -z at the start, the way a WebXR 'local-floor' space begins. +x is to the viewer's right.
 *
 * The place is made up, but its ingredients are southern Wisconsin: a quartzite bluff over a lake
 * (think of the Baraboo hills), sugar maple, oak, birch and white pine, and a low October sun
 * shining down the length of the valley.
 */

import { noise2, fbm, hash2, clamp, lerp, smoothstep, makeRng } from './rng.js';

const DEG = Math.PI / 180;

/** Height of the lake surface. The ledge is 46 m above it. */
export const LAKE_LEVEL = -46;

/**
 * Where the sun is: a little left of straight ahead and very low, minutes from setting, so it
 * sits just over the ridges at the far end of the lake. A unit vector toward it.
 */
export const SUN_AZIMUTH = 12 * DEG; // left of straight ahead
export const SUN_ELEVATION = 6.5 * DEG;
export const SUN_DIR = [
  -Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  -Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
];

/**
 * The lake: a long oval running away from the bluff toward the sun, so that the sun's glitter
 * path lies on the water all the way. u is the unit vector along it (toward the far end), v
 * across it (toward the right-hand shore).
 */
const LAKE_AXIS = 6 * DEG; // left of straight ahead
export const LAKE = {
  cx: -18.3,
  cz: -206,
  ux: -Math.sin(LAKE_AXIS),
  uz: -Math.cos(LAKE_AXIS),
  vx: Math.cos(LAKE_AXIS),
  vz: -Math.sin(LAKE_AXIS),
  a: 140,
  b: 85,
};

/** A point given in lake coordinates (p along the lake, q across it) as [x, z]. */
export function lakePoint(p, q) {
  return [LAKE.cx + p * LAKE.ux + q * LAKE.vx, LAKE.cz + p * LAKE.uz + q * LAKE.vz];
}

/** Signed distance to the shoreline in metres, roughly: negative on the water. */
export function lakeDistance(x, z) {
  const rx = x - LAKE.cx;
  const rz = z - LAKE.cz;
  const p = rx * LAKE.ux + rz * LAKE.uz;
  const q = rx * LAKE.vx + rz * LAKE.vz;
  const e = Math.hypot(p / LAKE.a, q / LAKE.b);
  if (e < 1e-6) return -LAKE.b;
  const reach = Math.hypot(p, q) / e; // how far the shore is from the middle in this direction
  const wobble = 0.08 * noise2(x / 52 + 3.1, z / 52 - 1.7) + 0.035 * noise2(x / 19, z / 19);
  return (e - 1 - wobble) * reach;
}

/** Distance from a point to a polyline [[x, z], ...]. */
function polylineDistance(line, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const ax = line[i][0];
    const az = line[i][1];
    const bx = line[i + 1][0] - ax;
    const bz = line[i + 1][1] - az;
    const t = clamp(((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz), 0, 1);
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
    if (d < best) best = d;
  }
  return best;
}

/**
 * The outlet creek: it leaves the near end of the lake, runs along the foot of the bluff and out
 * through a narrow wooded gorge on the viewer's right. The dragons fly through it below the
 * treetops.
 */
export const GORGE = [
  [14, -72],
  [60, -70],
  [100, -48],
  [126, -8],
  [140, 40],
  [170, 90],
  [230, 130],
  [330, 160],
  [480, 180],
  [700, 185],
];

/**
 * A grassy gap that winds through the forest on the valley floor, front left: the other place
 * where the dragons fly between the trees.
 */
export const MEADOW = [
  [-36, -64],
  [-80, -54],
  [-130, -58],
  [-180, -44],
  [-230, -38],
  [-280, -36],
  [-314, -38],
];

export const gorgeDistance = (x, z) => polylineDistance(GORGE, x, z);
export const meadowDistance = (x, z) => polylineDistance(MEADOW, x, z);

/**
 * Hills: [centre x, centre z, radius along its axis, radius across, axis in degrees left of
 * straight ahead, height, shape]. Shape 2 is a soft dome; nearer 1 the foot is steeper.
 * The two long ones flank the lake and leave the valley open toward the sun.
 */
const HILLS = [
  [205, -235, 300, 125, 6, 64, 2], // right of the lake
  [-228, -244, 210, 120, 6, 60, 2], // left of the lake
  [238, 12, 122, 112, 0, 54, 1.4], // across the gorge, on the right
  [120, -829, 300, 170, 6, 90, 2], // right of the notch, far
  [-420, -795, 300, 180, 6, 95, 2], // left of the notch, far
  [-160, -1550, 300, 700, 6, 75, 2], // the low ridge that closes the valley, far under the sun
  [480, -330, 420, 170, 6, 105, 2], // second ridge on the right
  [800, -350, 600, 240, 6, 160, 2], // third
  [-500, -300, 380, 170, 6, 100, 2], // second ridge on the left
  [-820, -260, 560, 240, 6, 150, 2], // third
  [-480, 20, 220, 240, 0, 85, 2], // left, level with the viewer
  [430, 260, 230, 230, 0, 80, 2], // behind right, past the gorge
  [-330, 330, 260, 260, 0, 80, 2], // behind left
].map((h) => {
  const az = h[4] * DEG;
  return { x: h[0], z: h[1], ra: h[2], rc: h[3], ux: -Math.sin(az), uz: -Math.cos(az), h: h[5], power: h[6] };
});

/** The rim of the bluff rounds off: this far back from the edge it starts, and this far down it is at the edge (metres). */
const PROW_BACK = 1.4;
const PROW_DROP = 0.6;
/** The bank at the water's edge: all land stands this far above the lake (metres). */
const SHORE_STEP = 0.7;

const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
const smin = (a, b, k) => -smax(-a, -b, k);

/**
 * How far a point is outside the top of the viewer's bluff, in metres (negative: on top of it).
 * The top is a wooded plateau behind the viewer, and in front of it a narrow pulpit of rock that
 * juts out over the valley: the ledge. The edge is 2.6 m in front of the viewer and 3 m to each
 * side, so the valley can be seen on three sides.
 */
export function bluffFront(x, z) {
  const k = x < 0 ? 0.0028 : 0.012;
  const rough = 5 * noise2(x / 28 + 11.3, 0.5) * smoothstep(8, 40, Math.abs(x));
  const plateau = 11 + k * x * x + rough - z;
  const zc = clamp(z, 0.4, 20);
  const pulpit = Math.hypot(x, z - zc) - (3.0 + 0.17 * (zc - 0.4));
  return smin(plateau, pulpit, 3.5);
}

function hillsAt(x, z) {
  // Lumpy outlines: bend the lookup a little.
  const wx = x + 38 * noise2(x / 170 + 5.2, z / 170 - 8.1);
  const wz = z + 38 * noise2(x / 170 - 2.7, z / 170 + 4.4);
  let sum = 0;
  for (let i = 0; i < HILLS.length; i++) {
    const h = HILLS[i];
    const dx = wx - h.x;
    const dz = wz - h.z;
    const along = (dx * h.ux + dz * h.uz) / h.ra;
    const across = (-dx * h.uz + dz * h.ux) / h.rc;
    const t = along * along + across * across;
    if (t < 1) sum += h.h * Math.pow(1 - t, h.power);
  }
  return sum;
}

/**
 * Terrain height. Under the lake this is the lake bed; the water surface itself is LAKE_LEVEL.
 */
export function ground(x, z) {
  const r = Math.hypot(x, z);
  const dl = lakeDistance(x, z);

  // Valley floor with low swells, and the hills standing on it.
  const swell = 2.6 + 2.4 * fbm(x / 95, z / 95, 3);
  let h = LAKE_LEVEL + swell + hillsAt(x, z);
  // Small-scale roughness, growing with height so the valley floor stays calm.
  h += 1.6 * fbm(x / 23 + 40, z / 23, 3) * smoothstep(LAKE_LEVEL + 4, LAKE_LEVEL + 30, h);

  // The viewer's bluff: a plateau behind the edge, a cliff band, then a talus slope.
  const flat = smoothstep(5, 26, r);
  const plateau = 2.8 * noise2(x / 62 + 1.3, z / 62 + 9.1) * flat + 0.022 * Math.max(z, 0) * flat + 1.2 * fbm(x / 9, z / 9, 2) * smoothstep(9, 22, r);
  const front = bluffFront(x, z);
  // The rock rounds off toward its rim like the prow of a boat: it starts to fall away 1.4 m
  // back from the edge and is 0.6 m down by the edge itself, still steepening. (A level top
  // with a sharp rim hides the valley floor from anyone standing a few steps back from it: the
  // eye, the rim and whatever is below it are in one line.)
  const back = clamp((front + PROW_BACK) / PROW_BACK, 0, 1);
  let bluff = plateau - PROW_DROP * back * back;
  if (front > 0) {
    const ledges = 1.6 * noise2(x / 7 + 3, z / 7) * smoothstep(1, 6, front);
    // Past the edge the prow's curve runs on for a stride, and then the cliff takes over.
    bluff -= ((2 * PROW_DROP) / PROW_BACK) * Math.min(front, 1.5) + 13 * smoothstep(0, 5, front) + 0.62 * Math.max(front - 3, 0) - ledges;
  }
  // Land stands SHORE_STEP above the water everywhere (see below); the pulpit is level with the
  // viewer's feet, and the neck of rock behind them rises to the plateau over a few strides.
  bluff -= SHORE_STEP * (1 - smoothstep(2.5, 11, r));
  h = smax(h, bluff, 5);

  // The gorge and its creek: a flat floor about 26 m wide with steep sides.
  const dg = gorgeDistance(x, z);
  if (dg < 80) {
    const bed = LAKE_LEVEL - 0.6 - 0.012 * Math.max(z + 72, 0);
    const channel = bed + 0.85 * Math.max(dg - 13, 0) + 0.9 * smoothstep(0, 13, dg);
    h = smin(h, channel, 4);
    if (dg < 2.2) h -= 0.5 * (1 - dg / 2.2); // the creek bed
  }

  // Ease the land down to the water, and drop the bed away under it.
  if (dl > 0) {
    const s = smoothstep(0, 42, dl);
    h = LAKE_LEVEL + (h - LAKE_LEVEL) * s + SHORE_STEP * smoothstep(0, 6, dl);
  } else {
    h = LAKE_LEVEL + Math.max(dl * 0.4, -9);
  }

  // The ledge itself: level rock where the viewer stands. (It is level there already; this
  // only takes out the last few millimetres.)
  if (r < 1.6) h = lerp(0, h, smoothstep(1.1, 1.6, r));
  return h;
}

/** How steep the ground is: rise over run. */
export function slopeAt(x, z) {
  const e = 1.5;
  const dx = ground(x + e, z) - ground(x - e, z);
  const dz = ground(x, z + e) - ground(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** 0 where nothing grows (water, cliff, the ledge, the creek, the meadow gap), 1 in deep forest. */
export function forestDensity(x, z) {
  const dl = lakeDistance(x, z);
  if (dl < 4) return 0;
  const r = Math.hypot(x, z);
  let f = smoothstep(4, 10, dl);
  f *= smoothstep(18, 26, gorgeDistance(x, z));
  f *= smoothstep(18, 26, meadowDistance(x, z));
  // Around the ledge the trees are placed by hand (HERO_TREES); the forest proper starts
  // further back, which also leaves room for a dragon to come in low over the viewer's shoulder.
  f *= smoothstep(z > 0 ? 27 : 8, z > 0 ? 34 : 13, r);
  // Behind the viewer's right shoulder the plateau is a bare shelf of rock with a few trees
  // (HERO_TREES): that is the way a dragon comes over. (It was a narrower shelf while the
  // dragons were smaller: a wingspan of twenty metres wants a gate to match.)
  if (z > 0 && x > -13) f *= Math.max(smoothstep(58, 68, r), 1 - smoothstep(-13, -5, x));
  // The cliff and the fallen rock under it are bare; trees begin lower down the slope.
  const front = bluffFront(x, z);
  if (front > -1.5) f *= smoothstep(44, 56, front);
  // Under the ledge itself the fallen rock fans out wider: nothing grows within 60 m of it.
  if (z < 12) f *= smoothstep(60, 72, r);
  // Straight ahead nothing stands between the ledge and the lake.
  if (z < 0) f *= smoothstep(0, 7, Math.abs(x) - (9 + 0.22 * -z)) + smoothstep(70, 82, -z) - smoothstep(0, 7, Math.abs(x) - (9 + 0.22 * -z)) * smoothstep(70, 82, -z);
  // A few natural clearings.
  f *= 1 - smoothstep(0.52, 0.66, fbm(x / 130 + 20, z / 130 - 6, 2) * 1.6);
  // Nothing of the forest stands against the trunk of one of the big trees by the creek (the
  // smaller trees do grow under their crowns).
  if (f > 0) f *= smoothstep(4, 8, groveDistance(x, z));
  return f;
}

/**
 * The trees that stand close to the ledge, placed by hand: [x, z, height, crown radius, kind].
 * The big maple leans over the viewer's left shoulder and sheds the leaves that drift past; the
 * right side is kept open, because that is where a dragon comes over. In particular no trunk
 * stands within 15 m of the line 13 m to the viewer's right, from the rim to 34 m back, and no
 * crown reaches within 10 m of it: a dragon that is called goes by along it, low enough to be
 * watched all the way (flight.js, planPass), and the long swoop of the opening comes down it
 * the other way. (The pine and the first birch stood four metres nearer to that line while
 * the dragons were smaller.)
 */
export const HERO_TREES = [
  { x: -7.5, z: 5.5, height: 15, radius: 5.6, kind: 'maple' },
  { x: 29, z: 27, height: 11, radius: 3, kind: 'birch' },
  { x: -16.5, z: 13, height: 14, radius: 6, kind: 'oak' },
  { x: 31, z: 9, height: 19, radius: 3.4, kind: 'pine' },
  { x: -3, z: 19, height: 13, radius: 5, kind: 'maple2' },
  { x: -2, z: 32, height: 12, radius: 4.6, kind: 'oak2' },
  { x: -24, z: 4, height: 10, radius: 3, kind: 'birch2' },
];

/**
 * The big trees at the mouth of the creek: old sugar maples, oaks and white pines that stand
 * nearly twice as tall as the forest round them, a row on each bank. The creek's first hundred
 * metres run between them, and that is the gap in the trees which can be WATCHED from the
 * ledge: 55 to 120 m off to the front right, the crowns between 8 and 20 degrees below eye
 * level. The dragons fly through at the height of the crowns (the lane 'narrows' in flight.js),
 * behind the row on the near bank, and are seen between its trees.
 *
 * Placed by hand, as the trees by the ledge are: { x, z, height: where the top is (metres above
 * the ledge, so all of these are negative), radius of the crown, kind }. Each stands at least
 * 21 m from the middle of the creek, which leaves the lane 30 m of clear air between the crowns.
 */
export const GROVE = [
  // The near bank, from the lake end. Seen from the ledge the first two stand in front of the
  // creek with a gap between them and a gap after: a dragon flying up the creek is in the
  // open, behind the maple, out, behind the gold one, and out again.
  { x: 27.5, z: -43.5, height: -9.5, radius: 8.5, kind: 'elderMaple' },
  { x: 54, z: -41.5, height: -8.5, radius: 8, kind: 'elderGold' },
  { x: 76.5, z: -29.5, height: -6, radius: 5.5, kind: 'whitePine' },
  { x: 89, z: -15, height: -9, radius: 8.5, kind: 'elderOak' },
  { x: 97, z: 6, height: -10, radius: 8, kind: 'elderMaple2' },
  // The far bank: what is seen behind the dragons, through the gaps.
  { x: 46, z: -100, height: -13, radius: 5, kind: 'farPine' },
  { x: 79, z: -88, height: -12, radius: 7.5, kind: 'farGold' },
  { x: 96, z: -77, height: -9, radius: 5, kind: 'farPine2' },
  { x: 117.5, z: -63.5, height: -12.5, radius: 7.5, kind: 'farMaple' },
];

/** A circle that holds every tree of the grove, crowns and all: nothing outside it need ask. */
export const GROVE_REACH = (() => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const t of GROVE) {
    x0 = Math.min(x0, t.x);
    x1 = Math.max(x1, t.x);
    z0 = Math.min(z0, t.z);
    z1 = Math.max(z1, t.z);
  }
  const x = (x0 + x1) / 2;
  const z = (z0 + z1) / 2;
  let radius = 0;
  for (const t of GROVE) radius = Math.max(radius, Math.hypot(t.x - x, t.z - z) + t.radius);
  return { x, z, radius };
})();

/** How far a point is from the nearest trunk in the grove (metres); Infinity well away from it. */
export function groveDistance(x, z, margin) {
  if (Math.hypot(x - GROVE_REACH.x, z - GROVE_REACH.z) > GROVE_REACH.radius + (margin || 12)) return Infinity;
  let best = Infinity;
  for (let i = 0; i < GROVE.length; i++) {
    const d = Math.hypot(x - GROVE[i].x, z - GROVE[i].z);
    if (d < best) best = d;
  }
  return best;
}

/** The top of the grove's leaves over a point, or -Infinity where there are none. */
export function groveTop(x, z) {
  if (Math.hypot(x - GROVE_REACH.x, z - GROVE_REACH.z) > GROVE_REACH.radius) return -Infinity;
  let top = -Infinity;
  for (let i = 0; i < GROVE.length; i++) {
    const t = GROVE[i];
    const d = Math.hypot(x - t.x, z - t.z) / t.radius;
    // A dome: full height over the trunk, a third of the crown lower at its edge.
    if (d < 1) top = Math.max(top, t.height - 4.5 * d * d);
  }
  return top;
}

/** Typical treetop height above the ground, and the tallest any tree of the forest grows. */
export const CANOPY = 17;
export const TREE_MAX = 23;

/** The top of the land as the light sees it: water, bare ground, or the forest's canopy. */
export function canopyHeight(x, z) {
  if (lakeDistance(x, z) < 0) return LAKE_LEVEL;
  return Math.max(ground(x, z) + CANOPY * smoothstep(0.05, 0.6, forestDensity(x, z)), groveTop(x, z));
}

/**
 * The top of everything a dragon could hit: water, bare ground, or the tallest tree that may
 * stand here. The gaps (gorge, meadow) are open down to the ground.
 */
export function clearHeight(x, z) {
  if (lakeDistance(x, z) < 0) return LAKE_LEVEL;
  return Math.max(ground(x, z) + TREE_MAX * smoothstep(0.05, 0.5, forestDensity(x, z)), groveTop(x, z));
}

// ---------------------------------------------------------------------------------------------
// Light, haze and sky. Colours are linear RGB; toDisplay() turns them into what the screen gets.
// The same formulas are in the shaders (shaders.js); keep the two in step.
// ---------------------------------------------------------------------------------------------

export const srgb = (r, g, b) => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
export const hex = (h) => srgb(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);

/**
 * The grade: how a linear colour becomes what the screen shows. It is the look of the whole
 * piece, and it is three numbers:
 *   exposure   where the soft shoulder sits: bright things roll off toward white, never clip
 *   gamma      one per channel, and not the same: red is held down in the dark and blue is
 *              lifted, so shadows go cool while the sunlit side stays warm (in the highlights
 *              the three meet again). This is the "warm lights, cool shadows" of a film grade,
 *              and because each channel has its own curve it costs the shader nothing.
 *   contrast   how much of an S-curve is laid over the result: darks deeper, lights brighter
 * shaders.js builds its dvDisplay() from these same numbers.
 */
export const GRADE = {
  exposure: 1.0,
  gamma: [0.485, 0.4545, 0.425],
  contrast: 0.5,
};

const displayChannel = (v, i) => {
  const g = Math.pow(1 - Math.exp(-Math.max(v, 0) * GRADE.exposure), GRADE.gamma[i]);
  return g + GRADE.contrast * (g * g * (3 - 2 * g) - g);
};

/** Linear colour to what is written to the screen: a soft shoulder, gamma, contrast. In place. */
export function toDisplay(c) {
  c[0] = displayChannel(c[0], 0);
  c[1] = displayChannel(c[1], 1);
  c[2] = displayChannel(c[2], 2);
  return c;
}

/**
 * The other way: the linear colour that toDisplay() turns into this screen colour (each channel
 * 0..1). The sky and the haze are chosen as the colours they should have on the screen, and
 * turned into linear light with this, once, when the page starts.
 */
export function fromDisplay(r, g, b) {
  const out = [r, g, b];
  for (let i = 0; i < 3; i++) {
    const y = clamp(out[i], 0, 0.992);
    // Undo the S-curve (Newton's method: it is monotonic), then the gamma, then the shoulder.
    let s = y;
    for (let n = 0; n < 12; n++) {
      const f = s + GRADE.contrast * (s * s * (3 - 2 * s) - s) - y;
      const df = 1 + GRADE.contrast * (6 * s - 6 * s * s - 1);
      s = clamp(s - f / df, 0, 1);
    }
    const shoulder = Math.min(Math.pow(s, 1 / GRADE.gamma[i]), 0.9995);
    out[i] = -Math.log(1 - shoulder) / GRADE.exposure;
  }
  return out;
}

/**
 * How far the sun's light wraps past the edge of what it strikes (0: a hard edge at a right
 * angle to the sun). Not far: with the sun this low it is the difference between lit and
 * unlit that gives a tree or a hill its shape, and the sides turned from the sun go to the
 * blue of the dusk.
 */
export const SUN_WRAP = 0.16;

export const LIGHT = {
  sun: [2.8, 0.8, 0.16], // the last of the sun: strong, and deep orange
  sky: [0.1, 0.117, 0.225], // light from above: the blue of dusk
  bounce: [0.12, 0.06, 0.045], // light from below: dim and warm, off the leaves
  exposure: GRADE.exposure,
};

/**
 * Haze. Its colour depends on which way one looks: blazing orange into the sun, a dusty rose
 * to the sides, the violet of the earth's shadow with the sun at one's back. All three are
 * given as screen colours. There is a lot of it: it is what gives the valley its depth (each
 * ridge a shade paler than the one in front), it carries the sun's glow down between the
 * hills, and it hides the far edge of what is drawn.
 */
export const FOG = {
  color: fromDisplay(0.27, 0.27, 0.49), // away from the sun
  sideColor: fromDisplay(0.58, 0.3, 0.37), // across it
  sunColor: fromDisplay(0.95, 0.47, 0.16), // into it
  haze: 0.0008, // haze everywhere, per metre
  mist: 0.013, // extra at lake level, per metre
  falloff: 1 / 9, // the mist lies on the water: it thins with height, on a 9 m scale
  base: LAKE_LEVEL,
  desaturate: 0.3, // how far colour drains out of what the haze covers, at full haze
};

/**
 * The sky above the haze, as screen colours at a few heights above the horizon (degrees), in
 * three columns: looking toward the sun, across it, and away from it. On the horizon itself the
 * sky is the colour of the haze, so that far land fades into it without a seam.
 */
export const SKY = {
  stops: [0, 1.3, 4, 9, 16, 26, 40, 60, 90],
  toward: [null, [1.0, 0.64, 0.25], [1.0, 0.55, 0.2], [0.97, 0.41, 0.2], [0.8, 0.3, 0.29], [0.52, 0.24, 0.39], [0.27, 0.18, 0.4], [0.12, 0.11, 0.31], [0.055, 0.065, 0.21]],
  side: [null, [0.78, 0.47, 0.42], [0.74, 0.44, 0.43], [0.63, 0.38, 0.46], [0.47, 0.31, 0.47], [0.31, 0.24, 0.44], [0.18, 0.16, 0.38], [0.095, 0.1, 0.29], [0.055, 0.065, 0.21]],
  // Over the earth's shadow the sky is rose for a hand's breadth (the "belt of Venus").
  away: [null, [0.4, 0.34, 0.53], [0.54, 0.4, 0.55], [0.66, 0.43, 0.53], [0.48, 0.35, 0.52], [0.28, 0.24, 0.46], [0.16, 0.16, 0.38], [0.09, 0.1, 0.29], [0.055, 0.065, 0.21]],
};
for (const column of [SKY.toward, SKY.side, SKY.away]) for (let i = 1; i < column.length; i++) column[i] = fromDisplay(column[i][0], column[i][1], column[i][2]);

/** Haze colour looking along a unit direction (linear). The same formula is in shaders.js. */
export function fogColor(dx, dy, dz, out) {
  const s = dx * SUN_DIR[0] + dy * SUN_DIR[1] + dz * SUN_DIR[2];
  const a = Math.max(s, 0);
  const a2 = a * a;
  const a8 = a2 * a2 * a2 * a2;
  const side = smoothstep(-0.9, 0.35, s);
  const sun = a2 * 0.35 + a8 * 0.65;
  out[0] = lerp(lerp(FOG.color[0], FOG.sideColor[0], side), FOG.sunColor[0], sun);
  out[1] = lerp(lerp(FOG.color[1], FOG.sideColor[1], side), FOG.sunColor[1], sun);
  out[2] = lerp(lerp(FOG.color[2], FOG.sideColor[2], side), FOG.sunColor[2], sun);
  return out;
}

/**
 * Lay haze over a linear colour, in place: `amount` of it (0..1), of colour `fog`. What is
 * covered loses its own colour a little faster than it gains the haze's.
 */
export function hazeOver(c, fog, amount) {
  const grey = 0.3 * c[0] + 0.5 * c[1] + 0.2 * c[2];
  const d = amount * FOG.desaturate;
  for (let i = 0; i < 3; i++) c[i] = lerp(lerp(c[i], grey, d), fog[i], amount);
  return c;
}

/** How much haze lies between an eye and a point `dist` metres away along a unit direction. */
export function fogAmount(eyeY, dirY, dist) {
  const above = Math.max(eyeY - FOG.base, 0);
  let t = FOG.falloff * dirY * dist;
  if (t < -FOG.falloff * above) t = -FOG.falloff * above; // nothing is counted below the lake
  const k = Math.abs(t) < 1e-4 ? 1 : (1 - Math.exp(-t)) / t;
  const depth = FOG.mist * Math.exp(-FOG.falloff * above) * dist * k + FOG.haze * dist;
  return 1 - Math.exp(-depth);
}

const tmpFog = [0, 0, 0];

const SUN_FLAT = Math.hypot(SUN_DIR[0], SUN_DIR[2]);

/**
 * Sky colour along a unit direction (linear RGB). `glow` (default true) adds the light round
 * the sun, though not its disc: the picture draws that glow as a thing of its own (scene.js,
 * buildSky), and asks for the sky without it; the lake's mirror image wants it in.
 */
export function skyColor(dx, dy, dz, out, glow) {
  const flat = Math.hypot(dx, dz) || 1;
  fogColor(dx / flat, 0, dz / flat, tmpFog);
  // Which of the three columns: by how far round from the sun this is.
  const round = (dx * SUN_DIR[0] + dz * SUN_DIR[2]) / (flat * SUN_FLAT);
  const toward = smoothstep(0, 1, round);
  const away = smoothstep(0, 1, -round);
  const side = 1 - toward - away;
  const up = Math.asin(clamp(dy, 0, 1)) / DEG;
  const stops = SKY.stops;
  let k = 0;
  while (k + 2 < stops.length && up >= stops[k + 1]) k++;
  const t = clamp((up - stops[k]) / (stops[k + 1] - stops[k]), 0, 1);
  for (let i = 0; i < 3; i++) {
    const lo = k === 0 ? tmpFog[i] : SKY.toward[k][i] * toward + SKY.side[k][i] * side + SKY.away[k][i] * away;
    const hi = SKY.toward[k + 1][i] * toward + SKY.side[k + 1][i] * side + SKY.away[k + 1][i] * away;
    out[i] = lerp(lo, hi, t);
  }
  if (glow !== false) {
    const s = clamp(dx * SUN_DIR[0] + dy * SUN_DIR[1] + dz * SUN_DIR[2], -1, 1);
    const off = Math.acos(s) / DEG;
    const g = 2.6 * Math.exp(-off / 2.4) + 0.5 * Math.exp(-off / 8);
    out[0] += g;
    out[1] += g * 0.55;
    out[2] += g * 0.16;
  }
  return out;
}

/**
 * The moon: nearly full, and up in the east since before the sun began to set, as it is at this
 * time of the month. It stands opposite the sun (so behind the viewer and a little to their
 * right, over the trees at the back of the ledge: where the dragons come from when they swoop
 * over), drawn a good deal bigger than life, as the sun is. Painted on the sky (scene.js).
 *   azimuth    degrees to the RIGHT of straight behind the viewer
 *   elevation  degrees above the horizon: clear of the treetops behind, which reach 20
 *   radius     of its disc, degrees
 */
export const MOON = { azimuth: SUN_AZIMUTH / DEG + 2, elevation: 26, radius: 2.0 };
/** A unit vector toward the moon. */
export const MOON_DIR = (() => {
  const az = MOON.azimuth * DEG;
  const el = MOON.elevation * DEG;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
})();

/**
 * The first stars: how many are tried, and where they may be. Only where the sky has gone
 * dark enough to show one (well up, and well round from the sun), and brighter the darker it
 * is there.
 */
export const STARS = { count: 150, least: 18, fromSun: 62 };

/**
 * The far ranges: three lines of mountains beyond everything that is built, one behind the
 * other, each paler than the one in front. They are what makes the valley one valley in a big
 * country. Nothing is built for them: they are painted on the sky (scene.js, buildSky), so
 * they cost no depth and no haze, and they stand where real ones would, at no parallax.
 *   high   how high the tallest crests stand above the horizon (degrees)
 *   grain  how many peaks there are to the turn (more: narrower peaks)
 *   dim    its crests' share of the haze's light (the nearer, the darker)
 *   sky    how far its colour has gone over to the sky's (the farther, the more)
 * Farthest first.
 */
export const RANGES = [
  { high: 8.2, grain: 6.4, seed: 3.7, dim: 1, sky: 0.5 },
  { high: 5.2, grain: 4.9, seed: 11.2, dim: 0.8, sky: 0.14 },
  { high: 3.0, grain: 3.5, seed: 23.9, dim: 0.6, sky: 0 },
];

/**
 * How high the crest of range k stands above the horizon in the direction (dx, dz), in
 * degrees. The sun goes down in a saddle of the ranges, between two shoulders.
 */
export function rangeCrest(k, dx, dz) {
  const R = RANGES[k];
  const flat = Math.hypot(dx, dz) || 1;
  const x = dx / flat;
  const z = dz / flat;
  // Noise read round a circle, so that the line closes on itself behind the viewer.
  const n = fbm(x * R.grain + R.seed, z * R.grain - R.seed, 4);
  // Crests where the noise crosses nought: sharp on top, wide at the foot.
  const peak = Math.pow(clamp(1 - 1.7 * Math.abs(n), 0, 1), 1.4);
  const roll = 0.5 + 0.5 * noise2(x * R.grain * 0.31 - R.seed, z * R.grain * 0.31 + R.seed);
  const off = Math.acos(clamp((x * SUN_DIR[0] + z * SUN_DIR[2]) / SUN_FLAT, -1, 1));
  const saddle = Math.exp(-Math.pow(off / 0.17, 2));
  const shoulder = Math.exp(-Math.pow((off - 0.42) / 0.2, 2));
  return R.high * (0.3 + 0.5 * peak + 0.2 * roll + 0.22 * shoulder) * (1 - 0.6 * saddle);
}

/**
 * The colour (linear) of range k in the direction (dx, dz): at its crest (`top` 1) and down
 * toward its foot (`top` 0), where it stands in the haze of the valley behind the range in
 * front. Into `out`.
 */
export function rangeColor(k, dx, dz, top, out) {
  const R = RANGES[k];
  const flat = Math.hypot(dx, dz) || 1;
  fogColor(dx / flat, 0, dz / flat, tmpFog);
  // The sky a little above the horizon: what the haze between the ranges shines with.
  const e = Math.sin(1.3 * DEG);
  const c = Math.cos(1.3 * DEG);
  skyColor((dx / flat) * c, e, (dz / flat) * c, out, false);
  for (let i = 0; i < 3; i++) {
    const sky = out[i];
    const crest = lerp(tmpFog[i] * R.dim, sky, R.sky);
    const foot = lerp(tmpFog[i], sky, 0.55 + 0.3 * R.sky);
    out[i] = lerp(foot, crest, top);
  }
  return out;
}

/** Light on a surface with unit normal n, as a multiplier per channel. sunlit: 0 shade .. 1 sun. */
export function lightOn(nx, ny, nz, sunlit, out) {
  // The sun is low and the sky around it is bright: its light wraps a little past the edge.
  const d = Math.max((nx * SUN_DIR[0] + ny * SUN_DIR[1] + nz * SUN_DIR[2] + SUN_WRAP) / (1 + SUN_WRAP), 0) * sunlit;
  const up = ny * 0.5 + 0.5;
  for (let i = 0; i < 3; i++) out[i] = lerp(LIGHT.bounce[i], LIGHT.sky[i], up) + LIGHT.sun[i] * d;
  return out;
}

// ---------------------------------------------------------------------------------------------
// A cached grid of heights, for the things that ask very often (shadows, reflections).
// ---------------------------------------------------------------------------------------------

export class HeightGrid {
  /** Covers [-half, half] in x and z with n by n samples. `fn` is ground or clearHeight. */
  constructor(fn, half, n) {
    this.half = half;
    this.n = n;
    this.step = (2 * half) / (n - 1);
    this.data = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      const z = -half + j * this.step;
      for (let i = 0; i < n; i++) this.data[j * n + i] = fn(-half + i * this.step, z);
    }
  }

  /** Bilinear lookup. Outside the grid the edge value is used. */
  at(x, z) {
    const n = this.n;
    const fx = clamp((x + this.half) / this.step, 0, n - 1.001);
    const fz = clamp((z + this.half) / this.step, 0, n - 1.001);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const d = this.data;
    const k = iz * n + ix;
    return (d[k] * (1 - tx) + d[k + 1] * tx) * (1 - tz) + (d[k + n] * (1 - tx) + d[k + n + 1] * tx) * tz;
  }
}

/**
 * For every grid cell, the height above which a point there is in sunshine. Found by walking
 * from the cell toward the sun over the given heights (terrain with treetops) and noting how far
 * the land rises above the sunbeam. Returns a HeightGrid-like object with at(x, z).
 */
export function buildSunHeight(heights, half, n) {
  const out = Object.create(HeightGrid.prototype);
  out.half = half;
  out.n = n;
  out.step = (2 * half) / (n - 1);
  out.data = new Float32Array(n * n);
  const flat = Math.hypot(SUN_DIR[0], SUN_DIR[2]);
  const sx = SUN_DIR[0] / flat;
  const sz = SUN_DIR[2] / flat;
  const rise = SUN_DIR[1] / flat; // metres up per metre along the ground
  for (let j = 0; j < n; j++) {
    const z = -half + j * out.step;
    for (let i = 0; i < n; i++) {
      const x = -half + i * out.step;
      // A point at height y here is lit if, all the way to the sun, y + rise*d stays above the land.
      let need = heights.at(x, z);
      let d = 6;
      for (let k = 0; k < 44; k++) {
        const hx = x + sx * d;
        const hz = z + sz * d;
        if (Math.abs(hx) > heights.half || Math.abs(hz) > heights.half) break;
        const y = heights.at(hx, hz) - rise * d;
        if (y > need) need = y;
        d *= 1.13;
      }
      out.data[j * n + i] = need;
    }
  }
  return out;
}

/** 0 in shadow .. 1 in sun, for a point at height y, with a soft edge `soft` metres tall. */
export function sunlitAt(sunHeight, x, y, z, soft) {
  const s = soft || 3;
  return smoothstep(-s, s, y - sunHeight.at(x, z));
}

// ---------------------------------------------------------------------------------------------
// The forest
// ---------------------------------------------------------------------------------------------

/** Autumn canopy colours (sRGB in, stored linear). */
export const LEAF = {
  scarlet: srgb(0.8, 0.15, 0.08),
  flame: srgb(0.92, 0.33, 0.08),
  orange: srgb(0.96, 0.5, 0.1),
  gold: srgb(0.97, 0.7, 0.13),
  yellow: srgb(0.94, 0.82, 0.22),
  russet: srgb(0.6, 0.26, 0.1),
  bronze: srgb(0.52, 0.34, 0.14),
  burgundy: srgb(0.5, 0.09, 0.1),
  olive: srgb(0.42, 0.48, 0.17),
  pine: srgb(0.1, 0.25, 0.15),
  tamarack: srgb(0.86, 0.63, 0.14),
};

const MAPLE = [LEAF.scarlet, LEAF.flame, LEAF.flame, LEAF.orange, LEAF.orange, LEAF.gold, LEAF.burgundy];
const OAK = [LEAF.russet, LEAF.russet, LEAF.bronze, LEAF.bronze, LEAF.burgundy, LEAF.orange];
const BIRCH = [LEAF.yellow, LEAF.yellow, LEAF.gold, LEAF.gold, LEAF.olive];

/** The colour of the canopy at a place: stands of one kind, with odd trees mixed in. */
export function canopyColor(x, z, pick, out) {
  const stand = noise2(x / 88 + 7.7, z / 88 - 3.3);
  const low = smoothstep(LAKE_LEVEL + 14, LAKE_LEVEL + 3, ground(x, z)); // 1 near the water
  let list;
  const odd = pick < 0.14;
  const p = odd ? pick / 0.14 : (pick - 0.14) / 0.86;
  if (odd) list = p < 0.4 ? MAPLE : p < 0.7 ? BIRCH : OAK;
  else if (stand + low * 0.9 > 0.42) list = BIRCH;
  else if (stand < -0.2) list = OAK;
  else list = MAPLE;
  const c = list[Math.min(Math.floor(hash2(Math.floor(p * 7919), list.length) * list.length), list.length - 1)];
  // A little spread in brightness so no two trees match.
  const v = 0.82 + 0.36 * hash2(Math.floor(p * 104729), 17);
  out[0] = c[0] * v;
  out[1] = c[1] * v;
  out[2] = c[2] * v;
  return out;
}

/** Are there pines here? In clumps, and along rocky edges. */
function pineChance(x, z) {
  const clump = smoothstep(0.38, 0.62, noise2(x / 46 + 31, z / 46 + 12));
  const front = bluffFront(x, z);
  const rim = front > -22 && front < 2 ? 0.35 : 0;
  return clamp(0.05 + 0.55 * clump + rim, 0, 0.8);
}

/** Tree levels of detail by distance from the viewer. */
export const LOD = { MID: 0, FAR: 1 };
export const FOREST_RANGE = { hero: 15, mid: 112, farA: 235, farB: 470 };

/**
 * Place the forest. Returns an array of trees:
 *   { x, y, z, height, radius, conifer, color:[r,g,b] linear, lod, yaw, order }
 * `order` is a random number in [0, 1): thinning the forest keeps the trees with the lowest.
 * `density` scales how many are tried (1 = the Quest 1 budget).
 */
export function placeForest(seed, density) {
  const rng = makeRng(seed);
  const trees = [];
  const color = [0, 0, 0];
  const bands = [
    { lod: LOD.MID, from: FOREST_RANGE.hero, to: FOREST_RANGE.mid, cell: 8.6, keep: 0.8 },
    { lod: LOD.FAR, from: FOREST_RANGE.mid, to: FOREST_RANGE.farA, cell: 12.5, keep: 0.86 },
    { lod: LOD.FAR, from: FOREST_RANGE.farA, to: FOREST_RANGE.farB, cell: 21, keep: 0.86 },
  ];
  for (const band of bands) {
    const cell = band.cell / Math.sqrt(density || 1);
    const n = Math.ceil(band.to / cell);
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        // Always draw the same numbers per cell, so one rejected tree does not move the rest.
        const jx = rng();
        const jz = rng();
        const keep = rng();
        const kind = rng();
        const size = rng();
        const pick = rng();
        const yaw = rng();
        const order = rng();
        const x = (i + 0.15 + 0.7 * jx) * cell;
        const z = (j + 0.15 + 0.7 * jz) * cell;
        const r = Math.hypot(x, z);
        if (r < band.from || r >= band.to) continue;
        if (keep > band.keep) continue;
        // Nothing far behind the viewer: the trees close by hide it.
        if (z > (band.lod === LOD.MID ? 80 : 95)) continue;
        const f = forestDensity(x, z);
        if (f < 0.5 || keep > band.keep * f) continue;
        if (slopeAt(x, z) > 1.05) continue;
        const y = ground(x, z);
        // Keep the view from the ledge open: in front, nothing close may stand taller than the
        // ledge itself.
        const headroom = z < 6 && r < 75 ? -5 - y : Infinity;
        if (headroom < 8) continue;
        // And straight ahead, nothing at all between the ledge and the lake.
        if (z < 0 && r < 75 && Math.abs(x) < 9 + 0.22 * -z) continue;
        const far = band.lod === LOD.FAR;
        const lakeside = lakeDistance(x, z) < 26;
        const conifer = kind < (lakeside ? 0.3 : pineChance(x, z));
        let height;
        let radius;
        if (conifer) {
          height = 14 + 9 * size;
          radius = height * (0.18 + 0.05 * pick);
          if (lakeside) {
            // Tamarack: a conifer that turns gold.
            color[0] = LEAF.tamarack[0];
            color[1] = LEAF.tamarack[1];
            color[2] = LEAF.tamarack[2];
            height *= 0.75;
          } else {
            const v = 0.8 + 0.5 * pick;
            color[0] = LEAF.pine[0] * v;
            color[1] = LEAF.pine[1] * v;
            color[2] = LEAF.pine[2] * v;
          }
        } else {
          height = 12 + 8.5 * size;
          radius = height * (0.3 + 0.1 * pick);
          canopyColor(x, z, pick, color);
        }
        if (height > headroom) {
          radius *= headroom / height;
          height = headroom;
        }
        if (far) {
          // Far trees stand for a clump: wider, so fewer of them still close the canopy.
          const widen = band.cell > 15 ? 1.9 : 1.25;
          if (!conifer) radius *= widen;
          else radius *= 1.15;
        }
        trees.push({ x, y, z, height, radius, conifer, color: [color[0], color[1], color[2]], lod: band.lod, yaw: yaw * Math.PI * 2, order });
      }
    }
  }
  return trees;
}

/** Ground colour (linear RGB) for the terrain mesh. `slope` is rise over run. */
export function groundColor(x, z, h, slope, out) {
  const r = Math.hypot(x, z);
  const dl = lakeDistance(x, z);
  const f = forestDensity(x, z);
  const n = fbm(x / 6.5, z / 6.5, 2);
  const rock = srgb(0.5 + 0.07 * n, 0.4 + 0.05 * n, 0.43 + 0.05 * n); // quartzite: grey with a pink cast
  const grass = srgb(0.6 + 0.08 * n, 0.52 + 0.06 * n, 0.24);
  const litter = srgb(0.4 + 0.08 * n, 0.25 + 0.05 * n, 0.12);
  const sand = srgb(0.38, 0.31, 0.25);
  let c = grass;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  c = mix(c, litter, smoothstep(0.15, 0.7, f));
  // Under the trees, what shows between the crowns is more leaves: lower branches, saplings,
  // the litter. Far away the "ground" is the top of the canopy itself.
  if (f > 0.3 && r > 22) {
    const leaf = canopyColor(x, z, hash2(Math.floor(x / 9), Math.floor(z / 9)), [0, 0, 0]);
    const far = smoothstep(FOREST_RANGE.farA * 0.8, FOREST_RANGE.farA * 1.3, r);
    const dim = lerp(0.5, 0.66, far);
    const much = lerp(0.6, 1, far) * smoothstep(0.3, 0.7, f) * smoothstep(22, 40, r);
    c = mix(c, [leaf[0] * dim, leaf[1] * dim, leaf[2] * dim], much);
  }
  c = mix(c, rock, smoothstep(0.75, 1.15, slope));
  // The slope under the viewer's cliff is fallen rock (talus), not forest floor.
  const under = bluffFront(x, z);
  if (under > 0 && under < 60) c = mix(c, rock, smoothstep(0.3, 0.55, slope) * (1 - smoothstep(34, 60, under)));
  if (r < 40) {
    // The pulpit and the rim of the bluff are bare rock, in patches that follow no circle.
    const front = bluffFront(x, z);
    const bare = smoothstep(-7, -2.5, front + 3.5 * noise2(x / 5 + 2, z / 5 - 4));
    c = mix(c, rock, bare);
  }
  if (dl < 7) c = mix(sand, c, smoothstep(1.5, 7, dl));
  if (dl < 0) c = srgb(0.16, 0.2, 0.2);
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
  return out;
}
