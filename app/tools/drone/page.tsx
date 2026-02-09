import DroneTool from './drone-tool';

export const metadata = {
  title: 'Drone',
  description: 'A simple practice drone (sustained pitch) for intonation work.',
  alternates: { canonical: '/tools/drone' },
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

export default function DronePage({ searchParams }: { searchParams?: SearchParams }) {
  const noteIndex = intParam(searchParams, 'noteIndex', 0, 11);
  const octave = intParam(searchParams, 'octave', 0, 8);
  const a4 = intParam(searchParams, 'a4', 415, 466);
  const volumePct = intParam(searchParams, 'volume', 0, 100);
  const spellingRaw = first(searchParams, 'spelling');
  const waveformRaw = first(searchParams, 'waveform');

  const spelling = spellingRaw === 'sharp' ? 'sharp' : spellingRaw === 'flat' ? 'flat' : undefined;
  const waveform =
    waveformRaw && ['sine', 'triangle', 'sawtooth', 'square'].includes(waveformRaw) ? (waveformRaw as OscillatorType) : undefined;

  return (
    <section className="grid">
      <DroneTool
        initial={{
          ...(noteIndex !== null ? { noteIndex } : null),
          ...(octave !== null ? { octave } : null),
          ...(a4 !== null ? { a4 } : null),
          ...(volumePct !== null ? { volume: volumePct / 100 } : null),
          ...(spelling ? { spelling } : null),
          ...(waveform ? { waveform } : null),
        }}
      />
    </section>
  );
}
