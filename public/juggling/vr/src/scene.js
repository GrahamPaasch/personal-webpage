/**
 * scene.js: everything drawn with three.js. No physics is decided here: positions come from
 * hands.js / physics.js every frame.
 *
 * Kept deliberately cheap for the Quest 1: no shadows, no post-processing, one directional light,
 * Lambert and unlit materials, low-poly spheres, and a handful of draw calls.
 *
 * World frame: y up, floor at y = 0, metres. The "anchor" group is the pattern frame of physics.js
 * placed in the world: its origin is the midpoint between the hands at hand height, +x is the
 * juggler's right, and the juggler stands `distance` behind it (at local +z).
 */

import * as THREE from '../vendor/three.module.min.js';
import { RIGHT, LEFT, throwAtBeat, flightState } from './physics.js';
import { sceneAt, handPath } from './hands.js';

export { THREE };

/** Ball colours: distinct hues so one ball can be followed through the pattern. */
export const BALL_COLORS = [
  0xff9f43, 0x2fd6c3, 0xff5c8a, 0x7cc7ff, 0xf7e04b, 0xb48cff, 0x7be36f, 0xff7a59, 0x5ce0ff, 0xf49ad8,
  0xd5dbe6, 0xffc48a, 0x8ff0d2,
];

/** Ghost hands are cool and see-through; the person's own hands are warm and solid. */
export const GHOST_HAND_COLOR = 0xcfe4ff;
export const OWN_HAND_COLOR = 0xffd9a0;

