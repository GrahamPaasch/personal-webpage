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
 * Where the sun is: a little left of straight ahead and low, so it hangs over the far end of the
 * lake. A unit vector toward it.
 */
export const SUN_AZIMUTH = 12 * DEG; // left of straight ahead
export const SUN_ELEVATION = 9 * DEG;
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

const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
const smin = (a, b, k) => -smax(-a, -b, k);

/**
 * How far a point is outside the top of the viewer's bluff, in metres (negative: on top of it).
 * The top is a wooded plateau behind the viewer, and in front of it a narrow pulpit of rock that
 * juts out over the valley: the ledge. The edge is 2.6 m in front of the viewer and 3 m to each
 * side, so the valley can be seen straight down on three sides.
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
  let bluff;
  if (front <= 0) {
    // The rock rounds off toward its rim.
    bluff = plateau - 0.35 * smoothstep(-1.6, 0, front);
  } else {
    const ledges = 1.6 * noise2(x / 7 + 3, z / 7) * smoothstep(1, 6, front);
    bluff = plateau - 0.35 - 13 * smoothstep(0, 5, front) - 0.62 * Math.max(front - 3, 0) + ledges;
  }
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
    h = LAKE_LEVEL + (h - LAKE_LEVEL) * s + 0.7 * smoothstep(0, 6, dl);
  } else {
    h = LAKE_LEVEL + Math.max(dl * 0.4, -9);
  }

  // The ledge itself: level rock where the viewer stands.
  if (r < 2.4) h = lerp(0, h, smoothstep(1.2, 2.4, r));
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
  // (HERO_TREES): that is the way a dragon comes over.
  if (z > 0 && x > -4) f *= Math.max(smoothstep(58, 68, r), 1 - smoothstep(-4, 4, x));
  // The cliff and the fallen rock under it are bare; trees begin lower down the slope.
  const front = bluffFront(x, z);
  if (front > -1.5) f *= smoothstep(44, 56, front);
  // Under the ledge itself the fallen rock fans out wider: nothing grows within 60 m of it.
  if (z < 12) f *= smoothstep(60, 72, r);
  // Straight ahead nothing stands between the ledge and the lake.
  if (z < 0) f *= smoothstep(0, 7, Math.abs(x) - (9 + 0.22 * -z)) + smoothstep(70, 82, -z) - smoothstep(0, 7, Math.abs(x) - (9 + 0.22 * -z)) * smoothstep(70, 82, -z);
  // A few natural clearings.
  f *= 1 - smoothstep(0.52, 0.66, fbm(x / 130 + 20, z / 130 - 6, 2) * 1.6);
  return f;
}

/**
 * The trees that stand close to the ledge, placed by hand: [x, z, height, crown radius, kind].
 * The big maple leans over the viewer's left shoulder and sheds the leaves that drift past; the
 * right side is kept open, because that is where a dragon comes over.
 */
export const HERO_TREES = [
  { x: -7.5, z: 5.5, height: 15, radius: 5.6, kind: 'maple' },
  { x: 18.5, z: 13.5, height: 11, radius: 3, kind: 'birch' },
  { x: -16.5, z: 13, height: 14, radius: 6, kind: 'oak' },
  { x: 27, z: 9, height: 19, radius: 3.4, kind: 'pine' },
  { x: -3, z: 19, height: 13, radius: 5, kind: 'maple2' },
  { x: 7, z: 23.5, height: 12, radius: 4.6, kind: 'oak2' },
  { x: -24, z: 4, height: 10, radius: 3, kind: 'birch2' },
];

/** Typical treetop height above the ground, and the tallest any tree grows. */
export const CANOPY = 17;
export const TREE_MAX = 23;

/** The top of the land as the light sees it: water, bare ground, or the forest's canopy. */
export function canopyHeight(x, z) {
  if (lakeDistance(x, z) < 0) return LAKE_LEVEL;
  return ground(x, z) + CANOPY * smoothstep(0.05, 0.6, forestDensity(x, z));
}

