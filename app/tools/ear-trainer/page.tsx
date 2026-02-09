import EarTrainerTool from './ear-trainer-tool';

export const metadata = {
  title: 'Interval Ear Trainer',
  description: 'Practice recognizing musical intervals by ear (melodic or harmonic).',
  alternates: { canonical: '/tools/ear-trainer' },
};

export default function EarTrainerPage() {
  return (
    <section className="grid">
      <EarTrainerTool />
    </section>
  );
}

