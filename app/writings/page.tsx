import Link from 'next/link';
import { listPosts } from '@/lib/posts';

export const metadata = {
  title: 'Writings',
  description: 'Essays and thoughts by Vigil Pathfinder.',
};

export default function WritingsIndex() {
  const posts = listPosts();
  return (
    <section className="grid">
      <div className="card">
        <h1>Writings</h1>
        <p className="muted">Published under the pen name Vigil Pathfinder.</p>
      </div>
      <div className="card">
        {posts.length === 0 ? (
          <p className="muted">No posts yet. Add markdown files to <code>content/writings</code>.</p>
        ) : (
          <div className="post-list">
            {posts.map((p) => (
              <article key={p.slug} className="post-item">
                <h2 style={{ margin: '0 0 6px' }}>
                  <Link href={`/writings/${p.slug}`}>{p.title}</Link>
                </h2>
                <div className="post-meta">{new Date(p.date).toLocaleDateString()}</div>
                {p.excerpt && <p style={{ marginTop: 8 }} className="muted">{p.excerpt}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

