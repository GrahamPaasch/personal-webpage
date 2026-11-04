import { Pool } from 'pg';
import { seedTimeline, type TimelineData } from './timeline';

/**
 * Persists the exercise timeline as one JSONB row in the site's existing
 * Postgres (the same connection PatternPals uses). Without a connection
 * string (local dev) it falls back to process memory.
 */
const conn =
  process.env.PATTERNPALS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

const KEY = 'main';
let pool: Pool | null = null;
let ready: Promise<void> | null = null;
let memory: TimelineData | null = null;

function getPool(): Pool {
  if (!pool) {
    const u = new URL(conn as string);
    pool = new Pool({
      host: u.hostname,
      port: Number(u.port || '5432'),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
      ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
      max: 3,
    });
    ready = pool
      .query(`CREATE TABLE IF NOT EXISTS exercise_timeline (
        key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
      .then(() => undefined);
  }
  return pool;
}

export async function readTimeline(): Promise<TimelineData> {
  if (!conn) return (memory ??= seedTimeline());
  const p = getPool();
  await ready;
  const r = await p.query('SELECT data FROM exercise_timeline WHERE key = $1', [KEY]);
  return r.rows[0]?.data ?? seedTimeline();
}

/** Read-modify-write under a row lock so two quick taps can't clobber each other. */
export async function updateTimeline<T>(fn: (d: TimelineData) => T): Promise<{ data: TimelineData; result: T }> {
  if (!conn) {
    memory ??= seedTimeline();
    return { data: memory, result: fn(memory) };
  }
  const p = getPool();
  await ready;
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      'INSERT INTO exercise_timeline (key, data) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [KEY, JSON.stringify(seedTimeline())],
    );
    const r = await c.query('SELECT data FROM exercise_timeline WHERE key = $1 FOR UPDATE', [KEY]);
    const data = r.rows[0].data as TimelineData;
    const result = fn(data);
    await c.query('UPDATE exercise_timeline SET data = $2, updated_at = now() WHERE key = $1', [KEY, JSON.stringify(data)]);
    await c.query('COMMIT');
    return { data, result };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
