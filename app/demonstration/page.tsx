'use client';

import { useEffect, useRef } from 'react';

type Vec2 = {
  x: number;
  y: number;
};

type WorldVec2 = {
  x: number;
  z: number;
};

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

type Camera = {
  x: number;
  y: number;
  z: number;
  fov: number;
};

type PointerState = {
  x: number;
  y: number;
  active: boolean;
};

type Star = {
  u: number;
  v: number;
  size: number;
  twinkleSpeed: number;
  phase: number;
  depth: number;
  hueOffset: number;
};

type Shockwave = {
  x: number;
  y: number;
  worldX: number;
  worldZ: number;
  age: number;
  life: number;
  speed: number;
  pixelSpeed: number;
  amplitude: number;
};

type Geometry = {
  points: Vec3[];
  segments: Array<[number, number]>;
};

type StructureKind = 'polyhedron' | 'torus' | 'impossible';

type FloatingStructure = {
  kind: StructureKind;
  geometry: Geometry;
  position: Vec3;
  basePosition: Vec3;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  rotation: Vec3;
  rotationVelocity: Vec3;
  scale: number;
  hueOffset: number;
  morphRate: number;
  morphAmount: number;
  seedOffset: number;
};

type TendrilNode = {
  x: number;
  y: number;
  thickness: number;
  energy: number;
};

type Tendril = {
  nodes: TendrilNode[];
  direction: number;
  growthCarry: number;
  hue: number;
  vigor: number;
  noiseOffset: number;
  maxNodes: number;
  dead: boolean;
};

type Palette = {
  root: number;
  skyA: number;
  skyB: number;
  auroraA: number;
  auroraB: number;
  terrainA: number;
  terrainB: number;
  tendril: number;
  structure: number;
};

const TAU = Math.PI * 2;
const SQRT3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT3 - 1);
const G2 = (3 - SQRT3) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

const GRAD3: number[][] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x9e3779b9;
    }
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
}

class SimplexNoise {
  private perm: Uint8Array;
  private permMod12: Uint8Array;

  constructor(random: () => number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) {
      p[i] = i;
    }

    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }

    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);

    for (let i = 0; i < 512; i += 1) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin: number, yin: number): number {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;

    const x0 = xin - (i - t);
    const y0 = yin - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0);
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1);
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2);
    }

    return 70 * (n0 + n1 + n2);
  }

  noise3D(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);

    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    let i2 = 0;
    let j2 = 0;
    let k2 = 0;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        i2 = 1;
        j2 = 1;
      } else if (x0 >= z0) {
        i1 = 1;
        i2 = 1;
        k2 = 1;
      } else {
        k1 = 1;
        i2 = 1;
        k2 = 1;
      }
    } else if (y0 < z0) {
      k1 = 1;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      j1 = 1;
      j2 = 1;
      k2 = 1;
    } else {
      j1 = 1;
      i2 = 1;
      j2 = 1;
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    const gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]];
    const gi2 = this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]];
    const gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]];

    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0 + GRAD3[gi0][2] * z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1 + GRAD3[gi1][2] * z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2 + GRAD3[gi2][2] * z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi3][0] * x3 + GRAD3[gi3][1] * y3 + GRAD3[gi3][2] * z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  }
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpAngle = (a: number, b: number, t: number): number => {
  let delta = ((b - a + Math.PI) % TAU) - Math.PI;
  if (delta < -Math.PI) {
    delta += TAU;
  }
  return a + delta * t;
};

const normalizeAngle = (angle: number): number => {
  let a = angle % TAU;
  if (a < 0) {
    a += TAU;
  }
  return a;
};

const rotatePoint = (point: Vec3, rotation: Vec3): Vec3 => {
  let x = point.x;
  let y = point.y;
  let z = point.z;

  const cx = Math.cos(rotation.x);
  const sx = Math.sin(rotation.x);
  const cy = Math.cos(rotation.y);
  const sy = Math.sin(rotation.y);
  const cz = Math.cos(rotation.z);
  const sz = Math.sin(rotation.z);

  let y1 = y * cx - z * sx;
  let z1 = y * sx + z * cx;

  let x2 = x * cy + z1 * sy;
  let z2 = -x * sy + z1 * cy;

  let x3 = x2 * cz - y1 * sz;
  let y3 = x2 * sz + y1 * cz;

  x = x3;
  y = y3;
  z = z2;

  return { x, y, z };
};

const projectPoint = (
  point: Vec3,
  camera: Camera,
  width: number,
  height: number,
): { x: number; y: number; depth: number; scale: number } | null => {
  const dz = point.z - camera.z;
  if (dz <= 0.05) {
    return null;
  }

  const scale = camera.fov / (camera.fov + dz);

  return {
    x: width * 0.5 + (point.x - camera.x) * scale * height * 0.62,
    y: height * 0.64 - (point.y - camera.y) * scale * height * 0.58,
    depth: dz,
    scale,
  };
};

const buildCubeGeometry = (): Geometry => {
  const points: Vec3[] = [
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: 1, y: 1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: -1, y: 1, z: 1 },
  ];

  const segments: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  return { points, segments };
};

const buildOctaGeometry = (): Geometry => {
  const points: Vec3[] = [
    { x: 0, y: 1.35, z: 0 },
    { x: 0, y: -1.35, z: 0 },
    { x: -1.1, y: 0, z: 0 },
    { x: 1.1, y: 0, z: 0 },
    { x: 0, y: 0, z: -1.1 },
    { x: 0, y: 0, z: 1.1 },
  ];

  const segments: Array<[number, number]> = [
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [2, 4],
    [4, 3],
    [3, 5],
    [5, 2],
  ];

  return { points, segments };
};

