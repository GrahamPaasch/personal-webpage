import MetronomeTool from './metronome-tool';
import { settingsFromParams, type SearchParamsLike } from '@/lib/music/practiceParams';

export const metadata = {
  title: 'Practice Tool (Metronome)',
  description:
    'A practice tool built around a sample-accurate metronome: success-gated tempo ladder, gap click, drone, rhythm patterns, interleaved session plan and a local practice log.',
  alternates: { canonical: '/tools/metronome' },
};

export default async function MetronomePage({ searchParams }: { searchParams?: Promise<SearchParamsLike> }) {
  // Next 16 hands search params over as a promise; reading them makes this
  // route server-rendered per request, which is what deep links need.
  const sp = (await searchParams) ?? {};
  const initial = settingsFromParams(sp);
  const autostartRaw = sp.autostart;
  const autostart = (Array.isArray(autostartRaw) ? autostartRaw[0] : autostartRaw) === '1';

  return (
    <section className="grid">
      <MetronomeTool initial={initial} autostart={autostart} />
    </section>
  );
}
