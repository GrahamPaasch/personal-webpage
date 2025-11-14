import { randomUUID } from 'crypto';
import { Pool } from 'pg';

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

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

type StorageImpl = {
  listGraffiti: () => Promise<StoredGraffiti[]>;
  addGraffiti: (payload: GraffitiPayload) => Promise<StoredGraffiti>;
  clearGraffiti: () => Promise<void>;
  listComments: (page: string) => Promise<StoredComment[]>;
  addComment: (
    page: string,
    body: string,
    author: string | null,
  ) => Promise<StoredComment>;
  deleteComment: (id: string) => Promise<void>;
};

function createPgStorage(conn: string): StorageImpl {
  const sslOption = process.env.DATABASE_SSL === 'false'
    ? undefined
    : { rejectUnauthorized: false };

  const parsed = new URL(conn);
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

  return {
    async listGraffiti() {
      await ready;
      const res = await pool.query(
        'SELECT id, payload, created_at FROM graffiti_tags ORDER BY created_at ASC',
      );
      return res.rows.map((row) => ({
        id: row.id,
        payload: row.payload as GraffitiPayload,
        createdAt: row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString(),
      }));
    },
    async addGraffiti(payload) {
      await ready;
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      await pool.query(
        'INSERT INTO graffiti_tags (id, payload, created_at) VALUES ($1, $2::jsonb, $3)',
        [id, JSON.stringify(payload), createdAt],
      );
      return { id, payload, createdAt };
    },
    async clearGraffiti() {
      await ready;
      await pool.query('DELETE FROM graffiti_tags');
    },
    async listComments(page) {
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
    },
    async addComment(page, body, author) {
      await ready;
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      await pool.query(
        'INSERT INTO comments (id, page, author, body, created_at) VALUES ($1, $2, $3, $4, $5)',
        [id, page, author, body, createdAt],
      );
      return { id, page, author, body, createdAt };
    },
    async deleteComment(id) {
      await ready;
      await pool.query('DELETE FROM comments WHERE id = $1', [id]);
    },
  };
}

function createMemoryStorage(): StorageImpl {
  console.warn(
    'DATABASE_URL/POSTGRES_URL not configured; graffiti/comments API will use in-memory storage.',
  );
  const graffiti: StoredGraffiti[] = [];
  const comments: StoredComment[] = [];

  return {
    async listGraffiti() {
      return [...graffiti];
    },
    async addGraffiti(payload) {
      const entry: StoredGraffiti = {
        id: randomUUID(),
        payload,
        createdAt: new Date().toISOString(),
      };
      graffiti.push(entry);
      return entry;
    },
    async clearGraffiti() {
      graffiti.length = 0;
    },
    async listComments(page) {
      return comments.filter((item) => item.page === page);
    },
    async addComment(page, body, author) {
      const entry: StoredComment = {
        id: randomUUID(),
        page,
        body,
        author,
        createdAt: new Date().toISOString(),
      };
      comments.push(entry);
      return entry;
    },
    async deleteComment(id) {
      const idx = comments.findIndex((row) => row.id === id);
      if (idx !== -1) {
        comments.splice(idx, 1);
      }
    },
  };
}

const storage = connectionString
  ? createPgStorage(connectionString)
  : createMemoryStorage();

export const {
  listGraffiti,
  addGraffiti,
  clearGraffiti,
  listComments,
  addComment,
  deleteComment,
} = storage;
