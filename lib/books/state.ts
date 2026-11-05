import { createHash, randomUUID } from 'node:crypto';

/**
 * Reader state for /books (voice-ui spec 32), kept as one JSONB document.
 *
 * Public: each book's place (furthest paragraph reached), its notes /
 * highlights / links (no timestamps), which book was read last, and monthly
 * totals. Private (password-only): the reading-session log, what is on screen
 * right now, and every timestamp.
 */

export type Addr = { c: number; p: number };
export type Place = Addr & { i?: number }; // i = global paragraph index in the book (for counting)

export type NoteKind = 'note' | 'highlight' | 'link';
export type Note = {
  id: string;
  kind: NoteKind;
  at: Addr & { s?: number };
  to?: Addr; // inclusive end of a highlight range
  quote?: string; // a few words inside the paragraph that the note is about
  text?: string;
  url?: string;
  label?: string;
};

export type BookState = { place: Place | null; finished?: boolean; notes: Note[] };
export type Session = { start: number; end: number; ranges: [number, number, number][] }; // [chapter, fromP, toP]
export type Totals = { paragraphs: number; words: number; finished: number };

export type BooksData = {
  books: Record<string, BookState>;
  last: string | null;
  totals: Record<string, Totals>; // by month "YYYY-MM" (Central time)
  private: {
    sessions: Record<string, Session[]>;
    view: { slug: string; paras: string[]; at: number } | null;
    placeAt: Record<string, number>;
    noteAt: Record<string, number>;
  };
};

export const SESSION_GAP_MS = 30 * 60 * 1000;
export const MAX_SESSIONS = 1000;
export const MAX_STEP = 400; // a single report can't count more paragraphs than this (protects totals from jumps)
export const WORDS_PER_PAGE = 275;

export const emptyData = (): BooksData => ({
  books: {},
  last: null,
  totals: {},
  private: { sessions: {}, view: null, placeAt: {}, noteAt: {} },
});

// ---------------------------------------------------------------- auth

/** "Graham Books", either order, any case or spacing. Only hashes live here. */
const ACCEPTED = new Set([
  '1b177db898697d99131d474af4e9d6d53158906b272a449bdc433eaf952e454e',
  '8923d9a52b9a0effe20d417a033fbd78748072b4f6b26fa2dbd110582fab2bd6',
]);
export const normalizePassword = (pw: string) => pw.toLowerCase().replace(/[^a-z]/g, '');
export const passwordOk = (pw: unknown): boolean =>
  typeof pw === 'string' && ACCEPTED.has(createHash('sha256').update(`books:${normalizePassword(pw)}`).digest('hex'));

// ---------------------------------------------------------------- addresses

const SLUG = /^[a-z0-9-]{1,80}$/;
export const validSlug = (s: unknown): s is string => typeof s === 'string' && SLUG.test(s);

export function parseAddr(v: unknown): Addr | null {
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,4}):(\d{1,5})$/);
    return m ? { c: Number(m[1]), p: Number(m[2]) } : null;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Number.isInteger(o.c) && Number.isInteger(o.p) && (o.c as number) > 0 && (o.p as number) > 0) return { c: o.c as number, p: o.p as number };
  }
  return null;
}

export const cmpAddr = (a: Addr, b: Addr) => a.c - b.c || a.p - b.p;
export const fmtAddr = (a: Addr) => `${a.c}:${a.p}`;

export function monthKey(now: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(new Date(now));
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

const book = (d: BooksData, slug: string): BookState => (d.books[slug] ??= { place: null, notes: [] });
const totals = (d: BooksData, now: number): Totals => (d.totals[monthKey(now)] ??= { paragraphs: 0, words: 0, finished: 0 });

// ---------------------------------------------------------------- place

/**
 * Advance the place only if `to` is further than the current place: reading
 * never moves your place backwards on its own. Returns true if it moved.
 * Paragraph/word counts for the month come from the gap between the two
 * global indexes (capped, so a stray jump can't inflate the totals).
 */
export function advancePlace(d: BooksData, slug: string, to: Place, now: number, words = 0): boolean {
  const b = book(d, slug);
  if (b.place && cmpAddr(to, b.place) <= 0) return false;
  const step = !b.place
    ? (Number.isInteger(to.i) ? (to.i as number) + 1 : 1) // first report: everything up to here
    : Number.isInteger(b.place.i) && Number.isInteger(to.i) ? (to.i as number) - (b.place.i as number) : 1;
  if (step > 0 && step <= MAX_STEP) {
    const t = totals(d, now);
    t.paragraphs += step;
    t.words += Math.max(0, Math.min(Math.round(words) || 0, step * 1000));
  }
  b.place = { c: to.c, p: to.p, ...(Number.isInteger(to.i) ? { i: to.i } : {}) };
  d.private.placeAt[slug] = now;
  return true;
}

/** "Move my place here": the one deliberate way to move it, backwards included. */
export function movePlace(d: BooksData, slug: string, to: Place, now: number) {
  book(d, slug).place = { c: to.c, p: to.p, ...(Number.isInteger(to.i) ? { i: to.i } : {}) };
  d.private.placeAt[slug] = now;
}

export function markFinished(d: BooksData, slug: string, now: number): boolean {
  const b = book(d, slug);
  if (b.finished) return false;
  b.finished = true;
  totals(d, now).finished += 1;
  return true;
}

// ---------------------------------------------------------------- sessions

/** Merge paragraph addresses into a session's [chapter, from, to] ranges. */
export function addToRanges(ranges: [number, number, number][], paras: Addr[]) {
  for (const a of paras) {
    const hit = ranges.find(([c, f, t]) => c === a.c && a.p >= f - 1 && a.p <= t + 1);
    if (hit) {
      hit[1] = Math.min(hit[1], a.p);
      hit[2] = Math.max(hit[2], a.p);
    } else ranges.push([a.c, a.p, a.p]);
  }
  // coalesce ranges that now touch
  ranges.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  for (let i = 1; i < ranges.length; i++) {
    const [c0, , t0] = ranges[i - 1];
    const [c1, f1, t1] = ranges[i];
    if (c0 === c1 && f1 <= t0 + 1) {
      ranges[i - 1][2] = Math.max(t0, t1);
      ranges.splice(i--, 1);
    }
  }
}

/** Log what is on screen. A gap of more than 30 minutes starts a new session. */
export function logView(d: BooksData, slug: string, paras: Addr[], now: number) {
  const list = (d.private.sessions[slug] ??= []);
  let s = list[list.length - 1];
  if (!s || now - s.end > SESSION_GAP_MS) {
    s = { start: now, end: now, ranges: [] };
    list.push(s);
    if (list.length > MAX_SESSIONS) list.splice(0, list.length - MAX_SESSIONS);
  }
  s.end = now;
  addToRanges(s.ranges, paras);
  d.private.view = { slug, paras: paras.map(fmtAddr), at: now };
  d.last = slug;
}

// ---------------------------------------------------------------- notes

const KINDS = new Set<NoteKind>(['note', 'highlight', 'link']);
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);

