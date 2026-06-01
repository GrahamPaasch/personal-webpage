import { NextResponse } from 'next/server';
import { getPatternPalsStorageInfo } from '@/lib/patternpals/storage';

export function patternPalsHeaders(existing?: HeadersInit) {
  const headers = new Headers(existing);
  const storage = getPatternPalsStorageInfo();

  headers.set('x-patternpals-storage', storage.mode);
  if (storage.fallbackReason) {
    headers.set('x-patternpals-storage-warning', storage.fallbackReason.slice(0, 180));
  }

  return headers;
}

export function patternPalsJson<T>(body: T, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: patternPalsHeaders(init?.headers),
  });
}

export function patternPalsApiError(error: unknown, context: string) {
  console.error(`PatternPals API error in ${context}:`, error);

  return patternPalsJson(
    {
      error: 'PatternPals is temporarily unavailable. Please try again shortly.',
      context,
    },
    { status: 500 },
  );
}
