import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null | undefined;

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[supabase] Admin env vars missing; skipping');
    client = null;
    return client;
  }

  client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'graham-site-admin' } },
  });
  return client;
}

