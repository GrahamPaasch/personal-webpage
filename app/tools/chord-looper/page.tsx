import ChordLooperTool from './chord-looper-tool';

export const metadata = {
  title: 'Chord Looper',
  description: 'Loop common chord progressions in any key with a simple synth + optional click.',
  alternates: { canonical: '/tools/chord-looper' },
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

export default function ChordLooperPage({ searchParams }: { searchParams?: SearchParams }) {
  const keyIndex = intParam(searchParams, 'keyIndex', 0, 11);
  const bpm = intParam(searchParams, 'bpm', 30, 240);
  const beatsPerBar = intParam(searchParams, 'beatsPerBar', 1, 12);
  const barsPerChord = intParam(searchParams, 'barsPerChord', 1, 16);

  const spellingRaw = first(searchParams, 'spelling');
  const spelling = spellingRaw === 'sharp' ? 'sharp' : spellingRaw === 'flat' ? 'flat' : undefined;

  const scaleRaw = first(searchParams, 'scale');
  const scale = scaleRaw === 'minor' ? 'minor' : scaleRaw === 'major' ? 'major' : undefined;

  const presetId = first(searchParams, 'presetId');
  const click = first(searchParams, 'click');
  const bass = first(searchParams, 'bass');

  return (
    <section className="grid">
      <ChordLooperTool
        initial={{
          ...(keyIndex !== null ? { keyIndex } : null),
          ...(bpm !== null ? { bpm } : null),
          ...(beatsPerBar !== null ? { beatsPerBar } : null),
          ...(barsPerChord !== null ? { barsPerChord } : null),
          ...(spelling ? { spelling } : null),
          ...(scale ? { scale } : null),
          ...(presetId ? { presetId } : null),
          ...(click !== undefined ? { click: click !== '0' } : null),
          ...(bass !== undefined ? { bass: bass !== '0' } : null),
        }}
      />
    </section>
  );
}
