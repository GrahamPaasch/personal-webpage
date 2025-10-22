'use client';

import { FormEvent, useEffect, useState } from 'react';

type Comment = {
  id: string;
  author: string | null;
  body: string;
  createdAt: string;
};

type Props = {
  pageId: string;
};

export default function Comments({ pageId }: Props) {
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/comments?page=${encodeURIComponent(pageId)}`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        if (!cancelled) {
          setComments(data.items ?? []);
        }
      } catch {
        if (!cancelled) setError('Could not load comments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!body.trim()) {
      setError('Add a comment before submitting.');
      return;
    }
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: pageId, author: name.trim(), body: body.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save comment');
      }
      const saved: Comment = await res.json();
      setComments((prev) => [...prev, saved]);
      setBody('');
      setSuccess('Thanks for leaving a note!');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    }
  }

  return (
    <section className="comment-section">
      <h2>Leave a Comment</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Share your thoughts. Name is optional; all comments are public.
      </p>
      <form onSubmit={handleSubmit} className="comment-form">
        <label>
          Name (optional)
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
        </label>
        <label>
          Comment
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder="Add your message"
            required
          />
        </label>
        <button type="submit" className="button primary" disabled={!body.trim()}>
          Post comment
        </button>
      </form>
      {error ? <p className="comment-error">{error}</p> : null}
      {success ? <p className="comment-success">{success}</p> : null}
      <div className="comment-list">
        {loading ? <p className="muted">Loading comments…</p> : null}
        {!loading && comments.length === 0 ? <p className="muted">No comments yet.</p> : null}
        {comments.map((comment) => (
          <article key={comment.id} className="comment">
            <header>
              <strong>{comment.author || 'Anonymous'}</strong>
              <span>{new Date(comment.createdAt).toLocaleString()}</span>
            </header>
            <p>{comment.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
