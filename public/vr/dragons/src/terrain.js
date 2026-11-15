/**
 * terrain.js: the land as one mesh. Pure (no three.js).
 *
 * The viewer never leaves the ledge, so the mesh is a web of rings around them: fine underfoot
 * and coarser with distance, which keeps about the same detail per degree of view everywhere.
 * Light and shadow are worked out here once and stored as vertex colours; the shader only adds
 * haze.
 */

import { ground, groundColor, forestDensity, lakeDistance, lightOn, sunlitAt, CANOPY, FOREST_RANGE, LAKE_LEVEL } from './world.js';
import { hash2, smoothstep } from './rng.js';

const SECTORS = 96;
const OUTER = 1750;

/** Ring radii and how many points each ring has. Ring 0 is the single point underfoot. */
export function terrainRings() {
  const radii = [0];
  const counts = [1];
  let r = 0.6;
  let n = 6;
  while (r < OUTER) {
    while (n < SECTORS && (2 * Math.PI * r) / n > 0.66) n *= 2;
    radii.push(r);
    counts.push(n);
    const arc = (2 * Math.PI * r) / n;
    if (n < SECTORS) r += arc * 0.95;
    else r *= 1 + (r < 420 ? 0.105 : 0.21);
  }
  return { radii, counts };
}

/**
 * How far the far "ground" is lifted to stand for the canopy top (0 near, most of a tree far).
 * Behind the viewer the same is done much nearer, about 100 m back: from the ledge the plateau
 * forest is seen from the side, and without something solid behind the last trees that are
 * drawn, the sky would show between their trunks.
 */
function canopyLift(x, z, r) {
  if (r < FOREST_RANGE.farA) {
    if (z < 8 || r < 94) return 0;
    return 0.85 * CANOPY * smoothstep(94, 112, r) * smoothstep(8, 34, z) * smoothstep(0.3, 0.7, forestDensity(x, z));
  }
  return 0.7 * CANOPY * smoothstep(FOREST_RANGE.farA, FOREST_RANGE.farA * 1.4, r) * smoothstep(0.3, 0.7, forestDensity(x, z));
}

/**
 * Build the terrain. `sunHeight` comes from world.buildSunHeight.
 * Returns { position, color (linear, lit), triangles, heightAt(x, z) }.
 */
