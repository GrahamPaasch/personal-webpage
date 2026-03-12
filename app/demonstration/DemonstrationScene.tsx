"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  ORBITERS,
  centralFragmentShader,
  centralVertexShader,
  colorToVector,
  createParticleBurst,
  createStarfield,
  disposeParticleBurst,
  orbiterFragmentShader,
  orbiterVertexShader,
  type OrbiterConfig,
  type ParticleBurst,
} from "./demonstrationSceneShared";

type BlobMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

type Orbiter = {
  config: OrbiterConfig;
  material: THREE.ShaderMaterial;
  mesh: BlobMesh;
};

type DragState = {
  active: boolean;
  material: THREE.ShaderMaterial | null;
  pullPoint: THREE.Vector3;
  releaseTime: number;
  releasing: boolean;
  targetMesh: BlobMesh | null;
};

type PopState = {
  mesh: BlobMesh | null;
  particles: ParticleBurst | null;
  popping: boolean;
  reformStartTime: number;
  reforming: boolean;
  startTime: number;
};

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function computeReformScale(reformElapsed: number): number {
  const progress = THREE.MathUtils.clamp(reformElapsed / 0.6, 0, 1);
  if (progress <= 0.7) {
    const up = progress / 0.7;
    return THREE.MathUtils.lerp(0, 1.15, easeOutCubic(up));
  }

  const settle = (progress - 0.7) / 0.3;
  return 1 + 0.15 * Math.exp(-6 * settle) * Math.cos(Math.PI * 4 * settle);
}

