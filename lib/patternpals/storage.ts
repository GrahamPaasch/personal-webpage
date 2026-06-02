import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import type {
  CurationSignal,
  CurationStatus,
  ExperienceLevel,
  JugglerProfile,
  PatternCurationEntry,
  PatternStatus,
  PatternVisualAid,
  PracticeAttemptEntry,
  PracticeAttemptVerdict,
  PracticeMode,
  PropType,
  ProgressEntry,
  SessionCompositionPlan,
  SessionEntry,
  SessionReadinessSnapshot,
  SessionStatus,
} from './types';

type CreateJugglerInput = {
  name: string;
  experience: ExperienceLevel;
  props: PropType[];
};

type CreateSessionInput = {
  hostId: string;
  partnerId: string | null;
  partnerName: string | null;
  participantIds: string[];
  participantNames: string[];
  practiceMode: PracticeMode;
  scheduledFor: string;
  durationMinutes: number | null;
  location: string | null;
  focusPatterns: string[];
  compositionPlan: SessionCompositionPlan[];
  readinessSnapshot: SessionReadinessSnapshot[];
  status: SessionStatus;
  outcome: string | null;
  completedAt: string | null;
};

type CreatePracticeAttemptInput = {
  hostId: string;
  patternId: string;
  sessionId: string | null;
  verdict: PracticeAttemptVerdict;
  note: string | null;
  rosterSnapshot: {
    id: string;
    name: string;
    comfortableObjects: number;
    comfortableCount: number;
    movementComfort: string;
  }[];
};

type ProgressUpdateInput = {
  jugglerId: string;
  patternId: string;
  status: PatternStatus;
};

type CreateCurationInput = {
  patternId: string;
  authorId: string | null;
  authorName: string;
  signal: CurationSignal;
  note: string;
  visualAid: Omit<PatternVisualAid, 'id' | 'patternId' | 'status' | 'createdAt'> | null;
  status?: CurationStatus;
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
  listAttempts: (hostId: string) => Promise<PracticeAttemptEntry[]>;
  createAttempt: (input: CreatePracticeAttemptInput) => Promise<PracticeAttemptEntry>;
  listCuration: (patternId?: string) => Promise<PatternCurationEntry[]>;
  createCuration: (input: CreateCurationInput) => Promise<PatternCurationEntry>;
};

type StorageInfo = {
  mode: 'postgres' | 'memory' | 'memory-fallback';
  persistent: boolean;
  fallbackReason: string | null;
};

const connectionString =
  process.env.PATTERNPALS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

let storageInfo: StorageInfo = connectionString
  ? { mode: 'postgres', persistent: true, fallbackReason: null }
  : { mode: 'memory', persistent: false, fallbackReason: 'No database connection string is configured.' };

function formatStorageError(error: unknown) {
  if (error instanceof Error) {
    const code = 'code' in error ? String((error as Error & { code?: unknown }).code) : null;
    return code ? `${error.message} (${code})` : error.message;
  }
  return String(error);
}

function activateFallback(reason: string) {
  if (storageInfo.mode === 'memory-fallback' && storageInfo.fallbackReason === reason) {
    return;
  }

  storageInfo = {
    mode: connectionString ? 'memory-fallback' : 'memory',
    persistent: false,
    fallbackReason: reason,
  };

  console.warn(`PatternPals storage using non-persistent fallback: ${reason}`);
}

