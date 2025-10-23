-- Supabase setup script for logging Agent2Agent attempts.
-- Run this in the Supabase SQL editor or via `supabase db remote commit`.

create table if not exists public.a2a_attempts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  prompt text not null,
  response text,
  context_id text,
  task_id text,
  provider text,
  metadata jsonb
);

create index if not exists idx_a2a_attempts_created_desc
  on public.a2a_attempts (created_at desc, id desc);

create index if not exists idx_a2a_attempts_context
  on public.a2a_attempts (context_id);

create index if not exists idx_a2a_attempts_task
  on public.a2a_attempts (task_id);
