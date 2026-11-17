/**
 * scene.js: everything that is drawn except the dragons (dragons.js): sky and sun, the land, the
 * lake, the forest, and the things close to the viewer (ledge.js).
 *
 * Budget, for an Oculus Quest 1 at 72 frames a second: a few dozen draw calls per eye, tens of
 * thousands of triangles, no shadows computed while running, nothing see-through over large
 * parts of the picture. What is fixed (light on the land, shadows of the hills, the lake's mirror
 * image) is worked out once at start; the trees are instanced; the wind is a few sines in the
 * vertex shader.
 */

import {
  THREE, WIND, makeShared, worldMaterial, skyMaterial, sunMaterial, waterMaterial, leafMaterial, mistMaterial, moteMaterial,
} from './shaders.js';
import * as W from './world.js';
import { buildTerrain } from './terrain.js';
import { bakeReflection, bakeNoise } from './reflection.js';
import { MeshBuilder } from './meshbuilder.js';
import { buildLedge, buildGrove } from './ledge.js';
import { SPIRE } from './fetch.js';
import { hash2, makeRng } from './rng.js';

export { THREE };

export const WORLD_SEED = 20261115;

/** How many leaves are in the air around the ledge, and the box they fall through (metres). */
const LEAF_COUNT = 190;
export const LEAF_BOX = { min: [-10.5, -7, -11.5], size: [20, 19, 19] };

/**
 * What hangs in the air and catches the light (see moteMaterial): how many of each, and the
 * box round the viewer they are in (metres). These are caps: there are never more.
 */
export const MOTES = { motes: 150, sparks: 48, ash: 42 };
export const MOTE_BOX = { min: [-9, -4.5, -12], size: [18, 12.5, 17] };

/** The one line of words shown in the headset, on the rim of the ledge. */
/**
 * The lines of words that can stand over the rim in the headset (see buildHint), one picture
 * for all of them. HINT names them.
 */
const HINT_LINES = [
  'Pull the trigger to call a dragon',
  'Grip to pick up the ball, let go to throw',
  'Exercise: they bring it to your feet',
  'Perch: they bring it to the rock beside you',
];
export const HINT = { call: 0, ball: 1, exercise: 2, perch: 3 };

/** Azimuth slices the forest is split into, so trees behind the viewer are not drawn. */
const FOREST_SECTORS = 6;

const BARK = W.srgb(0.27, 0.19, 0.13);

/** How big the sun's disc is drawn: its radius in degrees (the real one is a quarter of a degree). */
export const SUN_DISC = 2.3;

/** How far over the water the sheet of mist lies (metres). */
const MIST_HEIGHT = 7;

/** Shafts of sunlight in the haze: how many, and how bright the brightest is along its middle (added to the picture, 0..1). */
const RAY_COUNT = 13;
const RAY_BRIGHT = 0.17;

/** Turn MeshBuilder arrays into a three.js geometry. */
export function toGeometry(arrays, options) {
  const o = options || {};
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(arrays.position, 3));
  if (arrays.normal && o.normal !== false) g.setAttribute('normal', new THREE.BufferAttribute(arrays.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(arrays.color, 3));
  if (arrays.aux && o.aux !== false) g.setAttribute('aux', new THREE.BufferAttribute(arrays.aux, 4));
  g.computeBoundingSphere();
  return g;
}

export class Stage {
  constructor(canvas, options) {
    const o = options || {};
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: o.antialias !== false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x241a2c, 1); // dusk, should anything ever be left undrawn
    renderer.xr.enabled = true;
    // Colours leave the shaders ready for the screen; three.js must not convert them again.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    // The rig carries the camera. The viewer never moves, but a headset without a floor-level
    // space needs lifting to standing height.
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
    this.camera.position.set(0, 1.62, 0);
    this.rig.add(this.camera);

