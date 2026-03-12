'use client';

import dynamic from 'next/dynamic';

const DemonstrationScene = dynamic(() => import('./DemonstrationScene'), {
  ssr: false,
});

export default function DemonstrationPage() {
  return (
    <main
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: '#02030a' }}
    >
      <DemonstrationScene />

      <h1 className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 text-center text-3xl font-semibold tracking-[0.24em] text-white/85 sm:text-5xl">
        A Universe That Never Repeats
      </h1>

      <footer className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-center text-xs tracking-[0.22em] text-white/50 sm:text-sm">
        Procedurally generated • Codex CLI multi-agent • gpt-5.3-codex
      </footer>
    </main>
  );
}
