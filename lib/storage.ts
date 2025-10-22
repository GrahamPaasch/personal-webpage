import { randomUUID } from 'crypto';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for graffiti/comments storage.');
}

const sslOption = process.env.DATABASE_SSL === 'false'
  ? undefined
  : { rejectUnauthorized: false };

const parsed = new URL(connectionString);
const connectionConfig = {
  host: parsed.hostname,
  port: Number(parsed.port || '5432'),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: parsed.pathname.replace(/^\//, ''),
  ssl: sslOption,
} as const;

const pool = new Pool(connectionConfig);

async function ensureSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS graffiti_tags (
        id UUID PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY,
        page TEXT NOT NULL,
        author TEXT,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}

const ready = ensureSchema();

export type GraffitiPayload = {
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
};

export type StoredGraffiti = {
  id: string;
  payload: GraffitiPayload;
  createdAt: string;
};

export type StoredComment = {
  id: string;
  page: string;
  author: string | null;
  body: string;
  createdAt: string;
};

export async function listGraffiti(): Promise<StoredGraffiti[]> {
  await ready;
  const res = await pool.query(
    'SELECT id, payload, created_at FROM graffiti_tags ORDER BY created_at ASC',
  );
  return res.rows.map((row) => ({
    id: row.id,
    payload: row.payload as GraffitiPayload,
    createdAt: row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString(),
  }));
}

export async function addGraffiti(payload: GraffitiPayload): Promise<StoredGraffiti> {
  await ready;
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await pool.query(
    'INSERT INTO graffiti_tags (id, payload, created_at) VALUES ($1, $2::jsonb, $3)',
    [id, JSON.stringify(payload), createdAt],
  );
  return { id, payload, createdAt };
}

export async function clearGraffiti(): Promise<void> {
  await ready;
  await pool.query('DELETE FROM graffiti_tags');
}

export async function listComments(page: string): Promise<StoredComment[]> {
  await ready;
  const res = await pool.query(
    'SELECT id, page, author, body, created_at FROM comments WHERE page = $1 ORDER BY created_at ASC',
    [page],
  );
  return res.rows.map((row) => ({
    id: row.id,
    page: row.page,
    author: row.author,
    body: row.body,
    createdAt: row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString(),
  }));
}

export async function addComment(
  page: string,
  body: string,
  author: string | null,
): Promise<StoredComment> {
  await ready;
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await pool.query(
    'INSERT INTO comments (id, page, author, body, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id, page, author, body, createdAt],
  );
  return { id, page, author, body, createdAt };
}