const buildIcosaGeometry = (): Geometry => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const inv = 1 / Math.sqrt(1 + phi * phi);
  const a = inv;
  const b = phi * inv;

  const points: Vec3[] = [
    { x: 0, y: a, z: b },
    { x: 0, y: -a, z: b },
    { x: 0, y: a, z: -b },
    { x: 0, y: -a, z: -b },
    { x: a, y: b, z: 0 },
    { x: -a, y: b, z: 0 },
    { x: a, y: -b, z: 0 },
    { x: -a, y: -b, z: 0 },
    { x: b, y: 0, z: a },
    { x: b, y: 0, z: -a },
    { x: -b, y: 0, z: a },
    { x: -b, y: 0, z: -a },
  ];

  const segments: Array<[number, number]> = [];
  const target = 2 * inv;
  const epsilon = 0.16;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dz = points[i].z - points[j].z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (Math.abs(distance - target) < epsilon) {
        segments.push([i, j]);
      }
    }
  }

  return { points, segments };
};

const buildTorusGeometry = (majorSegments: number, minorSegments: number): Geometry => {
  const points: Vec3[] = [];
  const segments: Array<[number, number]> = [];

  const majorRadius = 1.25;
  const minorRadius = 0.45;

  for (let i = 0; i < majorSegments; i += 1) {
    const u = (i / majorSegments) * TAU;
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);

    for (let j = 0; j < minorSegments; j += 1) {
      const v = (j / minorSegments) * TAU;
      const cosV = Math.cos(v);
      const sinV = Math.sin(v);

      const x = (majorRadius + minorRadius * cosV) * cosU;
      const y = minorRadius * sinV;
      const z = (majorRadius + minorRadius * cosV) * sinU;
      points.push({ x, y, z });
    }
  }

  for (let i = 0; i < majorSegments; i += 1) {
    for (let j = 0; j < minorSegments; j += 1) {
      const current = i * minorSegments + j;
      const nextMinor = i * minorSegments + ((j + 1) % minorSegments);
      const nextMajor = ((i + 1) % majorSegments) * minorSegments + j;
      segments.push([current, nextMinor]);
      segments.push([current, nextMajor]);
    }
  }

  return { points, segments };
};

const buildImpossibleGeometry = (): Geometry => {
  const points: Vec3[] = [
    { x: -1.45, y: -0.85, z: 0.55 },
    { x: 1.45, y: -0.85, z: 0.55 },
    { x: 0.08, y: 1.55, z: 0.55 },
    { x: -1.02, y: -0.48, z: -0.62 },
    { x: 1.04, y: -0.48, z: -0.62 },
    { x: 0.02, y: 1.18, z: -0.62 },
    { x: -0.66, y: -0.12, z: 0.18 },
    { x: 0.68, y: -0.12, z: 0.18 },
    { x: 0.03, y: 0.94, z: 0.18 },
    { x: -1.3, y: -0.86, z: 0.14 },
    { x: -0.28, y: 0.85, z: 0.14 },
    { x: -0.96, y: 0.42, z: -0.58 },
    { x: 1.31, y: -0.84, z: 0.14 },
    { x: 0.28, y: 0.85, z: 0.14 },
    { x: 0.99, y: 0.42, z: -0.58 },
  ];

  const segments: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 0],
    [3, 4],
    [4, 5],
    [5, 3],
    [0, 3],
    [1, 4],
    [2, 5],
    [6, 7],
    [7, 8],
    [8, 6],
    [9, 10],
    [10, 11],
    [11, 9],
    [12, 13],
    [13, 14],
    [14, 12],
    [10, 8],
    [13, 8],
    [9, 0],
    [12, 1],
  ];

  return { points, segments };
};

const createPolyhedronGeometry = (rng: SeededRandom): Geometry => {
  const builder = rng.pick([buildCubeGeometry, buildOctaGeometry, buildIcosaGeometry]);
  return builder();
};

const createPalette = (t: number, seedHue: number): Palette => {
  const slowWave = Math.sin(t * 0.11) * 28;
  const drift = t * 2.1;
  const root = (seedHue + slowWave + drift) % 360;

  return {
    root,
    skyA: (root + 210) % 360,
    skyB: (root + 245) % 360,
    auroraA: (root + 118) % 360,
    auroraB: (root + 158) % 360,
    terrainA: (root + 24) % 360,
    terrainB: (root + 56) % 360,
    tendril: (root + 138) % 360,
    structure: (root + 168) % 360,
  };
};

const fbm2D = (
  noise: SimplexNoise,
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): number => {
  const octaveCount = Math.max(0.5, octaves);
  const wholeOctaves = Math.floor(octaveCount);
  const fractionalOctave = octaveCount - wholeOctaves;

  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let normalizer = 0;

  for (let i = 0; i < wholeOctaves; i += 1) {
    sum += noise.noise2D(x * frequency, y * frequency) * amplitude;
    normalizer += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }

  if (fractionalOctave > 0) {
    sum += noise.noise2D(x * frequency, y * frequency) * amplitude * fractionalOctave;
    normalizer += amplitude * fractionalOctave;
  }

  return normalizer > 0 ? sum / normalizer : 0;
};

const detailOctaves = (
  baseOctaves: number,
  detailZoom: number,
  growth: number,
  maxOctaves: number,
): number => clamp(baseOctaves + Math.log2(Math.max(0.001, detailZoom)) * growth, 0.75, maxOctaves);

const renderSplinePath = (ctx: CanvasRenderingContext2D, points: TendrilNode[]): void => {
  if (points.length < 2) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length - 1; i += 1) {
    const cpx = points[i].x;
    const cpy = points[i].y;
    const nx = (points[i].x + points[i + 1].x) * 0.5;
    const ny = (points[i].y + points[i + 1].y) * 0.5;
    ctx.quadraticCurveTo(cpx, cpy, nx, ny);
  }

  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
};

