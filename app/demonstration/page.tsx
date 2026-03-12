'use client';

import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Environment,
  Float,
  MeshDistortMaterial,
  OrbitControls,
  Sphere,
  Stars,
} from '@react-three/drei';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
} from '@react-three/postprocessing';
import { Color, MathUtils, Vector2 as ThreeVector2 } from 'three';
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

type DistortMaterialHandle = {
  color: Color;
  distort: number;
  emissive: Color;
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
  const materialRef = useRef<DistortMaterialHandle | null>(null);
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
    material.emissive.setHSL((hue + 0.2) % 1, 0.82, 0.2);

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
          emissiveIntensity={0.8}
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
  const materialRef = useRef<DistortMaterialHandle | null>(null);

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

    material.distort = config.distort + Math.sin(elapsed * 1.25 + config.phase) * 0.06;
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
          emissiveIntensity={0.35}
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
  const chromaticOffset = useMemo(() => new ThreeVector2(0.00065, 0.00085), []);

  return (
    <>
      <ambientLight
        color="#6475aa"
        intensity={0.26}
      />
      <pointLight
        color="#4ba7ff"
        distance={18}
        intensity={45}
        position={[4.5, 3.4, 3.2]}
      />
      <pointLight
        color="#ff4ab5"
        distance={14}
        intensity={28}
        position={[-4, -2.8, -2.5]}
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

      <EffectComposer>
        <Bloom
          intensity={1.2}
          luminanceSmoothing={0.9}
          luminanceThreshold={0.2}
          mipmapBlur
        />
        <ChromaticAberration offset={chromaticOffset} />
      </EffectComposer>
    </>
  );
}

export default function DemonstrationPage() {
  return (
    <main
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: '#02030a' }}
    >
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

      <h1 className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 text-center text-3xl font-semibold tracking-[0.24em] text-white/85 sm:text-5xl">
        A Universe That Never Repeats
      </h1>

      <footer className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-center text-xs tracking-[0.22em] text-white/50 sm:text-sm">
        Procedurally generated • Codex CLI multi-agent • gpt-5.3-codex
      </footer>
    </main>
  );
}
