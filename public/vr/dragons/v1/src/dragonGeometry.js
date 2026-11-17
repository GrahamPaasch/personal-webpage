/**
 * dragonGeometry.js: the dragon's shape, built from triangles in the rest pose. Pure.
 *
 * Low-poly on purpose (about a thousand triangles): the silhouette does the work, so the budget
 * goes to the parts that make one: horns, the row of spines down the back, the scalloped trailing
 * edge of the wings, the spade on the tail.
 *
 * Every vertex follows one or two bones (aux.x, aux.y) with aux.z as the weight of the first;
 * aux.w says what it is: 0 hide, 1 wing membrane (light shines through), 2 glowing (eyes).
 */

import { MeshBuilder } from './meshbuilder.js';
import { BONE, makeSkeleton } from './rig.js';
import { hash2 } from './rng.js';

const HIDE = 0;
const MEMBRANE = 1;
const GLOW = 2;

const scaleColor = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/**
 * colors: { back, side, belly, wingTop, wingUnder, bone, horn, eye } as linear RGB arrays.
 * Returns { arrays (from MeshBuilder), skeleton }.
 */
export function buildDragon(build, colors) {
  const skeleton = makeSkeleton(build);
  const b = skeleton.build;
  const s = b.scale;
  const m = new MeshBuilder();
  const P = (x, y, z) => [x * s, y * s, z * s];
  const one = (bone, kind) => [bone, bone, 1, kind || HIDE];
  const two = (a, c, w, kind) => [a, c, w, kind || HIDE];

  // -------------------------------------------------------------------------------------------
  // Body: a skin over the spine from the tip of the tail to the nose. Each station is
  // [z, y, half width, height above the middle, depth below it, bone A, bone B, weight of A].
  // -------------------------------------------------------------------------------------------
  const T = b.tail;
  const N = b.neck;
  const K = b.bulk;
  const tz = (i) => -1.7 - 1.25 * T * i; // where tail joint i sits
  const nz = (f) => 1.7 + f * N; // along the neck
  const ny = (f) => 0.25 + f * N;
  const stations = [
    [tz(4) - 1.55 * T, 0, 0.02, 0.02, 0.02, BONE.tail5, BONE.tail5, 1],
    [tz(4) - 0.8 * T, 0, 0.075, 0.09, 0.075, BONE.tail5, BONE.tail5, 1],
    [tz(4), 0, 0.125, 0.15, 0.125, BONE.tail4, BONE.tail5, 0.5],
    [tz(3), 0, 0.2, 0.24, 0.2, BONE.tail3, BONE.tail4, 0.5],
    [tz(2), 0, 0.29, 0.34, 0.29, BONE.tail2, BONE.tail3, 0.5],
    [tz(1), 0, 0.4 * K, 0.46, 0.4, BONE.tail1, BONE.tail2, 0.5],
    [tz(0), 0, 0.53 * K, 0.58, 0.55, BONE.hips, BONE.tail1, 0.5],
    [-0.95, 0, 0.66 * K, 0.7, 0.72 * K, BONE.hips, BONE.hips, 1],
    [-0.2, 0, 0.76 * K, 0.76, 0.86 * K, BONE.chest, BONE.hips, 0.5],
    [0.65, 0, 0.82 * K, 0.84, 0.98 * K, BONE.chest, BONE.chest, 1],
    [1.3, 0.05, 0.72 * K, 0.76, 0.8 * K, BONE.chest, BONE.chest, 1],
    [nz(0.15), ny(0.02), 0.5 * K, 0.52, 0.5, BONE.chest, BONE.neck1, 0.5],
    [nz(0.85), ny(0.2), 0.37, 0.4, 0.37, BONE.neck1, BONE.neck2, 0.5],
    [nz(1.7), ny(0.37), 0.31, 0.33, 0.31, BONE.neck2, BONE.neck3, 0.5],
    [nz(2.3), ny(0.44), 0.28, 0.31, 0.28, BONE.neck3, BONE.neck3, 1],
    [nz(2.55), ny(0.5), 0.37, 0.36, 0.24, BONE.neck3, BONE.head, 0.4],
    [nz(2.9), ny(0.5), 0.39, 0.38, 0.2, BONE.head, BONE.head, 1],
    [nz(3.3), ny(0.45), 0.28, 0.24, 0.14, BONE.head, BONE.head, 1],
    [nz(3.75), ny(0.42), 0.21, 0.17, 0.1, BONE.head, BONE.head, 1],
    [nz(4.05), ny(0.4), 0.13, 0.1, 0.06, BONE.head, BONE.head, 1],
  ];
  const SIDES = 8;
  // The outline of one slice: a ridge along the back, flat flanks, a keel under the chest.
  const shape = [
    [1, 0], [0.74, 0.62], [0, 1.12], [-0.74, 0.62], [-1, 0], [-0.8, -0.72], [0, -1], [0.8, -0.72],
  ];
  const rings = stations.map((st) => shape.map(([cx, cy]) => P(cx * st[2], st[1] + cy * (cy > 0 ? st[3] : st[4]), st[0])));
  const bodyColor = (i) => {
    // Faces between outline points i and i+1: 1, 2 are the back; 5, 6 the belly; the rest flanks.
    if (i === 1 || i === 2) return colors.back;
    if (i === 5 || i === 6) return colors.belly;
    return colors.side;
  };
  m.loft(rings, {
    faceColor: (k, i) => scaleColor(bodyColor(i), 0.88 + 0.24 * hash2(k * 8 + i, 5)),
    auxAt: (k) => two(stations[k][5], stations[k][6], stations[k][7]),
    capEnd: colors.side,
    capEndAux: one(BONE.head),
  });

  // -------------------------------------------------------------------------------------------
  // Head: lower jaw, horns, cheek spikes, eyes.
  // -------------------------------------------------------------------------------------------
  const jawRings = [
    [nz(2.62), ny(0.26), 0.3, 0.07],
    [nz(3.3), ny(0.27), 0.22, 0.06],
    [nz(3.95), ny(0.31), 0.1, 0.035],
  ].map(([z, y, w, h]) => [P(w, y + h, z), P(-w, y + h, z), P(-w * 0.8, y - h, z), P(w * 0.8, y - h, z)]);
  m.loft(jawRings, { faceColor: (k, i) => (i === 0 ? scaleColor(colors.belly, 0.55) : colors.belly), aux: one(BONE.jaw), capEnd: colors.belly, capStart: colors.belly });

  const H = b.horn;
  for (const side of [1, -1]) {
    // Two long horns swept back from the skull.
    m.tube(
      [
        { p: P(side * 0.22, ny(0.5) + 0.3, nz(2.7)), r: 0.1 * s },
        { p: P(side * 0.34, ny(0.5) + 0.62 * H, nz(2.7) - 0.55 * H), r: 0.06 * s },
        { p: P(side * 0.4, ny(0.5) + 0.78 * H, nz(2.7) - 1.25 * H), r: 0.008 * s },
      ],
      3, colors.horn, one(BONE.head)
    );
    // A shorter spike on the cheek.
    m.tube(
      [
        { p: P(side * 0.34, ny(0.5) + 0.02, nz(2.75)), r: 0.075 * s },
        { p: P(side * 0.62, ny(0.5) + 0.06, nz(2.75) - 0.55 * H), r: 0.006 * s },
      ],
      3, colors.horn, one(BONE.head)
    );
    // Eye: a small bright facet under the brow, facing out and a little forward.
    const e0 = P(side * 0.345, ny(0.5) + 0.2, nz(3.02));
    const e1 = P(side * 0.31, ny(0.5) + 0.17, nz(3.2));
    const e2 = P(side * 0.36, ny(0.5) + 0.1, nz(3.08));
    if (side === 1) m.tri(e0, e1, e2, colors.eye, one(BONE.head, GLOW));
    else m.tri(e0, e2, e1, colors.eye, one(BONE.head, GLOW));
  }

  // -------------------------------------------------------------------------------------------
  // Spines down the back: thin blades, seen from both sides.
  // -------------------------------------------------------------------------------------------
  const top = (z) => {
    // Height of the ridge and the bones that carry it, between the stations around z.
    for (let k = 0; k + 1 < stations.length; k++) {
      const a = stations[k];
      const c = stations[k + 1];
      if (z >= a[0] && z <= c[0]) {
        const f = (z - a[0]) / (c[0] - a[0]);
        const y = a[1] + a[3] * 1.12 + (c[1] + c[3] * 1.12 - a[1] - a[3] * 1.12) * f;
        return { y, aux: f < 0.5 ? two(a[5], a[6], a[7]) : two(c[5], c[6], c[7]) };
      }
    }
    return { y: 0, aux: one(BONE.chest) };
  };
  const spineFrom = tz(4) - 0.4 * T;
  const spineTo = nz(2.2);
  const count = 17;
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1);
    const z = spineFrom + (spineTo - spineFrom) * f;
    // Tallest over the shoulders, small toward both ends.
    const size = 0.16 + 0.34 * Math.exp(-Math.pow((z - 0.9) / 2.6, 2));
    const half = size * 0.45;
    const base0 = top(z - half);
    const base1 = top(z + half);
    const a = P(0, base0.y - 0.03, z - half);
    const c = P(0, base1.y - 0.03, z + half);
    const tip = P(0, (base0.y + base1.y) / 2 + size, z - half * 0.9);
    m.tri(a, c, tip, colors.horn, [base0.aux, base1.aux, base0.aux]);
    m.tri(c, a, tip, colors.horn, [base1.aux, base0.aux, base0.aux]);
  }

  // Spade at the end of the tail: flat, like an arrowhead.
  {
    const z0 = tz(4) - 0.9 * T;
    const a = P(0, 0, z0);
    const l = P(0.5, 0, z0 - 0.55 * T);
    const r = P(-0.5, 0, z0 - 0.55 * T);
    const tip = P(0, 0, z0 - 1.5 * T);
    const aux = one(BONE.tail5);
    const col = colors.horn;
    m.tri(a, tip, l, col, aux).tri(a, l, tip, col, aux).tri(a, r, tip, col, aux).tri(a, tip, r, col, aux);
  }

  // -------------------------------------------------------------------------------------------
  // Legs: tucked back along the tail.
  // -------------------------------------------------------------------------------------------
  for (const [side, bone] of [[1, BONE.legL], [-1, BONE.legR]]) {
    m.tube(
      [
        { p: P(side * 0.42 * K, -0.3, -0.75), r: 0.24 * s },
        { p: P(side * 0.56 * K, -0.78, -1.45), r: 0.17 * s },
        { p: P(side * 0.5 * K, -0.6, -2.2), r: 0.09 * s },
        { p: P(side * 0.5 * K, -0.74, -2.7), r: 0.02 * s },
      ],
      4, (k) => (k === 2 ? colors.horn : scaleColor(colors.side, 0.85)), one(bone)
    );
  }

  // -------------------------------------------------------------------------------------------
  // Wings.
  // -------------------------------------------------------------------------------------------
  for (const side of [1, -1]) {
    const o = side === 1 ? 0 : 5;
    const w = side === 1 ? skeleton.wingL : skeleton.wingR;
    const humerus = BONE.humerusL + o;
    const forearm = BONE.forearmL + o;
    const hand = BONE.handL + o;
    const finger2 = BONE.finger2L + o;
    const finger3 = BONE.finger3L + o;
    const along = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];

    // The arm and the fingers, as thin three-sided rods.
    const rod = (from, to, r0, r1, bone) => m.tube([{ p: from, r: r0 * s }, { p: to, r: r1 * s }], 3, colors.bone, one(bone), { turn: 0.25 });
    rod(w.shoulder, w.elbow, 0.13, 0.1, humerus);
    rod(w.elbow, w.wrist, 0.1, 0.075, forearm);
    rod(w.wrist, w.tip1, 0.065, 0.012, hand);
    rod(w.wrist, w.tip2, 0.055, 0.012, finger2);
    rod(w.wrist, w.tip3, 0.055, 0.012, finger3);
    // The thumb claw at the wrist, pointing forward.
    rod(w.wrist, [w.wrist[0] + side * 0.12 * s, w.wrist[1] + 0.05 * s, w.wrist[2] + 0.55 * s], 0.05, 0.005, hand);

    // The membrane. Named points, each with the bones it follows.
    const pt = (p, aux) => ({ p, aux });
    const S = pt(w.shoulder, one(humerus, MEMBRANE));
    const E = pt(w.elbow, one(forearm, MEMBRANE));
    const W = pt(w.wrist, one(hand, MEMBRANE));
    const T1 = pt(w.tip1, one(hand, MEMBRANE));
    const T2 = pt(w.tip2, one(finger2, MEMBRANE));
    const T3 = pt(w.tip3, one(finger3, MEMBRANE));
    const F3 = pt(along(w.wrist, w.tip3, 0.5), one(finger3, MEMBRANE));
    // Where the membrane meets the body, from behind the shoulder to the root of the tail.
    const B0 = pt(P(side * 0.62 * K, 0.36, 0.72), one(BONE.chest, MEMBRANE));
    const B1 = pt(P(side * 0.66 * K, 0.2, -0.2), two(BONE.chest, BONE.hips, 0.5, MEMBRANE));
    const B2 = pt(P(side * 0.54 * K, 0.15, -1.25), one(BONE.hips, MEMBRANE));
    const B3 = pt(P(side * 0.4 * K, 0.1, tz(0) - 0.45), two(BONE.hips, BONE.tail1, 0.5, MEMBRANE));
    // Trailing edge: it hangs in scallops between the finger tips, as a bat's wing does.
    const scallop = (p, q, toward, pull, aux) => pt(along(along(p.p, q.p, 0.5), toward.p, pull), aux);
    const M3 = scallop(T3, B3, E, 0.2, two(finger3, BONE.hips, 0.5, MEMBRANE));
    const M32 = scallop(T3, T2, W, 0.16, two(finger3, finger2, 0.5, MEMBRANE));
    const M21 = scallop(T2, T1, W, 0.14, two(finger2, hand, 0.5, MEMBRANE));

    const panels = [
      [S, W, E], // the small sail in front of the elbow
      [S, E, B0], [B0, E, B1], [B1, E, M3], [B1, M3, B2], [B2, M3, B3],
      [E, W, F3], [E, F3, M3], [F3, T3, M3],
      [W, T3, M32], [W, M32, T2],
      [W, T2, M21], [W, M21, T1],
    ];
    panels.forEach((tri, n) => {
      // Order the corners so the face points up, then add its underside.
      let [a, c, d] = tri;
      const up = (c.p[2] - a.p[2]) * (d.p[0] - a.p[0]) - (c.p[0] - a.p[0]) * (d.p[2] - a.p[2]);
      if (up < 0) [c, d] = [d, c];
      const v = 0.9 + 0.2 * hash2(n, 9);
      // Thin toward the trailing edge: lighter there.
      const edge = (q) => (q === M3 || q === M32 || q === M21 || q === T1 || q === T2 || q === T3 ? 1.25 : 1);
      const topCol = [a, c, d].map((q) => scaleColor(colors.wingTop, v * edge(q)));
      const underCol = [a, d, c].map((q) => scaleColor(colors.wingUnder, v * edge(q)));
      m.tri(a.p, c.p, d.p, topCol, [a.aux, c.aux, d.aux]);
      m.tri(a.p, d.p, c.p, underCol, [a.aux, d.aux, c.aux]);
    });
  }

  return { arrays: m.arrays(), skeleton };
}

