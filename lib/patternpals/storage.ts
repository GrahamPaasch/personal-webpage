import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import type {
  ExperienceLevel,
  JugglerProfile,
  PatternStatus,
  ProgressEntry,
  SessionEntry,
  SessionStatus,
} from './types';

type CreateJugglerInput = {
  name: string;
  experience: ExperienceLevel;
  props: string[];
};

type CreateSessionInput = {
  hostId: string;
  partnerId: string | null;
  partnerName: string | null;
  scheduledFor: string;
  durationMinutes: number | null;
  location: string | null;
  focusPatterns: string[];
  status: SessionStatus;
  outcome: string | null;
};

type ProgressUpdateInput = {
  jugglerId: string;
  patternId: string;
  status: PatternStatus;
};

type StorageImpl = {
  listJugglers: () => Promise<JugglerProfile[]>;
  createJuggler: (input: CreateJugglerInput) => Promise<JugglerProfile>;
  updateJuggler: (id: string, input: Partial<CreateJugglerInput>) => Promise<JugglerProfile | null>;
  listProgress: (jugglerId: string) => Promise<ProgressEntry[]>;
  upsertProgress: (input: ProgressUpdateInput) => Promise<ProgressEntry>;
  deleteProgress: (jugglerId: string, patternId: string) => Promise<void>;
  listSessions: (hostId: string) => Promise<SessionEntry[]>;
  createSession: (input: CreateSessionInput) => Promise<SessionEntry>;
  updateSession: (id: string, input: Partial<CreateSessionInput>) => Promise<SessionEntry | null>;
};

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

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
        CREATE TABLE IF NOT EXISTS patternpals_jugglers (
          id UUID PRIMARY KEY,
          name TEXT NOT NULL,
          experience TEXT NOT NULL,
          props TEXT[] NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS patternpals_progress (
          id UUID PRIMARY KEY,
          juggler_id UUID NOT NULL,
          pattern_id TEXT NOT NULL,
          status TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          UNIQUE (juggler_id, pattern_id)
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS patternpals_sessions (
          id UUID PRIMARY KEY,
          host_id UUID NOT NULL,
          partner_id UUID,
          partner_name TEXT,
          scheduled_for TIMESTAMPTZ NOT NULL,
          duration_minutes INTEGER,
          location TEXT,
          focus_patterns TEXT[] NOT NULL DEFAULT '{}',
          status TEXT NOT NULL,
          outcome TEXT,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);
    } finally {
      client.release();
    }
  }

  const ready = ensureSchema();

  const mapJuggler = (row: any): JugglerProfile => ({
    id: row.id,
    name: row.name,
    experience: row.experience,
    props: row.props ?? [],
    createdAt: row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at.toISOString?.() ?? new Date(row.updated_at).toISOString(),
  });

  const mapProgress = (row: any): ProgressEntry => ({
    id: row.id,
    jugglerId: row.juggler_id,
    patternId: row.pattern_id,
    status: row.status,
    updatedAt: row.updated_at.toISOString?.() ?? new Date(row.updated_at).toISOString(),
  });

  const mapSession = (row: any): SessionEntry => ({
    id: row.id,
    hostId: row.host_id,
    partnerId: row.partner_id,
    partnerName: row.partner_name,
    scheduledFor: row.scheduled_for.toISOString?.() ?? new Date(row.scheduled_for).toISOString(),
    durationMinutes: row.duration_minutes,
    location: row.location,
    focusPatterns: row.focus_patterns ?? [],
    status: row.status,
    outcome: row.outcome,
    createdAt: row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString(),
  });

  return {
    async listJugglers() {
      await ready;
      const res = await pool.query(
        'SELECT * FROM patternpals_jugglers ORDER BY created_at ASC',
      );
      return res.rows.map(mapJuggler);
    },
    async createJuggler(input) {
      await ready;
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const updatedAt = createdAt;
      const props = input.props ?? [];
      await pool.query(
        `
        INSERT INTO patternpals_jugglers (id, name, experience, props, created_at, updated_at)
        VALUES ($1, $2, $3, $4::text[], $5, $6)
        `,
        [id, input.name, input.experience, props, createdAt, updatedAt],
      );
      return {
        id,
        name: input.name,
        experience: input.experience,
        props,
        createdAt,
        updatedAt,
      };
    },
    async updateJuggler(id, input) {
      await ready;
      const { name, experience, props } = input;
      const updatedAt = new Date().toISOString();
      const res = await pool.query(
        `
        UPDATE patternpals_jugglers
        SET name = COALESCE($2, name),
            experience = COALESCE($3, experience),
            props = COALESCE($4::text[], props),
            updated_at = $5
        WHERE id = $1
        RETURNING *
        `,
        [id, name ?? null, experience ?? null, props ?? null, updatedAt],
      );
      return res.rows[0] ? mapJuggler(res.rows[0]) : null;
    },
    async listProgress(jugglerId) {
      await ready;
      const res = await pool.query(
        'SELECT * FROM patternpals_progress WHERE juggler_id = $1 ORDER BY updated_at DESC',
        [jugglerId],
      );
      return res.rows.map(mapProgress);
    },
    async upsertProgress(input) {
      await ready;
      const updatedAt = new Date().toISOString();
      const id = randomUUID();
      const res = await pool.query(
        `
        INSERT INTO patternpals_progress (id, juggler_id, pattern_id, status, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (juggler_id, pattern_id)
        DO UPDATE SET status = $4, updated_at = $5
        RETURNING *
        `,
        [id, input.jugglerId, input.patternId, input.status, updatedAt],
      );
      return mapProgress(res.rows[0]);
    },
    async deleteProgress(jugglerId, patternId) {
      await ready;
      await pool.query(
        'DELETE FROM patternpals_progress WHERE juggler_id = $1 AND pattern_id = $2',
        [jugglerId, patternId],
      );
    },
    async listSessions(hostId) {
      await ready;
      const res = await pool.query(
        'SELECT * FROM patternpals_sessions WHERE host_id = $1 ORDER BY scheduled_for ASC',
        [hostId],
      );
      return res.rows.map(mapSession);
    },
    async createSession(input) {
      await ready;
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      await pool.query(
        `
        INSERT INTO patternpals_sessions (
          id,
          host_id,
          partner_id,
          partner_name,
          scheduled_for,
          duration_minutes,
          location,
          focus_patterns,
          status,
          outcome,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11)
        `,
        [
          id,
          input.hostId,
          input.partnerId,
          input.partnerName,
          input.scheduledFor,
          input.durationMinutes,
          input.location,
          input.focusPatterns ?? [],
          input.status,
          input.outcome,
          createdAt,
        ],
      );
      return {
        ...input,
        id,
        createdAt,
      };
    },
    async updateSession(id, input) {
      await ready;
      const res = await pool.query(
        `
        UPDATE patternpals_sessions
        SET partner_id = COALESCE($2, partner_id),
            partner_name = COALESCE($3, partner_name),
            scheduled_for = COALESCE($4, scheduled_for),
            duration_minutes = COALESCE($5, duration_minutes),
            location = COALESCE($6, location),
            focus_patterns = COALESCE($7::text[], focus_patterns),
            status = COALESCE($8, status),
            outcome = COALESCE($9, outcome)
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          input.partnerId ?? null,
          input.partnerName ?? null,
          input.scheduledFor ?? null,
          input.durationMinutes ?? null,
          input.location ?? null,
          input.focusPatterns ?? null,
          input.status ?? null,
          input.outcome ?? null,
        ],
      );
      return res.rows[0] ? mapSession(res.rows[0]) : null;
    },
  };
}

function createMemoryStorage(): StorageImpl {
  console.warn('PatternPals storage using in-memory fallback.');

  const jugglers: JugglerProfile[] = [];
  const progress: ProgressEntry[] = [];
  const sessions: SessionEntry[] = [];

  return {
    async listJugglers() {
      return [...jugglers];
    },
    async createJuggler(input) {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const entry: JugglerProfile = {
        id,
        name: input.name,
        experience: input.experience,
        props: input.props ?? [],
        createdAt,
        updatedAt: createdAt,
      };
      jugglers.push(entry);
      return entry;
    },
    async updateJuggler(id, input) {
      const idx = jugglers.findIndex((row) => row.id === id);
      if (idx === -1) return null;
      const existing = jugglers[idx];
      const updated = {
        ...existing,
        ...input,
        props: input.props ?? existing.props,
        updatedAt: new Date().toISOString(),
      };
      jugglers[idx] = updated;
      return updated;
    },
    async listProgress(jugglerId) {
      return progress.filter((row) => row.jugglerId === jugglerId);
    },
    async upsertProgress(input) {
      const idx = progress.findIndex(
        (row) => row.jugglerId === input.jugglerId && row.patternId === input.patternId,
      );
      const updatedAt = new Date().toISOString();
      if (idx === -1) {
        const entry: ProgressEntry = {
          id: randomUUID(),
          jugglerId: input.jugglerId,
          patternId: input.patternId,
          status: input.status,
          updatedAt,
        };
        progress.push(entry);
        return entry;
      }
      progress[idx] = { ...progress[idx], status: input.status, updatedAt };
      return progress[idx];
    },
    async deleteProgress(jugglerId, patternId) {
      const idx = progress.findIndex(
        (row) => row.jugglerId === jugglerId && row.patternId === patternId,
      );
      if (idx !== -1) progress.splice(idx, 1);
    },
    async listSessions(hostId) {
      return sessions.filter((row) => row.hostId === hostId);
    },
    async createSession(input) {
      const entry: SessionEntry = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      sessions.push(entry);
      return entry;
    },
    async updateSession(id, input) {
      const idx = sessions.findIndex((row) => row.id === id);
      if (idx === -1) return null;
      sessions[idx] = {
        ...sessions[idx],
        ...input,
        focusPatterns: input.focusPatterns ?? sessions[idx].focusPatterns,
      };
      return sessions[idx];
    },
  };
}

const storage = connectionString ? createPgStorage(connectionString) : createMemoryStorage();

export const {
  listJugglers,
  createJuggler,
  updateJuggler,
  listProgress,
  upsertProgress,
  deleteProgress,
  listSessions,
  createSession,
  updateSession,
} = storage;
