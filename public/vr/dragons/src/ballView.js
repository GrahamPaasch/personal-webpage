/**
 * ballView.js: draws the ball, its glow and its trail, the splashes it (and a dragon beating at
 * the water) makes on the lake, and the viewer's hands. fetch.js says where everything is.
 *
 * The ball is a glowing amber orb a metre across, with darker veins of the same amber turning
 * in it, so that it can be seen to roll and to spin. It gives off its own light (it is not lit
 * by the sun), and round it there is a soft disc of added light that never gets smaller than a
 * degree or so across, however far off it is: 200 m out against the dusk it is still a spark
 * of amber to follow. While it flies it draws a faint trail. All of that is three draw calls
 * at most, and none of it reads a texture.
 */

import { THREE, COMMON } from './shaders.js';
import { MeshBuilder, icosphere } from './meshbuilder.js';
import { BALL_RADIUS } from './fetch.js';
import { hash2 } from './rng.js';

/** The ball's colours, linear: its bright middle, its rim, and the veins. */
const CORE = [1.0, 0.5, 0.1];
const RIM = [0.75, 0.2, 0.025];
const VEIN = [0.42, 0.09, 0.01];
/** How bright it glows, against a lit surface of the same colour. */
const GLOW = 1.15;
/** The disc of light round it: its radius near to, and as a fraction of its distance far off. */
const HALO_NEAR = 1.5;
const HALO_FAR = 0.016;
/** How many points of its path the trail keeps (one a frame at most, a few centimetres apart at least). */
const TRAIL = 28;
/** Droplets in one splash. */
const DROPS = 44;

export class BallView {
  constructor(stage) {
    this.stage = stage;
    this.shared = stage.shared;
    this.buildOrb();
    this.buildHalo();
    this.buildTrail();
    this.splashes = [this.buildSplash(), this.buildSplash()];
    this.nextSplash = 0;
    this.trailPoints = [];
    for (let i = 0; i < TRAIL; i++) this.trailPoints.push(new THREE.Vector3());
    this.trailCount = 0;
    this.trailFade = 0;
    this.tmp = new THREE.Vector3();
  }

