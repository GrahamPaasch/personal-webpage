import GraffitiWall from '@/components/GraffitiWall';

export const metadata = {
  title: 'Graffiti Wall',
  description: 'A collaborative graffiti wall where anyone can tag the site.',
};

export default function GraffitiPage() {
  return (
    <section className="grid">
      <article className="card" style={{ gridColumn: 'span 12' }}>
        <h1>Graffiti Wall</h1>
        <p className="muted">
          Leave a mark. This is a public graffiti wall—anonymous, ephemeral, and mostly unmoderated.
          Spray responsibly. I reserve the right to wipe it clean if things get out of hand.
        </p>
        <GraffitiWall />
      </article>
    </section>
  );
}
