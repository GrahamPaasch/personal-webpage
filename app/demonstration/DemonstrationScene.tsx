'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Environment,
  Float,
  MeshDistortMaterial,
  OrbitControls,
  Sphere,
  Stars,
} from '@react-three/drei';
import { MathUtils } from 'three';
import type { Mesh, Vector2 } from 'three';

type OrbiterConfig = {
  color: string;
  distort: number;
  orbitRadius: number;
  orbitSpeed: number;
  phase: number;
  size: number;
  yAmplitude: number;
};

const ORBITERS: OrbiterConfig[] = [
  {
    color: '#46f0ff',
    distort: 0.28,
    orbitRadius: 2.6,
    orbitSpeed: 0.85,
    phase: 0.3,
    size: 0.34,
    yAmplitude: 0.24,
  },
  {
    color: '#ff58be',
    distort: 0.24,
    orbitRadius: 3.35,
    orbitSpeed: 0.62,
    phase: 1.9,
    size: 0.42,
    yAmplitude: 0.3,
  },
  {
    color: '#8bff7a',
    distort: 0.31,
    orbitRadius: 4.1,
    orbitSpeed: 0.48,
    phase: 3.2,
    size: 0.38,
    yAmplitude: 0.22,
  },
  {
    color: '#ffc857',
    distort: 0.2,
    orbitRadius: 4.75,
    orbitSpeed: 0.37,
    phase: 4.6,
    size: 0.3,
    yAmplitude: 0.18,
  },
];

function pointerProximity(pointer: Vector2): number {
  const distance = pointer.length();
  return MathUtils.clamp(1 - distance / 0.85, 0, 1);
}

function CentralCore() {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<any>(null!);
  const distortRef = useRef(0.32);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;

    if (!mesh || !material) {
      return;
    }

    const elapsed = state.clock.getElapsedTime();
    const proximity = pointerProximity(state.pointer as Vector2);
    const breathing = Math.sin(elapsed * 0.75) * 0.08;
    const targetDistort = 0.28 + breathing + proximity * 0.72;

    distortRef.current = MathUtils.damp(
      distortRef.current,
      targetDistort,
      4.2,
      delta,
    );

    material.distort = distortRef.current;

    const hue = (elapsed * 0.06 + proximity * 0.35) % 1;
    material.color.setHSL(hue, 0.88, 0.55);
    material.emissive.setHSL((hue + 0.2) % 1, 0.88, 0.34);

    mesh.rotation.x = elapsed * 0.18;
    mesh.rotation.y = elapsed * 0.24;
    mesh.scale.setScalar(1 + proximity * 0.07);
  });

  return (
    <Float
      speed={1.4}
      rotationIntensity={0.45}
      floatIntensity={0.55}
    >
      <Sphere
        args={[1.4, 96, 96]}
        ref={meshRef}
      >
        <MeshDistortMaterial
          clearcoat={1}
          clearcoatRoughness={0.08}
          color="#5bc8ff"
          distort={0.32}
          emissive="#32196f"
          emissiveIntensity={1.55}
          metalness={0.95}
          ref={materialRef}
          roughness={0.08}
          speed={1.4}
        />
      </Sphere>
    </Float>
  );
}

function OrbitingSphere({ config }: { config: OrbiterConfig }) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<any>(null!);

  useFrame((state) => {
    const mesh = meshRef.current;
    const material = materialRef.current;

    if (!mesh || !material) {
      return;
    }

    const elapsed = state.clock.getElapsedTime();
    const angle = elapsed * config.orbitSpeed + config.phase;

    mesh.position.set(
      Math.cos(angle) * config.orbitRadius,
      Math.sin(angle * 1.35 + config.phase) * config.yAmplitude,
      Math.sin(angle) * config.orbitRadius,
    );

    mesh.rotation.x = angle * 0.5;
    mesh.rotation.y = angle * 0.9;

    material.distort =
      config.distort + Math.sin(elapsed * 1.25 + config.phase) * 0.06;
  });

  return (
    <Float
      speed={1 + config.orbitSpeed * 0.25}
      rotationIntensity={0.5}
      floatIntensity={0.35}
    >
      <Sphere
        args={[config.size, 48, 48]}
        ref={meshRef}
      >
        <MeshDistortMaterial
          color={config.color}
          distort={config.distort}
          emissive={config.color}
          emissiveIntensity={0.95}
          metalness={0.8}
          ref={materialRef}
          roughness={0.18}
          speed={1.1}
        />
      </Sphere>
    </Float>
  );
}

function Scene() {
  return (
    <>
      <ambientLight
        color="#6475aa"
        intensity={0.18}
      />
      <pointLight
        color="#4ba7ff"
        distance={22}
        intensity={62}
        position={[4.5, 3.4, 3.2]}
      />
      <pointLight
        color="#ff4ab5"
        distance={19}
        intensity={42}
        position={[-4, -2.8, -2.5]}
      />
      <pointLight
        color="#7a5dff"
        distance={24}
        intensity={36}
        position={[0, 5.8, -4.6]}
      />

      <Stars
        count={4600}
        depth={52}
        factor={3.2}
        fade
        radius={120}
        saturation={0.2}
        speed={0.65}
      />

      <CentralCore />
      {ORBITERS.map((config) => (
        <OrbitingSphere
          config={config}
          key={config.color}
        />
      ))}

      <Suspense fallback={null}>
        <Environment preset="night" />
      </Suspense>

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.32}
        dampingFactor={0.08}
        enableDamping
        enablePan={false}
        maxDistance={11}
        minDistance={4}
      />
    </>
  );
}

export default function DemonstrationScene() {
  return (
    <Canvas
      camera={{ fov: 48, position: [0, 0.2, 6.4] }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <color
        args={['#02030a']}
        attach="background"
      />
      <Scene />
    </Canvas>
  );
}
