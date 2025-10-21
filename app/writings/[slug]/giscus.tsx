'use client';

import { useEffect, useMemo, useRef } from 'react';

// Load from env; only enable when fully configured so we avoid
// the public "giscus is not installed" error message.
const GISCUS_ENV = {
  repo: process.env.NEXT_PUBLIC_GISCUS_REPO || '',
  repoId: process.env.NEXT_PUBLIC_GISCUS_REPO_ID || '',
  category: process.env.NEXT_PUBLIC_GISCUS_CATEGORY || '',
  categoryId: process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID || '',
};

const GISCUS_STATIC = {
  mapping: 'pathname',
  reactionsEnabled: '1',
  emitMetadata: '0',
  inputPosition: 'bottom',
  theme: 'dark_dimmed',
  lang: 'en',
};

const GISCUS_ENABLED = Boolean(
  GISCUS_ENV.repo &&
  GISCUS_ENV.repoId &&
  GISCUS_ENV.category &&
  GISCUS_ENV.categoryId &&
  !/yourusername\/yourrepo/i.test(GISCUS_ENV.repo)
);

type Props = { title?: string; slug?: string };

export default function Giscus({ title, slug }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GISCUS_ENABLED || !ref.current) return;
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-repo', GISCUS_ENV.repo);
    s.setAttribute('data-repo-id', GISCUS_ENV.repoId);
    s.setAttribute('data-category', GISCUS_ENV.category);
    s.setAttribute('data-category-id', GISCUS_ENV.categoryId);
    s.setAttribute('data-mapping', GISCUS_STATIC.mapping);
    s.setAttribute('data-reactions-enabled', GISCUS_STATIC.reactionsEnabled);
    s.setAttribute('data-emit-metadata', GISCUS_STATIC.emitMetadata);
    s.setAttribute('data-input-position', GISCUS_STATIC.inputPosition);
    s.setAttribute('data-theme', GISCUS_STATIC.theme);
    s.setAttribute('data-lang', GISCUS_STATIC.lang);
    ref.current.appendChild(s);
    return () => {
      if (ref.current) ref.current.innerHTML = '';
    };
  }, []);

  // Fallback: if not configured, show a lightweight link to open
  // a GitHub issue for discussion. This works without installing apps.
  if (!GISCUS_ENABLED) {
    const issuesRepo = process.env.NEXT_PUBLIC_FEEDBACK_REPO || '';
    const repoUrl = issuesRepo ? `https://github.com/${issuesRepo}` : '';
    const href = useMemo(() => {
      if (!issuesRepo) return '';
      const t = encodeURIComponent(`Comment: ${title ?? 'Post'}`);
      const b = encodeURIComponent(
        `Post: /writings/${slug ?? ''}\n\nLeave your comment below.`
      );
      return `${repoUrl}/issues/new?title=${t}&body=${b}&labels=comment,blog`;
    }, [issuesRepo, repoUrl, title, slug]);

    if (!issuesRepo) return null;

    return (
      <div className="muted" style={{ marginTop: 24 }}>
        Want to comment? <a href={href} target="_blank" rel="noreferrer noopener">Open a GitHub issue</a>.
      </div>
    );
  }

  return <div ref={ref} style={{ marginTop: 24 }} />;
}