  buildOrb() {
    // An icosphere, its corners coloured: a swirl of darker veins through the amber.
    const sphere = icosphere(2);
    const position = [];
    const normal = [];
    const color = [];
    const vein = (d) => {
      // Bands that wind round it, crossed by a second set: a pattern that shows it turning.
      const a = Math.sin(d[0] * 5.1 + d[1] * 3.3 + 2.0 * Math.sin(d[2] * 4.0));
      const b = Math.sin(d[2] * 4.7 - d[0] * 2.1 + 1.7 * Math.sin(d[1] * 3.2));
      return Math.max(0, 1 - Math.abs(a) * 3.2) * 0.75 + Math.max(0, 1 - Math.abs(b) * 4) * 0.5;
    };
    for (const [a, b, c] of sphere.faces) {
      for (const k of [a, b, c]) {
        const d = sphere.vertices[k];
        position.push(d[0] * BALL_RADIUS, d[1] * BALL_RADIUS, d[2] * BALL_RADIUS);
        normal.push(d[0], d[1], d[2]);
        const v = Math.min(vein(d), 1) * (0.85 + 0.3 * hash2(k, 77));
        color.push(v, 0, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
    const material = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uPulse: { value: 0 } }, this.shared),
      vertexColors: true,
      vertexShader: /* glsl */ `
        ${COMMON}
        uniform float uPulse;
        varying vec3 vColor;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vec3 toEye = normalize(cameraPosition - wp.xyz);
          // Brightest where it faces the eye, deeper amber toward its rim: a lit glass ball.
          float face = max(dot(n, toEye), 0.0);
          vec3 c = mix(vec3(${RIM.join(', ')}), vec3(${CORE.join(', ')}), face * face);
          c = mix(c, vec3(${VEIN.join(', ')}), color.r);
          c *= ${GLOW.toFixed(2)} * (1.0 + 0.12 * uPulse);
          // It is its own light: little of the haze (as the dragons get less than the land).
          vec4 vp = viewMatrix * wp;
          vColor = dvDisplay(dvHaze(c, wp.xyz, 0.2)) * dvVignette(vp.xyz);
          gl_Position = projectionMatrix * vp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }
      `,
    });
    this.orb = new THREE.Mesh(g, material);
    this.orb.renderOrder = 6;
    this.stage.scene.add(this.orb);
    this.orbTriangles = position.length / 9;
  }

  /** The glow: a fan that faces the eye, bright in the middle and nothing at its rim, added on. */
  buildHalo() {
    const spokes = 14;
    const position = [];
    const level = [];
    const ring = 0.32;
    for (let k = 0; k < spokes; k++) {
      const a0 = (k / spokes) * Math.PI * 2;
      const a1 = ((k + 1) / spokes) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const tri = (pts) => {
        for (const [x, y, l] of pts) {
          position.push(x, y, 0);
          level.push(l);
        }
      };
      tri([[0, 0, 1], [c0 * ring, s0 * ring, 0.45], [c1 * ring, s1 * ring, 0.45]]);
      tri([[c0 * ring, s0 * ring, 0.45], [c0, s0, 0], [c1, s1, 0]]);
      tri([[c0 * ring, s0 * ring, 0.45], [c1, s1, 0], [c1 * ring, s1 * ring, 0.45]]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('level', new THREE.Float32BufferAttribute(level, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uCenter: { value: new THREE.Vector3() }, uBright: { value: 1 } }, this.shared),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${COMMON}
        uniform vec3 uCenter;
        uniform float uBright;
        attribute float level;
        varying vec3 vColor;
        void main() {
          vec4 vp = viewMatrix * vec4(uCenter, 1.0);
          float dist = length(vp.xyz);
          // Never smaller than about a degree across: it is there to be followed.
          float r = max(${HALO_NEAR.toFixed(2)}, dist * ${HALO_FAR.toFixed(3)});
          // (Drawn a little in front of the ball, so the ball does not hide its own glow.)
          vp.xyz += normalize(-vp.xyz) * min(0.8, dist * 0.5);
          vp.xy += position.xy * r;
          // Fainter in the haze far off, but not much: amber reads through it.
          float far = 1.0 - 0.45 * smoothstep(60.0, 400.0, dist);
          vColor = vec3(1.0, 0.55, 0.16) * (0.42 * level * level * uBright * far);
          gl_Position = projectionMatrix * vp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }
      `,
    });
    this.halo = new THREE.Mesh(g, material);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 72;
    this.stage.scene.add(this.halo);
  }

  /** The trail: a ribbon along the last points of its flight, facing the eye, fading out behind. */
  buildTrail() {
    const n = TRAIL;
    const position = new Float32Array(n * 2 * 3);
    const fade = new Float32Array(n * 2);
    const index = [];
    for (let i = 0; i + 1 < n; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    for (let i = 0; i < n; i++) {
      const f = 1 - i / (n - 1);
      fade[i * 2] = f;
      fade[i * 2 + 1] = f;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('fade', new THREE.BufferAttribute(fade, 1));
    g.setIndex(index);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uAlpha: { value: 0 } }, this.shared),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${COMMON}
        uniform float uAlpha;
        attribute float fade;
        varying vec3 vColor;
        void main() {
          vec4 vp = viewMatrix * vec4(position, 1.0);
          vColor = vec3(1.0, 0.5, 0.14) * (0.32 * fade * fade * uAlpha);
          gl_Position = projectionMatrix * vp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }
      `,
    });
    this.trail = new THREE.Mesh(g, material);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 71;
    this.trail.visible = false;
    this.stage.scene.add(this.trail);
  }

  /**
   * A splash: droplets thrown up and out that fall back, and a ring spreading on the water.
   * Everything moves in the vertex shader from one clock; a splash costs one draw call while
   * it lasts (two seconds) and nothing after.
   */
  buildSplash() {
    const position = [];
    const launch = [];
    const corner = [];
    for (let k = 0; k < DROPS; k++) {
      // Up, and out a little, each at its own speed: a crown of water.
      const a = (k / DROPS) * Math.PI * 2 + hash2(k, 3) * 0.6;
      const out = 1.2 + 2.6 * hash2(k, 4);
      const up = 3.5 + 6.5 * hash2(k, 5) * hash2(k, 6);
      const size = 0.12 + 0.2 * hash2(k, 7);
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
        position.push(0, 0, 0);
        launch.push(Math.cos(a) * out, up, Math.sin(a) * out);
        corner.push(cx * size, cy * size, 0);
      }
    }
    // The ring on the water: a band of quads, flat.
    const seg = 24;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      const quad = [[a0, 0], [a1, 0], [a1, 1], [a0, 0], [a1, 1], [a0, 1]];
      for (const [a, edge] of quad) {
        position.push(Math.cos(a), 0, Math.sin(a));
        launch.push(0, 0, 0);
        corner.push(edge, 0, 1); // z = 1: part of the ring
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('launch', new THREE.Float32BufferAttribute(launch, 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const material = new THREE.ShaderMaterial({
      uniforms: Object.assign({ uOrigin: { value: new THREE.Vector3() }, uAge: { value: 99 }, uSize: { value: 1 } }, this.shared),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${COMMON}
        uniform vec3 uOrigin;
        uniform float uAge;
        uniform float uSize;
        attribute vec3 launch;
        attribute vec3 corner;
        varying vec3 vColor;
        void main() {
          float t = uAge;
          vec3 wp;
          float bright;
          if (corner.z > 0.5) {
            // The ring: out from where it went in, fading.
            float r = (0.6 + 4.5 * sqrt(t)) * uSize;
            float w = 0.35 * uSize;
            wp = uOrigin + vec3(position.x * (r + corner.x * w), 0.05, position.z * (r + corner.x * w));
            bright = 0.5 * (1.0 - smoothstep(0.2, 2.2, t));
          } else {
            vec3 v = launch * uSize;
            vec3 p = uOrigin + v * t + vec3(0.0, -4.9 * t * t, 0.0);
            p.y = max(p.y, uOrigin.y);
            vec4 vc = viewMatrix * vec4(p, 1.0);
            vc.xy += corner.xy * uSize;
            bright = 1.0 - smoothstep(0.4, 1.3, t);
            vColor = dvDisplay(dvHaze(vec3(1.4, 1.1, 0.85) * (1.0 + uSunDir.y), p, 0.6)) * bright * 0.8;
            gl_Position = projectionMatrix * vc;
            return;
          }
          vec4 vp = viewMatrix * vec4(wp, 1.0);
          vColor = dvDisplay(dvHaze(vec3(1.2, 0.95, 0.8), wp, 0.6)) * bright;
          gl_Position = projectionMatrix * vp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }
      `,
    });
    const mesh = new THREE.Mesh(g, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 73;
    mesh.visible = false;
    this.stage.scene.add(mesh);
    return { mesh, age: 99 };
  }

  /** A splash at x, z on the lake, of a size (1: the ball falling in from a long throw). */
  splash(x, y, z, size) {
    const s = this.splashes[this.nextSplash];
    this.nextSplash = (this.nextSplash + 1) % this.splashes.length;
    s.age = 0;
    s.mesh.material.uniforms.uOrigin.value.set(x, y, z);
    s.mesh.material.uniforms.uSize.value = Math.max(0.3, Math.min(size, 1.5));
    s.mesh.visible = true;
  }

  /**
   * Every frame. ball: fetch.js's Ball; eye: where the viewer's eye is (for the trail to face it).
   * `at`, if given, is where to draw the ball instead (in a dragon's jaws, as the picture poses it).
   */
  update(ball, eye, dt, time, at) {
    const x = at ? at[0] : ball.x;
    const y = at ? at[1] : ball.y;
    const z = at ? at[2] : ball.z;
    const grow = ball.fresh < 1 ? ball.fresh * ball.fresh * (3 - 2 * ball.fresh) : 1;
    this.orb.position.set(x, y, z);
    this.orb.scale.setScalar(Math.max(grow, 0.001));
    // It turns as it rolls (about the axis across its way), and slowly as it flies.
    const vx = ball.vx;
    const vz = ball.vz;
    const flat = Math.hypot(vx, vz);
    if (flat > 0.05) this.tmp.set(vz / flat, 0, -vx / flat);
    else this.tmp.set(1, 0, 0);
    this.orb.quaternion.setFromAxisAngle(this.tmp, ball.spin);
    this.orb.material.uniforms.uPulse.value = Math.sin(time * 2.2);
    this.halo.material.uniforms.uCenter.value.set(x, y, z);
    this.halo.material.uniforms.uBright.value = grow * (ball.state === 'floating' ? 1.25 : 1);

    // The trail: while it flies (and a moment after, fading).
    const flying = ball.state === 'flying' || ball.state === 'trees';
    this.trailFade += ((flying ? 1 : 0) - this.trailFade) * Math.min(1, dt * (flying ? 8 : 2.5));
    if (flying) {
      const pts = this.trailPoints;
      if (this.trailCount === 0 || pts[0].distanceTo(this.tmp.set(x, y, z)) > 0.35) {
        for (let i = Math.min(this.trailCount, TRAIL - 1); i > 0; i--) pts[i].copy(pts[i - 1]);
        pts[0].set(x, y, z);
        this.trailCount = Math.min(this.trailCount + 1, TRAIL);
      } else {
        pts[0].set(x, y, z);
      }
    } else if (this.trailFade < 0.02) {
      this.trailCount = 0;
    }
    this.trail.visible = this.trailFade > 0.02 && this.trailCount > 2;
    if (this.trail.visible) this.ribbon(eye);
    this.trail.material.uniforms.uAlpha.value = this.trailFade;

    for (const s of this.splashes) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      s.mesh.material.uniforms.uAge.value = s.age;
      if (s.age > 2.4) s.mesh.visible = false;
    }
  }

  /** Lay the trail's ribbon along its points, turned to face the eye. */
  ribbon(eye) {
    const pts = this.trailPoints;
    const n = this.trailCount;
    const pos = this.trail.geometry.attributes.position;
    const a = pos.array;
    const side = this.side || (this.side = new THREE.Vector3());
    const along = this.along || (this.along = new THREE.Vector3());
    const toEye = this.toEye || (this.toEye = new THREE.Vector3());
    for (let i = 0; i < TRAIL; i++) {
      const k = Math.min(i, n - 1);
      const p = pts[k];
      const q = pts[Math.min(k + 1, n - 1)];
      const o = pts[Math.max(k - 1, 0)];
      along.subVectors(o, q);
      toEye.subVectors(eye, p);
      side.crossVectors(along, toEye);
      const l = side.length();
      // Thin toward its end.
      const w = (BALL_RADIUS * 0.75 * (1 - i / TRAIL)) / (l > 1e-6 ? l : 1);
      if (l < 1e-6) side.set(0, 0, 0);
      a[i * 6] = p.x + side.x * w;
      a[i * 6 + 1] = p.y + side.y * w;
      a[i * 6 + 2] = p.z + side.z * w;
      a[i * 6 + 3] = p.x - side.x * w;
      a[i * 6 + 4] = p.y - side.y * w;
      a[i * 6 + 5] = p.z - side.z * w;
    }
    pos.needsUpdate = true;
  }
}

/**
 * The viewer's hands, in the headset: a small low mitten on each controller, so that there is
 * something to reach for the ball with. The colour of leather gloves, lit like everything else.
 */
export function buildHand(stage, worldMaterial, side) {
  const m = new MeshBuilder();
  const leather = [0.2, 0.12, 0.07];
  const col = (d) => {
    const k = 0.75 + 0.35 * (d[1] * 0.5 + 0.5);
    return [leather[0] * k, leather[1] * k, leather[2] * k];
  };
  // The palm and fingers together, and the thumb.
  m.blob([0, -0.01, 0.03], [0.045, 0.028, 0.085], 1, 0.05, 11, col, [0, 0, 0, 0], { round: 0.7 });
  m.blob([side * 0.04, 0.0, -0.005], [0.018, 0.018, 0.045], 0, 0.05, 12, col, [0, 0, 0, 0], { round: 0.7 });
  const a = m.arrays();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
  g.setAttribute('aux', new THREE.BufferAttribute(a.aux, 4));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, worldMaterial);
  mesh.renderOrder = 7;
  // (Tilted the way a hand holding a Touch controller is.)
  mesh.rotation.x = -0.5;
  return mesh;
}
