import TempoRampTool from './tempo-ramp-tool';

export const metadata = {
  title: 'Tempo Ramp',
  description: 'A speed trainer: ramp a metronome from a start BPM to an end BPM in steps.',
  alternates: { canonical: '/tools/tempo-ramp' },
};

export default function TempoRampPage() {
  return (
    <section className="grid">
      <TempoRampTool />
    </section>
  );
}

