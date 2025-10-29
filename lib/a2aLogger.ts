import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from './supabaseAdminClient';

type LogEntry = {
  prompt: string;
  response?: string;
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  provider?: string;
};

function truncate(value: string | undefined, limit = 4000): string | undefined {
  if (value === undefined) return undefined;
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

async function pruneRingBuffer(
  supabase: SupabaseClient,
  table: string,
  maxRows: number
) {
  if (!Number.isFinite(maxRows) || maxRows <= 0) return;
  const { data, error } = await supabase
    .from(table)
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(maxRows - 1, maxRows - 1);

  if (error || !data?.length) {
    if (error) {
      console.warn('[a2a] prune query failed', error);
    }
    return;
  }

  const boundary = data[0];
  if (!boundary.created_at) return;
  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .or(
      `created_at.lt.${boundary.created_at},and(created_at.eq.${boundary.created_at},id.lt.${boundary.id})`
    );

  if (deleteError) {
    console.warn('[a2a] prune delete failed', deleteError);
  }
}

export async function logA2AAttempt(entry: LogEntry) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;
  const table = process.env.A2A_LOG_TABLE || 'a2a_attempts';
  const maxRows =
    Number.parseInt(process.env.A2A_LOG_MAX ?? '', 10) || 200;

  const payload = {
    prompt: truncate(entry.prompt) ?? '',
    response: truncate(entry.response),
    context_id: entry.contextId ?? null,
    task_id: entry.taskId ?? null,
    provider: entry.provider ?? null,
    metadata: entry.metadata ?? null,
  };

  const { error } = await supabase.from(table).insert(payload);
  if (error) {
    console.warn('[a2a] supabase insert failed', error);
    return;
  }
  await pruneRingBuffer(supabase, table, maxRows);
}
