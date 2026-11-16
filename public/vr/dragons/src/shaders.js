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
import { SUN_DIR, SUN_WRAP, LIGHT, FOG, GRADE } from './world.js';

/** A number as GLSL wants a float written. */
const glf = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/**
 * Which way the wind blows and how far it moves a crown at a moderate strength (main.js makes
 * it swell and die with the gusts that are heard): out over the valley from behind the viewer's
 * left shoulder, so that the big maple's leaves cross in front of the ledge.
 */
export const WIND = [0.8, -0.38];

/** Uniforms every material shares. One object, so a change reaches all of them. */
export function makeShared() {
  return {
    uSunDir: { value: new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2]) },
    uSunColor: { value: new THREE.Vector3(LIGHT.sun[0], LIGHT.sun[1], LIGHT.sun[2]) },
    uSkyColor: { value: new THREE.Vector3(LIGHT.sky[0], LIGHT.sky[1], LIGHT.sky[2]) },
    uBounceColor: { value: new THREE.Vector3(LIGHT.bounce[0], LIGHT.bounce[1], LIGHT.bounce[2]) },
    uFogColor: { value: new THREE.Vector3(FOG.color[0], FOG.color[1], FOG.color[2]) },
    uFogSideColor: { value: new THREE.Vector3(FOG.sideColor[0], FOG.sideColor[1], FOG.sideColor[2]) },
    uFogSunColor: { value: new THREE.Vector3(FOG.sunColor[0], FOG.sunColor[1], FOG.sunColor[2]) },
    uFog: { value: new THREE.Vector4(FOG.haze, FOG.mist, FOG.falloff, FOG.base) },
    uExposure: { value: LIGHT.exposure },
    // How much darker the picture is toward the edge of what the eye sees than in its middle.
    uVignette: { value: VIGNETTE.flat },
    uTime: { value: 0 },
    // Direction and strength of the sway.
    uWind: { value: new THREE.Vector2(WIND[0], WIND[1]) },
    // How much of the sun a dragon is covering just now, seen from the ledge (0..1): its
    // shadow falls on the ledge and the trees by it, and the glare round the sun dims.
    uCover: { value: 0 },
    // How bright the shafts of sunlight in the haze are (1: as designed; 0: none).
    uRays: { value: 1 },
  };
}

/**
 * The vignette: the picture is a little darker away from the middle of what the eye sees, which
 * holds the gaze on the valley and the sun. Like everything else it is worked out per vertex
 * (from the angle between the way the eye points and the way to the vertex), so it costs no
 * pixel anything. In a headset it is gentler: each eye has its own, and the lenses add theirs.
 */
export const VIGNETTE = { flat: 0.34, vr: 0.2 };

const COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;
uniform vec3 uFogColor;
uniform vec3 uFogSideColor;
uniform vec3 uFogSunColor;
uniform vec4 uFog;
uniform float uExposure;
uniform float uVignette;
uniform float uTime;

// (world.js, fogColor)
vec3 dvFogColor(vec3 dir) {
  float s = dot(dir, uSunDir);
  float a = max(s, 0.0);
  float a2 = a * a;
  float a8 = a2 * a2;
  a8 *= a8;
  vec3 c = mix(uFogColor, uFogSideColor, smoothstep(-0.9, 0.35, s));
  return mix(c, uFogSunColor, a2 * 0.35 + a8 * 0.65);
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
  float d = max((dot(n, uSunDir) + ${glf(SUN_WRAP)}) / ${glf(1 + SUN_WRAP)}, 0.0) * sunlit;
  return mix(uBounceColor, uSkyColor, n.y * 0.5 + 0.5) + uSunColor * d;
}

// The grade (world.js, GRADE and toDisplay): a soft shoulder, a gamma for each channel so that
// shadows fall cool, and an S-curve for contrast.
vec3 dvDisplay(vec3 c) {
  vec3 g = pow(1.0 - exp(-max(c, 0.0) * uExposure), vec3(${GRADE.gamma.map(glf).join(', ')}));
  return g + ${glf(GRADE.contrast)} * (g * g * (3.0 - 2.0 * g) - g);
}

