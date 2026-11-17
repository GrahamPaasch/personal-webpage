/**
 * reflection.js: what the lake mirrors, worked out once. Pure (no three.js).
 *
 * The viewer stays on the ledge, so the mirror image in the water barely changes: leaning a
 * metre moves it by a fraction of a degree. That lets the whole reflection (sky, sun glow, the
 * hills and their trees) be computed up front for the ledge and kept in a small texture, instead
 * of drawing the scene a second time every frame, which a Quest 1 cannot afford.
 *
 * Texture layout: a square over the lake in world x/z. rgb = the mirrored colour, ready for the
 * screen. alpha = how strongly the sun glitters at that spot.
 */

import {
  LAKE, LAKE_LEVEL, SUN_DIR, SUN_ELEVATION, LIGHT, lakeDistance, forestDensity, canopyColor, groundColor,
  skyColor, fogColor, fogAmount, lightOn, sunlitAt, toDisplay,
} from './world.js';
import { hash2, smoothstep, lerp } from './rng.js';

/** The world rectangle the texture covers: the lake and a margin. */
export function reflectionBounds() {
  const margin = 26;
  const ex = Math.hypot(LAKE.a * LAKE.ux, LAKE.b * LAKE.vx) * 1.12 + margin;
  const ez = Math.hypot(LAKE.a * LAKE.uz, LAKE.b * LAKE.vz) * 1.12 + margin;
  return { x0: LAKE.cx - ex, x1: LAKE.cx + ex, z0: LAKE.cz - ez, z1: LAKE.cz + ez };
}

const DEEP = [0.014, 0.018, 0.05]; // looking down into the water: ink, at this hour
const SHALLOW = [0.1, 0.08, 0.065];
/**
 * How much of a mirror the lake is: this much looking straight down into it, and all of one
 * at a glancing angle. (Water under a midday sky is a fifth of that, and one sees into it.
 * Under a sky that is on fire, with the land gone dark, the lake is the sky lying on the
 * ground: that is what is drawn.)
 */
const MIRROR_LEAST = 0.4;
/** A mirrored ray that clears the land by less than this (radians) still sees some of it: the soft outline of the hills. */
const EDGE = 0.045;
/** How much of the sky's glow the haze in front of a far hill takes on, toward the sun. */
const HAZE_GLOW = 0.6;
/** Far from the viewer the mirror image is smeared along the line of sight, by up to this many texels each way. */
const SMEAR = 9;

/**
 * heights: HeightGrid of the land with its treetops (fine, near). far: HeightGrid of the bare
 * land out to the horizon (coarse). sunHeight: from buildSunHeight. eye: [x, y, z].
 */
