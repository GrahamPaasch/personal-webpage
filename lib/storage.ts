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

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

type StorageImpl = {
  listGraffiti: () => Promise<StoredGraffiti[]>;
  addGraffiti: (payload: GraffitiPayload) => Promise<StoredGraffiti>;
  clearGraffiti: () => Promise<void>;
};

function createPgStorage(conn: string): StorageImpl {
  // NOTE: Many managed Postgres providers require TLS, but don't provide a CA
  // bundle that Node can validate by default. For compatibility we default to a
  // "relaxed" TLS mode unless explicitly configured.
  //
  // Options:
  // - DATABASE_SSL=false   -> disable TLS
  // - DATABASE_SSL=strict  -> enable TLS + require a valid certificate chain
  // - (unset|relaxed)      -> enable TLS with rejectUnauthorized=false
  const sslMode = String(process.env.DATABASE_SSL || '').trim().toLowerCase();
  const sslOption =
    sslMode === 'false' || sslMode === '0' || sslMode === 'off' || sslMode === 'disable'
      ? undefined
      : sslMode === 'strict'
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false };

  if (sslOption && sslOption.rejectUnauthorized === false && sslMode !== 'strict') {
    console.warn(
      '[db] TLS enabled with rejectUnauthorized=false (DATABASE_SSL=relaxed). Set DATABASE_SSL=strict to verify certs.',
    );
  }

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
  };
}

function createMemoryStorage(): StorageImpl {
  console.warn(
    'DATABASE_URL/POSTGRES_URL not configured; graffiti API will use in-memory storage.',
  );
  const graffiti: StoredGraffiti[] = [];

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
  };
}

const storage = connectionString
  ? createPgStorage(connectionString)
  : createMemoryStorage();

export const {
  listGraffiti,
  addGraffiti,
  clearGraffiti,
} = storage;