// Haze between the eye and a world position, applied to a linear colour (world.js, hazeOver).
vec3 dvHaze(vec3 c, vec3 worldPos, float scale) {
  vec3 toP = worldPos - cameraPosition;
  float dist = length(toP);
  vec3 dir = toP / max(dist, 1.0e-4);
  float f = dvFogAmount(cameraPosition.y, dir.y, dist) * scale;
  c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))), f * ${glf(FOG.desaturate)});
  return mix(c, dvFogColor(dir), f);
}

// The vignette, from a position in the eye's own frame: 1 in the middle of the view, less
// toward its edge.
float dvVignette(vec3 viewPos) {
  float c = -viewPos.z / max(length(viewPos), 1.0e-4);
  return 1.0 - uVignette * (1.0 - smoothstep(0.42, 0.93, c));
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
      uniform float uCover;
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
          // Low sun through leaves: the side away from the sun is not black but glows a
          // little, deep in the leaf's own colour (the light has been through it twice over).
          c += albedo * albedo * uSunColor * (max(-dot(n, uSunDir), 0.0) * 0.4 * aux.y * sunlit);
        #endif
        // A dragon between the ledge and the low sun: for that moment its shadow is on the
        // ledge and on everything within a few strides of it.
        c *= 1.0 - 0.42 * uCover * (1.0 - smoothstep(22.0, 42.0, length(wp.xz)));
        vec4 vp = viewMatrix * wp;
        vColor = dvDisplay(dvHaze(c, wp.xyz, uHaze)) * dvVignette(vp.xyz);
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: FLAT_FRAGMENT,
  });
}

/**
 * The sky dome. Its vertex colours are final screen colours (baked in scene.js); it is drawn at
 * the far plane after everything solid, so it only costs pixels where sky shows.
 */
