import DroneTool from './drone-tool';

export const metadata = {
  title: 'Drone',
  description: 'A simple practice drone (sustained pitch) for intonation work.',
  alternates: { canonical: '/tools/drone' },
};

export default function DronePage() {
  return (
    <section className="grid">
      <DroneTool />
    </section>
  );
}

