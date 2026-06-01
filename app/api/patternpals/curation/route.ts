import { NextRequest } from 'next/server';
import { patternPalsApiError, patternPalsJson } from '@/app/api/patternpals/_utils';
import { getPatternById } from '@/lib/patternpals/patterns';
import { createCuration, listCuration } from '@/lib/patternpals/storage';
import type { CurationSignal, VisualAidKind } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';

const SIGNALS = new Set<CurationSignal>(['tip', 'variation', 'warning', 'source', 'diagram']);
const VISUAL_AID_KINDS = new Set<VisualAidKind>([
  'source-excerpt',
  'diagram-needed',
  'community-diagram',
  'video-reference',
]);

const cleanString = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const cleanNullableString = (value: unknown, maxLength: number) => {
  const cleaned = cleanString(value, maxLength);
  return cleaned || null;
};

export async function GET(req: NextRequest) {
  try {
    const patternId = req.nextUrl.searchParams.get('patternId')?.trim() || undefined;
    if (patternId && !getPatternById(patternId)) {
      return patternPalsJson({ error: 'Pattern not found.' }, { status: 404 });
    }

    const items = await listCuration(patternId);
    return patternPalsJson({ items });
  } catch (error) {
    return patternPalsApiError(error, 'curation.GET');
  }
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { id: 'patternpals-curation-write', limit: 20, windowMs: 60_000 });
  if (!limited.ok) {
    return patternPalsJson(
      { error: 'Too many curation updates. Please wait before trying again.' },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 12_000) {
      return patternPalsJson(
        { error: 'Curation submissions must be smaller than 12 KB.' },
        { status: 413, headers: rateLimitHeaders(limited) },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return patternPalsJson(
        { error: 'Invalid JSON body.' },
        { status: 400, headers: rateLimitHeaders(limited) },
      );
    }

    const patternId = cleanString((body as any).patternId, 160);
    const pattern = getPatternById(patternId);
    if (!pattern) {
      return patternPalsJson(
        { error: 'Choose a valid PatternPals pattern.' },
        { status: 400, headers: rateLimitHeaders(limited) },
      );
    }

    const rawSignal = cleanString((body as any).signal, 32) as CurationSignal;
    const signal = SIGNALS.has(rawSignal) ? rawSignal : 'tip';
    const note = cleanString((body as any).note, 1200);
    if (note.length < 8) {
      return patternPalsJson(
        { error: 'Add a note of at least 8 characters.' },
        { status: 400, headers: rateLimitHeaders(limited) },
      );
    }

    const rawVisualAid = (body as any).visualAid;
    const visualAid = rawVisualAid && typeof rawVisualAid === 'object'
      ? {
          kind: VISUAL_AID_KINDS.has(rawVisualAid.kind) ? rawVisualAid.kind : 'diagram-needed',
          title: cleanString(rawVisualAid.title, 120) || `Visual aid for ${pattern.name}`,
          description: cleanString(rawVisualAid.description, 600),
          href: cleanNullableString(rawVisualAid.href, 500),
          image: cleanNullableString(rawVisualAid.image, 500),
          sourceTitle: cleanNullableString(rawVisualAid.sourceTitle, 160),
          page: Number.isFinite(Number(rawVisualAid.page)) ? Number(rawVisualAid.page) : null,
          alt: cleanNullableString(rawVisualAid.alt, 240),
        }
      : null;

    const entry = await createCuration({
      patternId,
      authorId: cleanNullableString((body as any).authorId, 120),
      authorName: cleanString((body as any).authorName, 80) || 'PatternPals contributor',
      signal,
      note,
      visualAid,
      status: 'pending',
    });

    return patternPalsJson({ item: entry }, { status: 201, headers: rateLimitHeaders(limited) });
  } catch (error) {
    return patternPalsApiError(error, 'curation.POST');
  }
}