export function skyMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uVignette: shared.uVignette },
    vertexColors: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uVignette;
      varying vec3 vColor;
      void main() {
        vec3 v = mat3(viewMatrix) * position;
        // The vignette (see dvVignette).
        float c = -v.z / max(length(v), 1.0e-4);
        vColor = color * (1.0 - uVignette * (1.0 - smoothstep(0.42, 0.93, c)));
        vec4 p = projectionMatrix * vec4(v, 1.0);
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

/**
 * The sun and the light round it. One mesh and one draw call, in parts told apart by `part`
 * (see scene.js, buildSky):
 *   0  the disc and its glow. They are things in the sky: drawn at the far plane and tested
 *      against what has been drawn already, so a hill, a cloud or a dragon in front of them
 *      hides them, and is seen as a dark shape against the light. (Added over everything, the
 *      disc once showed through a dragon's wing like a hole.)
 *   1  the light that spills over the edge of whatever stands in front of the sun. That is not
 *      a thing, it happens in the eye: drawn in front of everything, and dimmed while a dragon
 *      covers the disc (uCover).
 *   2  shafts of sunlight in the haze, fanning out from the sun. Real ones are light scattered
 *      along the whole line of sight; here they are a fan of soft blades of added light, and
 *      what stands for "along the line of sight" is that they are drawn RAY_DEPTH metres out:
 *      the far hills, the far end of the lake and a dragon out there are behind them, the
 *      ledge, the trees by it and a dragon close by are in front. Each blade sways and
 *      brightens slowly on a clock of its own (`ray`: x phase, y how fast), and they go out
 *      while a dragon covers the sun.
 */
export const RAY_DEPTH = 200;

export function sunMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { uCover: shared.uCover, uTime: shared.uTime, uSunDir: shared.uSunDir, uRays: shared.uRays },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uCover;
      uniform float uTime;
      uniform float uRays;
      uniform vec3 uSunDir;
      attribute float part;
      attribute vec2 ray;
      varying vec3 vColor;
      void main() {
        float spill = step(0.5, part) * step(part, 1.5);
        float shaft = step(1.5, part);
        vec3 dir = position;
        // A shaft sways a little about the sun (turned about the line to it), and comes and goes.
        float turn = shaft * 0.045 * sin(uTime * 0.05 * ray.y + ray.x * 6.2832);
        dir = dir * cos(turn) + cross(uSunDir, dir) * sin(turn) + uSunDir * (dot(uSunDir, dir) * (1.0 - cos(turn)));
        float breathe = 0.62 + 0.38 * sin(uTime * 0.31 * ray.y + ray.x * 17.0);
        vColor = color * (1.0 - 0.8 * uCover * spill) * mix(1.0, breathe * uRays * (1.0 - 0.9 * uCover), shaft);
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * dir * mix(1.0, ${glf(RAY_DEPTH)}, shaft), 1.0);
        // The sun at the far plane, the spill just inside the near one, the shafts where they are.
        gl_Position = vec4(p.xy, mix(mix(p.w, -0.999 * p.w, spill), p.z, shaft), p.w);
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
      varying float vDim;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vUv = (wp.xz - uBounds.xy) * uBounds.zw;
        vWorld = wp.xz;
        vec3 toP = wp.xyz - cameraPosition;
        float dist = length(toP);
        vec3 dir = toP / max(dist, 1.0e-4);
        vFog = vec4(dvDisplay(dvFogColor(dir)), dvFogAmount(cameraPosition.y, dir.y, dist));
        vec4 vp = viewMatrix * wp;
        vDim = dvVignette(vp.xyz);
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uReflection;
      uniform sampler2D uNoise;
      uniform float uTime;
      varying vec2 vUv;
      varying vec2 vWorld;
      varying vec4 vFog;
      varying float vDim;
      void main() {
        // A slow swell (two noises in one read) nudges where the mirror is read.
        vec2 swell = texture2D(uNoise, vWorld * 0.047 + vec2(uTime * 0.019, uTime * 0.011)).rg;
        vec4 r = texture2D(uReflection, vUv + (swell - 0.5) * 0.006);
        // Small waves, long across the line of sight, running toward the bluff: where two of
        // them cross, a crest throws the sun at the eye.
        vec2 crest = texture2D(uNoise, vWorld * vec2(0.085, 0.29) + vec2(uTime * 0.021, uTime * 0.083), -0.7).rg;
        // The sun's path: molten down its middle, breaking up into glints toward its edges
        // (r.a is how far into the path this water is: the further in, the more crests catch).
        // Far out the crests are too small to be told apart (the texture's smaller copies see
        // to that), and there the middle of the path is one unbroken band of light.
        float glint = smoothstep(0.5 - 0.52 * r.a, 0.57 - 0.52 * r.a, crest.r * crest.g + 0.12 * (swell.r - 0.5));
        vec3 c = r.rgb * (0.94 + 0.12 * swell.g) + vec3(1.0, 0.62, 0.24) * (r.a * r.a * 0.55);
        // (Less of the haze than the land gets: the mist on the lake is drawn by itself, in
        // banks, and between them the water is a dark mirror.)
        c = mix(c, vFog.rgb, vFog.a * ${glf(0.62)});
        // The glints are the sun itself, thrown back: the mist dims them, it does not hide them.
        c += vec3(1.0, 0.74, 0.34) * (glint * r.a * (1.25 - 0.6 * vFog.a));
        gl_FragColor = vec4(c * vDim, 1.0);
      }
    `,
  });
}

/**
 * Mist on the lake: one flat sheet a few metres over the water, see-through, thick in patches
 * that drift and change slowly (two sines of place and time, per vertex: the sheet is coarse
 * and so are banks of mist). It takes the colour of the haze, so toward the sun it glows.
 * A dragon that flies under it is seen through it; one that skims it parts nothing, but that
 * is not looked at so closely.
 *
 *   edge   per vertex: 1 where the sheet lies over open water, 0 where it ends (the shores,
 *          where the ground comes up through it, and its own rim)
 */
export function mistMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uAmount: { value: 1 } }, shared),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform float uAmount;
      attribute float edge;
      varying vec4 vMist;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float t = uTime;
        float bank = sin(wp.x * 0.021 + t * 0.031) * sin(wp.z * 0.017 - t * 0.024 + 1.7 * sin(wp.x * 0.0083 + t * 0.011));
        float wisp = sin(wp.x * 0.047 - wp.z * 0.039 + t * 0.05);
        vec3 toP = wp.xyz - cameraPosition;
        float dist = length(toP);
        vec3 dir = toP / max(dist, 1.0e-4);
        // Nothing of it close to the eye, where a flat sheet would be seen for what it is.
        float a = edge * uAmount * (0.34 + 0.3 * bank + 0.08 * wisp) * smoothstep(25.0, 110.0, dist);
        vec4 vp = viewMatrix * wp;
        vMist = vec4(dvDisplay(dvFogColor(dir) * 1.08) * dvVignette(vp.xyz), clamp(a, 0.0, 0.8));
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vMist;
      void main() {
        gl_FragColor = vMist;
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
        // Steady, whatever the gusts do: a leaf's place is worked out from the time alone, and
        // a wind that changed strength would move every leaf at once.
        uDrift: { value: new THREE.Vector2(WIND[0], WIND[1]) },
        // How far the wakes of passing dragons have carried the leaves so far (metres). It
        // only ever grows, a little at a time (scene.js, blowLeaves): a leaf that leaves the
        // box on one side comes in on the other, so it never needs to come back.
        uBlown: { value: new THREE.Vector3(0, 0, 0) },
      },
      shared
    ),
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uBoxMin;
      uniform vec3 uBoxSize;
      uniform vec2 uDrift;
      uniform vec3 uBlown;
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
        q.xz += uDrift * (uTime * (0.9 + 0.7 * r4));
        // Light leaves are carried further by a wake than heavy ones.
        q += uBlown * (0.55 + 0.9 * r3);
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
        vec3 c = aLeaf.rgb * (mix(uBounceColor, uSkyColor, n.y * 0.5 + 0.5) + uSunColor * (sun * 0.7));
        // And they catch the light as they come down: one that falls between the eye and the
        // sun is lit through, like a scrap of stained glass, and one that turns its face
        // just so throws the sun at the eye for an instant.
        vec3 toEye = normalize(cameraPosition - wp.xyz);
        float into = max(-dot(toEye, uSunDir), 0.0);
        c += aLeaf.rgb * uSunColor * (into * into * into * (0.5 + 0.9 * sun));
        float flash = abs(dot(n, normalize(uSunDir + toEye)));
        flash *= flash;
        flash *= flash;
        flash *= flash;
        flash *= flash;
        c += uSunColor * (flash * flash * 0.55);
        vec4 vp = viewMatrix * wp;
        vColor = dvDisplay(dvHaze(c, wp.xyz, 1.0)) * dvVignette(vp.xyz);
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: FLAT_FRAGMENT,
  });
}

/**
 * What hangs in the air round the ledge and catches the light: motes of pollen and dust, sparks
 * from the dragons' fire, and flakes of ash. One instanced draw call of small squares that
 * face the eye, each drawn as a soft round dot and ADDED to the picture (they are light, or
 * lit); where each one is, is worked out from the time alone, in a box round the viewer, as
 * the leaves are. There are few of them and they are small: on the screen all of them
 * together cover less than a hundredth of it.
 *
 *   aSeed  x, y, z: place in the box (0..1); w: a random number that sets everything else
 *   aKind  0 a mote, 1 a spark, 2 a flake of ash
 *
 * A mote is all but unseen until one looks toward the sun through it: then the air is full of
 * them. Sparks glow of themselves, rise, flicker and die; how many are alight is uEmber (more
 * for a while after a dragon has breathed fire). Ash drifts down, pale where it is lit.
 */
export function moteMaterial(shared, box) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign(
      {
        uBoxMin: { value: new THREE.Vector3(box.min[0], box.min[1], box.min[2]) },
        uBoxSize: { value: new THREE.Vector3(box.size[0], box.size[1], box.size[2]) },
        uDrift: { value: new THREE.Vector2(WIND[0], WIND[1]) },
        // The wakes of passing dragons carry them as they carry the leaves.
        uBlown: { value: new THREE.Vector3(0, 0, 0) },
        uEmber: { value: 0.4 },
      },
      shared
    ),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uBoxMin;
      uniform vec3 uBoxSize;
      uniform vec2 uDrift;
      uniform vec3 uBlown;
      uniform float uEmber;
      attribute vec4 aSeed;
      attribute float aKind;
      varying vec3 vColor;
      varying vec2 vUv;
      void main() {
        float r1 = aSeed.w;
        float r2 = fract(r1 * 7.31);
        float r3 = fract(r1 * 13.7);
        float r4 = fract(r1 * 29.3);
        float spark = step(0.5, aKind) * step(aKind, 1.5);
        float ash = step(1.5, aKind);
        float t = uTime;
        // Motes hang, and drift a little with the wind; sparks go up on their own heat and
        // are carried along; ash comes down.
        vec3 go = vec3(uDrift.x * 0.3, 0.02 + 0.04 * r2, uDrift.y * 0.3);
        go = mix(go, vec3(uDrift.x * 0.8, 0.55 + 0.7 * r3, uDrift.y * 0.8), spark);
        go = mix(go, vec3(uDrift.x * 0.55, -0.22 - 0.2 * r3, uDrift.y * 0.55), ash);
        vec3 q = aSeed.xyz * uBoxSize + go * t + uBlown * (0.35 + 0.65 * r3);
        // Each wanders about its path.
        float w = t * (0.35 + 0.5 * r2) + r1 * 6.2832;
        q += vec3(sin(w), 0.6 * sin(w * 1.31 + 1.0), cos(w * 0.83 + 2.0)) * mix(0.22, 0.5, spark);
        q = mod(q, uBoxSize);
        vec3 center = uBoxMin + q;
        vec3 rim = min(q, uBoxSize - q);
        float show = smoothstep(0.0, 1.4, min(rim.x, min(rim.y, rim.z)));
        vec3 toP = center - cameraPosition;
        float dist = length(toP);
        vec3 dir = toP / max(dist, 1.0e-4);
        // None in the viewer's face.
        show *= smoothstep(0.45, 1.3, dist);
        float into = max(dot(dir, uSunDir), 0.0);
        float twinkle = 0.5 + 0.5 * sin(t * (1.1 + 2.4 * r4) + r1 * 40.0);
        // A mote: seen by the sun it scatters toward the eye.
        vec3 c = vec3(1.0, 0.7, 0.34) * ((0.07 + 0.93 * into * into * into) * (0.3 + 0.7 * twinkle * twinkle));
        // A spark: bright and yellow low down where it was made, red and dying as it rises.
        float life = q.y / uBoxSize.y;
        float flicker = 0.62 + 0.38 * sin(t * (8.0 + 7.0 * r2) + r1 * 50.0);
        vec3 glow = mix(vec3(1.0, 0.5, 0.1), vec3(0.85, 0.1, 0.02), life) * (flicker * (1.0 - life * life) * 1.5 * step(r4, uEmber));
        c = mix(c, glow, spark);
        // Ash: pale where the sun finds it.
        c = mix(c, vec3(0.8, 0.62, 0.5) * ((0.1 + 0.55 * into * into) * (0.45 + 0.55 * twinkle)), ash);
        float size = mix(0.015 + 0.014 * r2, 0.024 + 0.022 * r2, spark);
        size = mix(size, 0.014 + 0.012 * r2, ash);
        // (A little bigger far off, or they would be less than a pixel of a Quest 1.)
        size *= show * (1.0 + 0.07 * dist);
        vec4 vp = viewMatrix * vec4(center, 1.0);
        vp.xy += position.xy * size;
        vUv = position.xy;
        vColor = c * dvVignette(vp.xyz);
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying vec2 vUv;
      void main() {
        float a = max(1.0 - dot(vUv, vUv), 0.0);
        gl_FragColor = vec4(vColor * (a * a), 1.0);
      }
    `,
  });
}