export function getPatternPalsStorageInfo(): StorageInfo {
  return storageInfo;
}

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
          participant_ids TEXT[] NOT NULL DEFAULT '{}',
          participant_names TEXT[] NOT NULL DEFAULT '{}',
          practice_mode TEXT NOT NULL DEFAULT 'passing',
          scheduled_for TIMESTAMPTZ NOT NULL,
          duration_minutes INTEGER,
          location TEXT,
          focus_patterns TEXT[] NOT NULL DEFAULT '{}',
          composition_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
          readiness_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL,
          outcome TEXT,
          completed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);
      await client.query(`
        ALTER TABLE patternpals_sessions
          ADD COLUMN IF NOT EXISTS participant_ids TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS participant_names TEXT[] NOT NULL DEFAULT '{}',
          ADD COLUMN IF NOT EXISTS practice_mode TEXT NOT NULL DEFAULT 'passing',
            ADD COLUMN IF NOT EXISTS composition_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS readiness_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS patternpals_curation (
          id UUID PRIMARY KEY,
          pattern_id TEXT NOT NULL,
          author_id TEXT,
          author_name TEXT NOT NULL,
          signal TEXT NOT NULL,
          note TEXT NOT NULL,
          visual_aid JSONB,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS patternpals_curation_pattern_idx
        ON patternpals_curation (pattern_id, created_at DESC);
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS patternpals_attempts (
          id UUID PRIMARY KEY,
          host_id UUID NOT NULL,
          pattern_id TEXT NOT NULL,
          session_id UUID,
          verdict TEXT NOT NULL,
          note TEXT,
          roster_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS patternpals_attempts_host_idx
        ON patternpals_attempts (host_id, created_at DESC);
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

  const mapVisualAid = (patternId: string, createdAt: string, raw: any): PatternVisualAid | null => {
    if (!raw || typeof raw !== 'object') return null;
    return {
      id: String(raw.id || randomUUID()),
      patternId,
      kind: raw.kind === 'community-diagram' || raw.kind === 'video-reference' || raw.kind === 'source-excerpt' ? raw.kind : 'diagram-needed',
      title: String(raw.title || 'Visual aid suggestion'),
      description: String(raw.description || ''),
      href: raw.href ? String(raw.href) : null,
      image: raw.image ? String(raw.image) : null,
      sourceTitle: raw.sourceTitle ? String(raw.sourceTitle) : null,
      page: typeof raw.page === 'number' ? raw.page : null,
      alt: raw.alt ? String(raw.alt) : null,
      status: raw.status === 'reviewed' ? 'reviewed' : 'pending',
      createdAt: raw.createdAt || createdAt,
    };
  };

  const mapCuration = (row: any): PatternCurationEntry => {
    const createdAt = row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString();
    return {
      id: row.id,
      patternId: row.pattern_id,
      authorId: row.author_id,
      authorName: row.author_name,
      signal: row.signal,
      note: row.note,
      visualAid: mapVisualAid(row.pattern_id, createdAt, row.visual_aid),
      status: row.status === 'reviewed' ? 'reviewed' : 'pending',
      createdAt,
    };
  };

  const mapSession = (row: any): SessionEntry => ({
    id: row.id,
    hostId: row.host_id,
    partnerId: row.partner_id,
    partnerName: row.partner_name,
    participantIds: row.participant_ids ?? (row.partner_id ? [row.partner_id] : []),
    participantNames: row.participant_names ?? (row.partner_name ? [row.partner_name] : []),
    practiceMode: row.practice_mode === 'solo' ? 'solo' : 'passing',
    scheduledFor: row.scheduled_for.toISOString?.() ?? new Date(row.scheduled_for).toISOString(),
    durationMinutes: row.duration_minutes,
    location: row.location,
    focusPatterns: row.focus_patterns ?? [],
    compositionPlan: row.composition_plan ?? [],
    readinessSnapshot: row.readiness_snapshot ?? [],
    status: row.status,
    outcome: row.outcome,
    completedAt: row.completed_at
      ? row.completed_at.toISOString?.() ?? new Date(row.completed_at).toISOString()
      : null,
    createdAt: row.created_at.toISOString?.() ?? new Date(row.created_at).toISOString(),
  });

  const mapAttempt = (row: any): PracticeAttemptEntry => ({
    id: row.id,
    hostId: row.host_id,
    patternId: row.pattern_id,
    sessionId: row.session_id,
    verdict: row.verdict,
    note: row.note,
    rosterSnapshot: Array.isArray(row.roster_snapshot) ? row.roster_snapshot : [],
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
          participant_ids,
          participant_names,
          practice_mode,
          scheduled_for,
          duration_minutes,
          location,
          focus_patterns,
          composition_plan,
          readiness_snapshot,
          status,
          outcome,
          completed_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, $9, $10, $11::text[], $12::jsonb, $13::jsonb, $14, $15, $16, $17)
        `,
        [
          id,
          input.hostId,
          input.partnerId,
          input.partnerName,
          input.participantIds ?? [],
          input.participantNames ?? [],
          input.practiceMode,
          input.scheduledFor,
          input.durationMinutes,
          input.location,
          input.focusPatterns ?? [],
          JSON.stringify(input.compositionPlan ?? []),
          JSON.stringify(input.readinessSnapshot ?? []),
          input.status,
          input.outcome,
          input.completedAt,
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
            participant_ids = COALESCE($4::text[], participant_ids),
            participant_names = COALESCE($5::text[], participant_names),
            practice_mode = COALESCE($6, practice_mode),
            scheduled_for = COALESCE($7, scheduled_for),
            duration_minutes = COALESCE($8, duration_minutes),
            location = COALESCE($9, location),
            focus_patterns = COALESCE($10::text[], focus_patterns),
            composition_plan = COALESCE($11::jsonb, composition_plan),
            readiness_snapshot = COALESCE($12::jsonb, readiness_snapshot),
            status = COALESCE($13, status),
            outcome = COALESCE($14, outcome),
            completed_at = COALESCE($15, completed_at)
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          input.partnerId ?? null,
          input.partnerName ?? null,
          input.participantIds ?? null,
          input.participantNames ?? null,
          input.practiceMode ?? null,
          input.scheduledFor ?? null,
          input.durationMinutes ?? null,
          input.location ?? null,
          input.focusPatterns ?? null,
          input.compositionPlan ? JSON.stringify(input.compositionPlan) : null,
          input.readinessSnapshot ? JSON.stringify(input.readinessSnapshot) : null,
          input.status ?? null,
          input.outcome ?? null,
          input.completedAt ?? null,
        ],
      );
      return res.rows[0] ? mapSession(res.rows[0]) : null;
    },
    async listAttempts(hostId) {
      await ready;
      const res = await pool.query(
        'SELECT * FROM patternpals_attempts WHERE host_id = $1 ORDER BY created_at DESC LIMIT 100',
        [hostId],
      );
      return res.rows.map(mapAttempt);
    },
    async createAttempt(input) {
      await ready;
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const res = await pool.query(
        `
        INSERT INTO patternpals_attempts (
          id,
          host_id,
          pattern_id,
          session_id,
          verdict,
          note,
          roster_snapshot,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        RETURNING *
        `,
        [
          id,
          input.hostId,
          input.patternId,
          input.sessionId,
          input.verdict,
          input.note,
          JSON.stringify(input.rosterSnapshot ?? []),
          createdAt,
        ],
      );
      return mapAttempt(res.rows[0]);
    },
    async listCuration(patternId) {
      await ready;
      const res = patternId
        ? await pool.query(
            'SELECT * FROM patternpals_curation WHERE pattern_id = $1 ORDER BY created_at DESC LIMIT 50',
            [patternId],
          )
        : await pool.query('SELECT * FROM patternpals_curation ORDER BY created_at DESC LIMIT 100');
      return res.rows.map(mapCuration);
    },
    async createCuration(input) {
      await ready;
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const status = input.status ?? 'pending';
      const visualAid = input.visualAid
        ? {
            ...input.visualAid,
            id: randomUUID(),
            patternId: input.patternId,
            status,
            createdAt,
          }
        : null;
      const res = await pool.query(
        `
        INSERT INTO patternpals_curation (
          id, pattern_id, author_id, author_name, signal, note, visual_aid, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        RETURNING *
        `,
        [
          id,
          input.patternId,
          input.authorId,
          input.authorName,
          input.signal,
          input.note,
          visualAid ? JSON.stringify(visualAid) : null,
          status,
          createdAt,
        ],
      );
      return mapCuration(res.rows[0]);
    },
  };
}

