/**
 * shaders.js: every material in the scene.
 *
 * The Quest 1 runs out of pixel-shading time long before it runs out of vertices, so all light
 * and haze is worked out per vertex and the pixel shaders do next to nothing: most of them write
 * one interpolated colour. Colours are computed in linear light and converted for the screen in
 * the vertex shader too (a soft shoulder, then gamma), so nothing is left for three.js to convert.
 *
 * The light and haze formulas are the ones in world.js (lightOn, fogColor, fogAmount, toDisplay);
 * keep the two in step.
 *
 * `aux` (4 numbers per vertex):
 *   world meshes   x: how much the vertex sways in the wind (metres at full gust)
 *                  y: 1 for leaves (tinted by the tree's colour, lit from behind), 0 for wood/rock
 *                  w: sway phase, for meshes that are not instanced
 *   dragons        x, y: the two bones the vertex follows; z: weight of the first
 *                  w: 0 body, 1 wing membrane (light shines through), 2 glows (eyes)
 */

import * as THREE from '../vendor/three.module.min.js';
import { SUN_DIR, LIGHT, FOG } from './world.js';

/** Uniforms every material shares. One object, so a change reaches all of them. */
export function makeShared() {
  return {
    uSunDir: { value: new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]) },
    uSunColor: { value: new THREE.Vector3(LIGHT.sun[0], LIGHT.sun[1], LIGHT.sun[2]) },
    uSkyColor: { value: new THREE.Vector3(LIGHT.sky[0], LIGHT.sky[1], LIGHT.sky[2]) },
    uBounceColor: { value: new THREE.Vector3(LIGHT.bounce[0], LIGHT.bounce[1], LIGHT.bounce[2]) },
    uFogColor: { value: new THREE.Vector3(FOG.color[0], FOG.color[1], FOG.color[2]) },
    uFogSunColor: { value: new THREE.Vector3(FOG.sunColor[0], FOG.sunColor[1], FOG.sunColor[2]) },
    uFog: { value: new THREE.Vector4(FOG.haze, FOG.mist, FOG.falloff, FOG.base) },
    uExposure: { value: LIGHT.exposure },
    uTime: { value: 0 },
    // Direction and strength of the sway. The wind comes over the plateau from behind the
    // viewer's left shoulder and blows out across the valley, so the big maple's leaves cross
    // in front of the ledge.
    uWind: { value: new THREE.Vector2(0.8, -0.38) },
  };
}

const COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec4 uFog;
uniform float uExposure;
uniform float uTime;

vec3 dvFogColor(vec3 dir) {
  float s = max(dot(dir, uSunDir), 0.0);
  float s2 = s * s;
  float s8 = s2 * s2;
  s8 *= s8;
  return mix(uFogColor, uFogSunColor, s8 * 0.8 + s2 * 0.2);
}

float dvFogAmount(float eyeY, float dirY, float dist) {
  float above = max(eyeY - uFog.w, 0.0);
  float t = max(uFog.z * dirY * dist, -uFog.z * above);
  float k = abs(t) < 1.0e-4 ? 1.0 : (1.0 - exp(-t)) / t;
  float depth = uFog.y * exp(-uFog.z * above) * dist * k + uFog.x * dist;
  return 1.0 - exp(-depth);
}

vec3 dvLight(vec3 n, float sunlit) {
  // The sun is low and the sky around it is bright: let its light wrap a little past the edge.
  float d = max((dot(n, uSunDir) + 0.3) / 1.3, 0.0) * sunlit;
  return mix(uBounceColor, uSkyColor, n.y * 0.5 + 0.5) + uSunColor * d;
}

vec3 dvDisplay(vec3 c) {
  return pow(1.0 - exp(-max(c, 0.0) * uExposure), vec3(0.4545));
}

// Haze between the eye and a world position, applied to a linear colour.
vec3 dvHaze(vec3 c, vec3 worldPos, float scale) {
  vec3 toP = worldPos - cameraPosition;
  float dist = length(toP);
  vec3 dir = toP / max(dist, 1.0e-4);
  float f = dvFogAmount(cameraPosition.y, dir.y, dist) * scale;
  return mix(c, dvFogColor(dir), f);
}
`;

const FLAT_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
`;

/**
 * Terrain, rocks, trees. Options:
 *   lit    light is computed here from the normal (trees, anything that turns); otherwise the
 *          vertex colour already holds the lit colour (terrain, the ledge)
 *   sway   vertices move in the wind by aux.x
 */