/**
 * How much of the land's haze a dragon gets. Not all of it: far off in the glow of the valley
 * the dragons are what the eye is looking for, and they are to stand in it as dark shapes,
 * not melt into it. (Measured, with and without each dragon in the picture, by
 * `npm run contrast`: see the README.)
 */
export const DRAGON_HAZE = 0.28;

/**
 * A dragon. The vertex shader moves each vertex with its one or two bones (rig.js works the
 * bones out; they arrive as three rows of four numbers each) and lights it. `mirror` makes the
 * dimmer material used for the dragon's image in the lake.
 *
 * The light is the look of the piece: the sun is behind the valley, so a dragon out in front is
 * seen against it. It is dark where the sun does not reach (the dusk lights that side, no more),
 * its edges catch the sun (a rim of fire along whatever is turned away from the eye, strongest
 * looking into the sun), and its wings are lanterns: the membranes let the sun through, in
 * their own colour, more the more squarely it strikes them from behind. While it breathes
 * fire (uFire, 0..1) the fire lights its own head, neck and breast.
 */
export function dragonMaterial(shared, bones, options) {
  const o = options || {};
  const defines = { DV_BONES: bones.length / 4, DV_DRAGON_HAZE: glf(DRAGON_HAZE) };
  if (o.mirror) defines.DV_MIRROR = 1;
  return new THREE.ShaderMaterial({
    uniforms: Object.assign(
      {
        uBones: { value: bones },
        uSunlit: { value: 1 },
        uAlpha: { value: 0.5 },
        uFire: { value: 0 },
        // Where the fire leaves the mouth, in the dragon's rest pose (x, y, z), and its size.
        uMouth: { value: new THREE.Vector4(0, 0.6, 5.6, 1) },
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
      uniform float uFire;
      uniform vec4 uMouth;
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
        vec3 toEye = normalize(cameraPosition - wp.xyz);
        // How nearly the eye is looking into the sun, past this point: 1 straight into it.
        float into = max(-dot(toEye, uSunDir), 0.0);
        // The sun on what faces it, with a tighter edge than on the land; the dusk on the rest.
        float lit = max((dot(n, uSunDir) + 0.14) / 1.14, 0.0) * uSunlit;
        vec3 c = color * (mix(uBounceColor, uSkyColor, n.y * 0.5 + 0.5) * 1.15 + uSunColor * lit);
        // The wings as lanterns: the sun through the membrane, in the membrane's own colour.
        float behind = max((-dot(n, uSunDir) + 0.22) / 1.22, 0.0);
        vec3 through = color * (uSunColor * 0.3 + vec3(0.75)) * (behind * (0.3 + 0.95 * into * into));
        c += through * (membrane * uSunlit);
        // The rim: the sun catching every edge that is turned away from the eye.
        float edge = 1.0 - abs(dot(n, toEye));
        edge *= edge * edge;
        c += (uSunColor * (0.3 + 0.7 * color)) * (edge * (0.1 + 0.42 * into) * uSunlit * (1.0 - 0.6 * membrane));
        // Its own fire on its face, neck and breast.
        vec3 fromMouth = (position - uMouth.xyz) / uMouth.w;
        c += (color + 0.04) * vec3(4.2, 1.5, 0.3) * (uFire / (1.0 + 0.3 * dot(fromMouth, fromMouth)));
        c = mix(c, color * 5.0, glow);
        #ifdef DV_MIRROR
          c *= 0.55;
        #endif
        // Less haze than the land gets (see DRAGON_HAZE).
        vec4 vp = viewMatrix * wp;
        vColor = dvDisplay(dvHaze(c, wp.xyz, DV_DRAGON_HAZE)) * dvVignette(vp.xyz);
        gl_Position = projectionMatrix * vp;
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

/**
 * Fire. Added on top of the picture (it is light, not a thing), drawn from both sides. Each
 * tongue shoots out from the mouth, thins, lifts a little and fades, over and over, each on its
 * own clock. uPower (0..1) is how hard the dragon is breathing: it sets length and brightness.
 *
 * The same mesh carries the glow round the fire (dragonGeometry.js, buildFlame): discs of
 * added light that ride on the jet and are turned to face the eye here. They are what a camera
 * would call bloom, and they cost one interpolated colour a pixel like everything else. They
 * are drawn where the fire is, so the dragon's own head stands dark against them, and they
 * never fill much of the picture: a disc is no bigger than a fifth of its distance from the eye.
 */
export function flameMaterial(shared, length) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ uPower: { value: 0 }, uLength: { value: length } }, shared),
    transparent: true,
    depthWrite: false,
    // Mostly added to the picture, but hiding some of what is behind it too: against a bright
    // hazy sky, light that is only added washes out to white, and fire should stay orange.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      uniform float uPower;
      uniform float uLength;
      attribute vec3 dir;
      attribute vec3 flame;
      attribute vec4 glow;
      varying vec4 vFlame;
      void main() {
        float along = flame.x;
        float halo = step(1.0e-4, glow.z);
        // 0 as the tongue leaves the mouth .. 1 as it dies.
        float cycle = fract(uTime * (1.5 + 1.7 * flame.z) + flame.y);
        float reach = uLength * uPower * (0.3 + 0.7 * cycle);
        // The tip runs ahead; late in its life the whole tongue lets go of the mouth.
        vec3 p = position + dir * (reach * (along + 0.3 * cycle * cycle * (1.0 - along)));
        float far = along * cycle;
        float lick = sin(uTime * 19.0 + flame.y * 40.0) * 0.05 * reach * far;
        p.x += lick;
        p.y += 0.6 * lick + 0.13 * reach * far * far; // fire rises
        // (A disc of the glow rides at its place along the jet, and does none of that.)
        p = mix(p, position + dir * (uLength * uPower * along), halo);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        // Yellow-white at the mouth, orange in the middle, red where it dies.
        float t = clamp(along * 1.3, 0.0, 1.0) * mix(0.45 + 0.55 * cycle, 1.0, halo);
        vec3 c = mix(vec3(1.0, 0.86, 0.42), vec3(1.0, 0.36, 0.03), smoothstep(0.0, 0.4, t));
        c = mix(c, vec3(0.72, 0.07, 0.02), smoothstep(0.4, 1.0, t));
        float fade = uPower * (1.0 - 0.9 * cycle * cycle);
        // Haze dims a light without tinting it.
        vec3 toP = wp.xyz - cameraPosition;
        float dist = length(toP);
        float haze = dvFogAmount(cameraPosition.y, toP.y / max(dist, 1.0e-4), dist);
        float a = fade * (1.0 - 0.5 * haze);
        vFlame = vec4(c * (a * 1.3), a * 0.8);
        vec4 vp = viewMatrix * wp;
        // The glow: a disc that faces the eye, flickering as the fire does, brighter and wider
        // the harder the dragon breathes. In haze it is dimmer at its middle and wider: the
        // air round the fire is what is lit.
        float flicker = 0.84 + 0.16 * sin(uTime * 23.0 + along * 31.0) * sin(uTime * 7.3 + along * 11.0);
        float radius = min(glow.z * (0.5 + 0.5 * uPower) * (1.0 + 0.5 * haze), 0.2 * dist);
        vp.xy += glow.xy * radius * halo;
        vec3 lit = mix(vec3(1.0, 0.78, 0.4), vec3(1.0, 0.33, 0.07), smoothstep(0.0, 0.5, along));
        vFlame = mix(vFlame, vec4(lit * (glow.w * uPower * uPower * flicker * (1.0 - 0.45 * haze)), 0.0), halo);
        gl_Position = projectionMatrix * vp;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec4 vFlame;
      void main() {
        gl_FragColor = vFlame;
      }
    `,
  });
}

export { THREE, COMMON, FLAT_FRAGMENT };