/**
 * The fire a dragon breathes: a spray of thin tongues from the mouth, in the same rest-pose
 * frame as the body (so the head's bone carries it). Nothing here moves; the vertex shader
 * shoots each tongue out again and again (shaders.js, flameMaterial).
 *
 * Per vertex: position (where it sits at the mouth), dir (the way its tongue points, unit), and
 * flame = [how far along the tongue (0 at the mouth, up to 1 at the tip), phase, speed].
 * Returns { position, dir, flame, vertices, triangles, length (metres, for the big dragon 9.5) }.
 */
export function buildFlame(build) {
  const b = Object.assign({ scale: 1, neck: 1 }, build || {});
  const s = b.scale;
  const mouth = [0, (0.25 + 0.33 * b.neck) * s, (1.7 + 3.9 * b.neck) * s];
  const tongues = 22;
  const position = [];
  const dir = [];
  const flame = [];
  for (let i = 0; i < tongues; i++) {
    // Spread on a sunflower spiral inside a cone of about 12 degrees, aimed a little below
    // the line of the snout (the lower jaw is what opens).
    const r = 0.03 + 0.22 * Math.sqrt((i + 0.5) / tongues);
    const a = i * 2.39996;
    let dx = r * Math.cos(a);
    let dy = r * Math.sin(a) - 0.1;
    let dz = 1;
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
    const phase = hash2(i, 71);
    const speed = hash2(i, 72);
    const reach = 0.55 + 0.45 * hash2(i, 73); // not all the same length
    const w = (0.16 + 0.2 * hash2(i, 74)) * s;
    // Three points round the mouth, and the tip, which starts there too.
    const ring = [];
    for (let k = 0; k < 3; k++) {
      const t = a + (k / 3) * Math.PI * 2;
      ring.push([mouth[0] + Math.cos(t) * w + dx * 0.2 * s, mouth[1] + Math.sin(t) * w + dy * 0.2 * s, mouth[2]]);
    }
    const tip = [mouth[0] + dx * 0.2 * s, mouth[1] + dy * 0.2 * s, mouth[2]];
    for (let k = 0; k < 3; k++) {
      for (const [p, along] of [[ring[k], 0], [ring[(k + 1) % 3], 0], [tip, reach]]) {
        position.push(p[0], p[1], p[2]);
        dir.push(dx, dy, dz);
        flame.push(along, phase, speed);
      }
    }
  }
  return {
    position: new Float32Array(position),
    dir: new Float32Array(dir),
    flame: new Float32Array(flame),
    vertices: position.length / 3,
    triangles: position.length / 9,
    length: 9.5 * s,
  };
}

