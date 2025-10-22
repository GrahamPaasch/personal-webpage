import { notFound } from 'next/navigation';
import { getPost, listPostSlugs } from '@/lib/posts';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import Giscus from './giscus';
import Comments from '@/components/Comments';

type Props = { params: { slug: string } };

export function generateStaticParams() {
  return listPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const post = getPost(params.slug);
  if (!post) return {};
  return {
    title: post.meta.title,
    description: post.meta.excerpt || 'Writing by Graham Paasch',
  };
}

export default function PostPage({ params }: Props) {
  const post = getPost(params.slug);
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
      <div className="post-meta">{new Date(post.meta.date).toLocaleDateString()}</div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <Comments pageId={`/writings/${post.meta.slug}`} />
      <Giscus title={post.meta.title} slug={post.meta.slug} />
    </article>
  );
}