export function worldMaterial(shared, options) {
  const o = options || {};
  const defines = {};
  if (o.lit) defines.DV_LIT = 1;
  if (o.sway) defines.DV_SWAY = 1;
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uHaze: { value: o.haze === undefined ? 1 : o.haze } }, shared),
    defines,
    vertexColors: true,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform float uHaze;
      uniform vec2 uWind;
      attribute vec4 aux;
      #ifdef USE_INSTANCING
        attribute float aShade;
      #endif
      varying vec3 vColor;
      void main() {
        #ifdef USE_INSTANCING
          vec4 wp = modelMatrix * (instanceMatrix * vec4(position, 1.0));
        #else
          vec4 wp = modelMatrix * vec4(position, 1.0);
        #endif
        #ifdef DV_SWAY
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
          #else
            float ph = aux.w;
          #endif
          float gust = sin(uTime * 0.9 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.4;
          float flutter = sin(uTime * 6.0 + wp.x * 1.9 + wp.y * 2.7 + wp.z * 1.3) * aux.y * 0.03;
          wp.x += (gust * uWind.x + flutter) * aux.x;
          wp.z += (gust * uWind.y - flutter) * aux.x;
        #endif
        vec3 c = color;
        #ifdef DV_LIT
          float sunlit = 1.0;
          #ifdef USE_INSTANCING
            mat3 im = mat3(instanceMatrix);
            vec3 n = im * (normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2])));
            sunlit = aShade;
            #ifdef USE_INSTANCING_COLOR
              c *= mix(vec3(1.0), instanceColor, aux.y);
            #endif
          #else
            vec3 n = normal;
          #endif
          n = normalize(mat3(modelMatrix) * n);
          vec3 albedo = c;
          c = albedo * dvLight(n, sunlit);
          // Low sun through leaves: the side away from the sun glows.
          c += albedo * uSunColor * (max(-dot(n, uSunDir), 0.0) * 0.55 * aux.y * sunlit);
        #endif
        vColor = dvDisplay(dvHaze(c, wp.xyz, uHaze));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: FLAT_FRAGMENT,
  });
}

/**
 * The sky dome. Its vertex colours are final screen colours (baked in scene.js); it is drawn at
 * the far plane after everything solid, so it only costs pixels where sky shows.
 */
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        // A little noise hides the steps an 8-bit screen makes in a smooth sky.
        float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        gl_FragColor = vec4(vColor + (n - 0.5) / 255.0, 1.0);
      }
    `,
  });
}

/** The sun's disc and the glare around it: added on top of whatever is there. */
export function sunMaterial() {
  return new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: FLAT_FRAGMENT,
  });
}

/**
 * The lake. What it mirrors (sky, hills, the sun's path) was worked out once for the viewer's
 * spot and stored in a texture: rgb is the mirrored colour, alpha is how strongly the sun
 * glitters there. The pixel shader adds moving sparkle and the haze.
 */
export function waterMaterial(shared, reflection, noise, bounds) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign(
      {
        uReflection: { value: reflection },
        uNoise: { value: noise },
        uBounds: { value: new THREE.Vector4(bounds.x0, bounds.z0, 1 / (bounds.x1 - bounds.x0), 1 / (bounds.z1 - bounds.z0)) },
      },
      shared
    ),
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec4 uBounds;
      varying vec2 vUv;
      varying vec2 vWorld;
      varying vec4 vFog;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vUv = (wp.xz - uBounds.xy) * uBounds.zw;
        vWorld = wp.xz;
        vec3 toP = wp.xyz - cameraPosition;
        float dist = length(toP);
        vec3 dir = toP / max(dist, 1.0e-4);
        vFog = vec4(dvDisplay(dvFogColor(dir)), dvFogAmount(cameraPosition.y, dir.y, dist));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uReflection;
      uniform sampler2D uNoise;
      uniform float uTime;
      varying vec2 vUv;
      varying vec2 vWorld;
      varying vec4 vFog;
      void main() {
        float n1 = texture2D(uNoise, vWorld * 0.047 + vec2(uTime * 0.019, uTime * 0.011)).r;
        float n2 = texture2D(uNoise, vWorld * 0.073 - vec2(uTime * 0.015, -uTime * 0.022)).g;
        // Ripples nudge where the mirror is read.
        vec4 r = texture2D(uReflection, vUv + (vec2(n1, n2) - 0.5) * 0.006);
        float sparkle = smoothstep(0.34, 0.46, n1 * n2);
        vec3 c = r.rgb * (0.95 + 0.1 * n1) + vec3(1.0, 0.86, 0.6) * (r.a * (sparkle * 1.1 + 0.12));
        gl_FragColor = vec4(mix(c, vFog.rgb, vFog.a), 1.0);
      }
    `,
  });
}

/**
 * Falling leaves: one instanced kite. Each leaf has a place in a box around the viewer and
 * falls, drifts downwind and rocks from side to side as a function of time alone, so they cost
 * nothing to animate. Where one leaves the box it comes back in on the far side, shrunk to
 * nothing at the faces of the box so that it never pops. A leaf that would touch the viewer's
 * face shrinks away too.
 *
 *   aSeed  x, y, z: place in the box (0..1); w: a random number that sets everything else
 *   aLeaf  r, g, b (linear); w: size in metres
 */