function createMemoryStorage(): StorageImpl {
  const jugglers: JugglerProfile[] = [];
  const progress: ProgressEntry[] = [];
  const sessions: SessionEntry[] = [];
  const attempts: PracticeAttemptEntry[] = [];
  const curationEntries: PatternCurationEntry[] = [];

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
        compositionPlan: input.compositionPlan ?? sessions[idx].compositionPlan,
      };
      return sessions[idx];
    },
    async listAttempts(hostId) {
      return attempts.filter((row) => row.hostId === hostId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 100);
    },
    async createAttempt(input) {
      const entry: PracticeAttemptEntry = {
        id: randomUUID(),
        hostId: input.hostId,
        patternId: input.patternId,
        sessionId: input.sessionId,
        verdict: input.verdict,
        note: input.note,
        rosterSnapshot: input.rosterSnapshot ?? [],
        createdAt: new Date().toISOString(),
      };
      attempts.push(entry);
      return entry;
    },
    async listCuration(patternId) {
      const rows = patternId
        ? curationEntries.filter((entry) => entry.patternId === patternId)
        : curationEntries;
      return [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, patternId ? 50 : 100);
    },
    async createCuration(input) {
      const createdAt = new Date().toISOString();
      const status = input.status ?? 'pending';
      const visualAid: PatternVisualAid | null = input.visualAid
        ? {
            ...input.visualAid,
            id: randomUUID(),
            patternId: input.patternId,
            status,
            createdAt,
          }
        : null;
      const entry: PatternCurationEntry = {
        id: randomUUID(),
        patternId: input.patternId,
        authorId: input.authorId,
        authorName: input.authorName,
        signal: input.signal,
        note: input.note,
        visualAid,
        status,
        createdAt,
      };
      curationEntries.push(entry);
      return entry;
    },
  };
}