    this.shared = makeShared();
    this.time = 0;
    this.forestFraction = 1;
    this.timings = {};
    this.options = o;
  }

  /**
   * Build the valley. It is a few hundred milliseconds of work on a laptop and several seconds
   * on a Quest 1, so it is done in steps with a pause between them: the page stays alive, and
   * `say(text)` is told what is being made. Resolves when everything is in the scene.
   */
  async build(say) {
    const o = this.options;
    const step = async (name, text, fn) => {
      if (say && text) say(text);
      // Let the browser paint and answer before each piece of work.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const t = performance.now();
      const out = fn();
      this.timings[name] = performance.now() - t;
      return out;
    };
    // Heights of the land with its treetops, and from them where the sun reaches.
    this.heights = await step('heights', 'Raising the hills\u2026', () => new W.HeightGrid(W.canopyHeight, 600, 192));
    this.sunHeight = await step('shadows', '', () => W.buildSunHeight(this.heights, 600, 192));
    this.farHeights = await step('farHeights', '', () => new W.HeightGrid(W.ground, 2000, 128));
    await step('sky', '', () => this.buildSky());
    await step('clouds', '', () => this.buildClouds());
    this.terrain = await step('terrain', '', () => this.buildTerrain());
    await step('water', 'Filling the lake\u2026', () => this.buildWater(o.reflectionSize || 256));
    await step('mist', '', () => this.buildMist());
    await step('forest', 'Turning the maples\u2026', () => this.buildForest(o.forestDensity || 1));
    await step('ledge', '', () => this.buildLedge());
    await step('grove', '', () => this.buildGrove());
    await step('leaves', '', () => this.buildLeaves(o.leaves === undefined ? LEAF_COUNT : o.leaves));
    await step('motes', '', () => this.buildMotes());
    await step('hint', '', () => this.buildHint(HINT_LINES));
    this.built = true;
  }

  // -------------------------------------------------------------------------------------------

  buildSky() {
    // Bands of elevation (degrees), close together near the horizon where the colour changes
    // fastest: the sky goes from the orange of the haze through rose and violet to the blue
    // of dusk within a hand's breadth.
    const bands = [-12, -3, 0, 2, 4, 6.5, 9, 12, 16, 21, 26, 33, 40, 50, 60, 75, 90];
    const segments = 64;
    const position = [];
    const color = [];
    const index = [];
    const c = [0, 0, 0];
    for (let b = 0; b < bands.length; b++) {
      const el = (bands[b] * Math.PI) / 180;
      for (let s = 0; s <= segments; s++) {
        const az = (s / segments) * Math.PI * 2;
        const cosE = Math.cos(el);
        const dx = Math.sin(az) * cosE;
        const dy = Math.sin(el);
        const dz = -Math.cos(az) * cosE;
        position.push(dx, dy, dz);
        // Without the light round the sun: that is drawn over it (below), finer than this
        // dome's web could carry it.
        W.toDisplay(W.skyColor(dx, dy, dz, c, false));
        color.push(c[0], c[1], c[2]);
      }
    }
    const row = segments + 1;
    for (let b = 0; b + 1 < bands.length; b++) {
      for (let s = 0; s < segments; s++) {
        const a = b * row + s;
        index.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
    // The first stars, and the moon, painted on the sky like the ranges (so they cost no draw
    // call, and whatever is nearer hides them). A star is a small square with a bright middle
    // and corners of the sky's own colour, so that it has no edge; they are only put where
    // the sky has gone dark, and there are more of them, and brighter, toward the zenith and
    // the east.
    const starRng = makeRng(WORLD_SEED + 2024);
    const sunV = W.SUN_DIR;
    let stars = 0;
    const tangent = (dx, dy, dz) => {
      // Two unit vectors at right angles to a direction: sideways (level) and up.
      const flat = Math.hypot(dx, dz) || 1;
      const sx = dz / flat;
      const sz = -dx / flat;
      return [[sx, 0, sz], [-dy * (dx / flat), flat, -dy * (dz / flat)]];
    };
    const lit = [0, 0, 0];
    for (let n = 0; n < W.STARS.count; n++) {
      // Evenly over the upper sky (by area), then kept or not.
      const az = starRng() * Math.PI * 2;
      const dy = starRng.range(Math.sin((W.STARS.least * Math.PI) / 180), 1);
      const cosE = Math.sqrt(1 - dy * dy);
      const dx = Math.sin(az) * cosE;
      const dz = -Math.cos(az) * cosE;
      const size = starRng();
      const tint = starRng();
      const offSun = (Math.acos(dx * sunV[0] + dy * sunV[1] + dz * sunV[2]) * 180) / Math.PI;
      const offMoon = (Math.acos(dx * W.MOON_DIR[0] + dy * W.MOON_DIR[1] + dz * W.MOON_DIR[2]) * 180) / Math.PI;
      if (offSun < W.STARS.fromSun || offMoon < W.MOON.radius * 3.2) continue;
      W.toDisplay(W.skyColor(dx, dy, dz, c, false));
      // How dark the sky is here: nothing shows against a sky brighter than this.
      const dark = 1 - Math.min((0.3 * c[0] + 0.5 * c[1] + 0.2 * c[2]) / 0.3, 1);
      if (dark <= 0.05) continue;
      // A few bright ones, many faint: and none so small that a headset cannot draw it.
      const bright = (0.26 + 0.74 * size * size * size) * dark;
      const half = ((0.075 + 0.1 * size) * Math.PI) / 180;
      const [side, up] = tangent(dx, dy, dz);
      const first = position.length / 3;
      // Blue-white mostly; one in five is warm.
      const hue = tint < 0.2 ? [1, 0.82, 0.62] : [0.86, 0.92, 1];
      lit[0] = Math.min(c[0] + bright * hue[0], 1);
      lit[1] = Math.min(c[1] + bright * hue[1], 1);
      lit[2] = Math.min(c[2] + bright * hue[2], 1);
      position.push(dx, dy, dz);
      color.push(lit[0], lit[1], lit[2]);
      for (const [u, v] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        position.push(dx + (side[0] * u + up[0] * v) * half, dy + (side[1] * u + up[1] * v) * half, dz + (side[2] * u + up[2] * v) * half);
        color.push(c[0], c[1], c[2]);
      }
      for (let k = 0; k < 4; k++) index.push(first, first + 1 + k, first + 1 + ((k + 1) % 4));
      stars++;
    }
    this.starCount = stars;

    // The moon: a pale disc, a little darker toward its limb and marked with its seas, and
    // a ring of its light on the haze round it, which fades into the sky.
    {
      const m = W.MOON_DIR;
      const [side, up] = tangent(m[0], m[1], m[2]);
      const spokes = 20;
      const R = (W.MOON.radius * Math.PI) / 180;
      const first = position.length / 3;
      const at = (r, a) => [m[0] + (side[0] * Math.cos(a) + up[0] * Math.sin(a)) * r, m[1] + (side[1] * Math.cos(a) + up[1] * Math.sin(a)) * r, m[2] + (side[2] * Math.cos(a) + up[2] * Math.sin(a)) * r];
      const face = [0.99, 0.94, 0.8];
      // Its seas: a few soft dark patches, where they are on the real one near enough (the
      // big ones in the upper left, as it is seen rising). x, y across the disc (the limb at
      // 1), how far each reaches, how dark.
      const SEAS = [[-0.34, 0.3, 0.4, 0.2], [0.12, 0.42, 0.3, 0.17], [-0.5, -0.12, 0.26, 0.14], [0.3, -0.05, 0.3, 0.12], [-0.05, -0.5, 0.22, 0.08]];
      const shade = (x, y) => {
        let v = 1;
        for (const [sx, sy, reach, dark] of SEAS) v -= dark * Math.exp(-((x - sx) * (x - sx) + (y - sy) * (y - sy)) / (reach * reach));
        // And it dims a little toward its limb.
        return v * (1 - 0.1 * (x * x + y * y));
      };
      // Rings: the middle, three across the face, the limb, just outside it (the first of
      // its light on the haze), and where that has faded into the sky.
      position.push(m[0], m[1], m[2]);
      color.push(face[0] * shade(0, 0), face[1] * shade(0, 0), face[2] * shade(0, 0));
      const ringsAt = [[0.3, 'face'], [0.62, 'face'], [0.97, 'face'], [1.06, 'glow'], [2.7, 'sky']];
      for (const [f, kind] of ringsAt) {
        for (let k = 0; k < spokes; k++) {
          const a = ((k + (kind === 'face' && f === 0.62 ? 0.5 : 0)) / spokes) * Math.PI * 2;
          const p = at(R * f, a);
          position.push(p[0], p[1], p[2]);
          const pl = Math.hypot(p[0], p[1], p[2]);
          W.toDisplay(W.skyColor(p[0] / pl, p[1] / pl, p[2] / pl, c, false));
          if (kind === 'face') {
            const v = shade(f * Math.cos(a), f * Math.sin(a));
            color.push(face[0] * v, face[1] * v, face[2] * v * (1 - 0.04 * f));
          } else if (kind === 'glow') {
            color.push(c[0] + (face[0] - c[0]) * 0.3, c[1] + (face[1] - c[1]) * 0.3, c[2] + (face[2] - c[2]) * 0.3);
          } else {
            color.push(c[0], c[1], c[2]);
          }
        }
      }
      for (let k = 0; k < spokes; k++) {
        const j = (k + 1) % spokes;
        index.push(first, first + 1 + k, first + 1 + j);
        for (let r = 0; r + 1 < ringsAt.length; r++) {
          const a0 = first + 1 + r * spokes + k;
          const a1 = first + 1 + r * spokes + j;
          index.push(a0, a0 + spokes, a1, a1, a0 + spokes, a1 + spokes);
        }
      }
    }

    // The far ranges, painted on the sky: three lines of mountains one behind the other, the
    // farthest first so that each nearer one is drawn over it (all of the sky is at one depth,
    // and is drawn in the order it is listed here). Each is dark along its crest and fades
    // into the haze toward its foot, which is what sets it off from the one behind.
    const around = 160;
    const foot = Math.sin((-2.5 * Math.PI) / 180);
    for (let k = 0; k < W.RANGES.length; k++) {
      const first = position.length / 3;
      for (let i = 0; i <= around; i++) {
        const az = (i / around) * Math.PI * 2;
        const dx = Math.sin(az);
        const dz = -Math.cos(az);
        const crest = (W.rangeCrest(k, dx, dz) * Math.PI) / 180;
        // Crest, a little way down it, and well under the horizon.
        const rows = [[crest, 1], [crest * 0.42, 0.36], [Math.asin(foot), 0]];
        for (const [el, top] of rows) {
          const cosE = Math.cos(el);
          position.push(dx * cosE, Math.sin(el), dz * cosE);
          W.toDisplay(W.rangeColor(k, dx, dz, top, c));
          color.push(c[0], c[1], c[2]);
        }
      }
      for (let i = 0; i < around; i++) {
        for (let r = 0; r < 2; r++) {
          const a = first + i * 3 + r;
          index.push(a, a + 3, a + 1, a + 3, a + 4, a + 1);
        }
      }
    }
    this.skyTriangles = index.length / 3;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    g.setIndex(index);
    const sky = new THREE.Mesh(g, skyMaterial(this.shared));
    sky.frustumCulled = false;
    // After everything solid (so it only costs the pixels that are still empty), and BEFORE
    // the lake, the dragons' mirror images and their fire, none of which leaves a mark in the
    // depth buffer: drawn after those, the sky took any pixel of them that had no land behind
    // it. (The lake bed is cut out of the land's mesh where it is never seen, and through that
    // hole the far end of the lake showed as a flat slab of sky colour.)
    sky.renderOrder = 35;
    this.scene.add(sky);
    this.sky = sky;

    // The sun. One mesh, rings round the direction of the sun, in parts told apart by `part`:
    //   0  the disc and the light round it, far away: a hill, a cloud or a dragon in front
    //      hides it, so that whatever crosses the sunset is a clean dark shape against it;
    //   1  the little of that light which spills over the edge of whatever is in front (as it
    //      does in an eye or a lens): drawn over everything, and dimmed while a dragon covers
    //      the disc.
    // The light is added to the sky's own colour, which is orange there already; the disc is
    // big (a setting sun is, to the mind's eye) and nearly white.
    const sunPos = [];
    const sunCol = [];
    const sunPart = [];
    const sunIdx = [];
    const s = W.SUN_DIR;
    const side = new THREE.Vector3(s[2], 0, -s[0]).normalize();
    const up = new THREE.Vector3().crossVectors(new THREE.Vector3(s[0], s[1], s[2]), side).normalize();
    const spokes = 32;
    const rings = (degrees, part, colourAt) => {
      const first = sunPos.length / 3;
      for (let r = 0; r < degrees.length; r++) {
        const radius = (degrees[r] * Math.PI) / 180;
        const col = colourAt(degrees[r]);
        for (let k = 0; k < spokes; k++) {
          const a = (k / spokes) * Math.PI * 2;
          const sn = Math.sin(radius);
          const cs = Math.cos(radius);
          sunPos.push(
            s[0] * cs + (side.x * Math.cos(a) + up.x * Math.sin(a)) * sn,
            s[1] * cs + (side.y * Math.cos(a) + up.y * Math.sin(a)) * sn,
            s[2] * cs + (side.z * Math.cos(a) + up.z * Math.sin(a)) * sn
          );
          sunCol.push(col[0], col[1], col[2]);
          sunPart.push(part);
        }
      }
      for (let r = 0; r + 1 < degrees.length; r++) {
        for (let k = 0; k < spokes; k++) {
          const a = first + r * spokes + k;
          const b = first + r * spokes + ((k + 1) % spokes);
          sunIdx.push(a, b, a + spokes, b, b + spokes, a + spokes);
        }
      }
    };
    const DISC = SUN_DISC;
    // (No wider than it can be seen: at 26 degrees out it would add less than a hundredth,
    // and every pixel it covers is a pixel blended. It went out to 38.)
    const GLOW_OUT = 26;
    rings([0, DISC * 0.6, DISC * 0.94, DISC * 1.04, DISC * 1.35, DISC * 1.9, 6, 8, 11, 14.5, 19, GLOW_OUT], 0, (deg) => {
      if (deg < DISC) {
        // The disc: white-gold, a little deeper toward its limb.
        const limb = deg / DISC;
        return [1, 0.9 - 0.14 * limb * limb, 0.62 - 0.3 * limb * limb];
      }
      // The light round it: a hot ring hugging the disc, then a wide warm glow that is gone
      // by GLOW_OUT degrees.
      const out = deg - DISC;
      const fade = Math.max(0, 1 - deg / GLOW_OUT);
      const hot = 0.6 * Math.exp(-out / 1.5);
      const warm = 0.34 * Math.exp(-out / 7) * fade;
      return [hot + warm, hot * 0.62 + warm * 0.42, hot * 0.24 + warm * 0.1];
    });
    rings([0, 2.5, 5, 7.5, 10.5], 1, (deg) => {
      const spill = 0.13 * Math.pow(Math.max(0, 1 - deg / 10.5), 2);
      return [spill, spill * 0.66, spill * 0.3];
    });
    const sunRay = new Array((sunPos.length / 3) * 2).fill(0);

    // Shafts of sunlight in the haze (part 2: see sunMaterial). A fan of blades round the
    // sun, each a strip that is bright along its middle and nothing at its edges and ends.
    // Longest out to the sides, where they lie across the hills; short downward, so that
    // none reaches the near half of the lake (they are drawn RAY_DEPTH metres out, and water
    // nearer than that would cut them off along a line).
    const rayRng = makeRng(WORLD_SEED + 909);
    let rays = 0;
    for (let i = 0; i < RAY_COUNT; i++) {
      // Round the sun, unevenly; 0 is to the viewer's right, a quarter turn is straight up.
      const at = ((i + rayRng.range(-0.42, 0.42)) / RAY_COUNT) * Math.PI * 2;
      const down = Math.max(-Math.sin(at), 0);
      const upward = Math.max(Math.sin(at), 0);
      const from = rayRng.range(3.2, 5.5);
      const to = from + rayRng.range(20, 38) * (1 - 0.62 * down) * (1 - 0.35 * upward);
      // Half its width, as an angle round the sun: a few broad beams among narrow ones.
      const half = rayRng() < 0.35 ? rayRng.range(0.09, 0.15) : rayRng.range(0.03, 0.07);
      const bright = rayRng.range(0.5, 1) * RAY_BRIGHT * (1 - 0.3 * upward) * (half > 0.08 ? 0.8 : 1);
      const phase = rayRng();
      const pace = rayRng.range(0.6, 1.6);
      const first = sunPos.length / 3;
      // Stations along it: nothing, full, fading, nothing.
      const along = [[from, 0], [from + (to - from) * 0.16, 1], [from + (to - from) * 0.5, 0.55], [to, 0]];
      for (const [deg, level] of along) {
        const radius = (deg * Math.PI) / 180;
        const sn = Math.sin(radius);
        const cs = Math.cos(radius);
        for (const across of [-1, 0, 1]) {
          const a = at + across * half;
          sunPos.push(
            s[0] * cs + (side.x * Math.cos(a) + up.x * Math.sin(a)) * sn,
            s[1] * cs + (side.y * Math.cos(a) + up.y * Math.sin(a)) * sn,
            s[2] * cs + (side.z * Math.cos(a) + up.z * Math.sin(a)) * sn
          );
          const v = across === 0 ? level * bright : 0;
          sunCol.push(v, v * 0.6, v * 0.27);
          sunPart.push(2);
          sunRay.push(phase, pace);
        }
      }
      for (let k = 0; k < along.length - 1; k++) {
        for (let j = 0; j < 2; j++) {
          const a = first + k * 3 + j;
          sunIdx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
          rays += 2;
        }
      }
    }
    this.rayTriangles = rays;
    const solid = sunIdx.length - rays * 3; // how much of the mesh is the sun itself
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sunPos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sunCol, 3));
    sg.setAttribute('part', new THREE.Float32BufferAttribute(sunPart, 1));
    sg.setAttribute('ray', new THREE.Float32BufferAttribute(sunRay, 2));
    sg.setIndex(sunIdx);
    const sun = new THREE.Mesh(sg, sunMaterial(this.shared));
    sun.frustumCulled = false;
    sun.renderOrder = 200;
    sun.userData.all = sunIdx.length;
    sun.userData.solid = solid;
    this.scene.add(sun);
    this.sun = sun;
  }

  /**
   * Long, flat bars of cloud, far off and low in the sky: dark against the sunset, with the
   * sun's fire on their undersides and their sunward edges, and rose in the east where the
   * light strikes them full. One mesh, a few hundred triangles, coloured here once (smoothly
   * over each lump, so that they read as vapour and not as cut stone).
   */
  buildClouds() {
    const rng = makeRng(WORLD_SEED + 404);
    const m = new MeshBuilder();
    const sunAz = Math.atan2(-W.SUN_DIR[0], -W.SUN_DIR[2]); // left of straight ahead
    // Where the light on them comes from: the sun's side, and from below (the sun is under
    // their horizon already).
    const from = [W.SUN_DIR[0], -0.4, W.SUN_DIR[2]];
    const fl = Math.hypot(from[0], from[1], from[2]);
    const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    // What they look like lit and unlit, by how nearly they are in line with the sun: as
    // colours on the screen.
    const LIT = { toward: W.fromDisplay(1, 0.6, 0.24), side: W.fromDisplay(0.96, 0.38, 0.31), away: W.fromDisplay(0.82, 0.5, 0.57) };
    const DARK = { toward: W.fromDisplay(0.44, 0.17, 0.25), side: W.fromDisplay(0.3, 0.19, 0.36), away: W.fromDisplay(0.33, 0.29, 0.49) };
    // [degrees left of straight ahead, degrees up, how wide (degrees), how many lumps, how thick]
    const bank = [
      // Bars across the sunset: thin, and clear of the disc itself.
      [29, 12.5, 21, 7, 0.4], [-5, 15.5, 15, 6, 0.4], [36, 19.5, 17, 6, 0.55], [4, 24, 15, 5, 0.65], [-24, 11, 13, 5, 0.45], [55, 9.5, 14, 5, 0.5],
      // The rest of the sky.
      [-50, 14, 16, 6, 0.9], [-82, 18, 16, 5, 1], [86, 13, 17, 6, 1], [122, 17, 14, 5, 1], [-118, 12, 16, 5, 1],
      [-158, 16, 15, 5, 1], [168, 11, 14, 5, 1], [20, 36, 13, 5, 1], [-38, 31, 12, 4, 1], [72, 31, 12, 4, 1],
    ];
    for (const [azDeg, elDeg, wideDeg, lumps, thick] of bank) {
      const az = (azDeg * Math.PI) / 180;
      const dist = 2300;
      const cx = -Math.sin(az) * dist;
      const cz = -Math.cos(az) * dist;
      const cy = Math.tan((elDeg * Math.PI) / 180) * dist;
      const wide = Math.tan((wideDeg * Math.PI) / 180) * dist;
      // The cloud lies across the line of sight.
      const ax = Math.cos(az);
      const azz = -Math.sin(az);
      // How nearly the cloud is in line with the sun (1), or opposite it (-1).
      const toward = Math.cos(az - sunAz);
      const t = Math.min(Math.abs(toward) * 1.25, 1);
      const lit = mix3(LIT.side, toward > 0 ? LIT.toward : LIT.away, t);
      const dark = mix3(DARK.side, toward > 0 ? DARK.toward : DARK.away, t);
      // With the sun behind the viewer the whole face of a cloud is lit; in front of the sun
      // only what looks down or sunward.
      const flood = toward < 0 ? 0.45 * t : 0;
      const n = lumps * 2;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1) - 0.5;
        const size = (1 - 1.6 * f * f) * rng.range(0.7, 1.15);
        const rx = (wide / n) * 1.9 * size;
        const centre = [cx + ax * f * wide + rng.range(-30, 30), cy + rng.range(-7, 7) + 8 * size * thick, cz + azz * f * wide + rng.range(-30, 30)];
        const seed = Math.floor(rng() * 1000);
        m.blob(
          centre,
          [Math.abs(ax) * rx + Math.abs(azz) * rx * 0.5 + 24, (20 * size + 7) * thick, Math.abs(azz) * rx + Math.abs(ax) * rx * 0.5 + 24],
          0, 0.1, seed,
          (dir) => {
            const d = (dir[0] * from[0] + dir[1] * from[1] + dir[2] * from[2]) / fl;
            const k = Math.min(Math.max((d + 0.25) / 0.85, 0), 1);
            const glow = Math.min(k * k * (3 - 2 * k) + flood, 1);
            return mix3(dark, lit, glow);
          },
          [0, 0, 0, 0],
          { corner: true }
        );
      }
    }
    const mesh = new THREE.Mesh(toGeometry(m.arrays(), { normal: false }), worldMaterial(this.shared, { haze: 0.3 }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 32; // after the land, which hides most of them; before the sky
    this.scene.add(mesh);
    this.clouds = mesh;
    this.cloudTriangles = m.triangleCount;
  }

  buildTerrain() {
    const t = buildTerrain(this.sunHeight);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(t.position, 3));
    g.setAttribute('color', new THREE.BufferAttribute(t.color, 3));
    // The shader wants an aux attribute; the terrain does not sway, so one shared zero will do.
    g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(t.vertices * 4), 4));
    const mesh = new THREE.Mesh(g, worldMaterial(this.shared, {}));
    mesh.frustumCulled = false;
    mesh.renderOrder = 30;
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    return t;
  }

  buildWater(size) {
    const eye = [0, 1.62, 0];
    const baked = bakeReflection(size, this.heights, this.farHeights, this.sunHeight, eye);
    const reflection = new THREE.DataTexture(baked.data, size, size, THREE.RGBAFormat);
    reflection.magFilter = THREE.LinearFilter;
    reflection.minFilter = THREE.LinearMipmapLinearFilter;
    reflection.generateMipmaps = true;
    reflection.wrapS = reflection.wrapT = THREE.ClampToEdgeWrapping;
    reflection.needsUpdate = true;
    const noise = new THREE.DataTexture(bakeNoise(64), 64, 64, THREE.RGBAFormat);
    // With its smaller copies: far out, where one pixel of a headset is a metre of water and
    // twenty of this texture's texels, the glints on the lake must run together into a steady
    // glow, not flicker from frame to frame as the head moves.
    noise.magFilter = THREE.LinearFilter;
    noise.minFilter = THREE.LinearMipmapLinearFilter;
    noise.generateMipmaps = true;
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    noise.needsUpdate = true;

    // A sheet over the lake, in cells, so the haze can vary along it.
    const L = W.LAKE;
    const cell = 14;
    const np = Math.ceil((L.a * 1.14 + 10) / cell);
    const nq = Math.ceil((L.b * 1.14 + 10) / cell);
    const position = [];
    const corner = (i, j) => W.lakePoint(i * cell, j * cell);
    for (let i = -np; i < np; i++) {
      for (let j = -nq; j < nq; j++) {
        const pts = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
        if (!pts.some((p) => W.lakeDistance(p[0], p[1]) < 12)) continue;
        for (const k of [0, 3, 2, 0, 2, 1]) position.push(pts[k][0], W.LAKE_LEVEL, pts[k][1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.computeBoundingSphere();
    const water = new THREE.Mesh(g, waterMaterial(this.shared, reflection, noise, baked.bounds));
    water.renderOrder = 40; // after the land, which hides its edges
    this.scene.add(water);
    this.water = water;
    // Make sure the faces point up whichever way the lake axes run.
    const p = g.attributes.position;
    const ax = p.getX(1) - p.getX(0);
    const az = p.getZ(1) - p.getZ(0);
    const bx = p.getX(2) - p.getX(0);
    const bz = p.getZ(2) - p.getZ(0);
    if (az * bx - ax * bz < 0) water.material.side = THREE.BackSide;
  }

  /**
   * Mist lying on the lake: one coarse sheet a few metres over the water (see mistMaterial).
   * It lies over the far half of the lake and the flats beyond its far end, toward the sun:
   * that is where mist is seen, lit from behind, and from the ledge that is a thin band of
   * the picture. (It first covered the whole lake and the valley floor under the ledge: drawn
   * alone and counted, that was half of what an eye sees when it looks down at the lake, all
   * of it blended, for a veil that could hardly be told from the haze that costs nothing.
   * The near water is the better for being a clear mirror.) It ends where the land comes up
   * through it.
   */
  buildMist() {
    const L = W.LAKE;
    const y = W.LAKE_LEVEL + MIST_HEIGHT;
    const cell = 32;
    const p0 = -1; // from just short of the middle of the lake...
    const p1 = Math.ceil((L.a + 150) / cell); // ...to well beyond its far end
    const q1 = Math.ceil((L.b + 55) / cell);
    const position = [];
    const edge = [];
    const index = [];
    const cols = 2 * q1 + 1;
    for (let i = p0; i <= p1; i++) {
      for (let j = -q1; j <= q1; j++) {
        const [x, z] = W.lakePoint(i * cell, j * cell);
        position.push(x, y, z);
        // Thinning to nothing where the ground is within a few metres under the sheet, and
        // at the sheet's own rim.
        const room = y - this.terrain.heightAt(x, z);
        const rim = Math.min(i - p0, p1 - i, j + q1, q1 - j);
        edge.push(Math.min(Math.max((room - 1.5) / 5, 0), 1) * Math.min(rim / 1.5, 1));
      }
    }
    for (let i = 0; i < p1 - p0; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        // No face where there is no mist at any of its corners.
        if (edge[a] + edge[a + 1] + edge[a + cols] + edge[a + cols + 1] <= 0) continue;
        index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(index);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mistMaterial(this.shared));
    mesh.renderOrder = 65; // over the lake and the dragons' mirror images, under their fire
    this.scene.add(mesh);
    this.mist = mesh;
    this.mistTriangles = index.length / 3;
  }

  // -------------------------------------------------------------------------------------------

  /** The four tree shapes, each one unit tall with a crown one unit in radius. */
  treeShapes() {
    const leafShade = (dir, f, seed) => {
      // Lighter on top, darker underneath, and mottled a little.
      const v = (0.56 + 0.56 * (dir[1] * 0.5 + 0.5)) * (0.9 + 0.2 * hash2(f, seed));
      return [v, v, v];
    };
    // A crown is one soft mass of leaves, not a cut stone: its colour runs smoothly over it
    // and the light falls on it as on something round.
    const SOFT = { corner: true, round: 0.8 };
    const swayLeaf = (dir) => [0.22 + 0.2 * dir[1], 1, 0, 0];

    const mid = new MeshBuilder();
    mid.tube([{ p: [0, 0, 0], r: 0.075 }, { p: [0, 0.52, 0], r: 0.045 }], 4, BARK, (k) => [k * 0.1, 0, 0, 0]);
    mid.blob([0, 0.66, 0], [0.9, 0.34, 0.9], 0, 0.24, 11, (d, f) => leafShade(d, f, 3), swayLeaf, SOFT);
    mid.blob([0.46, 0.8, 0.18], [0.6, 0.25, 0.6], 0, 0.24, 23, (d, f) => leafShade(d, f, 5), swayLeaf, SOFT);
    mid.blob([-0.44, 0.75, -0.3], [0.62, 0.23, 0.58], 0, 0.24, 37, (d, f) => leafShade(d, f, 7), swayLeaf, SOFT);

    const pine = new MeshBuilder();
    pine.tube([{ p: [0, 0, 0], r: 0.11 }, { p: [0, 0.4, 0], r: 0.07 }], 3, BARK, (k) => [k * 0.06, 0, 0, 0]);
    const tier = (builder, y0, y1, r, sides, seed) => {
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2 + seed;
        const a1 = ((i + 1) / sides) * Math.PI * 2 + seed;
        const v = 0.8 + 0.4 * hash2(i, seed * 10);
        builder.tri(
          [Math.cos(a0) * r, y0, Math.sin(a0) * r],
          [0, y1, 0],
          [Math.cos(a1) * r, y0, Math.sin(a1) * r],
          [[v * 0.75, v * 0.75, v * 0.75], [v * 1.15, v * 1.15, v * 1.15], [v * 0.75, v * 0.75, v * 0.75]],
          [[0.1, 1, 0, 0], [0.3, 1, 0, 0], [0.1, 1, 0, 0]]
        );
      }
    };
    tier(pine, 0.2, 0.62, 1, 5, 0.3);
    tier(pine, 0.46, 0.83, 0.74, 5, 0.9);
    tier(pine, 0.7, 1, 0.48, 5, 1.7);

    const far = new MeshBuilder();
    const ring = (y, r, turn) => {
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const a = ((i + turn) / 5) * Math.PI * 2;
        const k = 0.88 + 0.24 * hash2(i, Math.round(y * 100));
        pts.push([Math.cos(a) * r * k, y, Math.sin(a) * r * k]);
      }
      return pts;
    };
    const low = ring(0.36, 1, 0);
    const high = ring(0.74, 0.74, 0.5);
    const top = [0, 1, 0];
    const none = [0, 1, 0, 0];
    // Rounded like the nearer crowns: each corner is lit as a point on a dome, and is darker
    // the lower on the crown it sits.
    const dome = (p) => {
      const n = [p[0], (p[1] - 0.45) * 1.5, p[2]];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      return [n[0] / l, n[1] / l, n[2] / l];
    };
    const shade = (p, k) => {
      const v = (0.66 + 0.5 * p[1]) * (0.93 + 0.14 * hash2(k, 41));
      return [v, v, v];
    };
    let f = 0;
    const face = (a, b, c) => far.tri(a, b, c, [shade(a, f), shade(b, f + 1), shade(c, f + 2)], none, [dome(a), dome(b), dome(c)]);
    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      face(low[i], high[i], low[j]);
      face(low[j], high[i], high[j]);
      face(high[i], top, high[j]);
      f += 3;
    }

    const farPine = new MeshBuilder();
    tier(farPine, 0.12, 1, 1, 4, 0.5);
    return { mid: mid.arrays(), pine: pine.arrays(), far: far.arrays(), farPine: farPine.arrays() };
  }

  buildForest(density) {
    const trees = W.placeForest(WORLD_SEED, density);
    const shapes = this.treeShapes();
    const material = worldMaterial(this.shared, { lit: true, sway: true });
    const farMaterial = worldMaterial(this.shared, { lit: true });
    const base = {
      mid: toGeometry(shapes.mid),
      pine: toGeometry(shapes.pine),
      far: toGeometry(shapes.far),
      farPine: toGeometry(shapes.farPine),
    };
    // Sort into (shape, slice of the compass).
    const groups = new Map();
    for (const tree of trees) {
      const shape = tree.lod === W.LOD.MID ? (tree.conifer ? 'pine' : 'mid') : tree.conifer ? 'farPine' : 'far';
      let az = Math.atan2(tree.x, -tree.z);
      if (az < 0) az += Math.PI * 2;
      const sector = Math.min(Math.floor((az / (Math.PI * 2)) * FOREST_SECTORS), FOREST_SECTORS - 1);
      const key = shape + ':' + sector;
      if (!groups.has(key)) groups.set(key, { shape, list: [] });
      groups.get(key).list.push(tree);
    }
    this.forest = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    let count = 0;
    for (const { shape, list } of groups.values()) {
      // Lowest `order` first: thinning the forest (a lower instance count) drops trees evenly.
      list.sort((a, b) => a.order - b.order);
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color', 'aux']) g.setAttribute(name, base[shape].attributes[name]);
      const shade = new Float32Array(list.length);
      const isFar = shape === 'far' || shape === 'farPine';
      const mesh = new THREE.InstancedMesh(g, isFar ? farMaterial : material, list.length);
      list.forEach((tree, i) => {
        const y = this.terrain.heightAt(tree.x, tree.z) - 0.4;
        pos.set(tree.x, y, tree.z);
        q.setFromAxisAngle(up, tree.yaw);
        scale.set(tree.radius, tree.height, tree.radius);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(i, m);
        col.setRGB(tree.color[0], tree.color[1], tree.color[2]);
        mesh.setColorAt(i, col);
        shade[i] = W.sunlitAt(this.sunHeight, tree.x, y + Math.max(tree.height, W.CANOPY) + 2, tree.z, 4);
      });
      g.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.renderOrder = isFar ? 20 : 10;
      mesh.userData.full = list.length;
      this.scene.add(mesh);
      this.forest.push(mesh);
      count += list.length;
    }
    this.treeCount = count;
    this.trees = trees;
  }

  /** The trees, boulders and fallen leaves close to the viewer: one mesh. */
  buildLedge() {
    const built = buildLedge(this.terrain.surfaceNear(40), WORLD_SEED, { spire: SPIRE });
    const mesh = new THREE.Mesh(toGeometry(built.arrays), worldMaterial(this.shared, { lit: true, sway: true }));
    // Its trees stand on every side of the viewer: there is no direction in which it is out of sight.
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    this.scene.add(mesh);
    this.ledge = mesh;
    this.heroTrees = built.trees;
    this.ledgeTriangles = built.triangles;
  }

  /** The big trees at the mouth of the creek, which the dragons fly between: one mesh. */
  buildGrove() {
    const built = buildGrove(this.terrain.heightAt, WORLD_SEED);
    // The same material as the ledge's trees (and so the same shader program).
    const mesh = new THREE.Mesh(toGeometry(built.arrays), this.ledge.material);
    mesh.renderOrder = 9;
    this.scene.add(mesh);
    this.grove = mesh;
    this.groveTriangles = built.triangles;
  }

  /** The leaves coming down past the ledge: one instanced draw call, moved by its shader. */
  buildLeaves(count) {
    const rng = makeRng(WORLD_SEED + 77);
    const g = new THREE.InstancedBufferGeometry();
    // A kite folded a little along its midrib: stem, tip, and the two sides lifted.
    const S = [-1.1, 0, 0];
    const T = [1.3, 0, 0];
    const L = [0.1, 0.24, 0.85];
    const R = [0.1, 0.24, -0.85];
    const builder = new MeshBuilder();
    builder.tri(S, L, T, [1, 1, 1]).tri(S, T, R, [1, 1, 1]);
    const a = builder.arrays();
    g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
    const seed = new Float32Array(count * 4);
    const leaf = new Float32Array(count * 4);
    const colours = [W.LEAF.scarlet, W.LEAF.flame, W.LEAF.flame, W.LEAF.orange, W.LEAF.orange, W.LEAF.gold, W.LEAF.gold, W.LEAF.yellow, W.LEAF.russet];
    for (let i = 0; i < count; i++) {
      seed[i * 4] = rng();
      seed[i * 4 + 1] = rng();
      seed[i * 4 + 2] = rng();
      seed[i * 4 + 3] = rng();
      const c = colours[rng.int(colours.length)];
      const v = rng.range(0.75, 1.15);
      leaf[i * 4] = c[0] * v;
      leaf[i * 4 + 1] = c[1] * v;
      leaf[i * 4 + 2] = c[2] * v;
      leaf[i * 4 + 3] = rng.range(0.045, 0.07);
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.setAttribute('aLeaf', new THREE.InstancedBufferAttribute(leaf, 4));
    g.instanceCount = count;
    const mesh = new THREE.Mesh(g, leafMaterial(this.shared, LEAF_BOX));
    mesh.frustumCulled = false; // they are all round the viewer
    mesh.renderOrder = 9;
    mesh.userData.full = count;
    this.scene.add(mesh);
    this.leaves = mesh;
  }

  /** Motes, sparks and ash in the air round the ledge: one instanced draw call (see moteMaterial). */
  buildMotes() {
    const rng = makeRng(WORLD_SEED + 1313);
    const count = MOTES.motes + MOTES.sparks + MOTES.ash;
    const g = new THREE.InstancedBufferGeometry();
    // A square that faces the eye; the pixel shader makes a soft round dot of it.
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(count * 4);
    const kind = new Float32Array(count);
    // Mixed through one another, so that drawing any fraction of them (see setAirFraction)
    // leaves the same proportions.
    const kinds = [];
    for (let i = 0; i < MOTES.motes; i++) kinds.push(0);
    for (let i = 0; i < MOTES.sparks; i++) kinds.push(1);
    for (let i = 0; i < MOTES.ash; i++) kinds.push(2);
    for (let i = count - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const k = kinds[i];
      kinds[i] = kinds[j];
      kinds[j] = k;
    }
    for (let i = 0; i < count; i++) {
      seed[i * 4] = rng();
      seed[i * 4 + 1] = rng();
      seed[i * 4 + 2] = rng();
      seed[i * 4 + 3] = rng();
      kind[i] = kinds[i];
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
    g.instanceCount = count;
    const mesh = new THREE.Mesh(g, moteMaterial(this.shared, MOTE_BOX));
    mesh.frustumCulled = false; // they are all round the viewer
    mesh.renderOrder = 80; // over everything solid, the lake, the mist and the fire
    mesh.userData.full = count;
    this.scene.add(mesh);
    this.motes = mesh;
  }

  /**
   * Words in the world, for the headset (where there is no page to read): a line of text that
   * stands over the rim of the ledge in front of the viewer, fades in, and fades out again.
   *
   * It is made here, once, with everything else, and stays in the scene unseen: its shader
   * is then compiled with the others while the page loads and its picture is already on the
   * graphics chip. (Made when a session starts, it cost the headset a dropped frame or ten two
   * seconds into every session, just as the person began to look around.)
   */
  buildHint(lines) {
    // All the lines in one picture, one above the other; the one shown is chosen by where the
    // picture is read from (so changing it costs nothing).
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128 * lines.length;
    const c = canvas.getContext('2d');
    c.font = '600 56px Georgia, "Times New Roman", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(26, 20, 16, 0.85)';
    c.fillStyle = '#fbf3e4';
    lines.forEach((text, k) => {
      c.strokeText(text, 512, 66 + 128 * k);
      c.fillText(text, 512, 66 + 128 * k);
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.repeat.set(1, 1 / lines.length);
    texture.offset.set(0, 1 - 1 / lines.length);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7 / 8), material);
    // Over the rim, below the line of sight to the lake, turned up to face the viewer.
    mesh.position.set(0, 0.62, -2.3);
    mesh.lookAt(0, 1.55, 0);
    mesh.renderOrder = 300;
    mesh.visible = false;
    this.scene.add(mesh);
    try {
      this.renderer.initTexture(texture);
    } catch (err) {
      /* it will be sent when it is first drawn */
    }
    this.hint = { mesh, material, texture, age: 0, seconds: 0, lines, line: 0, showing: false, shown: 0, delay: 2.5 };
  }

  /**
   * Show a line for this many seconds: `line` is which (HINT; the trigger's, if not said), and
   * `soon` makes it appear at once (it otherwise takes two and a half seconds to begin to).
   */
  showHint(seconds, line, soon) {
    const h = this.hint;
    if (!h) return;
    const k = line === undefined ? HINT.call : line;
    h.line = k;
    h.texture.offset.set(0, 1 - (k + 1) / h.lines.length);
    h.delay = soon ? 0 : 2.5;
    h.age = 0;
    h.seconds = seconds || 14;
    h.showing = true;
    h.shown++;
    h.material.opacity = 0;
  }

  hideHint() {
    const h = this.hint;
    if (!h) return;
    h.showing = false;
    h.mesh.visible = false;
    h.material.opacity = 0;
  }

  updateHint(dt) {
    const h = this.hint;
    if (!h || !h.showing) return;
    h.age += dt;
    const fadeIn = Math.min(Math.max((h.age - h.delay) / (h.delay > 0 ? 1.5 : 0.4), 0), 1);
    const fadeOut = Math.min(Math.max((h.seconds - h.age) / 2, 0), 1);
    h.material.opacity = 0.95 * fadeIn * fadeOut;
    h.mesh.visible = h.material.opacity > 0.01;
    if (h.age > h.seconds) this.hideHint();
  }

  /**
   * How much of what is in the air is drawn, 0..1: the motes, sparks and ash, the shafts of
   * sunlight, and the mist on the lake. They are the see-through things, which cost a headset
   * pixels; everything solid is drawn regardless.
   */
  setAirFraction(fraction) {
    const f = Math.min(Math.max(fraction, 0), 1);
    this.airFraction = f;
    if (this.motes) {
      this.motes.geometry.instanceCount = Math.round(this.motes.userData.full * f);
      this.motes.visible = this.motes.geometry.instanceCount > 0;
    }
    this.shared.uRays.value = Math.min(f * 1.6, 1);
    // (With no shafts at all, their triangles are left out of the sun's mesh too.)
    if (this.sun) this.sun.geometry.setDrawRange(0, f > 0.05 ? this.sun.userData.all : this.sun.userData.solid);
    if (this.mist) {
      this.mist.material.uniforms.uAmount.value = f;
      this.mist.visible = f > 0.05;
    }
  }

  /** How many of the sparks in the air are alight, 0..1 (more for a while after fire). */
  setEmber(amount) {
    if (this.motes) this.motes.material.uniforms.uEmber.value = amount;
  }

  /** Draw only this fraction of the leaves in the air. */
  setLeafFraction(fraction) {
    if (this.leaves) this.leaves.geometry.instanceCount = Math.max(0, Math.round(this.leaves.userData.full * fraction));
  }

  /** Draw only this fraction of the forest (1 = all of it). Used to hold the frame rate. */
  setForestFraction(fraction) {
    this.forestFraction = fraction;
    for (const mesh of this.forest) mesh.count = Math.max(1, Math.ceil(mesh.userData.full * fraction));
  }

  // -------------------------------------------------------------------------------------------

  setSize(width, height) {
    if (this.renderer.xr.isPresenting) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  update(time) {
    this.time = time;
    this.shared.uTime.value = time;
  }

  /** How hard the wind is blowing just now, 0 (still) .. 1 (a gust): the trees sway by it. */
  setWind(strength) {
    const k = 0.45 + 1.05 * strength;
    this.shared.uWind.value.set(WIND[0] * k, WIND[1] * k);
  }

  /** How much darker the edge of the view is than its middle (see VIGNETTE in shaders.js). */
  setVignette(amount) {
    this.shared.uVignette.value = amount;
  }

  /** How much of the sun a dragon covers just now, seen from the ledge (0..1). */
  setCover(cover) {
    this.shared.uCover.value = cover;
  }

  /** Carry the leaves in the air this much further (metres): the wake of a dragon going by. */
  blowLeaves(dx, dy, dz) {
    if (!this.leaves) return;
    // (It only ever grows, by a few metres a pass: each leaf takes its own share of it, so it
    // cannot be brought back into the box here without every leaf jumping.)
    const blown = this.leaves.material.uniforms.uBlown.value;
    blown.x += dx;
    blown.y += dy;
    blown.z += dz;
    // What hangs in the air goes with them.
    if (this.motes) this.motes.material.uniforms.uBlown.value.copy(blown);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