export function leafMaterial(shared, box) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign(
      {
        uBoxMin: { value: new THREE.Vector3(box.min[0], box.min[1], box.min[2]) },
        uBoxSize: { value: new THREE.Vector3(box.size[0], box.size[1], box.size[2]) },
      },
      shared
    ),
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uBoxMin;
      uniform vec3 uBoxSize;
      uniform vec2 uWind;
      attribute vec4 aSeed;
      attribute vec4 aLeaf;
      varying vec3 vColor;

      vec3 turnX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
      vec3 turnY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, c * p.z - s * p.x); }
      vec3 turnZ(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

      void main() {
        float r1 = aSeed.w;
        float r2 = fract(r1 * 7.31);
        float r3 = fract(r1 * 13.7);
        float r4 = fract(r1 * 29.3);
        // A leaf falls in swings: it slides to one side, tips, and slides back.
        float swing = uTime * (1.5 + 1.3 * r2) + r1 * 6.2832;
        vec3 q = aSeed.xyz * uBoxSize;
        q.y -= uTime * (0.55 + 0.5 * r3);
        q.xz += uWind * (uTime * (0.9 + 0.7 * r4));
        q.x += sin(swing) * 0.32;
        q.z += cos(swing * 0.83 + 1.7) * 0.26;
        q.y += 0.07 * cos(2.0 * swing);
        q = mod(q, uBoxSize);
        vec3 center = uBoxMin + q;
        vec3 edge = min(q, uBoxSize - q);
        float show = smoothstep(0.0, 1.3, min(edge.x, min(edge.y, edge.z)));
        show *= smoothstep(0.4, 1.0, distance(center, cameraPosition));
        // One leaf in three tumbles end over end; the others rock.
        float tumble = step(0.66, r2) * uTime * (2.5 + 3.0 * r3);
        float roll = cos(swing) * 1.0 + tumble;
        float tip = sin(swing * 0.83 + 1.7) * 0.55;
        float yaw = r4 * 6.2832 + uTime * (0.4 + 0.8 * r1);
        vec3 p = turnY(turnZ(turnX(position, roll), tip), yaw);
        vec3 n = turnY(turnZ(turnX(normal, roll), tip), yaw);
        vec4 wp = vec4(center + p * (aLeaf.w * show), 1.0);
        // Thin enough for the low sun to shine through: lit from either side.
        float sun = 0.3 + 0.7 * abs(dot(n, uSunDir));
        vec3 c = aLeaf.rgb * (mix(uBounceColor, uSkyColor, n.y * 0.5 + 0.5) + uSunColor * (sun * 0.85));
        vColor = dvDisplay(dvHaze(c, wp.xyz, 1.0));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: FLAT_FRAGMENT,
  });
}

/**
 * A dragon. The vertex shader moves each vertex with its one or two bones (rig.js works the
 * bones out; they arrive as three rows of four numbers each), lights it, and lets the low sun
 * shine through the wing membranes. `mirror` makes the dimmer material used for the dragon's
 * image in the lake.
 */
export function dragonMaterial(shared, bones, options) {
  const o = options || {};
  const defines = { DV_BONES: bones.length / 4 };
  if (o.mirror) defines.DV_MIRROR = 1;
  return new THREE.ShaderMaterial({
    uniforms: Object.assign(
      {
        uBones: { value: bones },
        uSunlit: { value: 1 },
        uAlpha: { value: 0.5 },
      },
      shared
    ),
    defines,
    vertexColors: true,
    transparent: !!o.mirror,
    depthWrite: !o.mirror,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec4 uBones[DV_BONES];
      uniform float uSunlit;
      attribute vec4 aux;
      varying vec3 vColor;

      vec3 bonePoint(float bone, vec4 p) {
        int i = int(bone + 0.5) * 3;
        return vec3(dot(uBones[i], p), dot(uBones[i + 1], p), dot(uBones[i + 2], p));
      }
      vec3 boneDir(float bone, vec3 n) {
        int i = int(bone + 0.5) * 3;
        return vec3(dot(uBones[i].xyz, n), dot(uBones[i + 1].xyz, n), dot(uBones[i + 2].xyz, n));
      }

      void main() {
        vec4 rest = vec4(position, 1.0);
        float w = aux.z;
        vec3 p = bonePoint(aux.x, rest) * w + bonePoint(aux.y, rest) * (1.0 - w);
        vec3 n = boneDir(aux.x, normal) * w + boneDir(aux.y, normal) * (1.0 - w);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        n = normalize(mat3(modelMatrix) * n);
        float membrane = step(0.5, aux.w) * step(aux.w, 1.5);
        float glow = step(1.5, aux.w);
        vec3 c = color * dvLight(n, uSunlit);
        // The sun behind a wing lights it up like a paper lantern.
        c += color * uSunColor * (max(-dot(n, uSunDir), 0.0) * 0.9 * membrane * uSunlit);
        c = mix(c, color * 5.0, glow);
        #ifdef DV_MIRROR
          c *= 0.55;
        #endif
        // A little less haze than the land gets: down in the mist of the valley floor the
        // dragons are what the eye is looking for, and they must not sink into it.
        vColor = dvDisplay(dvHaze(c, wp.xyz, 0.72));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: o.mirror
      ? /* glsl */ `
        uniform float uAlpha;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, uAlpha);
        }
      `
      : FLAT_FRAGMENT,
  });
}

export { THREE, COMMON, FLAT_FRAGMENT };
