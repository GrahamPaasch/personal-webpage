import SetlistTool from './setlist-tool';

export const metadata = {
  title: 'Setlist Mode',
  description: 'Build a practice setlist that links out to metronome/drone/timer presets.',
  alternates: { canonical: '/tools/setlist' },
};

export default function SetlistPage() {
  return (
    <section className="grid">
      <SetlistTool />
    </section>
  );
}