const BALL_SEGMENTS = [20, 14];
const ARC_STEPS = 28;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0d1017, 1);
    renderer.xr.enabled = true;
    this.renderer = renderer;

    this.scene = new THREE.Scene();

    // The rig carries the camera and the controllers, so moving it moves the person in VR.
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.03, 120);
    this.rig.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x232a38, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(1.5, 4, 2.5);
    this.scene.add(sun);

    this.buildEnvironment();

    // Pattern frame.
    this.anchor = new THREE.Group();
    this.scene.add(this.anchor);

    this.ballRadius = 0.03;
    this.ballGeometry = new THREE.SphereGeometry(1, BALL_SEGMENTS[0], BALL_SEGMENTS[1]);
    this.ballMaterials = BALL_COLORS.map(
      (c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.22 })
    );
    this.balls = [];

    this.ghostHands = [makeHandCup(GHOST_HAND_COLOR, true), makeHandCup(GHOST_HAND_COLOR, true)];
    this.anchor.add(this.ghostHands[RIGHT], this.ghostHands[LEFT]);

    this.arcs = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false })
    );
    this.arcs.frustumCulled = false;
    this.anchor.add(this.arcs);

    this.handLoops = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.handLoops.frustumCulled = false;
    this.anchor.add(this.handLoops);

    // Red rings where balls would collide (mixed siteswaps only).
    this.collisionMarks = new THREE.Group();
    this.anchor.add(this.collisionMarks);
    this.collisionGeometry = new THREE.RingGeometry(0.05, 0.062, 28);
    this.collisionMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4d5e,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.pattern = null;
    this.timeline = null;
    this.showArcs = true;
    this.showGhostHands = true;
    this.lastScene = null;
  }

  buildEnvironment() {
    // Sky: a vertex-coloured dome, dark at the horizon line and a little lighter overhead.
    const skyGeo = new THREE.SphereGeometry(60, 20, 10);
    const pos = skyGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const low = new THREE.Color(0x121823); // same as the floor, so there is no visible horizon seam
    const high = new THREE.Color(0x1b2740);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = Math.min(Math.max(pos.getY(i) / 60, 0), 1);
      tmp.copy(low).lerp(high, Math.pow(k, 0.7));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false })
    );
    sky.renderOrder = -10;
    this.scene.add(sky);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 48),
      new THREE.MeshBasicMaterial({ color: 0x121823 })
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(18, 36, 0x34405a, 0x1e2636);
    grid.position.y = 0.002;
    this.scene.add(grid);

    // Where the juggler stands.
    this.spotRing = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.235, 40),
      new THREE.MeshBasicMaterial({ color: 0x2fd6c3, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    this.spotRing.rotation.x = -Math.PI / 2;
    this.spotRing.position.y = 0.004;
    this.scene.add(this.spotRing);

    // A faint head so the juggler's place is visible after stepping out.
    this.ghostHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 20, 14),
      new THREE.MeshLambertMaterial({ color: 0xaab6cc, transparent: true, opacity: 0.28, depthWrite: false })
    );
    this.ghostHead.visible = false;
    this.scene.add(this.ghostHead);
  }

  /** Place the pattern frame in the world. `a` = { spotX, spotZ, yaw, handHeight, distance, eyeHeight }. */
  setAnchor(a) {
    const fx = -Math.sin(a.yaw);
    const fz = -Math.cos(a.yaw);
    this.anchor.position.set(a.spotX + fx * a.distance, a.handHeight, a.spotZ + fz * a.distance);
    this.anchor.rotation.set(0, a.yaw, 0);
    this.anchor.updateMatrixWorld(true);
    this.spotRing.position.set(a.spotX, 0.004, a.spotZ);
    this.ghostHead.position.set(a.spotX, a.eyeHeight, a.spotZ);
  }

  setPattern(pattern, timeline, collisions) {
    this.pattern = pattern;
    this.timeline = timeline;
    this.ballRadius = pattern.ballDiameter / 2;

    while (this.balls.length < pattern.balls) {
      const mesh = new THREE.Mesh(this.ballGeometry, this.ballMaterials[this.balls.length % this.ballMaterials.length]);
      this.anchor.add(mesh);
      this.balls.push(mesh);
    }
    this.balls.forEach((mesh, i) => {
      mesh.visible = i < pattern.balls;
      mesh.scale.setScalar(this.ballRadius);
    });

    this.rebuildArcs();
    this.rebuildHandLoops();
    this.rebuildCollisionMarks(collisions);
  }

  rebuildArcs() {
    const pattern = this.pattern;
    const points = [];
    const seen = new Set();
    for (let i = 0; i < pattern.cycleBeats; i++) {
      const rec = throwAtBeat(pattern, i);
      if (!rec.air) continue;
      const key = rec.hand + ':' + rec.value;
      if (seen.has(key)) continue;
      seen.add(key);
      let prev = null;
      for (let k = 0; k <= ARC_STEPS; k++) {
        const st = flightState(rec, rec.tThrow + (rec.flight * k) / ARC_STEPS);
        if (prev) points.push(prev.x, prev.y, 0, st.x, st.y, 0);
        prev = st;
      }
    }
    setLinePositions(this.arcs, points);
  }

  rebuildHandLoops() {
    // The scoop (hand carrying a ball) is drawn bright, the empty return dim, so the direction
    // of the circle can be read at a glance.
    const points = [];
    const colors = [];
    const carry = new THREE.Color(GHOST_HAND_COLOR).multiplyScalar(0.75);
    const empty = new THREE.Color(GHOST_HAND_COLOR).multiplyScalar(0.22);
    for (const hand of [RIGHT, LEFT]) {
      const path = handPath(this.timeline, hand, 160);
      for (let k = 1; k < path.length; k++) {
        const c = path[k].carrying && path[k - 1].carrying ? carry : empty;
        points.push(path[k - 1].x, path[k - 1].y, 0, path[k].x, path[k].y, 0);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    setLinePositions(this.handLoops, points);
    this.handLoops.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }

  rebuildCollisionMarks(collisions) {
    while (this.collisionMarks.children.length) this.collisionMarks.remove(this.collisionMarks.children[0]);
    if (!collisions || !collisions.collides) return;
    const placed = [];
    for (const hit of collisions.hits) {
      if (placed.some((p) => Math.hypot(p.x - hit.x, p.y - hit.y) < 0.03)) continue;
      placed.push(hit);
      const ring = new THREE.Mesh(this.collisionGeometry, this.collisionMaterial);
      ring.position.set(hit.x, hit.y, 0);
      this.collisionMarks.add(ring);
      if (placed.length >= 12) break;
    }
  }

  setShowArcs(on) {
    this.showArcs = on;
  }

  setShowGhostHands(on) {
    this.showGhostHands = on;
  }

  /** Move balls and ghost hands to where the math says they are at simulation time t. */
  update(t) {
    if (!this.pattern) return null;
    const s = sceneAt(this.pattern, this.timeline, t, this.lastScene || undefined);
    for (const b of s.balls) {
      const mesh = this.balls[b.ball];
      if (mesh) mesh.position.set(b.x, b.y, 0);
    }
    for (let hand = 0; hand < 2; hand++) {
      const g = this.ghostHands[hand];
      g.visible = this.showGhostHands;
      g.position.set(s.hands[hand].x, s.hands[hand].y, 0);
    }
    this.arcs.visible = this.showArcs;
    this.handLoops.visible = this.showArcs && this.showGhostHands;
    // The collision rings pulse so they read as a warning, not as part of the pattern.
    if (this.collisionMarks.children.length) {
      const k = 1 + 0.12 * Math.sin(performance.now() / 180);
      for (const ring of this.collisionMarks.children) ring.scale.setScalar(k);
    }
    this.lastScene = s;
    return s;
  }

  resize(width, height) {
    if (this.renderer.xr.isPresenting) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

function setLinePositions(line, points) {
  line.geometry.dispose();
  line.geometry = new THREE.BufferGeometry();
  line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

/**
 * A cupped palm: the lower half of a sphere with a coloured rim, open toward local +y.
 * Its origin is the palm point, i.e. the centre of a ball resting in the hand.
 * Ghost hands are pale and see-through; the person's own hands are solid.
 */
export function makeHandCup(color, ghost) {
  const group = new THREE.Group();
  const cup = new THREE.Mesh(
    new THREE.SphereGeometry(0.041, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: ghost ? 0.3 : 0.85,
      side: THREE.DoubleSide,
      depthWrite: !ghost,
    })
  );
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.041, ghost ? 0.0035 : 0.005, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: ghost, opacity: ghost ? 0.85 : 1 })
  );
  rim.rotation.x = Math.PI / 2;
  group.add(cup, rim);
  group.userData.cup = cup;
  group.userData.rim = rim;
  return group;
}

