// Local high scores (top 10). Pure list logic + a thin localStorage wrapper.
export const MAX_SCORES = 10;
const KEY = 'cascade.scores.v1';

export function qualifies(list, score) {
  if (score <= 0) return false;
  return list.length < MAX_SCORES || score > list[list.length - 1].score;
}
// Returns { list, rank } with the entry inserted (sorted by score desc, ties: earlier entry first), capped.
export function insertScore(list, entry) {
  const out = [...list, entry].sort((a, b) => b.score - a.score || (a.date ?? 0) - (b.date ?? 0));
  const capped = out.slice(0, MAX_SCORES);
  const rank = capped.indexOf(entry);
  return { list: capped, rank };
}
export function loadScores(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(e => e && typeof e.score === 'number').sort((a, b) => b.score - a.score).slice(0, MAX_SCORES) : [];
  } catch { return []; }
}
export function saveScores(list, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, JSON.stringify(list.slice(0, MAX_SCORES))); } catch {}
}
