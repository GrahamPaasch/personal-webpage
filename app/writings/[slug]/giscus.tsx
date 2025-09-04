'use client';

import { useEffect, useRef } from 'react';

// Configure these with your repo when ready.
// See README for instructions.
const GISCUS_CONFIG = {
  repo: process.env.NEXT_PUBLIC_GISCUS_REPO || 'yourusername/yourrepo',
  repoId: process.env.NEXT_PUBLIC_GISCUS_REPO_ID || '',
  category: process.env.NEXT_PUBLIC_GISCUS_CATEGORY || 'General',
  categoryId: process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID || '',
  mapping: 'pathname',
  reactionsEnabled: '1',
  emitMetadata: '0',
  inputPosition: 'bottom',
  theme: 'dark_dimmed',
  lang: 'en',
};

export default function Giscus() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const s = document.createElement('script');
    s.src = 'https://giscus.app/client.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-repo', GISCUS_CONFIG.repo);
    if (GISCUS_CONFIG.repoId) s.setAttribute('data-repo-id', GISCUS_CONFIG.repoId);
    s.setAttribute('data-category', GISCUS_CONFIG.category);
    if (GISCUS_CONFIG.categoryId) s.setAttribute('data-category-id', GISCUS_CONFIG.categoryId);
    s.setAttribute('data-mapping', GISCUS_CONFIG.mapping);
    s.setAttribute('data-reactions-enabled', GISCUS_CONFIG.reactionsEnabled);
    s.setAttribute('data-emit-metadata', GISCUS_CONFIG.emitMetadata);
    s.setAttribute('data-input-position', GISCUS_CONFIG.inputPosition);
    s.setAttribute('data-theme', GISCUS_CONFIG.theme);
    s.setAttribute('data-lang', GISCUS_CONFIG.lang);
    ref.current.appendChild(s);
    return () => {
      if (ref.current) ref.current.innerHTML = '';
    };
  }, []);

  return <div ref={ref} style={{ marginTop: 24 }} />;
}

