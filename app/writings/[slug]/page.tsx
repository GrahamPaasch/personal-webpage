import { notFound } from 'next/navigation';
import { getPost, listPostSlugs } from '@/lib/posts';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import Giscus from './giscus';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return listPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.meta.title,
    description: post.meta.excerpt || 'Writing by Graham Paasch',
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
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
      <h1>{post.meta.title}</h1>
      <div className="post-meta">
        {new Date(post.meta.date).toLocaleDateString()}
        {post.meta.readingTime && (
          <span className="reading-time"> &middot; {post.meta.readingTime} min read</span>
        )}
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Giscus title={post.meta.title} slug={post.meta.slug} />
    </article>
  );
}


