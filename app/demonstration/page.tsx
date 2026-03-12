'use client';

import { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  hue: number;
};

const HUES = [188, 198, 212, 230, 248, 272];

export default function DemonstrationPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = 0;
    let lastTime = performance.now();

    const particles: Particle[] = [];
    const maxParticles = 1800;
    const gravity = 0.028;

    const pointer = {
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      active: false,
      seeded: false,
      lastPulse: 0,
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);
    };

    const emit = (x: number, y: number, count: number, impulseX: number, impulseY: number) => {
      for (let i = 0; i < count; i += 1) {
        if (particles.length >= maxParticles) {
          particles.shift();
        }

        const angle = Math.random() * Math.PI * 2;
        const speed = 0.4 + Math.random() * 2.2;
        const maxLife = 46 + Math.random() * 72;

        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed + impulseX * 0.05,
          vy: Math.sin(angle) * speed + impulseY * 0.05 - Math.random() * 0.45,
          size: 0.8 + Math.random() * 3,
          life: maxLife,
          maxLife,
          hue: HUES[(Math.random() * HUES.length) | 0] + (Math.random() - 0.5) * 16,
        });
      }
    };

    const setPointer = (x: number, y: number) => {
      pointer.x = x;
      pointer.y = y;
      pointer.active = true;

      if (!pointer.seeded) {
        pointer.px = x;
        pointer.py = y;
        pointer.seeded = true;
      }
    };

    const stopPointer = () => {
      pointer.active = false;
      pointer.seeded = false;
    };

    const onMouseMove = (event: MouseEvent) => {
      setPointer(event.clientX, event.clientY);
    };

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      setPointer(touch.clientX, touch.clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      setPointer(touch.clientX, touch.clientY);
    };

    const onTouchEnd = () => {
      stopPointer();
    };

    const onMouseOut = (event: MouseEvent) => {
      const related = event.relatedTarget as Node | null;
      if (!related) stopPointer();
    };

    const frame = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.667, 2.5);
      lastTime = time;

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(2, 6, 23, 0.22)';
      ctx.fillRect(0, 0, width, height);

      if (pointer.active) {
        const dx = pointer.x - pointer.px;
        const dy = pointer.y - pointer.py;
        const distance = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.floor(distance / 9));
        const spawnCount = 2 + Math.min(7, Math.floor(distance / 18));

        for (let step = 1; step <= steps; step += 1) {
          const t = step / steps;
          emit(pointer.px + dx * t, pointer.py + dy * t, spawnCount, dx, dy);
        }

        if (distance < 0.5 && time - pointer.lastPulse > 32) {
          emit(pointer.x, pointer.y, 2, 0, 0);
          pointer.lastPulse = time;
        }

        pointer.px = pointer.x;
        pointer.py = pointer.y;
      }

      ctx.globalCompositeOperation = 'lighter';

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];

        p.vy += gravity * dt;
        p.vx *= Math.pow(0.985, dt);
        p.vy *= Math.pow(0.985, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;

        if (
          p.life <= 0 ||
          p.x < -60 ||
          p.x > width + 60 ||
          p.y < -60 ||
          p.y > height + 60
        ) {
          particles.splice(i, 1);
          continue;
        }

        const lifeProgress = p.life / p.maxLife;
        const alpha = Math.max(0, lifeProgress * 0.85);
        const radius = p.size * (1.1 + (1 - lifeProgress) * 1.7);

        const glow = `hsla(${p.hue}, 100%, 66%, ${alpha})`;
        const core = `hsla(${p.hue}, 100%, 84%, ${alpha * 0.85})`;

        ctx.shadowBlur = 16 + radius * 7;
        ctx.shadowColor = glow;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.6, radius * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = window.requestAnimationFrame(frame);
    };

    resize();

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseout', onMouseOut);
    window.addEventListener('blur', stopPointer);

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('blur', stopPointer);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.10),transparent_36%),radial-gradient(circle_at_78%_28%,rgba(139,92,246,0.10),transparent_32%),radial-gradient(circle_at_52%_78%,rgba(6,182,212,0.08),transparent_38%)]" />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Interactive particle demonstration"
      />

      <div className="pointer-events-none absolute left-1/2 top-7 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/40 px-6 py-3 text-center shadow-[0_0_40px_rgba(56,189,248,0.15)] backdrop-blur-md">
        <h1 className="text-sm font-medium tracking-[0.24em] text-slate-100/90 sm:text-base">
          Built by AI, Powered by Creativity
        </h1>
      </div>

      <footer className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 px-4 text-center text-[11px] tracking-[0.12em] text-slate-300/65 sm:text-xs">
        Generated by Codex CLI with multi-agent mode • gpt-5.3-codex
      </footer>
    </main>
  );
}
