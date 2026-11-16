/**
 * ledge.js: what stands close to the viewer: the trees around the ledge (world.HERO_TREES),
 * boulders, and the leaves that have already come down. Pure (no three.js): it fills a
 * MeshBuilder, and scene.js draws the result as one mesh.
 *
 * These are the only things near enough to shift against the valley when the viewer leans, so
 * they get more triangles each than anything in the forest: a real trunk with boughs, and a
 * crown of several lumps.
 *
 * Every tree stays inside the cylinder world.HERO_TREES gives it (crown radius, height of the
 * top above the ledge): flight.js keeps the dragons out of exactly that.
 */

import { MeshBuilder } from './meshbuilder.js';
import { HERO_TREES, GROVE, LEAF, ground, srgb } from './world.js';
import { makeRng, hash2, clamp, lerp } from './rng.js';

const TAU = Math.PI * 2;

const BARK = {
  maple: srgb(0.3, 0.22, 0.17),
  oak: srgb(0.25, 0.19, 0.15),
  pine: srgb(0.33, 0.21, 0.15),
  birch: srgb(0.9, 0.87, 0.8),
  birchMark: srgb(0.16, 0.14, 0.13),
};
const ROCK = srgb(0.52, 0.42, 0.45); // the same quartzite as the cliff
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/** What each kind of tree is made of. */
const KINDS = {
  maple: { leaves: [LEAF.scarlet, LEAF.flame, LEAF.flame, LEAF.orange], bark: 'maple', trunk: 0.36, crownFrom: 0.5, lumps: 7, lean: [0.9, -0.9], detail: 1 },
  maple2: { leaves: [LEAF.orange, LEAF.gold, LEAF.flame], bark: 'maple', trunk: 0.3, crownFrom: 0.36, lumps: 6, lean: [0, 0], detail: 1 },
  oak: { leaves: [LEAF.russet, LEAF.bronze, LEAF.russet, LEAF.burgundy], bark: 'oak', trunk: 0.42, crownFrom: 0.34, lumps: 7, lean: [0, 0], detail: 1, wide: 1.12 },
  oak2: { leaves: [LEAF.bronze, LEAF.russet, LEAF.orange], bark: 'oak', trunk: 0.36, crownFrom: 0.34, lumps: 6, lean: [0, 0], detail: 1, wide: 1.1 },
  birch: { leaves: [LEAF.yellow, LEAF.gold, LEAF.yellow], bark: 'birch', trunk: 0.2, crownFrom: 0.55, lumps: 6, lean: [-0.3, -0.2], detail: 1, airy: true },
  birch2: { leaves: [LEAF.gold, LEAF.yellow, LEAF.olive], bark: 'birch', trunk: 0.2, crownFrom: 0.6, lumps: 5, lean: [0.2, 0], detail: 1, airy: true },
  // The big trees by the creek (world.GROVE): the same build, twice the size. The two nearest
  // the lake, which the dragons are watched going behind, get the triangles; the rest are
  // 90 m off and more, and are built as coarsely as the forest is.
  elderMaple: { leaves: [LEAF.flame, LEAF.orange, LEAF.scarlet, LEAF.orange], bark: 'maple', trunk: 0.62, crownFrom: 0.5, lumps: 7, lean: [0, 0], detail: 1 },
  elderGold: { leaves: [LEAF.gold, LEAF.yellow, LEAF.orange, LEAF.gold], bark: 'maple', trunk: 0.58, crownFrom: 0.5, lumps: 7, lean: [0, 0], detail: 1 },
  elderOak: { leaves: [LEAF.russet, LEAF.bronze, LEAF.burgundy, LEAF.russet], bark: 'oak', trunk: 0.7, crownFrom: 0.5, lumps: 8, lean: [0, 0], detail: 0, wide: 1.1, sides: 5 },
  elderMaple2: { leaves: [LEAF.scarlet, LEAF.flame, LEAF.orange], bark: 'maple', trunk: 0.6, crownFrom: 0.5, lumps: 7, lean: [0, 0], detail: 0, sides: 5 },
  farGold: { leaves: [LEAF.yellow, LEAF.gold, LEAF.orange], bark: 'maple', trunk: 0.55, crownFrom: 0.5, lumps: 6, lean: [0, 0], detail: 0, boughs: false, sides: 4 },
  farMaple: { leaves: [LEAF.orange, LEAF.flame, LEAF.gold], bark: 'maple', trunk: 0.55, crownFrom: 0.5, lumps: 6, lean: [0, 0], detail: 0, boughs: false, sides: 4 },
};
const PINES = { pine: 6, whitePine: 6, farPine: 4, farPine2: 4 }; // sides of the trunk

