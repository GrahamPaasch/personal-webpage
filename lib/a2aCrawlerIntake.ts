import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from './supabaseAdminClient';

type OptInPayload = {
  domain: string;
  contact?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

const TABLE = process.env.A2A_CRAWLER_TABLE || 'a2a_crawler_submissions';

function sanitizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return '';
  }
}

export function normalizeDomain(input: string): string {
  return sanitizeDomain(input);
}

export async function saveCrawlerOptIn(payload: OptInPayload): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const domain = sanitizeDomain(payload.domain);
  if (!domain) {
    throw new Error('Invalid domain');
  }

  const rec: Record<string, unknown> = {
    domain,
    contact: payload.contact?.trim() || null,
    message: payload.message?.trim() || null,
    metadata: payload.metadata ?? null,
  };

  const { error } = await supabase.from(TABLE).insert(rec as never);
  if (error) {
    console.warn('[crawler] failed to insert opt-in', error);
    throw new Error('Failed to record request');
  }
}