export function buildTerrain(sunHeight) {
  const { radii, counts } = terrainRings();
  const rings = radii.length;
  // Vertex positions ring by ring.
  const start = new Int32Array(rings + 1);
  for (let k = 0; k < rings; k++) start[k + 1] = start[k] + counts[k];
  const total = start[rings];
  const vx = new Float32Array(total);
  const vy = new Float32Array(total);
  const vz = new Float32Array(total);
  const inLake = new Uint8Array(total);
  for (let k = 0; k < rings; k++) {
    const n = counts[k];
    for (let i = 0; i < n; i++) {
      // Near the viewer the points are nudged off their rings and spokes, so the ground does
      // not look like a spider's web.
      const loose = k > 0 && radii[k] < 45 ? 1 - smoothstep(30, 45, radii[k]) : 0;
      const a = ((i + loose * 0.7 * (hash2(i, k) - 0.5)) / n) * Math.PI * 2;
      const gap = k + 1 < rings ? radii[k + 1] - radii[k] : 0;
      const rr = radii[k] + loose * 0.5 * gap * (hash2(k, i + 500) - 0.5);
      // Angle 0 is straight ahead (-z), turning toward +x.
      const x = Math.sin(a) * rr;
      const z = -Math.cos(a) * rr;
      const v = start[k] + i;
      vx[v] = x;
      vz[v] = z;
      vy[v] = ground(x, z) + canopyLift(x, z, radii[k]);
      inLake[v] = lakeDistance(x, z) < -9 ? 1 : 0;
    }
  }

  const position = [];
  const color = [];
  const light = [0, 0, 0];
  const albedo = [0, 0, 0];
  let faces = 0;

  const face = (a, b0, c0) => {
    let b = b0;
    let c = c0;
    if (inLake[a] && inLake[b] && inLake[c]) return; // under the water: never seen
    const cx = (vx[a] + vx[b] + vx[c]) / 3;
    const cz = (vz[a] + vz[b] + vz[c]) / 3;
    const cy = (vy[a] + vy[b] + vy[c]) / 3;
    const r = Math.hypot(cx, cz);
    // Far behind the viewer the plateau forest hides everything.
    if (cz > 30 && r > 150) return;
    const ux = vx[b] - vx[a];
    const uy = vy[b] - vy[a];
    const uz = vz[b] - vz[a];
    const wx = vx[c] - vx[a];
    const wy = vy[c] - vy[a];
    const wz = vz[c] - vz[a];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    if (ny < 0) {
      // Wound the other way round: turn it to face up.
      b = c0;
      c = b0;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const lift = canopyLift(cx, cz, r);
    // Lifted ground stands for leaves: it must not turn to bare rock where it is steep.
    const slope = lift > 0.5 ? 0.3 : Math.hypot(nx, nz) / Math.max(ny, 0.05);
    groundColor(cx, cz, cy, slope, albedo);
    // Canopy seen from far off is lit like a rough, upward-facing surface.
    const soft = lift > 0 ? 0.55 : 0;
    const lx = nx * (1 - soft);
    const ly = ny * (1 - soft) + soft;
    const lz = nz * (1 - soft);
    const ll = Math.hypot(lx, ly, lz) || 1;
    // The ledge and the cliff under it face the sun with nothing in the way.
    const open = 1 - smoothstep(14, 24, r);
    const sun = Math.max(open, sunlitAt(sunHeight, cx, cy + 0.6 + (lift > 0 ? CANOPY * 0.3 : 0), cz, 2.5));
    lightOn(lx / ll, ly / ll, lz / ll, sun, light);
    // Each facet a touch different, so the low-poly surface reads as cut stone and not as plastic.
    const v = 0.93 + 0.14 * hash2(faces * 3 + 1, 99);
    for (const p of [a, b, c]) {
      position.push(vx[p], vy[p], vz[p]);
      color.push(albedo[0] * light[0] * v, albedo[1] * light[1] * v, albedo[2] * light[2] * v);
    }
    faces++;
  };

  for (let k = 0; k + 1 < rings; k++) {
    const n = counts[k];
    const m = counts[k + 1];
    const a0 = start[k];
    const b0 = start[k + 1];
    if (n === 1) {
      for (let i = 0; i < m; i++) face(a0, b0 + i, b0 + ((i + 1) % m));
    } else if (m === n) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        face(a0 + i, b0 + i, b0 + j);
        face(a0 + i, b0 + j, a0 + j);
      }
    } else {
      // Twice as many points outside: three triangles per inner segment.
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const o0 = b0 + 2 * i;
        const o1 = b0 + 2 * i + 1;
        const o2 = b0 + ((2 * i + 2) % m);
        face(a0 + i, o0, o1);
        face(a0 + i, o1, a0 + j);
        face(a0 + j, o1, o2);
      }
    }
  }

  /**
   * Height of the mesh surface (not of the ideal ground) at a point: trees are planted on this,
   * so that none floats over a coarse far triangle.
   */
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z);
    if (r >= radii[rings - 1]) return ground(x, z);
    let k = 0;
    let hi = rings - 1;
    while (hi - k > 1) {
      const mid = (k + hi) >> 1;
      if (radii[mid] <= r) k = mid;
      else hi = mid;
    }
    const n = counts[k];
    const m = counts[k + 1];
    if (n !== m || n === 1) return ground(x, z); // underfoot the mesh is fine enough
    let a = Math.atan2(x, -z);
    if (a < 0) a += Math.PI * 2;
    const i = Math.min(Math.floor((a / (Math.PI * 2)) * n), n - 1);
    const j = (i + 1) % n;
    const p = [start[k] + i, start[k + 1] + i, start[k + 1] + j, start[k] + j];
    // The two triangles of this cell, as built above: (p0, p1, p2) and (p0, p2, p3).
    for (const [a1, b1, c1] of [[p[0], p[1], p[2]], [p[0], p[2], p[3]]]) {
      const d = (vz[b1] - vz[c1]) * (vx[a1] - vx[c1]) + (vx[c1] - vx[b1]) * (vz[a1] - vz[c1]);
      const w0 = ((vz[b1] - vz[c1]) * (x - vx[c1]) + (vx[c1] - vx[b1]) * (z - vz[c1])) / d;
      const w1 = ((vz[c1] - vz[a1]) * (x - vx[c1]) + (vx[a1] - vx[c1]) * (z - vz[c1])) / d;
      const w2 = 1 - w0 - w1;
      if (w0 >= -1e-4 && w1 >= -1e-4 && w2 >= -1e-4) return w0 * vy[a1] + w1 * vy[b1] + w2 * vy[c1];
    }
    return ground(x, z);
  };

  /**
   * The same for the ground close to the viewer, where the mesh is loose and fine: the exact
   * height of the drawn triangles, so that a pebble or a fallen leaf lies ON the rock. Returns a
   * function (x, z) -> y that falls back to ground() outside `radius`.
   */
  const surfaceNear = (radius) => {
    const tris = [];
    for (let i = 0; i < position.length; i += 9) {
      const cx = (position[i] + position[i + 3] + position[i + 6]) / 3;
      const cz = (position[i + 2] + position[i + 5] + position[i + 8]) / 3;
      if (Math.hypot(cx, cz) < radius + 4) tris.push(i);
    }
    // Buckets a metre wide, so a lookup tries a handful of triangles and not all of them.
    const cell = 1;
    const half = Math.ceil(radius + 6);
    const side = 2 * half;
    const buckets = new Array(side * side);
    for (const i of tris) {
      const x0 = Math.floor(Math.min(position[i], position[i + 3], position[i + 6]) / cell) + half;
      const x1 = Math.floor(Math.max(position[i], position[i + 3], position[i + 6]) / cell) + half;
      const z0 = Math.floor(Math.min(position[i + 2], position[i + 5], position[i + 8]) / cell) + half;
      const z1 = Math.floor(Math.max(position[i + 2], position[i + 5], position[i + 8]) / cell) + half;
      for (let bz = Math.max(z0, 0); bz <= Math.min(z1, side - 1); bz++) {
        for (let bx = Math.max(x0, 0); bx <= Math.min(x1, side - 1); bx++) {
          const k = bz * side + bx;
          (buckets[k] || (buckets[k] = [])).push(i);
        }
      }
    }
    return (x, z) => {
      if (Math.hypot(x, z) > radius) return ground(x, z);
      const bx = Math.floor(x / cell) + half;
      const bz = Math.floor(z / cell) + half;
      const list = bx >= 0 && bz >= 0 && bx < side && bz < side ? buckets[bz * side + bx] : null;
      if (list) {
        let best = -Infinity;
        for (const i of list) {
          const ax = position[i];
          const az = position[i + 2];
          const bx1 = position[i + 3];
          const bz1 = position[i + 5];
          const cx = position[i + 6];
          const cz = position[i + 8];
          const d = (bz1 - cz) * (ax - cx) + (cx - bx1) * (az - cz);
          if (Math.abs(d) < 1e-12) continue;
          const w0 = ((bz1 - cz) * (x - cx) + (cx - bx1) * (z - cz)) / d;
          const w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
          // Where the cliff overhangs itself in plan, the top surface is the one to stand on.
          const y = w0 * position[i + 1] + w1 * position[i + 4] + w2 * position[i + 7];
          if (y > best) best = y;
        }
        if (best > -Infinity) return best;
      }
      return ground(x, z);
    };
  };

  return {
    surfaceNear,
    position: new Float32Array(position),
    color: new Float32Array(color),
    triangles: faces,
    vertices: faces * 3,
    rings,
    heightAt,
    lakeFloor: LAKE_LEVEL - 9,
  };
}