function createResilientStorage(conn: string | undefined): StorageImpl {
  const memory = createMemoryStorage();

  if (!conn) {
    activateFallback('No database connection string is configured.');
    return memory;
  }

  let postgres: StorageImpl | null = null;
  let postgresDisabled = false;

  function getPostgres() {
    if (postgresDisabled) return null;
    if (postgres) return postgres;

    try {
      postgres = createPgStorage(conn);
      storageInfo = { mode: 'postgres', persistent: true, fallbackReason: null };
      return postgres;
    } catch (error) {
      postgresDisabled = true;
      activateFallback(`Database configuration could not be parsed: ${formatStorageError(error)}`);
      return null;
    }
  }

  async function run<T>(operation: keyof StorageImpl, fromMemory: () => Promise<T>, fromPostgres: (store: StorageImpl) => Promise<T>) {
    const store = getPostgres();
    if (!store) {
      return fromMemory();
    }

    try {
      return await fromPostgres(store);
    } catch (error) {
      postgresDisabled = true;
      activateFallback(`Database operation "${operation}" failed: ${formatStorageError(error)}`);
      return fromMemory();
    }
  }

  return {
    listJugglers: () => run('listJugglers', () => memory.listJugglers(), (store) => store.listJugglers()),
    createJuggler: (input) => run('createJuggler', () => memory.createJuggler(input), (store) => store.createJuggler(input)),
    updateJuggler: (id, input) => run('updateJuggler', () => memory.updateJuggler(id, input), (store) => store.updateJuggler(id, input)),
    listProgress: (jugglerId) => run('listProgress', () => memory.listProgress(jugglerId), (store) => store.listProgress(jugglerId)),
    upsertProgress: (input) => run('upsertProgress', () => memory.upsertProgress(input), (store) => store.upsertProgress(input)),
    deleteProgress: (jugglerId, patternId) => run('deleteProgress', () => memory.deleteProgress(jugglerId, patternId), (store) => store.deleteProgress(jugglerId, patternId)),
    listSessions: (hostId) => run('listSessions', () => memory.listSessions(hostId), (store) => store.listSessions(hostId)),
    createSession: (input) => run('createSession', () => memory.createSession(input), (store) => store.createSession(input)),
    updateSession: (id, input) => run('updateSession', () => memory.updateSession(id, input), (store) => store.updateSession(id, input)),
    listAttempts: (hostId) => run('listAttempts', () => memory.listAttempts(hostId), (store) => store.listAttempts(hostId)),
    createAttempt: (input) => run('createAttempt', () => memory.createAttempt(input), (store) => store.createAttempt(input)),
    listCuration: (patternId) => run('listCuration', () => memory.listCuration(patternId), (store) => store.listCuration(patternId)),
    createCuration: (input) => run('createCuration', () => memory.createCuration(input), (store) => store.createCuration(input)),
  };
}

const storage = createResilientStorage(connectionString);

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
  listAttempts,
  createAttempt,
  listCuration,
  createCuration,
} = storage;
