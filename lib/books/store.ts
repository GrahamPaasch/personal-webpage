import { Pool } from 'pg';
import { emptyData, type BooksData } from './state';

/**
 * Persists the /books reader state (place, notes, private session log) as one JSONB row in the site's existing
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
let memory: BooksData | null = null;

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
      .query(`CREATE TABLE IF NOT EXISTS books_state (
        key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
      .then(() => undefined);
  }
  return pool;
}

export async function readBooks(): Promise<BooksData> {
  if (!conn) return (memory ??= emptyData());
  const p = getPool();
  await ready;
  const r = await p.query('SELECT data FROM books_state WHERE key = $1', [KEY]);
  return r.rows[0]?.data ?? emptyData();
}

/** Read-modify-write under a row lock so two quick taps can't clobber each other. */
export async function updateBooks<T>(fn: (d: BooksData) => T): Promise<{ data: BooksData; result: T }> {
  if (!conn) {
    memory ??= emptyData();
    return { data: memory, result: fn(memory) };
  }
  const p = getPool();
  await ready;
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      'INSERT INTO books_state (key, data) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [KEY, JSON.stringify(emptyData())],
    );
    const r = await c.query('SELECT data FROM books_state WHERE key = $1 FOR UPDATE', [KEY]);
    const data = r.rows[0].data as BooksData;
    const result = fn(data);
    await c.query('UPDATE books_state SET data = $2, updated_at = now() WHERE key = $1', [KEY, JSON.stringify(data)]);
    await c.query('COMMIT');
    return { data, result };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