export function bakeReflection(size, heights, far, sunHeight, eye) {
  const b = reflectionBounds();
  const data = new Uint8Array(size * size * 4);
  const sky = [0, 0, 0];
  const fog = [0, 0, 0];
  const light = [0, 0, 0];
  const albedo = [0, 0, 0];
  const c = [0, 0, 0];
  const sunFlat = Math.hypot(SUN_DIR[0], SUN_DIR[2]);
  for (let j = 0; j < size; j++) {
    const z = lerp(b.z0, b.z1, (j + 0.5) / size);
    for (let i = 0; i < size; i++) {
      const x = lerp(b.x0, b.x1, (i + 0.5) / size);
      // From the eye down to the water, then mirrored upward.
      let dx = x - eye[0];
      let dy = LAKE_LEVEL - eye[1];
      let dz = z - eye[2];
      const len = Math.hypot(dx, dy, dz);
      dx /= len;
      dy /= len;
      dz /= len;
      const ry = -dy;
      // Walk the mirrored ray until it meets land. Where it only just clears a hill the answer
      // is not "sky": the outline of a hill 800 m off, mirrored in water that is never still,
      // is not a line. So the nearest miss is kept too (how far above the land the ray was, as
      // an angle), and over the last couple of degrees land fades into sky.
      let hit = false;
      let s = 3;
      let hx = 0;
      let hy = 0;
      let hz = 0;
      let clear = Infinity;
      let cs = 0;
      for (let k = 0; k < 110 && s < 2600; k++) {
        const px = x + dx * s;
        const pz = z + dz * s;
        const py = LAKE_LEVEL + ry * s;
        const inside = Math.abs(px) < heights.half && Math.abs(pz) < heights.half;
        const land = inside ? heights.at(px, pz) : far.at(px, pz) + 9;
        const over = (py - land) / s;
        if (over < clear) {
          clear = over;
          cs = s;
          hx = px;
          hy = Math.min(py, land);
          hz = pz;
        }
        if (over < 0) {
          hit = true;
          break;
        }
        s *= 1.065;
      }
      // 0: land; 1: sky; between: the ray passed within EDGE of the land.
      const open = hit ? 0 : smoothstep(0, EDGE, clear);
      skyColor(dx, ry, dz, sky);
      if (open < 1) {
        s = cs;
        const forest = forestDensity(hx, hz) > 0.4;
        // Seen from the ledge these slopes face the viewer and the sky.
        let nx = -dx * 0.6;
        let ny = 0.62;
        let nz = -dz * 0.6;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const inside = Math.abs(hx) < sunHeight.half && Math.abs(hz) < sunHeight.half;
        const lit = inside ? sunlitAt(sunHeight, hx, hy + 1.5, hz, 3) : 1;
        lightOn(nx, ny, nz, lit, light);
        if (forest) {
          canopyColor(hx, hz, hash2(Math.floor(hx / 11), Math.floor(hz / 11)), albedo);
          const through = Math.max(-(nx * SUN_DIR[0] + ny * SUN_DIR[1] + nz * SUN_DIR[2]), 0) * 0.45 * lit;
          for (let q = 0; q < 3; q++) c[q] = albedo[q] * (light[q] + LIGHT.sun[q] * through) * 0.8;
        } else {
          groundColor(hx, hz, hy, 0.4, albedo);
          for (let q = 0; q < 3; q++) c[q] = albedo[q] * light[q];
        }
        // Haze: all the way from the eye down to the water and on to the hill, which is at
        // least what lies between the eye and the same hill seen straight. And haze toward a
        // low sun is not only tinted, it glows as the sky behind it does: a far hill under
        // the sun is nearly the colour of that sky, not a dark shape cut out of it.
        const f = Math.max(fogAmount(LAKE_LEVEL, ry, s), fogAmount(eye[1], (hy - eye[1]) / Math.max(len + s, 1), len + s));
        fogColor(dx, ry, dz, fog);
        for (let q = 0; q < 3; q++) {
          const hazed = lerp(fog[q], sky[q], HAZE_GLOW);
          c[q] = lerp(lerp(c[q], hazed, f), sky[q], open);
        }
      } else {
        c[0] = sky[0];
        c[1] = sky[1];
        c[2] = sky[2];
      }
      // Water mirrors more at a glancing angle; looking down you see into it.
      const cosI = Math.abs(dy);
      const mirror = MIRROR_LEAST + (1 - MIRROR_LEAST) * Math.pow(1 - cosI, 2);
      const dl = lakeDistance(x, z);
      const shore = smoothstep(-4, 0, dl) * 0.42;
      for (let q = 0; q < 3; q++) {
        c[q] = lerp(DEEP[q], c[q] * 0.92, mirror);
        c[q] = lerp(c[q], SHALLOW[q], shore);
      }
      toDisplay(c);
      // The sun's path on the water: a road of light from under the sun toward the viewer,
      // narrow far off and wider as it comes (the nearer the water, the steeper it is seen,
      // and the more of its ripples are tilted the right way to throw the sun at the eye),
      // fading as it nears the foot of the bluff.
      const flat = Math.hypot(dx, dz) || 1;
      const cosAz = (dx * SUN_DIR[0] + dz * SUN_DIR[2]) / (flat * sunFlat);
      const az = Math.acos(Math.min(Math.max(cosAz, -1), 1));
      const el = Math.asin(ry) - SUN_ELEVATION;
      const wide = 0.05 + 0.11 * ry;
      let glitter = Math.exp(-(az * az) / (wide * wide)) * Math.exp(-(el * el) / (0.5 * 0.5));
      glitter *= sunlitAt(sunHeight, x, LAKE_LEVEL + 0.5, z, 2) * (1 - shore);
      const o = (j * size + i) * 4;
      data[o] = Math.round(c[0] * 255);
      data[o + 1] = Math.round(c[1] * 255);
      data[o + 2] = Math.round(c[2] * 255);
      data[o + 3] = Math.round(Math.min(glitter, 1) * 255);
    }
  }
  // Ripples smear a mirror image: soften it once (which also hides the texture's own grain).
  const soft = new Uint8Array(data.length);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      for (let q = 0; q < 4; q++) {
        let sum = 0;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = Math.min(Math.max(j + dj, 0), size - 1);
          for (let di = -1; di <= 1; di++) {
            const ii = Math.min(Math.max(i + di, 0), size - 1);
            sum += data[(jj * size + ii) * 4 + q] * (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
          }
        }
        soft[(j * size + i) * 4 + q] = Math.round(sum / 16);
      }
    }
  }
  // And they smear it most along the line of sight, more the further off and the flatter the
  // water is seen: the far half of the lake mirrors streaks, not outlines. Each texel becomes
  // the mean of those before and behind it on the line from the viewer, over a length that
  // grows from nothing 120 m out to SMEAR texels each way at the far shore.
  const smeared = new Uint8Array(data.length);
  const texel = (b.z1 - b.z0) / size;
  for (let j = 0; j < size; j++) {
    const z = lerp(b.z0, b.z1, (j + 0.5) / size);
    for (let i = 0; i < size; i++) {
      const x = lerp(b.x0, b.x1, (i + 0.5) / size);
      const o = (j * size + i) * 4;
      const range = Math.hypot(x - eye[0], z - eye[2]);
      const reach = SMEAR * smoothstep(120, 300, range);
      if (reach < 0.5) {
        for (let q = 0; q < 4; q++) smeared[o + q] = soft[o + q];
        continue;
      }
      // One texel's step along the line of sight, in texels across and along the texture.
      const ui = (((x - eye[0]) / range) * texel) / ((b.x1 - b.x0) / size);
      const uj = ((z - eye[2]) / range) * texel / texel;
      const n = Math.ceil(reach);
      const sum = [0, 0, 0, 0];
      let weight = 0;
      for (let k = -n; k <= n; k++) {
        const w = 1 - Math.abs(k) / (reach + 1);
        if (w <= 0) continue;
        const ii = Math.min(Math.max(Math.round(i + ui * k), 0), size - 1);
        const jj = Math.min(Math.max(Math.round(j + uj * k), 0), size - 1);
        const p = (jj * size + ii) * 4;
        for (let q = 0; q < 4; q++) sum[q] += soft[p + q] * w;
        weight += w;
      }
      for (let q = 0; q < 4; q++) smeared[o + q] = Math.round(sum[q] / weight);
    }
  }
  return { data: smeared, size, bounds: b };
}

/** A small tiling texture of two independent smooth noises (in r and g), for the sparkle. */
export function bakeNoise(size) {
  const data = new Uint8Array(size * size * 4);
  const raw = [new Float32Array(size * size), new Float32Array(size * size)];
  for (let c = 0; c < 2; c++) for (let i = 0; i < size * size; i++) raw[c][i] = hash2(i, 77 + c * 31);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      for (let c = 0; c < 2; c++) {
        // A 3x3 blur with wrap-around, so the texture tiles and has no single-texel speckle.
        let sum = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const w = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
            sum += w * raw[c][((j + dj + size) % size) * size + ((i + di + size) % size)];
          }
        }
        // Blurring pulls everything toward the middle: stretch it back out.
        const v = (sum / 16 - 0.5) * 2.2 + 0.5;
        data[(j * size + i) * 4 + c] = Math.round(Math.min(Math.max(v, 0), 1) * 255);
      }
      data[(j * size + i) * 4 + 3] = 255;
    }
  }
  return data;
}
