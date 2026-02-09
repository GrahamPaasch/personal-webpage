import PracticeLogTool from './practice-log-tool';

export const metadata = {
  title: 'Practice Log',
  description: 'A local-only music practice log (no accounts). Export/import JSON.',
  alternates: { canonical: '/tools/practice-log' },
};

export default function PracticeLogPage() {
  return (
    <section className="grid">
      <PracticeLogTool />
    </section>
  );
}

