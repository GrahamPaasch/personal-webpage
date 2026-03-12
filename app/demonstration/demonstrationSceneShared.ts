import * as THREE from "three";

export type OrbiterConfig = {
  color: string;
  distance: number;
  height: number;
  phase: number;
  radius: number;
  speed: number;
};

export type ParticleBurst = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  startTime: number;
  velocities: Float32Array;
};

export const ORBITERS: OrbiterConfig[] = [
  {
    color: "#54d7ff",
    distance: 2.5,
    height: 0.32,
    phase: 0.35,
    radius: 0.27,
    speed: 0.9,
  },
  {
    color: "#ff6db4",
    distance: 3.2,
    height: 0.42,
    phase: 1.5,
    radius: 0.34,
    speed: 0.66,
  },
  {
    color: "#8dff9e",
    distance: 4,
    height: 0.24,
    phase: 3.1,
    radius: 0.3,
    speed: 0.52,
  },
  {
    color: "#ffd46a",
    distance: 4.75,
    height: 0.2,
    phase: 4.4,
    radius: 0.24,
    speed: 0.41,
  },
];

export const centralVertexShader = `
uniform float uTime;
uniform float uMouseBoost;
uniform vec3 uPullPoint;
uniform float uPullStrength;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vDisplacement;
void main() {
  float t = uTime;
  vec3 transformed = position;
  float waveA = sin((position.x + t * 0.7) * 3.4) * cos((position.y - t * 0.9) * 4.1);
  float waveB = sin((position.z + t * 1.1) * 4.8) * cos((position.x - t * 0.4) * 3.2);
  float ripple = sin(length(position.xy) * 10.0 - t * 4.0);
  float displacement = (waveA * 0.09) + (waveB * 0.07) + (ripple * 0.03);
  displacement *= 1.0 + uMouseBoost * 2.0;
  transformed += normal * displacement;
  vec3 toPull = uPullPoint - transformed;
  float pullDist = length(toPull);
  float pullFactor = uPullStrength * smoothstep(0.8, 0.0, pullDist);
  transformed += normalize(toPull) * pullFactor * 1.5;
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  vDisplacement = displacement;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const centralFragmentShader = `
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vDisplacement;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.3);
  float hueWave = uTime * 0.22 + normal.x * 0.4 + normal.y * 0.35 + vDisplacement * 3.5;
  vec3 cyan = vec3(0.22, 0.88, 1.0);
  vec3 magenta = vec3(1.0, 0.35, 0.85);
  vec3 lime = vec3(0.75, 1.0, 0.45);
  float blendA = 0.5 + 0.5 * sin(6.28318 * hueWave);
  float blendB = 0.5 + 0.5 * sin(6.28318 * (hueWave + 0.33));
  vec3 iridescent = mix(cyan, magenta, blendA);
  iridescent = mix(iridescent, lime, blendB * 0.55);
  float keyLight = max(dot(normal, normalize(vec3(0.35, 0.8, 0.2))), 0.0);
  vec3 metallic = iridescent * (0.32 + keyLight * 0.68);
  vec3 glow = fresnel * vec3(1.15, 1.05, 1.4);
  gl_FragColor = vec4(metallic + glow, 1.0);
}
`;

export const orbiterVertexShader = `
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uPullPoint;
uniform float uPullStrength;
varying vec3 vNormal;
varying vec3 vWorldPosition;
void main() {
  vec3 transformed = position;
  float wave = sin(uTime * 1.9 + position.y * 9.0 + position.x * 5.0);
  transformed += normal * wave * uAmplitude;
  vec3 toPull = uPullPoint - transformed;
  float pullDist = length(toPull);
  float pullFactor = uPullStrength * smoothstep(0.8, 0.0, pullDist);
  transformed += normalize(toPull) * pullFactor * 1.5;
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const orbiterFragmentShader = `
uniform float uTime;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vWorldPosition;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
  float pulse = 0.5 + 0.5 * sin(uTime * 2.2 + vWorldPosition.y * 3.6);
  vec3 base = uColor * (0.45 + pulse * 0.55);
  vec3 rim = fresnel * (uColor * 0.8 + vec3(0.35));
  gl_FragColor = vec4(base + rim, 1.0);
}
`;

export function colorToVector(color: string): THREE.Vector3 {
  const parsed = new THREE.Color(color);
  return new THREE.Vector3(parsed.r, parsed.g, parsed.b);
}

export function createStarfield(
  count: number,
  radiusMin: number,
  radiusMax: number,
): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const r = THREE.MathUtils.randFloat(radiusMin, radiusMax);
    const theta = THREE.MathUtils.randFloat(0, Math.PI * 2);
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.cos(phi);
    positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: "#c7dcff",
    depthWrite: false,
    opacity: 0.92,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
  });

  return new THREE.Points(geometry, material);
}

export function createParticleBurst(
  origin: THREE.Vector3,
  color: THREE.Color,
  startTime: number,
): ParticleBurst {
  const count = 80;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] = origin.x;
    positions[i3 + 1] = origin.y;
    positions[i3 + 2] = origin.z;

    let x = THREE.MathUtils.randFloatSpread(2);
    let y = THREE.MathUtils.randFloatSpread(2);
    let z = THREE.MathUtils.randFloatSpread(2);
    const length = Math.sqrt(x * x + y * y + z * z) || 1;
    x /= length;
    y /= length;
    z /= length;

    const speed = THREE.MathUtils.randFloat(2, 5);
    velocities[i3] = x * speed;
    velocities[i3 + 1] = y * speed;
    velocities[i3 + 2] = z * speed;

    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    depthWrite: false,
    opacity: 1,
    size: 0.06,
    sizeAttenuation: true,
    transparent: true,
    vertexColors: true,
  });

  return {
    points: new THREE.Points(geometry, material),
    startTime,
    velocities,
  };
}

export function disposeParticleBurst(
  scene: THREE.Scene,
  burst: ParticleBurst | null,
): void {
  if (!burst) {
    return;
  }

  scene.remove(burst.points);
  burst.points.geometry.dispose();
  burst.points.material.dispose();
}
