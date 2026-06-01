import { NextRequest, NextResponse } from 'next/server';
import { createJuggler, listJugglers, updateJuggler } from '@/lib/patternpals/storage';
import type { ExperienceLevel, PropType } from '@/lib/patternpals/types';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';
import { patternPalsApiError, patternPalsJson } from '../_utils';

export const runtime = 'nodejs';

const MAX_CONTENT_LENGTH = 30_000; // bytes (best-effort)

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const PROP_OPTIONS: PropType[] = ['clubs', 'balls', 'rings'];

const isExperienceLevel = (value: any): value is ExperienceLevel =>
  EXPERIENCE_LEVELS.includes(value);

const isPropType = (value: any): value is PropType => PROP_OPTIONS.includes(value);

export async function GET() {
  try {
    const items = await listJugglers();
    return patternPalsJson({ items });
  } catch (error) {
    return patternPalsApiError(error, 'jugglers.GET');
  }
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:jugglers:write', limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return patternPalsJson(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return patternPalsJson(
      { error: 'Payload too large.' },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const data = await request.json().catch(() => null);
  if (!data || typeof data.name !== 'string' || !data.name.trim()) {
    return patternPalsJson({ error: 'Name is required.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }
  if (!isExperienceLevel(data.experience)) {
    return patternPalsJson({ error: 'Invalid experience level.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const props = Array.isArray(data.props)
    ? data.props.filter(isPropType)
    : [];

  try {
    const created = await createJuggler({
      name: data.name.trim(),
      experience: data.experience,
      props,
    });

    return patternPalsJson(created, { status: 201, headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'jugglers.POST');
  }
}

export async function PATCH(request: NextRequest) {
  const rl = rateLimit(request, { id: 'patternpals:jugglers:write', limit: 60, windowMs: 60_000 });
  if (!rl.ok) {
    return patternPalsJson(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return patternPalsJson(
      { error: 'Payload too large.' },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const data = await request.json().catch(() => null);
  if (!data || typeof data.id !== 'string') {
    return patternPalsJson({ error: 'Juggler id is required.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const updates: {
    name?: string;
    experience?: ExperienceLevel;
    props?: PropType[];
  } = {};

  if (typeof data.name === 'string' && data.name.trim()) {
    updates.name = data.name.trim();
  }
  if (data.experience && isExperienceLevel(data.experience)) {
    updates.experience = data.experience;
  }
  if (Array.isArray(data.props)) {
    updates.props = data.props.filter(isPropType);
  }

  try {
    const updated = await updateJuggler(data.id, updates);
    if (!updated) {
      return patternPalsJson({ error: 'Juggler not found.' }, { status: 404, headers: rateLimitHeaders(rl) });
    }
    return patternPalsJson(updated, { headers: rateLimitHeaders(rl) });
  } catch (error) {
    return patternPalsApiError(error, 'jugglers.PATCH');
  }
}
