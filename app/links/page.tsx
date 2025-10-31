const LINKS = [
  {
    title: 'LinkedIn',
    url: 'https://www.linkedin.com/in/grahampaasch/',
    description:
      'Professional history, recommendations, and the fastest way to validate what I am working on right now.',
    cta: 'Connect on LinkedIn',
  },
  {
    title: 'YouTube',
    url: 'https://www.youtube.com/@techyesplc',
    description:
      'Technical walkthroughs, gear breakdowns, and automation demos from the Tech Yes PLC channel.',
    cta: 'Watch on YouTube',
  },
  {
    title: 'GitHub',
    url: 'https://github.com/GrahamPaasch',
    description:
      'Source code for network automation projects, tooling, and experiments that back up my resume.',
    cta: 'Browse GitHub',
  },
  {
    title: 'Hugging Face',
    url: 'https://huggingface.co/gpaasch',
    description:
      'Model experiments, datasets, and AI-native networking prototypes I am iterating on.',
    cta: 'Explore Hugging Face',
  },
];

export const metadata = {
  title: 'Links',
  description: 'Quick access to Graham Paasch around the web.',
};

export default function LinksPage() {
  return (
    <section className="grid">
      <article className="card">
        <h1>Links</h1>
        <p>
          This page is the digital follow-up to my business card. Save it and you&apos;ll always
          have the latest places to see what I&apos;m building, performing, or shipping.
        </p>
      </article>

      {LINKS.map((link) => (
        <article key={link.url} className="card half">
          <h2>{link.title}</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            {link.description}
          </p>
          <a className="button" href={link.url} target="_blank" rel="noreferrer">
            {link.cta}
          </a>
        </article>
      ))}
    </section>
  );
}
