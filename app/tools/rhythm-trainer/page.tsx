import RhythmTrainerTool from './rhythm-trainer-tool';

export const metadata = {
  title: 'Rhythm Trainer',
  description: 'Tap along with a click track and measure your timing (early/late) in milliseconds.',
  alternates: { canonical: '/tools/rhythm-trainer' },
};

export default function RhythmTrainerPage() {
  return (
    <section className="grid">
      <RhythmTrainerTool />
    </section>
  );
}

