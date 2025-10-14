import { notFound } from 'next/navigation';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { getPost } from '@/lib/posts';

export const metadata = {
  title: 'Career Journey & Vision',
  description:
    'My career vision, values, must-haves, must-nots, strengths, weaknesses, and goals.',
  alternates: { canonical: '/career-vision' },
};

export default function CareerVisionPage() {
  const post = getPost('never-search-alone');
  if (!post) return notFound();

  const html = sanitizeHtml(marked.parse(post.content) as string, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt'],
      a: ['href', 'name', 'target', 'rel'],
    },
  });

  return (
    <article className="card prose" data-voice="unified">
      <h1>Career Journey & Vision</h1>
      <div className="post-meta">Last updated {new Date(post.meta.date).toLocaleDateString()}</div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
