import Link from 'next/link';

export default function HomePage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>Hi, I’m Graham — also known as Vigil Pathfinder.</h1>
        <p>
          I blend a decade of network engineering with Python development, and I
          spend a lot of my time playing music, juggling, and writing. This site is a home for all of that.
        </p>
        <div className="cta-row" style={{ marginTop: 16 }}>
          <Link className="button primary" href="/writings">Read my writings</Link>
          <Link className="button" href="/hobbies">Explore hobbies</Link>
          <Link className="button" href="/professional">Professional profile</Link>
        </div>
      </div>

      <div className="card half">
        <h2>Hobbies</h2>
        <p className="muted">Juggling, viola, and Shona Zimbabwean marimba music.</p>
        <div className="cta-row">
          <Link className="button" href="/hobbies/juggling">Texas Juggling Society</Link>
          <Link className="button" href="/hobbies/viola">Central Texas Medical Orchestra</Link>
          <Link className="button" href="/hobbies/shona-music">Mafaro Marimba</Link>
        </div>
      </div>

      <div className="card half">
        <h2>Writings</h2>
        <p className="muted">Essays and thoughts published under the pen name Vigil Pathfinder.</p>
        <Link className="button" href="/writings">Browse posts</Link>
      </div>

      <div className="card">
        <h2>Professional</h2>
        <p>
          10 years blending network engineering with Python development. Earned
          <strong> CCNP-RS</strong> and <strong>JNCIP-SP</strong> (both expired), still very active in
          infrastructure-as-code, automation, and resilient network design.
        </p>
        <Link className="button" href="/professional">View profile</Link>
      </div>
    </section>
  );
}