export default function DemonstrationPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      return;
    }

    const seed = Date.now() >>> 0;
    const rng = new SeededRandom(seed);
    const noise = new SimplexNoise(() => rng.next());
    const seedHue = rng.range(0, 360);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let elapsed = 0;
    let detailZoom = 1;
    let targetDetailZoom = 1;
    let previousTime = performance.now();
    let tendrilSpawnTimer = 0;

    const camera: Camera = {
      x: 0,
      y: 2.6,
      z: -3.4,
      fov: 1.28,
    };

    const pointer: PointerState = {
      x: 0,
      y: 0,
      active: false,
    };

    const pinch = {
      active: false,
      distance: 0,
      midpointX: 0,
      midpointY: 0,
    };

    let stars: Star[] = [];
    const shockwaves: Shockwave[] = [];
    const structures: FloatingStructure[] = [];
    const tendrils: Tendril[] = [];

    const worldConfig = {
      width: 28,
      depth: 42,
      cols: 84,
      rows: 64,
    };

    const maxStructures = 8;
    const maxTendrils = 22;
    const minDetailZoom = 0.18;
    const maxDetailZoom = 1e12;

    const createStars = (): Star[] => {
      const count = Math.max(180, Math.floor((width * height) / 6200));
      const data: Star[] = [];

      for (let i = 0; i < count; i += 1) {
        data.push({
          u: rng.next(),
          v: Math.pow(rng.next(), 1.45) * 0.8,
          size: rng.range(0.5, 2.1),
          twinkleSpeed: rng.range(0.8, 2.6),
          phase: rng.range(0, TAU),
          depth: rng.range(0.15, 1),
          hueOffset: rng.range(-20, 28),
        });
      }

      return data;
    };

    const createStructure = (kind?: StructureKind): FloatingStructure => {
      const chosenKind =
        kind ?? rng.pick<StructureKind>(['polyhedron', 'torus', 'impossible', 'polyhedron']);

      let geometry: Geometry;
      if (chosenKind === 'torus') {
        geometry = buildTorusGeometry(rng.int(10, 14), rng.int(8, 11));
      } else if (chosenKind === 'impossible') {
        geometry = buildImpossibleGeometry();
      } else {
        geometry = createPolyhedronGeometry(rng);
      }

      return {
        kind: chosenKind,
        geometry,
        position: { x: 0, y: 0, z: 12 },
        basePosition: {
          x: rng.range(-8.5, 8.5),
          y: rng.range(2.8, 7.5),
          z: rng.range(11.5, 24),
        },
        orbitRadius: rng.range(0.8, 3.6),
        orbitSpeed: rng.range(0.1, 0.34),
        orbitPhase: rng.range(0, TAU),
        rotation: {
          x: rng.range(0, TAU),
          y: rng.range(0, TAU),
          z: rng.range(0, TAU),
        },
        rotationVelocity: {
          x: rng.range(-0.14, 0.14),
          y: rng.range(-0.12, 0.12),
          z: rng.range(-0.11, 0.11),
        },
        scale: chosenKind === 'torus' ? rng.range(0.85, 1.15) : rng.range(0.7, 1.4),
        hueOffset: rng.range(-28, 42),
        morphRate: rng.range(0.28, 0.64),
        morphAmount: rng.range(0.1, 0.33),
        seedOffset: rng.range(-100, 100),
      };
    };

    const spawnTendril = (x: number, y: number, direction: number, hue: number, vigor: number): void => {
      if (tendrils.length >= maxTendrils) {
        return;
      }

      tendrils.push({
        nodes: [
          {
            x,
            y,
            thickness: rng.range(2.3, 4.2),
            energy: 1,
          },
        ],
        direction: normalizeAngle(direction),
        growthCarry: 0,
        hue,
        vigor,
        noiseOffset: rng.range(-200, 200),
        maxNodes: rng.int(70, 138),
        dead: false,
      });
    };

    const pointerToWorld = (px: number, py: number): WorldVec2 => {
      const nx = px / Math.max(1, width);
      const ny = py / Math.max(1, height);

      return {
        x: (nx - 0.5) * worldConfig.width * 1.12,
        z: (1 - ny) * worldConfig.depth,
      };
    };

    const clientToCanvas = (clientX: number, clientY: number): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const applyZoomRatio = (ratio: number): void => {
      targetDetailZoom = clamp(
        targetDetailZoom * Math.pow(ratio, 2.25),
        minDetailZoom,
        maxDetailZoom,
      );
    };

    const spawnShockwave = (x: number, y: number): void => {
      const world = pointerToWorld(x, y);

      shockwaves.push({
        x,
        y,
        worldX: world.x,
        worldZ: world.z,
        age: 0,
        life: rng.range(2.1, 3.3),
        speed: rng.range(8.6, 11.8),
        pixelSpeed: rng.range(310, 460),
        amplitude: rng.range(0.5, 1.1),
      });

      if (shockwaves.length > 6) {
        shockwaves.shift();
      }
    };

    const terrainHeight = (x: number, z: number, t: number): number => {
      const detailLod = Math.log2(Math.max(0.001, detailZoom));
      const detailFreq = Math.pow(2, detailLod * 1.18);
      const detailBlend = clamp((detailLod + 1.5) / 7.8, 0, 1);
      const baseOctaves = detailOctaves(4, detailZoom, 1.9, 18);
      const ridgeOctaves = detailOctaves(3, detailZoom, 1.58, 16);
      const microOctaves = detailOctaves(2, detailZoom, 1.34, 14);
      const ultraOctaves = detailOctaves(1.4, detailZoom, 1.08, 12);
      const zoomedFreq = 0.04 * detailFreq;
      const flow = t * (0.095 + detailBlend * 0.042);

      const base = fbm2D(
        noise,
        x * zoomedFreq,
        (z + flow * 8) * zoomedFreq,
        baseOctaves,
        2.03,
        0.52,
      );
      const ridgeRaw = fbm2D(
        noise,
        x * zoomedFreq * 1.55 + 17.2,
        (z - flow * 12) * zoomedFreq * 1.55 - 28.7,
        ridgeOctaves,
        2.16,
        0.58,
      );
      const ridge = 1 - Math.abs(ridgeRaw);
      const micro = fbm2D(
        noise,
        x * zoomedFreq * 3.8 - 63.7,
        (z + flow * 18) * zoomedFreq * 3.8 + 41.2,
        microOctaves,
        2.28,
        0.47,
      );
      const ultra = fbm2D(
        noise,
        x * zoomedFreq * 8.1 + 121.3,
        (z - flow * 27) * zoomedFreq * 8.1 - 94.2,
        ultraOctaves,
        2.41,
        0.43,
      );

      let heightValue =
        base * 2.7 +
        ridge * 1.4 +
        micro * (0.16 + detailBlend * 1.45) +
        ultra * clamp(detailLod * 0.24, 0, 2.15);

      const pointerWorld = pointerToWorld(pointer.x, pointer.y);
      const dx = x - pointerWorld.x;
      const dz = z - pointerWorld.z;
      const pointerField = Math.exp(-(dx * dx + dz * dz) * 0.11) * (pointer.active ? 2.65 : 1.2);
      heightValue += pointerField * Math.sin(t * 2.35 + dx * 0.7) * 0.75;

      for (let i = shockwaves.length - 1; i >= 0; i -= 1) {
        const wave = shockwaves[i];
        const radius = wave.age * wave.speed;
        const distance = Math.hypot(x - wave.worldX, z - wave.worldZ);
        const ring = distance - radius;
        const envelope = Math.exp(-(ring * ring) / 3.5);
        const decay = 1 - wave.age / wave.life;
        heightValue += Math.sin(ring * 2.6 - wave.age * 8.2) * envelope * wave.amplitude * decay * 1.1;
      }

      return heightValue;
    };

    const screenShock = (x: number, y: number): Vec2 => {
      let fx = 0;
      let fy = 0;

      for (let i = 0; i < shockwaves.length; i += 1) {
        const wave = shockwaves[i];
        const radius = wave.age * wave.pixelSpeed;
        const dx = x - wave.x;
        const dy = y - wave.y;
        const dist = Math.hypot(dx, dy) + 0.001;
        const ring = dist - radius;
        const envelope = Math.exp(-(ring * ring) / 6500);
        const decay = 1 - wave.age / wave.life;
        const force = envelope * decay * 2.5;

        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      return { x: fx, y: fy };
    };

    const initializeScene = (): void => {
      stars = createStars();
      structures.length = 0;
      tendrils.length = 0;
      shockwaves.length = 0;

      for (let i = 0; i < maxStructures; i += 1) {
        const kind = i % 3 === 2 ? 'impossible' : i % 3 === 1 ? 'torus' : 'polyhedron';
        structures.push(createStructure(kind));
      }

      for (let i = 0; i < 8; i += 1) {
        const edgeBias = rng.next();
        let x = width * rng.range(0.1, 0.9);
        let y = height * rng.range(0.66, 0.96);
        let angle = -Math.PI / 2 + rng.range(-0.65, 0.65);

        if (edgeBias < 0.28) {
          x = rng.next() < 0.5 ? width * rng.range(0.01, 0.08) : width * rng.range(0.92, 0.99);
          y = height * rng.range(0.45, 0.86);
          angle = rng.next() < 0.5 ? rng.range(-0.4, 0.6) : rng.range(2.55, 3.55);
        }

        spawnTendril(x, y, angle, (seedHue + rng.range(80, 190)) % 360, rng.range(0.65, 1.15));
      }
    };

    const resize = (): void => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = createStars();

      if (!pointer.active) {
        pointer.x = width * 0.5;
        pointer.y = height * 0.72;
      }
    };

    const updateStructures = (dt: number, t: number): void => {
      for (let i = 0; i < structures.length; i += 1) {
        const s = structures[i];
        const orbitT = t * s.orbitSpeed + s.orbitPhase;

        s.position.x = s.basePosition.x + Math.cos(orbitT * 0.95) * s.orbitRadius;
        s.position.y = s.basePosition.y + Math.sin(orbitT * 1.28) * 0.7;
        s.position.z = s.basePosition.z + Math.sin(orbitT * 0.72) * 2.5;

        s.rotation.x += s.rotationVelocity.x * dt;
        s.rotation.y += s.rotationVelocity.y * dt;
        s.rotation.z += s.rotationVelocity.z * dt;
      }
    };

    const updateTendrils = (dt: number, t: number, palette: Palette): void => {
      tendrilSpawnTimer += dt;
      const spawnCadence = 0.75;

      if (tendrilSpawnTimer >= spawnCadence) {
        tendrilSpawnTimer = 0;

        const x = width * rng.range(0.12, 0.88);
        const y = height * rng.range(0.74, 0.97);
        const dir = -Math.PI / 2 + rng.range(-0.55, 0.55);
        const hue = (palette.tendril + rng.range(-18, 22)) % 360;
        spawnTendril(x, y, dir, hue, rng.range(0.62, 1.22));
      }

      for (let i = tendrils.length - 1; i >= 0; i -= 1) {
        const tendril = tendrils[i];
        if (tendril.dead) {
          tendrils.splice(i, 1);
          continue;
        }

        tendril.growthCarry += dt * (36 + tendril.vigor * 28);

        let growthSteps = 0;
        while (tendril.growthCarry >= 1 && growthSteps < 8) {
          growthSteps += 1;
          tendril.growthCarry -= 1;

          const head = tendril.nodes[tendril.nodes.length - 1];
          const noiseInfluence = noise.noise3D(
            head.x * 0.0036 + tendril.noiseOffset,
            head.y * 0.0036 - tendril.noiseOffset,
            t * 0.46,
          );

          let targetDirection = tendril.direction + noiseInfluence * 1.08;
          let steerResponse = 0.55;
          let pointerPullX = 0;
          let pointerPullY = 0;

          if (pointer.active) {
            const dx = pointer.x - head.x;
            const dy = pointer.y - head.y;
            const dist = Math.hypot(dx, dy) + 0.001;
            const attract = clamp(1 - dist / (Math.max(width, height) * 1.8), 0, 1);
            const attractCurve = Math.pow(attract, 0.62);
            const pointerAngle = Math.atan2(dy, dx);
            targetDirection = tendril.direction + noiseInfluence * (0.22 + (1 - attractCurve) * 0.22);
            targetDirection = lerpAngle(targetDirection, pointerAngle, 0.6 + attractCurve * 0.36);
            steerResponse = clamp(0.78 + attractCurve * 0.18, 0.78, 0.96);

            const pull = attractCurve * (3.6 + tendril.vigor * 3.4);
            pointerPullX = (dx / dist) * pull;
            pointerPullY = (dy / dist) * pull * 0.92;
          }

          const shock = screenShock(head.x, head.y);
          if (Math.abs(shock.x) + Math.abs(shock.y) > 0.001) {
            const shockAngle = Math.atan2(shock.y, shock.x);
            targetDirection = lerpAngle(targetDirection, shockAngle, pointer.active ? 0.12 : 0.21);
          }

          tendril.direction = lerpAngle(tendril.direction, targetDirection, steerResponse);

          const stepLength = 2.3 + tendril.vigor * 1.25 + rng.range(0, 1.7);
          const upwardBias = -0.52 - (1.25 - tendril.vigor) * 0.15;

          const nextX =
            head.x + Math.cos(tendril.direction) * stepLength + shock.x * 0.7 + pointerPullX;
          const nextY =
            head.y +
            Math.sin(tendril.direction) * stepLength +
            upwardBias +
            shock.y * 0.7 +
            pointerPullY;

          const nextThickness = Math.max(0.65, head.thickness * rng.range(0.982, 0.996));

          tendril.nodes.push({
            x: nextX,
            y: nextY,
            thickness: nextThickness,
            energy: Math.max(0.24, head.energy * 0.986),
          });

          if (
            rng.next() < 0.012 * tendril.vigor &&
            tendrils.length < maxTendrils &&
            tendril.nodes.length > 24
          ) {
            spawnTendril(
              nextX,
              nextY,
              tendril.direction + rng.range(-1.35, 1.35),
              (tendril.hue + rng.range(-24, 32) + 360) % 360,
              clamp(tendril.vigor * rng.range(0.7, 0.94), 0.4, 1),
            );
          }

          if (tendril.nodes.length > tendril.maxNodes) {
            tendril.nodes.shift();
          }

          if (
            nextX < -80 ||
            nextX > width + 80 ||
            nextY < -90 ||
            nextY > height + 120 ||
            tendril.nodes.length < 4
          ) {
            tendril.dead = true;
            break;
          }
        }
      }
    };

    const updateShockwaves = (dt: number): void => {
      for (let i = shockwaves.length - 1; i >= 0; i -= 1) {
        shockwaves[i].age += dt;
        if (shockwaves[i].age >= shockwaves[i].life) {
          shockwaves.splice(i, 1);
        }
      }
    };

    const renderBackground = (palette: Palette, t: number): void => {
      ctx.globalCompositeOperation = 'source-over';

      const coreX = width * 0.5 + (pointer.active ? (pointer.x - width * 0.5) * 0.08 : 0);
      const coreY = height * 0.36 + (pointer.active ? (pointer.y - height * 0.5) * 0.04 : 0);

      const radial = ctx.createRadialGradient(coreX, coreY, 0, width * 0.5, height * 0.7, Math.max(width, height));
      radial.addColorStop(0, `hsla(${palette.skyA}, 58%, 8%, 1)`);
      radial.addColorStop(0.55, `hsla(${palette.skyB}, 46%, 5%, 1)`);
      radial.addColorStop(1, 'rgba(2, 3, 10, 1)');

      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, width, height);

      const vignette = ctx.createLinearGradient(0, 0, 0, height);
      vignette.addColorStop(0, 'rgba(2, 3, 8, 0.35)');
      vignette.addColorStop(0.5, 'rgba(1, 2, 6, 0.02)');
      vignette.addColorStop(1, 'rgba(2, 3, 9, 0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `hsla(${(palette.root + 170 + Math.sin(t * 0.4) * 16) % 360}, 75%, 54%, 0.04)`;
      ctx.fillRect(0, 0, width, height * 0.42);
    };

    const renderStars = (palette: Palette, t: number): void => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];

        const parallaxX = (pointer.active ? (pointer.x / width - 0.5) * 34 * star.depth : 0) +
          Math.sin(t * 0.05 + star.phase) * 0.8;
        const parallaxY = (pointer.active ? (pointer.y / height - 0.5) * 16 * star.depth : 0) +
          Math.cos(t * 0.06 + star.phase) * 0.4;

        const x = star.u * width + parallaxX;
        const y = star.v * height + parallaxY;

        const twinkle = 0.45 + 0.55 * Math.sin(t * star.twinkleSpeed + star.phase);
        const alpha = 0.15 + twinkle * 0.62;

        ctx.fillStyle = `hsla(${(palette.skyB + star.hueOffset + 360) % 360}, 72%, 88%, ${alpha})`;
        const size = star.size * (0.75 + twinkle * 0.65);
        ctx.fillRect(x, y, size, size);

        if (size > 1.45 && twinkle > 0.72) {
          ctx.strokeStyle = `hsla(${palette.auroraA}, 72%, 82%, ${alpha * 0.35})`;
          ctx.lineWidth = 0.65;
          ctx.beginPath();
          ctx.moveTo(x - size * 1.6, y + size * 0.5);
          ctx.lineTo(x + size * 2.2, y + size * 0.5);
          ctx.moveTo(x + size * 0.5, y - size * 1.6);
          ctx.lineTo(x + size * 0.5, y + size * 2.2);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    const renderAurora = (palette: Palette, t: number): void => {
      const layers = 5;
      const auroraDetailZoom = clamp(detailZoom, minDetailZoom, 96);
      const detailFreq = Math.pow(auroraDetailZoom, 0.92);
      const detailBlend = clamp((Math.log2(Math.max(0.001, auroraDetailZoom)) + 1.2) / 7, 0, 1);
      const auroraOctaves = detailOctaves(2, auroraDetailZoom, 0.82, 7);
      const auroraScale = Math.pow(auroraDetailZoom, 0.08);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let layer = 0; layer < layers; layer += 1) {
        const layerMix = layer / (layers - 1);
        const baseY = height * (0.16 + layerMix * 0.2);
        const amplitude = height * (0.12 - layerMix * 0.038) * (1.3 / auroraScale);
        const thicknessBase = 22 + (1 - layerMix) * 22;

        const top: Vec2[] = [];
        const bottom: Vec2[] = [];
        const center: Vec2[] = [];

        const step = 18;
        for (let x = -32; x <= width + 32; x += step) {
          const nx = x * 0.0023 * detailFreq;
          const flow = t * 0.17 + layer * 0.35;

          const n1 = noise.noise3D(nx + 11.2, layer * 0.42, flow);
          const n2 = noise.noise2D(nx * 1.7 - flow * 0.31, layer * 1.2 + 5.1);
          const nDetail = fbm2D(
            noise,
            nx * 3.6 + layer * 1.7,
            flow * 0.85 + layer * 0.9,
            auroraOctaves,
            2.04,
            0.52,
          );
          const sway = Math.sin(nx * 4.4 + flow * 2.3 + layer * 1.4) * (0.28 + detailBlend * 0.2);

          const centerY =
            baseY + n1 * amplitude + n2 * amplitude * 0.38 + nDetail * amplitude * (0.1 + detailBlend * 0.35) + sway * amplitude;
          const thickness =
            thicknessBase +
            n2 * 12 +
            nDetail * 8 * detailBlend +
            Math.sin(flow + nx * 3.2) * (6 + detailBlend * 3.8);

          top.push({ x, y: centerY - thickness });
          bottom.push({ x, y: centerY + thickness });
          center.push({ x, y: centerY });
        }

        ctx.beginPath();
        ctx.moveTo(top[0].x, top[0].y);
        for (let i = 1; i < top.length; i += 1) {
          ctx.lineTo(top[i].x, top[i].y);
        }
        for (let i = bottom.length - 1; i >= 0; i -= 1) {
          ctx.lineTo(bottom[i].x, bottom[i].y);
        }
        ctx.closePath();

        const layerHueA = (palette.auroraA + layer * 16 + Math.sin(t * 0.29 + layer) * 12 + 360) % 360;
        const layerHueB = (palette.auroraB + layer * 11 + Math.cos(t * 0.21 + layer) * 10 + 360) % 360;

        const grad = ctx.createLinearGradient(0, baseY - amplitude, 0, baseY + amplitude + thicknessBase);
        grad.addColorStop(0, `hsla(${layerHueA}, 96%, 60%, 0)`);
        grad.addColorStop(0.34, `hsla(${layerHueA}, 88%, 58%, ${0.14 + (1 - layerMix) * 0.16})`);
        grad.addColorStop(0.66, `hsla(${layerHueB}, 90%, 55%, ${0.12 + (1 - layerMix) * 0.14})`);
        grad.addColorStop(1, `hsla(${layerHueB}, 96%, 40%, 0)`);

        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(center[0].x, center[0].y);
        for (let i = 1; i < center.length; i += 1) {
          ctx.lineTo(center[i].x, center[i].y);
        }

        ctx.strokeStyle = `hsla(${layerHueA}, 100%, 82%, ${0.08 + (1 - layerMix) * 0.12})`;
        ctx.lineWidth = 1.1 + (1 - layerMix) * 1.5;
        ctx.stroke();
      }

      ctx.restore();
    };

    const renderTerrain = (palette: Palette, t: number): void => {
      const rows = worldConfig.rows;
      const cols = worldConfig.cols;
      const worldWidth = worldConfig.width;
      const worldDepth = worldConfig.depth;

      const pointerWorld = pointerToWorld(pointer.x, pointer.y);
      const flowZ = t * 2.8;

      type TerrainPoint = {
        x: number;
        y: number;
        h: number;
        depth: number;
      };

      let previousRow: TerrainPoint[] | null = null;

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      for (let row = 0; row < rows; row += 1) {
        const rowT = row / (rows - 1);
        const z = rowT * worldDepth + flowZ;
        const spread = 1 + rowT * 0.4;

        const currentRow: TerrainPoint[] = [];

        for (let col = 0; col < cols; col += 1) {
          const colT = col / (cols - 1);
          const x = (colT - 0.5) * worldWidth * spread;

          const h = terrainHeight(x, z, t);
          const projected = projectPoint({ x, y: h, z }, camera, width, height);
          if (!projected) {
            continue;
          }

          currentRow.push({
            x: projected.x,
            y: projected.y,
            h,
            depth: projected.depth,
          });
        }

        if (previousRow && currentRow.length === previousRow.length && currentRow.length > 2) {
          const avgHeight =
            currentRow.reduce((sum, p) => sum + p.h, 0) / Math.max(1, currentRow.length);
          const avgDepth =
            currentRow.reduce((sum, p) => sum + p.depth, 0) / Math.max(1, currentRow.length);

          const pointerDist = Math.hypot(pointerWorld.x, z - pointerWorld.z);
          const proximityGlow = Math.exp(-(pointerDist * pointerDist) * 0.02);

          const fog = clamp((avgDepth - 8) / 32, 0, 1);
          const hue = lerp(palette.terrainA, palette.terrainB, rowT) + avgHeight * 6;
          const sat = lerp(64, 34, fog);
          const light = clamp(lerp(31, 11, fog) + avgHeight * 2.4 + proximityGlow * 7, 6, 42);
          const alpha = clamp(lerp(0.66, 0.2, fog), 0.1, 0.75);

          ctx.beginPath();
          ctx.moveTo(previousRow[0].x, previousRow[0].y);
          for (let i = 1; i < previousRow.length; i += 1) {
            ctx.lineTo(previousRow[i].x, previousRow[i].y);
          }
          for (let i = currentRow.length - 1; i >= 0; i -= 1) {
            ctx.lineTo(currentRow[i].x, currentRow[i].y);
          }
          ctx.closePath();

          ctx.fillStyle = `hsla(${(hue + 360) % 360}, ${sat}%, ${light}%, ${alpha})`;
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(currentRow[0].x, currentRow[0].y);
          for (let i = 1; i < currentRow.length; i += 1) {
            ctx.lineTo(currentRow[i].x, currentRow[i].y);
          }
          ctx.strokeStyle = `hsla(${(hue + 30) % 360}, 88%, ${Math.min(70, light + 20)}%, ${
            0.12 + proximityGlow * 0.22
          })`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        previousRow = currentRow;
      }

      const fog = ctx.createLinearGradient(0, height * 0.2, 0, height);
      fog.addColorStop(0, 'rgba(5, 8, 18, 0)');
      fog.addColorStop(0.68, 'rgba(6, 8, 18, 0.18)');
      fog.addColorStop(1, 'rgba(4, 5, 14, 0.48)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, width, height);

      ctx.restore();
    };

    const renderStructures = (palette: Palette, t: number): void => {
      const structureDetailZoom = clamp(detailZoom, minDetailZoom, 72);
      const detailFreq = Math.pow(structureDetailZoom, 0.78);
      const detailBlend = clamp((structureDetailZoom - 1) / 6.5, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < structures.length; i += 1) {
        const structure = structures[i];
        const projectedPoints: Array<{ x: number; y: number; depth: number } | null> =
          new Array(structure.geometry.points.length).fill(null);

        for (let p = 0; p < structure.geometry.points.length; p += 1) {
          const basePoint = structure.geometry.points[p];
          const basePulse = noise.noise3D(
            basePoint.x * 0.9 * detailFreq + structure.seedOffset,
            basePoint.y * 0.9 * detailFreq - structure.seedOffset,
            t * structure.morphRate,
          );
          const finePulse = noise.noise3D(
            basePoint.x * 2.35 * detailFreq - structure.seedOffset * 0.53,
            basePoint.y * 2.1 * detailFreq + structure.seedOffset * 0.41,
            t * structure.morphRate * 1.38 + structure.seedOffset * 0.022,
          );
          const pulse =
            (basePulse * (1 - detailBlend * 0.45) + finePulse * detailBlend * 0.62) *
            structure.morphAmount;

          const distorted: Vec3 = {
            x: basePoint.x * structure.scale * (1 + pulse * 0.6),
            y: basePoint.y * structure.scale * (1 + pulse * 0.45),
            z: basePoint.z * structure.scale * (1 + pulse * 0.6),
          };

          const rotated = rotatePoint(distorted, structure.rotation);
          let worldPoint: Vec3 = {
            x: rotated.x + structure.position.x,
            y: rotated.y + structure.position.y,
            z: rotated.z + structure.position.z,
          };

          for (let w = 0; w < shockwaves.length; w += 1) {
            const wave = shockwaves[w];
            const radius = wave.age * wave.speed;
            const dist = Math.hypot(worldPoint.x - wave.worldX, worldPoint.z - wave.worldZ);
            const ring = dist - radius;
            const impulse = Math.exp(-(ring * ring) / 4.4) * (1 - wave.age / wave.life);
            worldPoint = {
              x: worldPoint.x,
              y: worldPoint.y + Math.sin(ring * 1.8 + t * 8) * impulse * 0.85,
              z: worldPoint.z,
            };
          }

          projectedPoints[p] = projectPoint(worldPoint, camera, width, height);
        }

        for (let s = 0; s < structure.geometry.segments.length; s += 1) {
          const [aIndex, bIndex] = structure.geometry.segments[s];
          const a = projectedPoints[aIndex];
          const b = projectedPoints[bIndex];

          if (!a || !b) {
            continue;
          }

          const depth = (a.depth + b.depth) * 0.5;
          const fog = clamp((depth - 8) / 24, 0, 1);
          const hue =
            (palette.structure + structure.hueOffset + Math.sin(t * 0.5 + i) * 22 + 360) % 360;
          const alpha = clamp(0.55 - fog * 0.42, 0.1, 0.6);

          ctx.strokeStyle = `hsla(${hue}, 94%, ${58 + Math.sin(t + s * 0.07) * 10}%, ${alpha})`;
          ctx.lineWidth = clamp(2.2 * (1 - fog) * structure.scale, 0.55, 2.8);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();

          if (structure.kind !== 'polyhedron' && s % 4 === 0) {
            ctx.strokeStyle = `hsla(${(hue + 30) % 360}, 90%, 80%, ${alpha * 0.33})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    };

    const renderTendrils = (palette: Palette, t: number): void => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < tendrils.length; i += 1) {
        const tendril = tendrils[i];
        if (tendril.nodes.length < 3) {
          continue;
        }

        const pulse = 0.5 + 0.5 * Math.sin(t * 2.8 + tendril.noiseOffset);
        const glowHue = (tendril.hue + palette.tendril * 0.2 + 360) % 360;

        renderSplinePath(ctx, tendril.nodes);
        ctx.strokeStyle = `hsla(${glowHue}, 96%, 62%, ${0.08 + pulse * 0.08})`;
        ctx.lineWidth = tendril.nodes[0].thickness * (2.3 + pulse * 1.8);
        ctx.stroke();

        renderSplinePath(ctx, tendril.nodes);
        ctx.strokeStyle = `hsla(${(glowHue + 16) % 360}, 98%, 74%, ${0.2 + pulse * 0.16})`;
        ctx.lineWidth = tendril.nodes[0].thickness * (0.7 + pulse * 0.45);
        ctx.stroke();

        const tip = tendril.nodes[tendril.nodes.length - 1];
        const tipJitter = noise.noise2D(t * 2.1 + i * 0.8, tendril.noiseOffset * 0.04);
        const radius = tip.thickness * (0.85 + pulse * 0.9);

        ctx.fillStyle = `hsla(${(glowHue + 24) % 360}, 100%, 78%, ${0.28 + pulse * 0.28})`;
        ctx.beginPath();
        ctx.arc(tip.x + tipJitter * 1.5, tip.y + tipJitter, radius, 0, TAU);
        ctx.fill();
      }

      ctx.restore();
    };

    const renderShockwaves = (palette: Palette): void => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < shockwaves.length; i += 1) {
        const wave = shockwaves[i];
        const radius = wave.age * wave.pixelSpeed;
        const decay = 1 - wave.age / wave.life;

        ctx.strokeStyle = `hsla(${(palette.structure + i * 18 + 360) % 360}, 92%, 72%, ${0.05 + decay * 0.16})`;
        ctx.lineWidth = 1.2 + decay * 2.6;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = `hsla(${(palette.auroraA + i * 23 + 360) % 360}, 96%, 82%, ${0.03 + decay * 0.12})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius * 0.72, 0, TAU);
        ctx.stroke();
      }

      ctx.restore();
    };

    const update = (dt: number): void => {
      elapsed += dt;
      detailZoom = Math.exp(
        lerp(
          Math.log(Math.max(minDetailZoom, detailZoom)),
          Math.log(Math.max(minDetailZoom, targetDetailZoom)),
          clamp(dt * 5.1, 0.02, 0.32),
        ),
      );

      const palette = createPalette(elapsed, seedHue);

      updateShockwaves(dt);
      updateStructures(dt, elapsed);
      updateTendrils(dt, elapsed, palette);
    };

    const render = (): void => {
      const palette = createPalette(elapsed, seedHue);

      renderBackground(palette, elapsed);
      renderStars(palette, elapsed);
      renderAurora(palette, elapsed);
      renderTerrain(palette, elapsed);
      renderStructures(palette, elapsed);
      renderTendrils(palette, elapsed);
      renderShockwaves(palette);
    };

    const frame = (time: number): void => {
      const dt = Math.min((time - previousTime) / 1000, 1 / 20);
      previousTime = time;

      update(dt);
      render();

      raf = window.requestAnimationFrame(frame);
    };

    const setPointer = (x: number, y: number): void => {
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;
    };

    const onMouseMove = (event: MouseEvent): void => {
      const local = clientToCanvas(event.clientX, event.clientY);
      setPointer(local.x, local.y);
    };

    const onMouseLeave = (): void => {
      pointer.active = false;
    };

    const onMouseDown = (event: MouseEvent): void => {
      const local = clientToCanvas(event.clientX, event.clientY);
      spawnShockwave(local.x, local.y);
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const ratio = Math.exp(-event.deltaY * 0.0011);
      applyZoomRatio(ratio);
    };

    const onTouchStart = (event: TouchEvent): void => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        const local = clientToCanvas(touch.clientX, touch.clientY);
        setPointer(local.x, local.y);
        spawnShockwave(local.x, local.y);
      }

      if (event.touches.length >= 2) {
        const a = event.touches[0];
        const b = event.touches[1];
        const dx = b.clientX - a.clientX;
        const dy = b.clientY - a.clientY;

        pinch.active = true;
        pinch.distance = Math.hypot(dx, dy);
        pinch.midpointX = (a.clientX + b.clientX) * 0.5;
        pinch.midpointY = (a.clientY + b.clientY) * 0.5;
        const local = clientToCanvas(pinch.midpointX, pinch.midpointY);
        setPointer(local.x, local.y);
      }

      event.preventDefault();
    };

    const onTouchMove = (event: TouchEvent): void => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        const local = clientToCanvas(touch.clientX, touch.clientY);
        setPointer(local.x, local.y);
      }

      if (event.touches.length >= 2) {
        const a = event.touches[0];
        const b = event.touches[1];
        const dx = b.clientX - a.clientX;
        const dy = b.clientY - a.clientY;

        const distance = Math.hypot(dx, dy);
        if (pinch.active && pinch.distance > 0) {
          const ratio = distance / pinch.distance;
          applyZoomRatio(ratio);
        }

        pinch.distance = distance;
        pinch.midpointX = (a.clientX + b.clientX) * 0.5;
        pinch.midpointY = (a.clientY + b.clientY) * 0.5;
        const local = clientToCanvas(pinch.midpointX, pinch.midpointY);
        setPointer(local.x, local.y);
      }

      event.preventDefault();
    };

    const onTouchEnd = (event: TouchEvent): void => {
      if (event.touches.length === 0) {
        pointer.active = false;
        pinch.active = false;
        return;
      }

      if (event.touches.length === 1) {
        const touch = event.touches[0];
        const local = clientToCanvas(touch.clientX, touch.clientY);
        setPointer(local.x, local.y);
        pinch.active = false;
        return;
      }

      const a = event.touches[0];
      const b = event.touches[1];
      const dx = b.clientX - a.clientX;
      const dy = b.clientY - a.clientY;
      pinch.distance = Math.hypot(dx, dy);
      pinch.midpointX = (a.clientX + b.clientX) * 0.5;
      pinch.midpointY = (a.clientY + b.clientY) * 0.5;
      pinch.active = true;
      const local = clientToCanvas(pinch.midpointX, pinch.midpointY);
      setPointer(local.x, local.y);
    };

    resize();
    initializeScene();

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('wheel', onWheel, { passive: false });

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);

      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('wheel', onWheel);

      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#02030a]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Procedural generative universe"
      />

      <div className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 px-6 text-center">
        <h1
          className="text-[clamp(1rem,2.2vw,1.45rem)] font-normal tracking-[0.26em] text-white/90"
          style={{
            fontFamily: '"Cormorant Garamond", "Times New Roman", serif',
            textShadow:
              '0 0 14px rgba(167, 223, 255, 0.28), 0 0 28px rgba(97, 175, 255, 0.16), 0 0 44px rgba(115, 246, 201, 0.12)',
          }}
        >
          A Universe That Never Repeats
        </h1>
      </div>

      <footer
        className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 px-4 text-center text-[11px] tracking-[0.12em] text-slate-200/70 sm:text-xs"
        style={{
          fontFamily: '"Cormorant Garamond", "Times New Roman", serif',
          textShadow: '0 0 18px rgba(146, 199, 255, 0.2)',
        }}
      >
        Procedurally generated • Codex CLI multi-agent • gpt-5.3-codex
      </footer>
    </main>
  );
}
