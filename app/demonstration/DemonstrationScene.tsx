'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

type OrbiterConfig = {
  color: string;
  distance: number;
  height: number;
  phase: number;
  radius: number;
  speed: number;
};

type Orbiter = {
  config: OrbiterConfig;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
};

const ORBITERS: OrbiterConfig[] = [
  { color: '#54d7ff', distance: 2.5, height: 0.32, phase: 0.35, radius: 0.27, speed: 0.9 },
  { color: '#ff6db4', distance: 3.2, height: 0.42, phase: 1.5, radius: 0.34, speed: 0.66 },
  { color: '#8dff9e', distance: 4.0, height: 0.24, phase: 3.1, radius: 0.3, speed: 0.52 },
  { color: '#ffd46a', distance: 4.75, height: 0.2, phase: 4.4, radius: 0.24, speed: 0.41 },
];

const centralVertexShader = `
uniform float uTime;
uniform float uMouseBoost;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vDisplacement;
void main() {
  float t = uTime;
  vec3 displaced = position;
  float waveA = sin((position.x + t * 0.7) * 3.4) * cos((position.y - t * 0.9) * 4.1);
  float waveB = sin((position.z + t * 1.1) * 4.8) * cos((position.x - t * 0.4) * 3.2);
  float ripple = sin(length(position.xy) * 10.0 - t * 4.0);
  float displacement = (waveA * 0.09) + (waveB * 0.07) + (ripple * 0.03);
  displacement *= 1.0 + uMouseBoost * 2.0;
  displaced += normal * displacement;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  vDisplacement = displacement;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const centralFragmentShader = `
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

const orbiterVertexShader = `
uniform float uTime;
uniform float uAmplitude;
varying vec3 vNormal;
varying vec3 vWorldPosition;
void main() {
  vec3 displaced = position;
  float wave = sin(uTime * 1.9 + position.y * 9.0 + position.x * 5.0);
  displaced += normal * wave * uAmplitude;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const orbiterFragmentShader = `
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

function colorToVector(color: string): THREE.Vector3 {
  const parsed = new THREE.Color(color);
  return new THREE.Vector3(parsed.r, parsed.g, parsed.b);
}

function createStarfield(count: number, radiusMin: number, radiusMax: number): THREE.Points {
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
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#c7dcff',
    depthWrite: false,
    opacity: 0.92,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
  });

  return new THREE.Points(geometry, material);
}

export default function DemonstrationScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020410');
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 200);
    camera.position.set(0, 0.2, 6.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 10.5;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.36;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.1, 0.95, 0.08);
    bloomPass.strength = 1.25;
    bloomPass.radius = 0.9;
    bloomPass.threshold = 0.07;
    composer.addPass(bloomPass);
    const ambientLight = new THREE.AmbientLight('#6d7eab', 0.22);
    const keyLight = new THREE.PointLight('#4aa8ff', 85, 28, 2);
    keyLight.position.set(4.2, 3.4, 3.4);
    const fillLight = new THREE.PointLight('#ff4cae', 62, 24, 2);
    fillLight.position.set(-4.4, -2.7, -2.2);
    const rimLight = new THREE.PointLight('#7f5bff', 44, 30, 2);
    rimLight.position.set(0.2, 6.0, -5.4);
    scene.add(ambientLight, keyLight, fillLight, rimLight);
    const centralGeometry = new THREE.IcosahedronGeometry(1.3, 5);
    const centralMaterial = new THREE.ShaderMaterial({
      fragmentShader: centralFragmentShader,
      uniforms: {
        uMouseBoost: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: centralVertexShader,
    });
    const centralMesh = new THREE.Mesh(centralGeometry, centralMaterial);
    scene.add(centralMesh);
    const orbiters: Orbiter[] = ORBITERS.map((config) => {
      const geometry = new THREE.SphereGeometry(config.radius, 48, 48);
      const material = new THREE.ShaderMaterial({
        fragmentShader: orbiterFragmentShader,
        uniforms: {
          uAmplitude: { value: 0.06 + config.radius * 0.08 },
          uColor: { value: colorToVector(config.color) },
          uTime: { value: 0 },
        },
        vertexShader: orbiterVertexShader,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      return { config, material, mesh };
    });
    const starfield = createStarfield(4200, 16, 110);
    scene.add(starfield);
    const mouse = new THREE.Vector2(2, 2);
    let targetBoost = 0;
    let smoothedBoost = 0;
    let rafId = 0;
    const handlePointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      mouse.set(x, y);
      const distance = mouse.length();
      targetBoost = THREE.MathUtils.clamp(1 - distance / 0.75, 0, 1);
    };

    const handlePointerLeave = () => {
      mouse.set(2, 2);
      targetBoost = 0;
    };

    const handleResize = () => {
      const nextWidth = mount.clientWidth || window.innerWidth;
      const nextHeight = mount.clientHeight || window.innerHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(nextWidth, nextHeight, false);
      composer.setSize(nextWidth, nextHeight);
      bloomPass.setSize(nextWidth, nextHeight);
    };
    mount.addEventListener('pointermove', handlePointerMove);
    mount.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('resize', handleResize);
    const clock = new THREE.Clock();
    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      smoothedBoost += (targetBoost - smoothedBoost) * 0.09;
      centralMaterial.uniforms.uTime.value = elapsed;
      centralMaterial.uniforms.uMouseBoost.value = smoothedBoost;
      centralMesh.rotation.x = elapsed * 0.23;
      centralMesh.rotation.y = elapsed * 0.31;
      centralMesh.scale.setScalar(1 + smoothedBoost * 0.08);
      orbiters.forEach(({ config, material, mesh }, index) => {
        const angle = elapsed * config.speed + config.phase;
        mesh.position.set(
          Math.cos(angle) * config.distance,
          Math.sin(angle * 1.6 + config.phase) * config.height,
          Math.sin(angle) * config.distance,
        );
        mesh.rotation.x = angle * 0.55;
        mesh.rotation.y = angle * 0.95;
        material.uniforms.uTime.value = elapsed + index * 0.6;
      });
      starfield.rotation.y = elapsed * 0.012;
      starfield.rotation.x = Math.sin(elapsed * 0.05) * 0.02;
      controls.update();
      composer.render();
    };
    animate();
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      mount.removeEventListener('pointermove', handlePointerMove);
      mount.removeEventListener('pointerleave', handlePointerLeave);
      controls.dispose();
      composer.dispose();
      bloomPass.dispose();
      orbiters.forEach(({ material, mesh }) => {
        mesh.geometry.dispose();
        material.dispose();
      });
      centralGeometry.dispose();
      centralMaterial.dispose();
      (starfield.geometry as THREE.BufferGeometry).dispose();
      (starfield.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);
  return <div ref={mountRef} style={{ height: '100%', width: '100%' }} />;
}
