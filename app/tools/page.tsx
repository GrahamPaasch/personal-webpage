import Link from 'next/link';

export const metadata = {
  title: 'Toolbox',
  description: 'Small, sharp utilities for network engineering and music practice. Everything runs in your browser.',
  alternates: { canonical: '/tools' },
};

const musicTools = [
  {
    href: '/tools/metronome',
    title: 'Metronome',
    badge: 'TEMPO',
    desc: 'Tap tempo, subdivisions, swing, and a downbeat accent.',
  },
  {
    href: '/tools/tempo-ramp',
    title: 'Tempo Ramp',
    badge: 'SPEED',
    desc: 'Ramp from a start BPM to an end BPM in steps every N bars.',
  },
  {
    href: '/tools/rhythm-trainer',
    title: 'Rhythm Trainer',
    badge: 'TIME',
    desc: 'Tap along and measure early/late timing in milliseconds.',
  },
  {
    href: '/tools/drone',
    title: 'Drone',
    badge: 'INTONATION',
    desc: 'A sustained pitch for intonation work (note + octave, waveform, and A4 tuning).',
  },
  {
    href: '/tools/practice-timer',
    title: 'Practice Timer',
    badge: 'FOCUS',
    desc: 'Build a practice session out of timed blocks. Beeps on transitions.',
  },
  {
    href: '/tools/practice-log',
    title: 'Practice Log',
    badge: 'LOCAL',
    desc: 'Local-only practice logging with export/import. No accounts.',
  },
  {
    href: '/tools/setlist',
    title: 'Setlist Mode',
    badge: 'FLOW',
    desc: 'Build a practice setlist that links out to tool presets.',
  },
  {
    href: '/tools/ear-trainer',
    title: 'Interval Ear Trainer',
    badge: 'EAR',
    desc: 'Melodic or harmonic intervals, with selectable interval sets and stats.',
  },
  {
    href: '/tools/chord-looper',
    title: 'Chord Looper',
    badge: 'HARMONY',
    desc: 'Loop common progressions in any key with a simple synth + optional click.',
  },
  {
    href: '/tools/scale-randomizer',
    title: 'Scale Randomizer',
    badge: 'PROMPT',
    desc: 'Random practice prompts for scales, arpeggios, and patterns.',
  },
  {
    href: '/tools/tuner',
    title: 'Tuner',
    badge: 'MIC',
    desc: 'Microphone-based pitch detection with cents deviation. Headphones recommended.',
  },
] as const;

const networkTools = [
  {
    href: '/tools/subnet',
    title: 'IPv4 Subnet Planner',
    badge: 'CIDR',
    desc: 'Paste a CIDR, get the mask/network/broadcast/host range. Split a supernet into child prefixes safely.',
  },
  {
    href: '/tools/bgp-communities',
    title: 'BGP Community Decoder',
    badge: 'BGP',
    desc: 'Decode standard and large communities. Recognizes well-known values like no-export and no-advertise.',
  },
  {
    href: '/tools/config-diff',
    title: 'Config Diff Viewer',
    badge: 'DIFF',
    desc: 'Paste before/after configs and get a readable line diff. Optional whitespace and blank-line normalization.',
  },
] as const;

function ToolCard(props: { href: string; title: string; badge: string; desc: string }) {
  return (
    <div key={props.href} className="card half">
      <div className="prompt-header" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{props.title}</h3>
        <span className="prompt-header-badge">{props.badge}</span>
      </div>
      <p className="muted">{props.desc}</p>
      <Link className="button primary" href={props.href}>
        Open tool &rarr;
      </Link>
    </div>
  );
}

export default function ToolsIndexPage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>Toolbox Corner</h1>
        <p className="muted">
          A small collection of utilities I keep reaching for: network engineering, automation, and music practice.
          Everything here runs in your browser.
        </p>
        <div className="cta-row" style={{ marginTop: 14 }}>
          <a className="button primary" href="#music">
            Music tools
          </a>
          <a className="button" href="#network">
            Network tools
          </a>
          <a className="button" href="#rationality">
            Rationality tools
          </a>
          <Link className="button" href="/naf-discovery">
            NAF Discovery Tool
          </Link>
          <Link className="button" href="/professional">
            Professional profile
          </Link>
        </div>
      </div>

      <div id="music" className="card toolbox-anchor">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Music Practice</h2>
          <span className="prompt-header-badge">MUSIC</span>
        </div>
        <p className="muted">
          Web Audio starts only after you press a button (browser policy). The tuner needs microphone permission.
        </p>
      </div>

      {musicTools.map((tool) => (
        <ToolCard key={tool.href} {...tool} />
      ))}

      <div id="network" className="card toolbox-anchor">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Network Engineering</h2>
          <span className="prompt-header-badge">NETWORK</span>
        </div>
        <p className="muted">
          CIDR planning, BGP communities, and quick config diffs. Everything runs locally in your browser.
        </p>
      </div>

      {networkTools.map((tool) => (
        <ToolCard key={tool.href} {...tool} />
      ))}

      <div id="rationality" className="card toolbox-anchor">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Rationality Toolkit</h2>
          <span className="prompt-header-badge">CFAR</span>
        </div>
        <p className="muted">
          Thirteen interactive tools inspired by CFAR applied rationality techniques. Structured exercises for clearer thinking and better decisions.
        </p>
        <div className="cta-row" style={{ marginTop: 14 }}>
          <Link className="button primary" href="/tools/rationality">
            Open Rationality Toolkit
          </Link>
        </div>
      </div>
    </section>
  );
}