export function addNote(d: BooksData, slug: string, input: Record<string, unknown>, now: number): { id: string } | { error: string } {
  const kind = input.kind as NoteKind;
  if (!KINDS.has(kind)) return { error: 'kind must be note, highlight or link' };
  const at = parseAddr(input.at);
  if (!at) return { error: 'at must be "chapter:paragraph"' };
  const note: Note = { id: randomUUID().slice(0, 8), kind, at };
  const s = typeof input.at === 'object' && input.at ? (input.at as Record<string, unknown>).s : input.s;
  if (Number.isInteger(s) && (s as number) > 0) note.at.s = s as number;
  const to = parseAddr(input.to);
  if (to && cmpAddr(to, at) > 0) note.to = to;
  note.quote = clip(input.quote, 600);
  note.text = clip(input.text, 5000);
  if (kind === 'link') {
    const url = clip(input.url, 2000);
    if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return { error: 'link needs an http(s) url' };
    note.url = url;
    note.label = clip(input.label, 200);
  }
  if (kind === 'note' && !note.text) return { error: 'a note needs text' };
  for (const k of Object.keys(note) as (keyof Note)[]) if (note[k] === undefined) delete note[k];
  book(d, slug).notes.push(note);
  d.private.noteAt[note.id] = now;
  return { id: note.id };
}

export function deleteNote(d: BooksData, slug: string, id: unknown): boolean {
  const b = d.books[slug];
  if (!b || typeof id !== 'string') return false;
  const i = b.notes.findIndex((n) => n.id === id);
  if (i < 0) return false;
  b.notes.splice(i, 1);
  delete d.private.noteAt[id];
  return true;
}

// ---------------------------------------------------------------- views

/** What anyone may see: no timestamps, no sessions, nothing on-screen. */
export function publicView(d: BooksData, now: number) {
  const t = d.totals[monthKey(now)] ?? { paragraphs: 0, words: 0, finished: 0 };
  const books: Record<string, { place: string | null; i: number | null; finished: boolean; notes: Note[] }> = {};
  for (const [slug, b] of Object.entries(d.books)) {
    books[slug] = { place: b.place ? fmtAddr(b.place) : null, i: b.place?.i ?? null, finished: !!b.finished, notes: b.notes };
  }
  const finishedAll = Object.values(d.books).filter((b) => b.finished).length;
  return {
    books,
    last: d.last,
    totals: {
      booksFinished: finishedAll,
      month: { paragraphs: t.paragraphs, pages: Math.round(t.words / WORDS_PER_PAGE), finished: t.finished },
    },
  };
}

/** Password view: adds the session log, what's on screen, and how long since the last report. */
export function privateView(d: BooksData, now: number) {
  const lastAt = d.private.view?.at ?? null;
  return {
    ...publicView(d, now),
    view: d.private.view,
    idleMs: lastAt == null ? null : now - lastAt,
    sessions: d.private.sessions,
  };
}

/** Fill in any keys an older stored document lacks (mutates, returns it). */
export function withDefaults(d: Partial<BooksData> | null | undefined): BooksData {
  const x = (d ?? {}) as BooksData;
  x.books ??= {};
  x.last ??= null;
  x.totals ??= {};
  x.private ??= { sessions: {}, view: null, placeAt: {}, noteAt: {} };
  x.private.sessions ??= {};
  x.private.view ??= null;
  x.private.placeAt ??= {};
  x.private.noteAt ??= {};
  for (const b of Object.values(x.books)) b.notes ??= [];
  return x;
}
