/**
 * meshbuilder.js: collects flat-shaded triangles into plain arrays. No three.js in here, so the
 * shapes (trees, rocks, the dragons) can be built and checked in the tests.
 *
 * Every triangle gets its own three vertices and its face normal: that is what gives the
 * low-poly look, and it keeps the shaders free of per-pixel work.
 *
 * Per vertex: position (3), normal (3), colour (3, linear RGB) and `aux` (4 numbers whose meaning
 * belongs to the shader that draws the mesh: see shaders.js).
 */

import { hash2 } from './rng.js';

const ZERO4 = [0, 0, 0, 0];

export class MeshBuilder {
  constructor() {
    this.position = [];
    this.normal = [];
    this.color = [];
    this.aux = [];
  }

  get vertexCount() {
    return this.position.length / 3;
  }

  get triangleCount() {
    return this.position.length / 9;
  }

  /**
   * One triangle, counter-clockwise seen from outside. `color` and `aux` are either one value
   * for the whole face or an array of three (one per corner).
   */
  tri(a, b, c, color, aux) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) return this; // a sliver with no area: leave it out
    nx /= len;
    ny /= len;
    nz /= len;
    const perCornerColor = Array.isArray(color[0]);
    const perCornerAux = aux && Array.isArray(aux[0]);
    const corners = [a, b, c];
    for (let i = 0; i < 3; i++) {
      const p = corners[i];
      const col = perCornerColor ? color[i] : color;
      const x = perCornerAux ? aux[i] : aux || ZERO4;
      this.position.push(p[0], p[1], p[2]);
      this.normal.push(nx, ny, nz);
      this.color.push(col[0], col[1], col[2]);
      this.aux.push(x[0], x[1], x[2], x[3]);
    }
    return this;
  }

  /** A four-sided face a-b-c-d (counter-clockwise), as two triangles. */
  quad(a, b, c, d, color, aux) {
    if (Array.isArray(color[0]) || (aux && Array.isArray(aux[0]))) {
      const col = Array.isArray(color[0]) ? color : [color, color, color, color];
      const x = aux && Array.isArray(aux[0]) ? aux : [aux || ZERO4, aux || ZERO4, aux || ZERO4, aux || ZERO4];
      this.tri(a, b, c, [col[0], col[1], col[2]], [x[0], x[1], x[2]]);
      this.tri(a, c, d, [col[0], col[2], col[3]], [x[0], x[2], x[3]]);
    } else {
      this.tri(a, b, c, color, aux);
      this.tri(a, c, d, color, aux);
    }
    return this;
  }

  /**
   * Skin made of rings of points: ring k is joined to ring k+1. All rings have the same number
   * of points, listed counter-clockwise when seen from the END of the loft looking back (so the
   * faces point outward when the rings advance along +z and wind x -> y).
   * colorAt(k, i) and auxAt(k, i) give the value for ring k, point i (corner values), or for a
   * face when `faceColor` is set: faceColor(k, i) colours the whole quad between rings k, k+1.
   */
  loft(rings, options) {
    const o = options || {};
    const n = rings[0].length;
    for (let k = 0; k + 1 < rings.length; k++) {
      const r0 = rings[k];
      const r1 = rings[k + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const flat = o.faceColor ? o.faceColor(k, i) : null;
        const col = flat || [o.colorAt(k, i), o.colorAt(k, j), o.colorAt(k + 1, j), o.colorAt(k + 1, i)];
        const aux = o.auxAt ? [o.auxAt(k, i), o.auxAt(k, j), o.auxAt(k + 1, j), o.auxAt(k + 1, i)] : o.aux;
        this.quad(r0[i], r0[j], r1[j], r1[i], col, aux);
      }
    }
    if (o.capStart) this.cap(rings[0], true, o.capStart, o.capStartAux || o.aux);
    if (o.capEnd) this.cap(rings[rings.length - 1], false, o.capEnd, o.capEndAux || o.aux);
    return this;
  }

  /** Close a ring with a fan around its middle. */
  cap(ring, flip, color, aux) {
    const n = ring.length;
    const mid = [0, 0, 0];
    for (const p of ring) {
      mid[0] += p[0] / n;
      mid[1] += p[1] / n;
      mid[2] += p[2] / n;
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) this.tri(mid, ring[j], ring[i], color, aux);
      else this.tri(mid, ring[i], ring[j], color, aux);
    }
    return this;
  }

  /**
   * A tube along a path of { p: [x, y, z], r: radius } with `sides` flat sides. Used for trunks
   * and branches. colour: one colour or (k, i) => colour for the face after ring k.
   */
  tube(path, sides, color, aux, options) {
    const o = options || {};
    const rings = [];
    let ref = [1, 0, 0];
    for (let k = 0; k < path.length; k++) {
      const a = path[Math.max(k - 1, 0)].p;
      const b = path[Math.min(k + 1, path.length - 1)].p;
      const t = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      // A frame around the path that does not twist: carry `ref` along.
      let side = cross(t, ref);
      if (Math.hypot(side[0], side[1], side[2]) < 1e-4) side = cross(t, [0, 0, 1]);
      side = normalize(side);
      ref = normalize(cross(side, t));
      const ring = [];
      const turn = o.turn || 0;
      for (let i = 0; i < sides; i++) {
        const ang = ((i + turn) / sides) * Math.PI * 2;
        const cs = Math.cos(ang) * path[k].r;
        const sn = Math.sin(ang) * path[k].r;
        ring.push([path[k].p[0] + ref[0] * cs + side[0] * sn, path[k].p[1] + ref[1] * cs + side[1] * sn, path[k].p[2] + ref[2] * cs + side[2] * sn]);
      }
      rings.push(ring);
    }
    const faceColor = typeof color === 'function' ? color : () => color;
    const auxAt = typeof aux === 'function' ? aux : null;
    this.loft(rings, { faceColor, aux: auxAt ? undefined : aux, auxAt, capEnd: o.capEnd, capStart: o.capStart });
    return this;
  }

  /**
   * A lumpy ball: an icosahedron (detail 0: 20 faces, 1: 80, 2: 320) stretched to `radius`
   * [rx, ry, rz] around `center` and pushed in and out by `bumps` (0 = smooth).
   * color: one colour, or (unitDirection, faceIndex) => colour. aux likewise.
   */
  blob(center, radius, detail, bumps, seed, color, aux) {
    const sphere = icosphere(detail);
    const verts = sphere.vertices;
    const moved = new Array(verts.length);
    for (let i = 0; i < verts.length; i++) {
      const d = verts[i];
      const k = 1 + (bumps ? bumps * (hash2(i * 7 + 1, seed) * 2 - 1) : 0);
      moved[i] = [center[0] + d[0] * radius[0] * k, center[1] + d[1] * radius[1] * k, center[2] + d[2] * radius[2] * k];
    }
    const colorFn = typeof color === 'function' ? color : null;
    const auxFn = typeof aux === 'function' ? aux : null;
    const dir = [0, 0, 0];
    for (let f = 0; f < sphere.faces.length; f++) {
      const [a, b, c] = sphere.faces[f];
      if (colorFn || auxFn) {
        dir[0] = (verts[a][0] + verts[b][0] + verts[c][0]) / 3;
        dir[1] = (verts[a][1] + verts[b][1] + verts[c][1]) / 3;
        dir[2] = (verts[a][2] + verts[b][2] + verts[c][2]) / 3;
      }
      this.tri(moved[a], moved[b], moved[c], colorFn ? colorFn(dir, f) : color, auxFn ? auxFn(dir, f) : aux);
    }
    return this;
  }

  /** Add everything from another builder, moved by (p) => [x, y, z] and (n) => [x, y, z]. */
  append(other, movePoint, moveNormal) {
    const n = other.vertexCount;
    for (let i = 0; i < n; i++) {
      const p = [other.position[i * 3], other.position[i * 3 + 1], other.position[i * 3 + 2]];
      const q = movePoint ? movePoint(p) : p;
      this.position.push(q[0], q[1], q[2]);
      const m = [other.normal[i * 3], other.normal[i * 3 + 1], other.normal[i * 3 + 2]];
      const w = moveNormal ? moveNormal(m) : m;
      this.normal.push(w[0], w[1], w[2]);
      this.color.push(other.color[i * 3], other.color[i * 3 + 1], other.color[i * 3 + 2]);
      this.aux.push(other.aux[i * 4], other.aux[i * 4 + 1], other.aux[i * 4 + 2], other.aux[i * 4 + 3]);
    }
    return this;
  }

  /** The finished mesh as typed arrays. */
  arrays() {
    return {
      position: new Float32Array(this.position),
      normal: new Float32Array(this.normal),
      color: new Float32Array(this.color),
      aux: new Float32Array(this.aux),
      vertices: this.vertexCount,
      triangles: this.triangleCount,
    };
  }
}

export function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const SPHERES = [];

/** Unit icosphere: { vertices: [[x, y, z]], faces: [[a, b, c]] }, outward counter-clockwise. */
export function icosphere(detail) {
  if (SPHERES[detail]) return SPHERES[detail];
  let sphere;
  if (detail === 0) {
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map(normalize);
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    sphere = { vertices, faces };
  } else {
    const base = icosphere(detail - 1);
    const vertices = base.vertices.slice();
    const faces = [];
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      let i = cache.get(key);
      if (i === undefined) {
        const p = vertices[a];
        const q = vertices[b];
        i = vertices.length;
        vertices.push(normalize([p[0] + q[0], p[1] + q[1], p[2] + q[2]]));
        cache.set(key, i);
      }
      return i;
    };
    for (const [a, b, c] of base.faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    sphere = { vertices, faces };
  }
  SPHERES[detail] = sphere;
  return sphere;
}
