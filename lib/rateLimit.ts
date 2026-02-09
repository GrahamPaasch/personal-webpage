import type { NextRequest } from 'next/server';

type Bucket = {
  count: number;
  resetAtMs: number;
};

type RateLimitOk = {
  ok: true;
  limit: number;
  remaining: number;
  resetAtMs: number;
};

type RateLimitBlocked = {
  ok: false;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSec: number;
};

export type RateLimitResult = RateLimitOk | RateLimitBlocked;

const buckets = new Map<string, Bucket>();
let lastCleanupMs = 0;

function isRateLimitBlocked(result: RateLimitResult): result is RateLimitBlocked {
  return result.ok === false;
}

function cleanup(nowMs: number) {
  // Basic, low-cost cleanup to keep memory bounded per instance.
  if (nowMs - lastCleanupMs < 60_000) return;
  lastCleanupMs = nowMs;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAtMs <= nowMs) buckets.delete(key);
  }
}

export function getClientIp(req: Request | NextRequest): string {
  // Prefer deployment-provided headers; fall back to generic proxy headers.
  const raw =
    req.headers.get('x-vercel-forwarded-for') ||
    req.headers.get('x-forwarded-for') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    '';
  const ip = raw.split(',')[0]?.trim();
  return ip || 'unknown';
}

export function rateLimit(
  req: Request | NextRequest,
  opts: { id: string; limit: number; windowMs: number },
): RateLimitResult {
  const enabled =
    process.env.NODE_ENV === 'production' &&
    String(process.env.RATE_LIMIT_DISABLE || '').toLowerCase() !== 'true';

  if (!enabled) {
    return {
      ok: true,
      limit: opts.limit,
      remaining: opts.limit,
      resetAtMs: Date.now() + opts.windowMs,
    };
  }

  const ip = getClientIp(req);
  const key = `${opts.id}:${ip}`;
  const nowMs = Date.now();

  cleanup(nowMs);

  const existing = buckets.get(key);
  if (!existing || nowMs >= existing.resetAtMs) {
    const resetAtMs = nowMs + opts.windowMs;
    buckets.set(key, { count: 1, resetAtMs });
    return { ok: true, limit: opts.limit, remaining: opts.limit - 1, resetAtMs };
  }

  if (existing.count >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));
    return {
      ok: false,
      limit: opts.limit,
      remaining: 0,
      resetAtMs: existing.resetAtMs,
      retryAfterSec,
    };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return {
    ok: true,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - existing.count),
    resetAtMs: existing.resetAtMs,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  // draft-ietf-httpapi-ratelimit-headers-ish compatibility
  const base: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };

  if (isRateLimitBlocked(result)) {
    base['Retry-After'] = String(result.retryAfterSec);
  }

  return base;
}