/** Leaves: lighter on top, darker underneath, and mottled a little. */
function leafColor(base, dir, f, seed) {
  const v = (0.56 + 0.56 * (dir[1] * 0.5 + 0.5)) * (0.88 + 0.24 * hash2(f, seed));
  return scale(base, v);
}

/**
 * A crown is soft: its colour runs smoothly over each lump, and the light falls on a lump as
 * on something round (a low sun on a rounded crown gives it a lit side, a dark side and a
 * glowing edge; on a faceted one it gives a scatter of bright and dark triangles).
 */
const SOFT = { corner: true, round: 0.75 };

/**
 * A broadleaf tree. spec: one of HERO_TREES; base: the height of the ground it stands on.
 * The crown is a handful of lumps on boughs that fork from the trunk.
 */
function broadleaf(m, spec, base, seed) {
  const kind = KINDS[spec.kind];
  const rng = makeRng(seed);
  const top = spec.height;
  const R = spec.radius;
  const phase = rng() * TAU;
  // The crown fills the top part of the tree; a tree that starts far below the ledge is mostly trunk.
  const crown0 = Math.max(base + (top - base) * kind.crownFrom, top - 2.2 * R);
  const span = top - crown0;
  const lx = kind.lean[0];
  const lz = kind.lean[1];
  const bark = BARK[kind.bark];
  const isBirch = kind.bark === 'birch';
  const barkColor = (k, i) => {
    if (isBirch) return hash2(k * 7 + i, seed) < 0.2 ? BARK.birchMark : scale(bark, 0.86 + 0.2 * hash2(i, seed + k));
    return scale(bark, 0.8 + 0.4 * hash2(k * 5 + i, seed));
  };
  const swayAt = (y) => 0.05 + 0.3 * clamp((y - crown0) / Math.max(span, 1), 0, 1);
  const wood = (y) => [0.6 * swayAt(y), 0, 0, phase];

  // Trunk: up to the middle of the crown, bending toward the way it leans.
  const r0 = kind.trunk;
  const trunkTop = crown0 + span * 0.55;
  const bend = [rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)];
  const trunk = [];
  const steps = 5;
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    const y = lerp(base - 0.6, trunkTop, f);
    const out = f * f;
    const wig = Math.sin(f * Math.PI) * 1.0;
    trunk.push({ p: [spec.x + lx * out + bend[0] * wig, y, spec.z + lz * out + bend[1] * wig], r: r0 * lerp(1.15, 0.3, Math.pow(f, 0.8)) });
  }
  m.tube(trunk, kind.sides || 6, barkColor, (k) => wood(trunk[k].p[1]));

  // Lumps of leaves: one at the top, the rest in a ring round the trunk, all inside the cylinder.
  const lumps = [];
  const n = kind.lumps;
  const wide = kind.wide || 1;
  const size = kind.airy ? 0.34 : 0.46;
  lumps.push({ c: [spec.x + lx, top - span * 0.3, spec.z + lz], r: [R * 0.5, span * 0.3, R * 0.5] });
  for (let i = 0; i < n - 1; i++) {
    const a = (i / (n - 1)) * TAU + rng.range(-0.25, 0.25);
    const rh = R * size * rng.range(0.85, 1.12);
    // The lump's far side must not pass the edge of the cylinder.
    const d = Math.min(R * rng.range(0.42, 0.58) * wide, R * 0.97 - rh - Math.hypot(lx, lz));
    const y = crown0 + span * (kind.airy ? rng.range(0.2, 0.62) : rng.range(0.24, 0.5));
    lumps.push({ c: [spec.x + lx + Math.cos(a) * d, y, spec.z + lz + Math.sin(a) * d], r: [rh, Math.min(span * rng.range(0.22, 0.3), y - crown0 + 0.4), rh] });
  }
  lumps.forEach((lump, i) => {
    const base0 = kind.leaves[i % kind.leaves.length];
    const tint = scale(base0, 0.9 + 0.25 * rng());
    m.blob(lump.c, lump.r, kind.detail, 0.2, seed + i * 13, (dir, f) => leafColor(tint, dir, f, seed + i), (dir) => [swayAt(lump.c[1] + dir[1] * lump.r[1]), 1, 0, phase], SOFT);
    if (i === 0 || kind.boughs === false) return;
    // A bough from the trunk into the lump.
    const from = trunk[2 + (i % 3)];
    const mid = [lerp(from.p[0], lump.c[0], 0.55), lerp(from.p[1], lump.c[1], 0.35), lerp(from.p[2], lump.c[2], 0.55)];
    m.tube(
      [{ p: from.p, r: from.r * 0.55 }, { p: mid, r: from.r * 0.4 }, { p: [lump.c[0], lump.c[1] - lump.r[1] * 0.2, lump.c[2]], r: from.r * 0.18 }],
      4, barkColor, (k) => wood(k === 0 ? from.p[1] : lump.c[1])
    );
  });
  return { phase, crown0 };
}

