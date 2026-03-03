import WorkoutTool from './workout-tool';

export const metadata = {
  title: 'Workout Timer',
  description: 'A configurable interval workout timer with preset and custom routines.',
  alternates: { canonical: '/workout' },
};

export default function WorkoutPage() {
  return (
    <section className="grid">
      <WorkoutTool />
    </section>
  );
}
