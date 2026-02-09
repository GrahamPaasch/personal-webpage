import ScaleRandomizerTool from './scale-randomizer-tool';

export const metadata = {
  title: 'Scale Randomizer',
  description: 'Random practice prompts for scales, arpeggios, and patterns (key, mode, focus).',
  alternates: { canonical: '/tools/scale-randomizer' },
};

export default function ScaleRandomizerPage() {
  return (
    <section className="grid">
      <ScaleRandomizerTool />
    </section>
  );
}