/**
 * The top of everything a dragon could hit: water, bare ground, or the tallest tree that may
 * stand here. The gaps (gorge, meadow) are open down to the ground.
 */
export function clearHeight(x, z) {
  if (lakeDistance(x, z) < 0) return LAKE_LEVEL;
  return ground(x, z) + TREE_MAX * smoothstep(0.05, 0.5, forestDensity(x, z));
}

// ---------------------------------------------------------------------------------------------
// Light, haze and sky. Colours are linear RGB; toDisplay() turns them into what the screen gets.
// The same formulas are in the shaders (shaders.js); keep the two in step.
// ---------------------------------------------------------------------------------------------

export const srgb = (r, g, b) => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
export const hex = (h) => srgb(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);

export const LIGHT = {
  sun: [2.5, 1.5, 0.74], // low sun: strong and orange
  sky: [0.2, 0.27, 0.46], // light from above: cool
  bounce: [0.3, 0.19, 0.1], // light from below: warm, off the leaves
  exposure: 1.25,
};

export const FOG = {
  color: srgb(0.8, 0.69, 0.71), // away from the sun: dusty pink
  sunColor: [1.75, 1.16, 0.5], // toward the sun: gold
  haze: 0.00085, // thin haze everywhere, per metre
  mist: 0.0065, // extra at lake level, per metre
  falloff: 1 / 14, // the mist thins with height; 14 m scale
  base: LAKE_LEVEL,
};

export const SKY = {
  zenith: srgb(0.2, 0.36, 0.66),
  upper: srgb(0.48, 0.58, 0.8),
};

/** Haze colour looking along a unit direction: gold toward the sun, pink away from it. */
export function fogColor(dx, dy, dz, out) {
  const s = Math.max(dx * SUN_DIR[0] + dy * SUN_DIR[1] + dz * SUN_DIR[2], 0);
  const s2 = s * s;
  const s8 = s2 * s2 * s2 * s2;
  const k = s8 * 0.8 + s2 * 0.2;
  out[0] = lerp(FOG.color[0], FOG.sunColor[0], k);
  out[1] = lerp(FOG.color[1], FOG.sunColor[1], k);
  out[2] = lerp(FOG.color[2], FOG.sunColor[2], k);
  return out;
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

/** Sky colour along a unit direction (linear RGB), sun glow included but not the disc. */
export function skyColor(dx, dy, dz, out) {
  const flat = Math.hypot(dx, dz) || 1;
  fogColor(dx / flat, 0, dz / flat, tmpFog);
  const up = Math.max(dy, 0);
  const a = 1 - Math.exp(-up * 5.5); // horizon band -> upper sky
  const b = smoothstep(0.15, 0.95, up); // upper sky -> zenith
  for (let i = 0; i < 3; i++) {
    const upper = lerp(SKY.upper[i], SKY.zenith[i], b);
    out[i] = lerp(tmpFog[i], upper, a);
  }
  const s = Math.max(dx * SUN_DIR[0] + dy * SUN_DIR[1] + dz * SUN_DIR[2], 0);
  const glow = Math.pow(s, 24) * 0.55 + Math.pow(s, 220) * 1.6;
  out[0] += glow * 1.9;
  out[1] += glow * 1.35;
  out[2] += glow * 0.7;
  return out;
}

/** Linear colour to what is written to the screen: a soft shoulder, then gamma. In place. */
export function toDisplay(c) {
  for (let i = 0; i < 3; i++) c[i] = Math.pow(1 - Math.exp(-Math.max(c[i], 0) * LIGHT.exposure), 1 / 2.2);
  return c;
}

/** Light on a surface with unit normal n, as a multiplier per channel. sunlit: 0 shade .. 1 sun. */
export function lightOn(nx, ny, nz, sunlit, out) {
  // The sun is low and the sky around it is bright: its light wraps a little past the edge.
  const d = Math.max((nx * SUN_DIR[0] + ny * SUN_DIR[1] + nz * SUN_DIR[2] + 0.3) / 1.3, 0) * sunlit;
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
  const sand = srgb(0.52, 0.46, 0.34);
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
