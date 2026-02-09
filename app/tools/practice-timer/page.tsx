import PracticeTimerTool from './practice-timer-tool';

export const metadata = {
  title: 'Practice Timer',
  description: 'A segment timer for structured music practice sessions.',
  alternates: { canonical: '/tools/practice-timer' },
};

export default function PracticeTimerPage() {
  return (
    <section className="grid">
      <PracticeTimerTool />
    </section>
  );
}

