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
  THREE, makeShared, worldMaterial, skyMaterial, sunMaterial, waterMaterial, leafMaterial,
} from './shaders.js';
import * as W from './world.js';
import { buildTerrain } from './terrain.js';
import { bakeReflection, bakeNoise } from './reflection.js';
import { MeshBuilder } from './meshbuilder.js';
import { buildLedge } from './ledge.js';
import { hash2, makeRng } from './rng.js';

export { THREE };

export const WORLD_SEED = 20261115;

/** How many leaves are in the air around the ledge, and the box they fall through (metres). */
const LEAF_COUNT = 190;
export const LEAF_BOX = { min: [-10.5, -7, -11.5], size: [20, 19, 19] };

/** Azimuth slices the forest is split into, so trees behind the viewer are not drawn. */
const FOREST_SECTORS = 6;

const BARK = W.srgb(0.27, 0.19, 0.13);

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
    renderer.setClearColor(0xd8b89c, 1);
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
    this.terrain = await step('terrain', '', () => this.buildTerrain());
    await step('water', 'Filling the lake\u2026', () => this.buildWater(o.reflectionSize || 256));
    await step('forest', 'Turning the maples\u2026', () => this.buildForest(o.forestDensity || 1));
    await step('ledge', '', () => this.buildLedge());
    await step('leaves', '', () => this.buildLeaves(o.leaves === undefined ? LEAF_COUNT : o.leaves));
    this.built = true;
  }

  // -------------------------------------------------------------------------------------------

  buildSky() {
    // Bands of elevation, close together near the horizon where the colour changes fastest.
    const bands = [-0.21, -0.06, 0, 0.03, 0.065, 0.11, 0.17, 0.25, 0.35, 0.48, 0.66, 0.9, 1.2, Math.PI / 2];
    const segments = 48;
    const position = [];
    const color = [];
    const index = [];
    const c = [0, 0, 0];
    for (let b = 0; b < bands.length; b++) {
      for (let s = 0; s <= segments; s++) {
        const az = (s / segments) * Math.PI * 2;
        const cosE = Math.cos(bands[b]);
        const dx = Math.sin(az) * cosE;
        const dy = Math.sin(bands[b]);
        const dz = -Math.cos(az) * cosE;
        position.push(dx, dy, dz);
        W.toDisplay(W.skyColor(dx, dy, dz, c));
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
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    g.setIndex(index);
    const sky = new THREE.Mesh(g, skyMaterial());
    sky.frustumCulled = false;
    sky.renderOrder = 100; // after everything solid: only the pixels that are still empty
    this.scene.add(sky);
    this.sky = sky;

    // The sun: a disc and its glare, added on top.
    const sunPos = [];
    const sunCol = [];
    const sunIdx = [];
    const s = W.SUN_DIR;
    const side = new THREE.Vector3(s[2], 0, -s[0]).normalize();
    const up = new THREE.Vector3().crossVectors(new THREE.Vector3(s[0], s[1], s[2]), side).normalize();
    const radii = [0, 0.9, 1.45, 1.9, 3, 5, 8, 12, 17].map((d) => (d * Math.PI) / 180);
    const spokes = 28;
    const glare = (theta) => {
      const deg = (theta * 180) / Math.PI;
      const disc = deg < 1.5 ? 1 : 0;
      const fade = Math.max(0, Math.min(1, (17 - deg) / 9));
      const halo = (0.5 * Math.exp(-deg / 2.2) + 0.2 * Math.exp(-deg / 7)) * fade;
      return [disc * 0.55 + halo, disc * 0.5 + halo * 0.8, disc * 0.34 + halo * 0.5];
    };
    for (let r = 0; r < radii.length; r++) {
      for (let k = 0; k < spokes; k++) {
        const a = (k / spokes) * Math.PI * 2;
        const sn = Math.sin(radii[r]);
        const cs = Math.cos(radii[r]);
        sunPos.push(
          s[0] * cs + (side.x * Math.cos(a) + up.x * Math.sin(a)) * sn,
          s[1] * cs + (side.y * Math.cos(a) + up.y * Math.sin(a)) * sn,
          s[2] * cs + (side.z * Math.cos(a) + up.z * Math.sin(a)) * sn
        );
        const col = glare(radii[r]);
        sunCol.push(col[0], col[1], col[2]);
      }
    }
    for (let r = 0; r + 1 < radii.length; r++) {
      for (let k = 0; k < spokes; k++) {
        const a = r * spokes + k;
        const b = r * spokes + ((k + 1) % spokes);
        sunIdx.push(a, b, a + spokes, b, b + spokes, a + spokes);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sunPos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sunCol, 3));
    sg.setIndex(sunIdx);
    const sun = new THREE.Mesh(sg, sunMaterial());
    sun.frustumCulled = false;
    sun.renderOrder = 200;
    this.scene.add(sun);
    this.sun = sun;
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
    noise.magFilter = noise.minFilter = THREE.LinearFilter;
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

  // -------------------------------------------------------------------------------------------

  /** The four tree shapes, each one unit tall with a crown one unit in radius. */
  treeShapes() {
    const leafShade = (dir, f, seed) => {
      // Lighter on top, darker underneath, and every facet a little different.
      const v = (0.62 + 0.52 * (dir[1] * 0.5 + 0.5)) * (0.84 + 0.32 * hash2(f, seed));
      return [v, v, v];
    };
    const swayLeaf = (dir) => [0.22 + 0.2 * dir[1], 1, 0, 0];

    const mid = new MeshBuilder();
    mid.tube([{ p: [0, 0, 0], r: 0.075 }, { p: [0, 0.52, 0], r: 0.045 }], 4, BARK, (k) => [k * 0.1, 0, 0, 0]);
    mid.blob([0, 0.66, 0], [0.9, 0.34, 0.9], 0, 0.24, 11, (d, f) => leafShade(d, f, 3), swayLeaf);
    mid.blob([0.46, 0.8, 0.18], [0.6, 0.25, 0.6], 0, 0.24, 23, (d, f) => leafShade(d, f, 5), swayLeaf);
    mid.blob([-0.44, 0.75, -0.3], [0.62, 0.23, 0.58], 0, 0.24, 37, (d, f) => leafShade(d, f, 7), swayLeaf);

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
    let f = 0;
    for (let i = 0; i < 5; i++) {
      const j = (i + 1) % 5;
      const a = 0.9 + 0.25 * hash2(f++, 41);
      const b = 0.75 + 0.25 * hash2(f++, 41);
      const c = 1.05 + 0.2 * hash2(f++, 41);
      far.tri(low[i], high[i], low[j], [a * 0.8, a * 0.8, a * 0.8], none);
      far.tri(low[j], high[i], high[j], [b, b, b], none);
      far.tri(high[i], top, high[j], [c, c, c], none);
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
    const built = buildLedge(this.terrain.surfaceNear(40), WORLD_SEED);
    const mesh = new THREE.Mesh(toGeometry(built.arrays), worldMaterial(this.shared, { lit: true, sway: true }));
    // Its trees stand on every side of the viewer: there is no direction in which it is out of sight.
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    this.scene.add(mesh);
    this.ledge = mesh;
    this.heroTrees = built.trees;
    this.ledgeTriangles = built.triangles;
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

  /**
   * Words in the world, for the headset (where there is no page to read): a line of text that
   * stands on the rim of the ledge in front of the viewer, fades in, and fades out again.
   */
  showHint(text, seconds) {
    this.hideHint();
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const c = canvas.getContext('2d');
    c.font = '600 60px Georgia, "Times New Roman", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(26, 20, 16, 0.85)';
    c.strokeText(text, 512, 66);
    c.fillStyle = '#fbf3e4';
    c.fillText(text, 512, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7 / 8), material);
    // On the rim, below the line of sight to the valley, turned up to face the viewer.
    mesh.position.set(0, 0.78, -2.1);
    mesh.lookAt(0, 1.55, 0);
    mesh.renderOrder = 300;
    this.scene.add(mesh);
    this.hint = { mesh, material, texture, age: 0, seconds: seconds || 14, text };
  }

  hideHint() {
    if (!this.hint) return;
    this.scene.remove(this.hint.mesh);
    this.hint.mesh.geometry.dispose();
    this.hint.material.dispose();
    this.hint.texture.dispose();
    this.hint = null;
  }

  updateHint(dt) {
    const h = this.hint;
    if (!h) return;
    h.age += dt;
    const fadeIn = Math.min(Math.max((h.age - 2.5) / 1.5, 0), 1);
    const fadeOut = Math.min(Math.max((h.seconds - h.age) / 2, 0), 1);
    h.material.opacity = 0.95 * fadeIn * fadeOut;
    h.mesh.visible = h.material.opacity > 0.01;
    if (h.age > h.seconds) this.hideHint();
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

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
