import MetronomeTool from './metronome-tool';

export const metadata = {
  title: 'Metronome',
  description: 'A practice metronome with tap tempo, subdivisions, swing, and accents.',
  alternates: { canonical: '/tools/metronome' },
};

export default function MetronomePage() {
  return (
    <section className="grid">
      <MetronomeTool />
    </section>
  );
}