/**
 * A text label drawn to a canvas and shown on a flat panel. Used for the in-VR speed label,
 * the calibration prompt and short notices.
 */
export class TextLabel {
  constructor(options) {
    const o = options || {};
    this.pxWidth = o.pxWidth || 512;
    this.pxHeight = o.pxHeight || 128;
    this.height = o.height || 0.08; // metres
    this.font = o.font || '600 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    this.color = o.color || '#ecebe6';
    this.background = o.background === undefined ? 'rgba(13,16,23,0.78)' : o.background;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.pxWidth;
    this.canvas.height = this.pxHeight;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: o.depthTest !== false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry((this.height * this.pxWidth) / this.pxHeight, this.height),
      material
    );
    this.mesh.renderOrder = 20;
    this.text = null;
    this.setText(o.text || '');
  }

  setText(text) {
    if (text === this.text) return;
    this.text = text;
    const ctx = this.canvas.getContext('2d');
    const w = this.pxWidth;
    const h = this.pxHeight;
    ctx.clearRect(0, 0, w, h);
    if (text === '') {
      this.texture.needsUpdate = true;
      return;
    }
    if (this.background) {
      ctx.fillStyle = this.background;
      roundRect(ctx, 2, 2, w - 4, h - 4, Math.min(h, w) * 0.22);
      ctx.fill();
    }
    ctx.fillStyle = this.color;
    ctx.font = this.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = String(text).split('\n');
    const lineHeight = h / (lines.length + 0.35);
    // Shrink long lines to fit.
    let scale = 1;
    for (const line of lines) {
      const m = ctx.measureText(line).width;
      if (m > w * 0.92) scale = Math.min(scale, (w * 0.92) / m);
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    lines.forEach((line, i) => {
      ctx.fillText(line, 0, ((i - (lines.length - 1) / 2) * lineHeight) / scale);
    });
    ctx.restore();
    this.texture.needsUpdate = true;
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}
