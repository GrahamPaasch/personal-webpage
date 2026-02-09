import Link from 'next/link';

export const metadata = {
  title: 'Network Toolbox',
  description: 'Small, sharp utilities for network engineering: CIDR planning, BGP communities, config diffs.',
  alternates: { canonical: '/tools' },
};

const tools = [
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

export default function ToolsIndexPage() {
  return (
    <section className="grid">
      <div className="card">
        <h1>Network Toolbox Corner</h1>
        <p className="muted">
          A small collection of utilities I keep reaching for while doing network engineering and automation.
          Everything on these pages runs in your browser.
        </p>
        <div className="cta-row" style={{ marginTop: 14 }}>
          <Link className="button" href="/naf-discovery">
            NAF Discovery Tool
          </Link>
          <Link className="button" href="/professional">
            Professional profile
          </Link>
        </div>
      </div>

      {tools.map((tool) => (
        <div key={tool.href} className="card half">
          <div className="prompt-header" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>{tool.title}</h2>
            <span className="prompt-header-badge">{tool.badge}</span>
          </div>
          <p className="muted">{tool.desc}</p>
          <Link className="button primary" href={tool.href}>
            Open tool &rarr;
          </Link>
        </div>
      ))}
    </section>
  );
}

