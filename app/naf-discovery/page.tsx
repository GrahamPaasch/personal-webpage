'use client';

import DiscoveryChat from './components/DiscoveryChat';

export default function NAFDiscoveryPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12 md:py-16">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl">
            NAF Discovery Tool
          </h1>
          <p className="text-base text-slate-300">Let's figure out your network automation journey</p>
        </header>
        <DiscoveryChat />
      </div>
    </main>
  );
}