/** The two dragons of this piece. Colours are sRGB here and converted by the caller. */
export const DRAGONS = [
  {
    name: 'Ember',
    build: { scale: 1, neck: 1, tail: 1, wing: 1, bulk: 1, horn: 1 },
    beat: 1.0, // wingbeats a second at an easy pace
    colors: {
      back: [0.56, 0.1, 0.06],
      side: [0.74, 0.18, 0.07],
      belly: [0.93, 0.66, 0.26],
      wingTop: [0.64, 0.15, 0.07],
      wingUnder: [0.9, 0.4, 0.12],
      bone: [0.3, 0.07, 0.05],
      horn: [0.14, 0.1, 0.09],
      eye: [1.0, 0.85, 0.2],
    },
  },
  {
    name: 'Tarn',
    build: { scale: 0.78, neck: 1.08, tail: 1.12, wing: 1.06, bulk: 0.9, horn: 1.25 },
    beat: 1.28,
    colors: {
      back: [0.06, 0.3, 0.38],
      side: [0.09, 0.44, 0.49],
      belly: [0.82, 0.88, 0.78],
      wingTop: [0.1, 0.38, 0.44],
      wingUnder: [0.5, 0.8, 0.76],
      bone: [0.05, 0.16, 0.22],
      horn: [0.86, 0.84, 0.74],
      eye: [1.0, 0.6, 0.1],
    },
  },
];
