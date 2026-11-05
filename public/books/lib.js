// Pure helpers for the /books reader (voice-ui spec 32). No DOM here, so the
// unit tests can import this file directly.

/** "#3:14", "3:14.2" -> { c: 3, p: 14, s: 2 }; anything else -> null. */
export function parseAddr(h) {
  if (typeof h !== 'string') return null;
  const m = decodeURIComponent(h).replace(/^#/, '').trim().match(/^(\d{1,4}):(\d{1,5})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const a = { c: Number(m[1]), p: Number(m[2]) };
  if (m[3]) a.s = Number(m[3]);
  return a.c > 0 && a.p > 0 && (a.s == null || a.s > 0) ? a : null;
}

export const fmtAddr = (a) => (a ? `${a.c}:${a.p}${a.s ? `.${a.s}` : ''}` : '');
export const cmpAddr = (a, b) => a.c - b.c || a.p - b.p || (a.s || 0) - (b.s || 0);

/**
 * Address label for a selection from `start` to `end` (inclusive):
 *   same sentence          3:14.2
 *   same paragraph         3:14.2–4   (or 3:14 when no sentence info)
 *   same chapter           3:14–16
 *   across chapters        3:14–4:2
 */
export function rangeLabel(start, end) {
  if (!end || (start.c === end.c && start.p === end.p)) {
    if (start.s && end && end.s && end.s !== start.s) return `${start.c}:${start.p}.${start.s}–${end.s}`;
    if (start.s && (!end || end.s === start.s || !end.s)) return fmtAddr(start);
    return `${start.c}:${start.p}`;
  }
  if (start.c === end.c) return `${start.c}:${start.p}–${end.p}`;
  return `${start.c}:${start.p}–${end.c}:${end.p}`;
}

export const permalink = (origin, slug, a) => `${origin.replace(/\/$/, '')}/books/${slug}#${fmtAddr(a)}`;

/** "— Le Page du Pratz, The History of Louisiana, 19:14.2, https://…/books/history-of-louisiana#19:14.2" */
export function citation(book, start, end, origin) {
  const first = start.s && end && (end.c !== start.c || end.p !== start.p) ? { c: start.c, p: start.p } : start;
  return `— ${book.author}, ${book.title}, ${rangeLabel(start, end)}, ${permalink(origin, book.slug, first)}`;
}

/** Text that goes on the clipboard: exactly what was selected, then the citation on its own line. */
export const copyPayload = (selected, cite) => `${selected.replace(/\s+$/, '')}\n\n${cite}`;

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function copyPayloadHtml(selectedHtml, book, start, end, origin) {
  const url = permalink(origin, book.slug, start.s && end && (end.c !== start.c || end.p !== start.p) ? { c: start.c, p: start.p } : start);
  return `${selectedHtml}<p>— ${escHtml(book.author)}, <i>${escHtml(book.title)}</i>, <a href="${escHtml(url)}">${rangeLabel(start, end)}</a></p>`;
}

/**
 * May reading move the place from `place` to `cand`? Only forward, and only by
 * a reading-sized step: jumping far ahead (contents, a permalink) never drags
 * the place along — that needs "Move my place here".
 */
export function canAdvance(place, cand, maxGap = 12) {
  if (!cand) return false;
  if (!place) return cand.i <= maxGap;
  return cand.i > place.i && cand.i - place.i <= maxGap;
}

/** Gists whose chunk overlaps any of a session's [chapter, from, to] ranges, in book order. */
export function gistsForRanges(gists, ranges) {
  return gists.filter((g) => g.text && ranges.some(([c, f, t]) => c === g.c && f <= g.to && t >= g.from));
}

/** The gist chunk that contains an address. */
export const gistAt = (gists, a) => gists.find((g) => g.c === a.c && a.p >= g.from && a.p <= g.to) || null;

/** Normalise the stored password check the same way the server does (for UX only). */
export const normalizePassword = (pw) => String(pw || '').toLowerCase().replace(/[^a-z]/g, '');
