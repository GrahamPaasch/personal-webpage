import Link from 'next/link';

export const metadata = {
  title: 'Graham Paasch',
  description: 'Hobbies, writings, and professional work by Graham Paasch.',
};

export default function HomePage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>Hi, I’m Graham Paasch.</h1>
        <p>
          I blend a decade of network engineering with Python development, and I
          spend a lot of my time playing music, juggling, and writing. This site is a home for all of that.
        </p>
        <div className="cta-row" style={{ marginTop: 16 }}>
          <Link className="button primary" href="/writings">Read my writings</Link>
          <Link className="button" href="/hobbies">Explore hobbies</Link>
          <Link className="button" href="/professional">Professional profile</Link>
          <Link className="button" href="/agent">Chat with my Agent</Link>
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
        <p className="muted">Essays and thoughts written by me, Graham Paasch.</p>
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

      <div className="card half">
        <h2>Around the web</h2>
        <ul className="muted">
          <li>
            <a href="https://www.linkedin.com/in/grahampaasch/" target="_blank" rel="noreferrer">
              LinkedIn
            </a>
          </li>
          <li>
            <a href="https://github.com/GrahamPaasch" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <a href="https://huggingface.co/gpaasch" target="_blank" rel="noreferrer">
              Hugging Face
            </a>
          </li>
          <li>
            <a
              href="https://www.youtube.com/channel/UCg3oUjrSYcqsL9rGk1g_lPQ"
              target="_blank"
              rel="noreferrer"
            >
              YouTube
            </a>
          </li>
          <li>
            <a
              href="https://www.credly.com/users/graham-paasch"
              target="_blank"
              rel="noreferrer"
            >
              Credly (certifications)
            </a>
          </li>
        </ul>
      </div>

      <div className="card half">
        <h2>Supportive communities</h2>
        <p className="muted">
          Juggling, circus arts, and collaborative music are how I stay grounded. They’re also how
          I show up for others.
        </p>
        <div className="cta-row">
          <a href="https://madisoncircusspace.com/" className="button" target="_blank" rel="noreferrer">
            Madison Circus Space
          </a>
          <a href="https://madjugglers.com/" className="button" target="_blank" rel="noreferrer">
            Madison Area Jugglers
          </a>
        </div>
      </div>
    </section>
  );
}