/** A white pine: a tall bare trunk and flat, ragged tiers of boughs, each a little turned. */
function pine(m, spec, base, seed) {
  const sides = PINES[spec.kind] || 6;
  const rng = makeRng(seed);
  const top = spec.height;
  const R = spec.radius;
  const phase = rng() * TAU;
  const bark = BARK.pine;
  const tall = top - base;
  const first = top - Math.min(tall * 0.62, 26); // where the boughs begin
  const sway = (y) => 0.04 + 0.34 * clamp((y - first) / (top - first), 0, 1);
  m.tube(
    [
      { p: [spec.x, base - 0.6, spec.z], r: 0.5 },
      { p: [spec.x + 0.15, lerp(base, top, 0.45), spec.z - 0.1], r: 0.36 },
      { p: [spec.x, top - 3, spec.z], r: 0.12 },
      { p: [spec.x, top - 0.4, spec.z], r: 0.03 },
    ],
    sides, (k, i) => scale(bark, 0.8 + 0.4 * hash2(k * 5 + i, seed)), (k) => [k < 2 ? 0 : sway(top) * 0.6, 0, 0, phase]
  );
  const tiers = Math.max(6, Math.round((top - first) / 2.7));
  const green = LEAF.pine;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = lerp(first, top - 1.6, f);
    // Widest a third of the way up the crown, a point at the top.
    const r = R * (0.3 + 0.7 * Math.sin(Math.PI * (0.2 + 0.8 * (1 - f)) * 0.9)) * (t === tiers - 1 ? 0.5 : 1);
    const sides = 6;
    const turn = rng() * TAU;
    const rim = [];
    for (let i = 0; i < sides; i++) {
      const a = turn + (i / sides) * TAU;
      const k = r * rng.range(0.62, 1);
      rim.push([spec.x + Math.cos(a) * k, y - 0.25 * r - rng() * 0.5, spec.z + Math.sin(a) * k]);
    }
    const peak = [spec.x, y + 0.5 * r + 0.5, spec.z];
    const under = [spec.x, y - 0.1 * r, spec.z];
    const aTop = [sway(y + 1), 1, 0, phase];
    const aRim = [sway(y), 1, 0, phase];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const v = (0.8 + 0.5 * hash2(i + t * 9, seed)) * (0.9 + 0.3 * f);
      // Seen from above (lighter), and from below (the shaded inside of the tier).
      m.tri(rim[j], rim[i], peak, [scale(green, v * 0.85), scale(green, v * 0.85), scale(green, v * 1.3)], [aRim, aRim, aTop]);
      m.tri(rim[i], rim[j], under, scale(green, v * 0.45), [aRim, aRim, aRim]);
    }
  }
  return { phase };
}

/** A boulder sitting in the ground. */
function boulder(m, x, z, r, squat, seed, surface) {
  const y = surface(x, z);
  const ry = r * squat;
  const tint = scale(ROCK, 0.85 + 0.3 * hash2(seed, 3));
  m.blob([x, y + ry * 0.35, z], [r, ry, r * (0.75 + 0.5 * hash2(seed, 5))], r > 0.8 ? 1 : 0, 0.22, seed, (dir, f) => scale(tint, (0.72 + 0.4 * (dir[1] * 0.5 + 0.5)) * (0.9 + 0.2 * hash2(f, seed))), [0, 0, 0, 0]);
}

/** Where the boulders are: [x, z, radius, how squat]. None stands in the view over the valley. */
const BOULDERS = [
  [2.15, -1.25, 0.34, 0.6],
  [-2.3, -0.75, 0.42, 0.55],
  [-2.05, -1.45, 0.2, 0.7],
  [2.55, 0.9, 0.5, 0.62],
  [-2.2, 2.6, 0.38, 0.7],
  [1.7, 5.6, 0.75, 0.6],
  [-2.4, 8.4, 1.0, 0.55],
  [3.4, 12.5, 1.35, 0.6],
  [-7.5, 15.5, 1.7, 0.5],
  [-6.2, 17.2, 0.8, 0.6],
  [11.5, 19, 1.5, 0.55],
  [17.5, 15.5, 2.1, 0.5],
  [19.8, 17, 1.0, 0.6],
  [-13, 21, 1.2, 0.6],
  [9, 31, 1.9, 0.5],
  [24, 27, 1.6, 0.55],
];

