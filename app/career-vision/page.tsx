import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export const metadata = {
  title: 'Career Journey & Vision',
  description:
    'Canonical source for my candidate market fit, Mnookin two-pager, and resume.',
  alternates: { canonical: '/career-vision' },
};

type CareerDoc = {
  slug: string;
  title: string;
  version?: string;
  lastUpdated?: string;
  status?: string;
  content: string;
};

const CAREER_DIR = path.join(process.cwd(), 'content', 'career');

const DOCS: Array<{ slug: string; filename: string }> = [
  { slug: 'candidate-market-fit', filename: 'candidate-market-fit.md' },
  { slug: 'mnookin-two-pager', filename: 'mnookin-two-pager.md' },
  { slug: 'resume', filename: 'resume.md' },
];

function loadCareerDoc(entry: { slug: string; filename: string }): CareerDoc | null {
  const filePath = path.join(CAREER_DIR, entry.filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  return {
    slug: entry.slug,
    title: data.title ?? entry.slug,
    version: data.version,
    lastUpdated: data.last_updated,
    status: data.status,
    content,
  };
}

function renderMarkdown(markdown: string): string {
  return sanitizeHtml(marked.parse(markdown) as string, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt'],
      a: ['href', 'name', 'target', 'rel'],
    },
  });
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export default function CareerVisionPage() {
  const docs = DOCS.map(loadCareerDoc).filter((doc): doc is CareerDoc => Boolean(doc));

  return (
    <article className="card prose" data-voice="unified">
      <h1>Career Journey & Vision</h1>
      <p className="post-meta">This page renders directly from the canonical Markdown stored in <code>content/career/</code>.</p>
      {docs.map((doc) => {
        const formattedDate = formatDate(doc.lastUpdated);
        return (
          <section key={doc.slug}>
            <header>
              <h2>{doc.title}</h2>
              <p className="post-meta">
                {doc.version ? `Version ${doc.version}` : null}
                {doc.version && formattedDate ? ' · ' : null}
                {formattedDate ? `Last updated ${formattedDate}` : null}
                {(!doc.version && !formattedDate && doc.status) ? doc.status : null}
              </p>
            </header>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(doc.content) }} />
          </section>
        );
      })}
    </article>
  );
}
