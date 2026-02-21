import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rationality Toolkit — Graham Paasch',
  description: 'A suite of 12 interactive tools inspired by CFAR applied rationality techniques.',
};

const skills = [
  { slug: 'aversion-factoring', title: 'Aversion Factoring', description: 'Unpack the hidden reasons you avoid important actions.' },
  { slug: 'bucket-errors', title: 'Bucket Errors', description: 'Identify when you\'re lumping distinct things into one category.' },
  { slug: 'double-crux', title: 'Double Crux', description: 'Find the core disagreement that, if resolved, changes both minds.' },
  { slug: 'focusing', title: 'Focusing', description: 'Tune into your felt sense to surface what you really know.' },
  { slug: 'freedom-of-action', title: 'Freedom of Action', description: 'Expand your option space by noticing invisible constraints.' },
  { slug: 'goal-factoring', title: 'Goal Factoring', description: 'Decompose goals to find what you actually want and better ways to get it.' },
  { slug: 'hamming-questions', title: 'Hamming Questions', description: 'Ask yourself: what\'s the most important problem you could be working on?' },
  { slug: 'internal-double-crux', title: 'Internal Double Crux', description: 'Resolve inner conflicts by finding the crux between competing parts of yourself.' },
  { slug: 'murphyjitsu', title: 'Murphyjitsu', description: 'Pre-hindsight your plans — imagine failure and patch the holes.' },
  { slug: 'pride-self-recognition', title: 'Pride & Self-Recognition', description: 'Build the habit of noticing and reinforcing your wins.' },
  { slug: 'resolve-cycles', title: 'Resolve Cycles', description: 'Break through loops of indecision and stuck patterns.' },
  { slug: 'trigger-action-planning', title: 'Trigger-Action Planning', description: 'Wire new behaviors to reliable triggers so they actually happen.' },
];

export default function RationalityToolkit() {
  return (
    <section>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Rationality Toolkit</h1>
          <span className="prompt-header-badge">CFAR-INSPIRED</span>
        </div>
        <p className="muted">
          Twelve interactive tools drawn from CFAR&rsquo;s applied rationality curriculum.
          Each one guides you through a structured thinking technique — designed to
          help you make clearer decisions, resolve internal conflicts, and actually
          follow through on what matters.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
        {skills.map((skill) => (
          <Link
            key={skill.slug}
            href={`/tools/rationality/${skill.slug}`}
            className="card"
            style={{ textDecoration: 'none', color: 'inherit', transition: 'transform 0.15s ease, box-shadow 0.15s ease' }}
          >
            <h3 style={{ margin: '0 0 6px' }}>{skill.title}</h3>
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{skill.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