const LITTER = [LEAF.scarlet, LEAF.flame, LEAF.flame, LEAF.orange, LEAF.orange, LEAF.gold, LEAF.yellow, LEAF.russet, LEAF.bronze];

/**
 * Fallen leaves on the rock: small kites lying almost flat, most of them where the wind leaves
 * them, in the lee of the boulders and along the back of the ledge.
 */
function litter(m, surface, seed, count) {
  const rng = makeRng(seed);
  let made = 0;
  for (let tries = 0; tries < count * 6 && made < count; tries++) {
    // Near the viewer mostly, thinning out along the neck of rock behind.
    const nearby = rng() < 0.6;
    const a = rng() * TAU;
    const d = nearby ? 0.5 + 2.4 * Math.sqrt(rng()) : 1 + 9 * rng();
    const x = nearby ? Math.cos(a) * d : rng.range(-3, 3);
    const z = nearby ? Math.sin(a) * d : d + 1.5;
    // Not on anything steep (the rim), and not right under the viewer's feet.
    const e = 0.12;
    const slope = Math.hypot(surface(x + e, z) - surface(x - e, z), surface(x, z + e) - surface(x, z - e)) / (2 * e);
    if (slope > 0.5 || Math.hypot(x, z) < 0.35) continue;
    const size = rng.range(0.04, 0.066);
    const yaw = rng() * TAU;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const curl = rng.range(0.004, 0.03);
    const lift = 0.012;
    const at = (u, v, h) => {
      const px = x + (u * cs - v * sn) * size;
      const pz = z + (u * sn + v * cs) * size;
      return [px, surface(px, pz) + lift + h, pz];
    };
    // A kite: stem end, two sides, tip.
    const p0 = at(-1.1, 0, 0);
    const p1 = at(0, 0.8, curl);
    const p2 = at(1.3, 0, curl * 0.4);
    const p3 = at(0, -0.8, 0);
    const c = scale(LITTER[rng.int(LITTER.length)], rng.range(0.55, 1.05));
    const aux = [0, 1, 0, 0];
    // Both halves face up.
    m.tri(p0, p1, p2, [scale(c, 0.9), scale(c, 1.1), c], aux);
    m.tri(p0, p2, p3, [scale(c, 0.9), c, scale(c, 0.8)], aux);
    made++;
  }
  return made;
}

/**
 * Build everything. surface(x, z): height of the drawn ground (see terrain.surfaceNear).
 * Returns { arrays, trees: [{ x, y, z, radius, kind, phase }], triangles }.
 */
export function buildLedge(surface, seed) {
  const m = new MeshBuilder();
  const trees = [];
  HERO_TREES.forEach((spec, i) => {
    const base = Math.min(ground(spec.x, spec.z), surface(spec.x, spec.z));
    const made = spec.kind in PINES ? pine(m, spec, base, seed + i * 101) : broadleaf(m, spec, base, seed + i * 101);
    trees.push({ x: spec.x, z: spec.z, top: spec.height, radius: spec.radius, kind: spec.kind, base, phase: made.phase, crown0: made.crown0 });
  });
  BOULDERS.forEach((b, i) => boulder(m, b[0], b[1], b[2], b[3], seed + 500 + i, surface));
  const leaves = litter(m, surface, seed + 900, 170);
  const arrays = m.arrays();
  return { arrays, trees, litter: leaves, triangles: arrays.triangles };
}

/**
 * The big trees by the creek (world.GROVE), as one mesh of their own: they are all in one part
 * of the view, so the mesh can be left out whenever that part is not looked at.
 * surface(x, z): height of the drawn ground (terrain.heightAt). Returns { arrays, trees, triangles }.
 */
export function buildGrove(surface, seed) {
  const m = new MeshBuilder();
  const trees = [];
  GROVE.forEach((spec, i) => {
    // The drawn ground is coarse this far out: start the trunk a little under it.
    const base = Math.min(ground(spec.x, spec.z), surface(spec.x, spec.z)) - 0.8;
    const made = spec.kind in PINES ? pine(m, spec, base, seed + 7000 + i * 131) : broadleaf(m, spec, base, seed + 7000 + i * 131);
    trees.push({ x: spec.x, z: spec.z, top: spec.height, radius: spec.radius, kind: spec.kind, base, phase: made.phase, crown0: made.crown0 });
  });
  const arrays = m.arrays();
  return { arrays, trees, triangles: arrays.triangles };
}
