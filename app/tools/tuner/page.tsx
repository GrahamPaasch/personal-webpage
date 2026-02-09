import TunerTool from './tuner-tool';

export const metadata = {
  title: 'Tuner',
  description: 'A simple microphone-based tuner (pitch + cents).',
  alternates: { canonical: '/tools/tuner' },
};

export default function TunerPage() {
  return (
    <section className="grid">
      <TunerTool />
    </section>
  );
}

