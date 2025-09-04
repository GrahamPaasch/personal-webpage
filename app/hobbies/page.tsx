import Link from 'next/link';

export const metadata = {
  title: 'Hobbies',
  description: 'Juggling, viola, and Shona Zimbabwean marimba music.',
};

export default function HobbiesPage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>Hobbies</h1>
        <p className="muted">Things I show up for every week.</p>
      </div>

      <div className="card half">
        <h2>Juggling</h2>
        <p>
          I am a core member of the Texas Juggling Society, and I love the
          flow, focus, and community that juggling brings.
        </p>
        <Link className="button" href="/hobbies/juggling">Learn more</Link>
      </div>

      <div className="card half">
        <h2>Viola</h2>
        <p>
          I play viola as a core member of the Central Texas Medical Orchestra.
          Music has always grounded me and stretched my attention to detail.
        </p>
        <Link className="button" href="/hobbies/viola">Learn more</Link>
      </div>

      <div className="card">
        <h2>Traditional Shona Zimbabwean Music</h2>
        <p>
          I’m a core member of Mafaro Marimba at the Rattletree School of Music.
          Marimba has a joyful, communal energy that I can’t get enough of.
        </p>
        <Link className="button" href="/hobbies/shona-music">Learn more</Link>
      </div>
    </section>
  );
}

