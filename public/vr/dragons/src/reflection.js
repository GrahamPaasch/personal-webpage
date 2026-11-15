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

const DEEP = [0.012, 0.04, 0.055]; // looking down into the water
const SHALLOW = [0.17, 0.16, 0.1];

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
      // Walk the mirrored ray until it meets land.
      let hit = false;
      let s = 3;
      let hx = 0;
      let hy = 0;
      let hz = 0;
      for (let k = 0; k < 110 && s < 2600; k++) {
        hx = x + dx * s;
        hz = z + dz * s;
        hy = LAKE_LEVEL + ry * s;
        const inside = Math.abs(hx) < heights.half && Math.abs(hz) < heights.half;
        const land = inside ? heights.at(hx, hz) : far.at(hx, hz) + 9;
        if (hy < land) {
          hit = true;
          break;
        }
        s *= 1.065;
      }
      if (hit) {
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
          const through = Math.max(-(nx * SUN_DIR[0] + ny * SUN_DIR[1] + nz * SUN_DIR[2]), 0) * 0.55 * lit;
          for (let q = 0; q < 3; q++) c[q] = albedo[q] * (light[q] + LIGHT.sun[q] * through) * 0.8;
        } else {
          groundColor(hx, hz, hy, 0.4, albedo);
          for (let q = 0; q < 3; q++) c[q] = albedo[q] * light[q];
        }
        const f = fogAmount(LAKE_LEVEL, ry, s);
        fogColor(dx, ry, dz, fog);
        for (let q = 0; q < 3; q++) c[q] = lerp(c[q], fog[q], f);
      } else {
        skyColor(dx, ry, dz, sky);
        c[0] = sky[0];
        c[1] = sky[1];
        c[2] = sky[2];
      }
      // Water mirrors more at a glancing angle; looking down you see into it.
      const cosI = Math.abs(dy);
      const mirror = 0.1 + 0.9 * Math.pow(1 - cosI, 2.6);
      const dl = lakeDistance(x, z);
      const shore = smoothstep(-4, 0, dl) * 0.55;
      for (let q = 0; q < 3; q++) {
        c[q] = lerp(DEEP[q], c[q] * 0.92, mirror);
        c[q] = lerp(c[q], SHALLOW[q], shore);
      }
      toDisplay(c);
      // The sun's path on the water: narrow sideways, long toward the viewer.
      const flat = Math.hypot(dx, dz) || 1;
      const cosAz = (dx * SUN_DIR[0] + dz * SUN_DIR[2]) / (flat * sunFlat);
      const az = Math.acos(Math.min(Math.max(cosAz, -1), 1));
      const el = Math.asin(ry) - SUN_ELEVATION;
      let glitter = Math.exp(-(az * az) / (0.075 * 0.075)) * Math.exp(-(el * el) / (0.2 * 0.2));
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
  return { data: soft, size, bounds: b };
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
