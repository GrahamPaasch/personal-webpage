import Link from 'next/link';

export const metadata = {
  title: 'Graham Paasch',
  description: 'Hobbies, writings, and professional work by Graham Paasch.',
};

export default function HomePage() {
  return (
    <>
      <details className="announcement-banner" open>
        <summary
          className="announcement-dismiss-button"
          aria-label="Dismiss announcement"
        >
          &times;
        </summary>
        <div className="announcement-content">
          <span className="announcement-emoji" aria-hidden="true">
            &#x1F3AE;
          </span>
          <span className="announcement-text">
            <span className="announcement-highlight">NEW:</span> I&apos;m building a beat-em-up game!
          </span>
          <Link className="announcement-link" href="/sidewalks-of-rage/">
            Play the demo &rarr;
          </Link>
        </div>
      </details>

      {/* Voice System Explainer */}
      <div className="voice-system-banner">
        <div className="voice-banner-content">
          <h3 className="voice-banner-title">
            <span className="voice-icon" aria-hidden="true">
              &#x2726;
            </span>
            Reading Guide: Authorship by Typography
          </h3>
          <div className="voice-samples">
            <div className="voice-sample-item">
              <span className="voice-badge" data-voice="ai">AI</span>
              <span className="voice-description" data-voice="ai">Terminal mono = 100% AI generated</span>
            </div>
            <div className="voice-sample-item">
              <span className="voice-badge" data-voice="human">Human</span>
              <span className="voice-description" data-voice="human">Ornate serif = Graham wrote it</span>
            </div>
            <div className="voice-sample-item">
              <span className="voice-badge" data-voice="unified">Hybrid</span>
              <span className="voice-description" data-voice="unified">Clean sans = We collaborated</span>
            </div>
          </div>
          <p className="voice-banner-note">
            Every word on this site signals its author through font choice.{' '}
            <Link href="/voice-specimen">Learn more &rarr;</Link>
          </p>
        </div>
      </div>

      <section className="grid">
        <div className="card">
          <div className="prompt-header">
            <h2>
              <span aria-hidden="true">&#x1F50D;</span> NAF Discovery Tool
            </h2>
            <span className="prompt-header-badge">BETA</span>
          </div>
          <p className="muted">
            AI-powered network assessment that builds your Network Architecture Framework through conversation. Describe your environment, get structured documentation.
          </p>
          <Link className="button primary" href="/naf-discovery">
            Try the tool &rarr;
          </Link>
        </div>

        <div className="card">
          <div className="prompt-header">
            <h2>
              <span aria-hidden="true">&#x1F3A8;</span> AI Creative Playground
            </h2>
            <span className="prompt-header-badge">NEW</span>
          </div>
          <p className="muted">
            Interactive canvas art powered by particle physics and generative styles. Draw, explore, and create something unexpected.
          </p>
          <a className="button primary" href="/create-now/index.html">
            Launch playground &rarr;
          </a>
        </div>

        <div className="card">
          <h1>Hi, I&apos;m Graham Paasch.</h1>
          <p>
            I blend a decade of network engineering with Python development, and I
            spend a lot of my time playing music, juggling, and writing. This site is a home for all of that.
          </p>
          <div className="cta-row" style={{ marginTop: 16 }}>
            <Link className="button primary" href="/writings">Read my writings</Link>
            <Link className="button" href="/hobbies">Explore hobbies</Link>
            <Link className="button" href="/wellness/">Wellness</Link>
            <Link className="button" href="/professional">Professional profile</Link>
            <Link className="button" href="/tools">Toolbox</Link>
            <Link className="button" href="/prompt-pack">Prompt Studio</Link>
            <Link className="button" href="/agent">Chat with my Agent</Link>
            <a className="button primary" href="/create-now/index.html">AI Creative Playground</a>
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
          <p className="muted small" style={{ marginTop: 12 }}>
            New: PatternPals helps me track passing sessions and recommend patterns in the moment.
          </p>
          <Link className="button" href="/patternpals">Open PatternPals</Link>
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
                YouTube (professional channel)
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
            Juggling, circus arts, and other collective practice spaces help me stay grounded. They're
            also how I show up for others.
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

        <div className="card half">
          <h2>Graffiti wall</h2>
          <p className="muted">
            Grab a virtual paint can and leave a tag on the site. It sticks until I wash the wall clean.
          </p>
          <Link className="button" href="/graffiti">Tag the wall</Link>
        </div>

        <div className="card half">
          <h2>Toolbox</h2>
          <p className="muted">
            Small utilities for day-to-day work and practice: network tools (CIDR, BGP, config diffs) plus music tools (metronome, drone, tuner).
          </p>
          <Link className="button" href="/tools">Open the toolbox</Link>
        </div>
      </section>
    </>
  );
}
