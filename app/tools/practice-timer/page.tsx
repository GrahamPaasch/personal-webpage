import PracticeTimerTool from './practice-timer-tool';

export const metadata = {
  title: 'Practice Timer',
  description: 'A segment timer for structured music practice sessions.',
  alternates: { canonical: '/tools/practice-timer' },
};

type SearchParams = { [key: string]: string | string[] | undefined };

function first(sp: SearchParams | undefined, key: string): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function intParam(sp: SearchParams | undefined, key: string, min: number, max: number): number | null {
  const raw = first(sp, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export default function PracticeTimerPage({ searchParams }: { searchParams?: SearchParams }) {
  const label = first(searchParams, 'label');
  const seconds = intParam(searchParams, 'seconds', 10, 8 * 60 * 60);

  const initialSegments =
    label && seconds !== null
      ? [{ id: 'preset', label, seconds }]
      : undefined;

  return (
    <section className="grid">
      <PracticeTimerTool initialSegments={initialSegments} />
    </section>
  );
}
