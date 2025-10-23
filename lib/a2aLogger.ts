import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LogEntry = {
  prompt: string;
  response?: string;
  contextId?: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  provider?: string;
};

let client: SupabaseClient | null | undefined;

function getClient() {
  if (client !== undefined) return client;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[a2a] Supabase env vars missing; skipping logging');
    client = null;
    return client;
  }
  client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'graham-site-a2a-logger' } },
  });
  return client;
}

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
  const supabase = getClient();
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
