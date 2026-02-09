import MetronomeTool from './metronome-tool';

export const metadata = {
  title: 'Metronome',
  description: 'A practice metronome with tap tempo, subdivisions, swing, and accents.',
  alternates: { canonical: '/tools/metronome' },
};

type SearchParams = { [key: string]: string | string[] | undefined };

function first(sp: SearchParams | undefined, key: string): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function intParam(sp: SearchParams | undefined, key: string, min: number, max: number): number | null {
  const raw = first(sp, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export default function MetronomePage({ searchParams }: { searchParams?: SearchParams }) {
  const bpm = intParam(searchParams, 'bpm', 30, 240);
  const beatsPerBar = intParam(searchParams, 'beatsPerBar', 1, 12);
  const subdivision = intParam(searchParams, 'subdivision', 1, 4);
  const swingPct = intParam(searchParams, 'swing', 0, 45);
  const volumePct = intParam(searchParams, 'volume', 0, 100);
  const accentDownbeat = first(searchParams, 'accentDownbeat');

  return (
    <section className="grid">
      <MetronomeTool
        initial={{
          ...(bpm !== null ? { bpm } : null),
          ...(beatsPerBar !== null ? { beatsPerBar } : null),
          ...(subdivision !== null ? { subdivision } : null),
          ...(swingPct !== null ? { swing: swingPct / 100 } : null),
          ...(volumePct !== null ? { volume: volumePct / 100 } : null),
          ...(accentDownbeat !== undefined ? { accentDownbeat: accentDownbeat !== '0' } : null),
        }}
      />
    </section>
  );
}
