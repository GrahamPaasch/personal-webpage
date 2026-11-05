/**
 * Exercise timeline (voice-ui spec 31). Pure data + scheduling, no I/O.
 *
 * Done sessions keep their real date. Pending sessions are laid out one per
 * day from today (or the start date, if later), skipping days that already
 * hold a done session, so a missed day quietly slides forward.
 */

/** Edit here to point the warm-up sessions at a better video. */
export const CALI_WARMUP_VIDEO = 'https://www.calimove.com/courses/782920/lectures/14311137';
/** Cali Move "Mobility Routine" lecture, used as the cool-down (Graham's Fitness bookmarks, 2026-11-04). */
export const CALI_COOLDOWN_VIDEO = 'https://www.calimove.com/courses/782920/lectures/14321525';

export type VideoLink = { label: string; url: string };

/**
 * The links shown on a session card. Derived at read time, so sessions already
 * stored with the old placeholder URL pick up the direct lecture links.
 */
export function linksFor(s: Pick<Session, 'id' | 'video'>): VideoLink[] {
  if (s.id.startsWith('cm-warmup-')) {
    return [
      { label: 'warm-up', url: CALI_WARMUP_VIDEO },
      { label: 'cool-down', url: CALI_COOLDOWN_VIDEO },
    ];
  }
  return [{ label: 'video', url: s.video }];
}

export type Session = {
  id: string;
  title: string;
  video: string;
  done: string | null; // YYYY-MM-DD, the real day it was done
  note: string | null;
};

export type TimelineData = {
  start: string; // YYYY-MM-DD, first planned day
  sessions: Session[];
  later: string[]; // greyed "coming later" line, not sessions
};

export type ScheduledSession = Session & { date: string };

export const TIME_ZONE = 'America/Chicago';

export function seedTimeline(): TimelineData {
  const sessions: Session[] = Array.from({ length: 21 }, (_, i) => ({
    id: `cm-warmup-${String(i + 1).padStart(2, '0')}`,
    title: 'Cali Move warm-up + cool-down',
    video: CALI_WARMUP_VIDEO,
    done: null,
    note: null,
  }));
  return {
    start: '2026-11-05',
    sessions,
    later: ['Full Cali Move workouts', 'Knees Over Toes'],
  };
}

export function todayIn(tz = TIME_ZONE, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function isDay(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function schedule(data: TimelineData, today: string): ScheduledSession[] {
  const doneDays = new Set(data.sessions.filter((s) => s.done).map((s) => s.done as string));
  let day = today > data.start ? today : data.start;
  const out: ScheduledSession[] = [];
  for (const s of data.sessions) {
    if (s.done) {
      out.push({ ...s, date: s.done });
      continue;
    }
    while (doneDays.has(day)) day = addDays(day, 1);
    out.push({ ...s, date: day });
    day = addDays(day, 1);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export type Action =
  | { action: 'done'; id?: string; date?: string; note?: string | null }
  | { action: 'undo'; id?: string }
  | { action: 'note'; id?: string; note: string | null }
  | { action: 'reset' };

/** Applies an action in place. `id` defaults: done = next pending, undo/note = latest done. */
export function apply(data: TimelineData, a: Action, today: string): { ok: true; id?: string } | { ok: false; error: string } {
  if (a.action === 'reset') {
    Object.assign(data, seedTimeline());
    return { ok: true };
  }
  const latestDone = () =>
    [...data.sessions].filter((s) => s.done).sort((x, y) => ((x.done as string) < (y.done as string) ? -1 : 1)).pop();
  const pick = a.id
    ? data.sessions.find((s) => s.id === a.id)
    : a.action === 'done'
      ? data.sessions.find((s) => !s.done)
      : latestDone();
  if (!pick) return { ok: false, error: a.id ? `no session ${a.id}` : 'no matching session' };

  if (a.action === 'done') {
    const date = a.date ?? today;
    if (!isDay(date)) return { ok: false, error: 'date must be YYYY-MM-DD' };
    pick.done = date;
    if (a.note !== undefined) pick.note = cleanNote(a.note);
  } else if (a.action === 'undo') {
    pick.done = null;
    pick.note = null;
  } else if (a.action === 'note') {
    if (!pick.done) return { ok: false, error: 'notes go on done sessions' };
    pick.note = cleanNote(a.note);
  }
  return { ok: true, id: pick.id };
}

function cleanNote(n: unknown): string | null {
  if (typeof n !== 'string') return null;
  const t = n.trim().slice(0, 200);
  return t || null;
}