export default function DemonstrationScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#020410");

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 200);
    camera.position.set(0, 0.2, 6.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
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
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.1,
      0.95,
      0.08,
    );
    bloomPass.strength = 1.25;
    bloomPass.radius = 0.9;
    bloomPass.threshold = 0.07;
    composer.addPass(bloomPass);

    const ambientLight = new THREE.AmbientLight("#6d7eab", 0.22);
    const keyLight = new THREE.PointLight("#4aa8ff", 85, 28, 2);
    keyLight.position.set(4.2, 3.4, 3.4);
    const fillLight = new THREE.PointLight("#ff4cae", 62, 24, 2);
    fillLight.position.set(-4.4, -2.7, -2.2);
    const rimLight = new THREE.PointLight("#7f5bff", 44, 30, 2);
    rimLight.position.set(0.2, 6, -5.4);
    scene.add(ambientLight, keyLight, fillLight, rimLight);

    const centralGeometry = new THREE.IcosahedronGeometry(1.3, 5);
    const centralMaterial = new THREE.ShaderMaterial({
      fragmentShader: centralFragmentShader,
      uniforms: {
        uMouseBoost: { value: 0 },
        uPullPoint: { value: new THREE.Vector3() },
        uPullStrength: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: centralVertexShader,
    });
    const centralMesh: BlobMesh = new THREE.Mesh(centralGeometry, centralMaterial);
    scene.add(centralMesh);

    const orbiters: Orbiter[] = ORBITERS.map((config) => {
      const geometry = new THREE.SphereGeometry(config.radius, 48, 48);
      const material = new THREE.ShaderMaterial({
        fragmentShader: orbiterFragmentShader,
        uniforms: {
          uAmplitude: { value: 0.06 + config.radius * 0.08 },
          uColor: { value: colorToVector(config.color) },
          uPullPoint: { value: new THREE.Vector3() },
          uPullStrength: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: orbiterVertexShader,
      });
      const mesh: BlobMesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      return { config, material, mesh };
    });

    const starfield = createStarfield(4200, 16, 110);
    scene.add(starfield);

    const blobMeshes: BlobMesh[] = [centralMesh, ...orbiters.map(({ mesh }) => mesh)];
    const meshColors = new Map<BlobMesh, THREE.Color>();
    meshColors.set(centralMesh, new THREE.Color("#6cccff"));
    orbiters.forEach(({ config, mesh }) => {
      meshColors.set(mesh, new THREE.Color(config.color));
    });

    const mouse = new THREE.Vector2(2, 2);
    const raycaster = new THREE.Raycaster();
    const dragPlane = new THREE.Plane();
    const dragPlaneNormal = new THREE.Vector3();
    const projectedWorldPoint = new THREE.Vector3();
    const localPullPoint = new THREE.Vector3();
    const popOrigin = new THREE.Vector3();

    const dragState: DragState = {
      active: false,
      material: null,
      pullPoint: new THREE.Vector3(),
      releaseTime: 0,
      releasing: false,
      targetMesh: null,
    };

    const popState: PopState = {
      mesh: null,
      particles: null,
      popping: false,
      reformStartTime: 0,
      reforming: false,
      startTime: 0,
    };

    const clickTimestamps = new Map<BlobMesh, number[]>();
    const clock = new THREE.Clock();

    let rafId = 0;
    let smoothedBoost = 0;
    let targetBoost = 0;

    const updateMouseFromEvent = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      mouse.set(x, y);
      const distance = mouse.length();
      targetBoost = THREE.MathUtils.clamp(1 - distance / 0.75, 0, 1);
    };

    const stopDragging = () => {
      if (dragState.material) {
        dragState.material.uniforms.uPullStrength.value = 0;
      }
      dragState.active = false;
      dragState.releasing = false;
      dragState.releaseTime = 0;
      dragState.targetMesh = null;
      dragState.material = null;
      controls.enabled = true;
    };

    const beginPop = (mesh: BlobMesh, elapsed: number) => {
      if (popState.popping || !mesh.visible) {
        return;
      }

      stopDragging();
      disposeParticleBurst(scene, popState.particles);

      mesh.getWorldPosition(popOrigin);
      const particleColor = meshColors.get(mesh) ?? new THREE.Color("#a8d8ff");
      const burst = createParticleBurst(popOrigin, particleColor, elapsed);
      scene.add(burst.points);

      mesh.visible = false;

      popState.popping = true;
      popState.mesh = mesh;
      popState.particles = burst;
      popState.startTime = elapsed;
      popState.reforming = false;
      popState.reformStartTime = 0;
    };

    const registerPointerDownForPop = (mesh: BlobMesh, elapsed: number): boolean => {
      const now = performance.now();
      const previous = clickTimestamps.get(mesh) ?? [];
      const recent = previous.filter((timestamp) => now - timestamp <= 1000);
      recent.push(now);
      clickTimestamps.set(mesh, recent);

      if (recent.length < 3) {
        return false;
      }

      clickTimestamps.set(mesh, []);
      beginPop(mesh, elapsed);
      return true;
    };

    const handlePointerDown = (event: PointerEvent) => {
      updateMouseFromEvent(event);
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(blobMeshes, false)[0];
      if (!hit) {
        return;
      }

      const hitMesh = hit.object as BlobMesh;
      if (registerPointerDownForPop(hitMesh, clock.elapsedTime)) {
        return;
      }

      if (dragState.material && dragState.material !== hitMesh.material) {
        dragState.material.uniforms.uPullStrength.value = 0;
      }

      dragState.active = true;
      dragState.releasing = false;
      dragState.releaseTime = 0;
      dragState.targetMesh = hitMesh;
      dragState.material = hitMesh.material;

      localPullPoint.copy(hit.point);
      hitMesh.worldToLocal(localPullPoint);
      dragState.pullPoint.copy(localPullPoint);
      hitMesh.material.uniforms.uPullPoint.value.copy(dragState.pullPoint);
      hitMesh.material.uniforms.uPullStrength.value = 1;

      camera.getWorldDirection(dragPlaneNormal);
      dragPlane.setFromNormalAndCoplanarPoint(dragPlaneNormal, hit.point);

      controls.enabled = false;
      if (!mount.hasPointerCapture(event.pointerId)) {
        mount.setPointerCapture(event.pointerId);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateMouseFromEvent(event);
      if (!dragState.active || !dragState.targetMesh || !dragState.material) {
        return;
      }

      raycaster.setFromCamera(mouse, camera);
      if (!raycaster.ray.intersectPlane(dragPlane, projectedWorldPoint)) {
        return;
      }

      localPullPoint.copy(projectedWorldPoint);
      dragState.targetMesh.worldToLocal(localPullPoint);
      dragState.pullPoint.copy(localPullPoint);
      dragState.material.uniforms.uPullPoint.value.copy(dragState.pullPoint);
      dragState.material.uniforms.uPullStrength.value = 1;
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (mount.hasPointerCapture(event.pointerId)) {
        mount.releasePointerCapture(event.pointerId);
      }

      if (!dragState.active) {
        return;
      }

      dragState.active = false;
      dragState.releasing = true;
      dragState.releaseTime = clock.elapsedTime;
      controls.enabled = true;
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

    mount.addEventListener("pointerdown", handlePointerDown);
    mount.addEventListener("pointermove", handlePointerMove);
    mount.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("resize", handleResize);

    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;

      smoothedBoost += (targetBoost - smoothedBoost) * 0.09;
      centralMaterial.uniforms.uTime.value = elapsed;
      centralMaterial.uniforms.uMouseBoost.value = smoothedBoost;
      centralMesh.rotation.x = elapsed * 0.23;
      centralMesh.rotation.y = elapsed * 0.31;
      const centralBaseScale = 1 + smoothedBoost * 0.08;
      centralMesh.scale.setScalar(centralBaseScale);

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

      if (dragState.releasing && dragState.material) {
        const dt = elapsed - dragState.releaseTime;
        const strength = Math.exp(-4 * dt) * Math.cos(12 * dt);
        if (Math.abs(strength) < 0.01) {
          dragState.material.uniforms.uPullStrength.value = 0;
          dragState.releasing = false;
          dragState.targetMesh = null;
          dragState.material = null;
        } else {
          dragState.material.uniforms.uPullStrength.value = strength;
        }
      }

      if (popState.popping && popState.mesh) {
        if (popState.particles) {
          const positionAttribute = popState.particles.points.geometry.getAttribute(
            "position",
          ) as THREE.BufferAttribute;
          const positions = positionAttribute.array as Float32Array;
          const velocities = popState.particles.velocities;

          for (let i = 0; i < velocities.length; i += 3) {
            velocities[i + 1] -= 2 * delta;
            positions[i] += velocities[i] * delta;
            positions[i + 1] += velocities[i + 1] * delta;
            positions[i + 2] += velocities[i + 2] * delta;
          }
          positionAttribute.needsUpdate = true;

          const burstAge = elapsed - popState.particles.startTime;
          popState.particles.points.material.opacity = THREE.MathUtils.clamp(
            1 - burstAge / 1.5,
            0,
            1,
          );
        }

        const popAge = elapsed - popState.startTime;
        if (!popState.reforming && popAge >= 2) {
          disposeParticleBurst(scene, popState.particles);
          popState.particles = null;
          popState.reforming = true;
          popState.reformStartTime = elapsed;
          popState.mesh.visible = true;
          popState.mesh.scale.setScalar(0);
        }

        if (popState.reforming) {
          const reformElapsed = elapsed - popState.reformStartTime;
          const reformProgress = THREE.MathUtils.clamp(reformElapsed / 0.6, 0, 1);
          const reformScale = computeReformScale(reformElapsed);
          const meshBaseScale = popState.mesh === centralMesh ? centralBaseScale : 1;
          popState.mesh.scale.setScalar(meshBaseScale * reformScale);

          const wobble =
            Math.sin(reformProgress * Math.PI * 8) * 0.07 * (1 - reformProgress);
          popState.mesh.rotation.x += wobble;
          popState.mesh.rotation.z -= wobble * 0.6;

          if (reformProgress >= 1) {
            popState.mesh.scale.setScalar(meshBaseScale);
            popState.popping = false;
            popState.mesh = null;
            popState.startTime = 0;
            popState.reforming = false;
            popState.reformStartTime = 0;
          }
        }
      }

      starfield.rotation.y = elapsed * 0.012;
      starfield.rotation.x = Math.sin(elapsed * 0.05) * 0.02;
      controls.update();
      composer.render();
    };

    animate();

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      mount.removeEventListener("pointerdown", handlePointerDown);
      mount.removeEventListener("pointermove", handlePointerMove);
      mount.removeEventListener("pointerleave", handlePointerLeave);

      disposeParticleBurst(scene, popState.particles);

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

  return <div ref={mountRef} style={{ height: "100%", width: "100%" }} />;
}
