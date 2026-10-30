/**
 * Relatives between patterns: the same pattern with one more/fewer club, the
 * crossing/straight or sync/async sibling, siteswap-compatible partners
 * (same catching interface, so two jugglers can run them against each other,
 * e.g. 4-count vs 3-count), and Will Murray's printed "related patterns".
 */
import { getPatternJugglerBounds, getPatternObjectCount } from './atlas';
import { analyzeSiteswap, siteswapsCompatible } from './siteswap';
import type { SiteswapAnalysis } from './siteswap';
import type { Pattern } from './types';

export type RelativeKind = 'more-clubs' | 'fewer-clubs' | 'same-family' | 'crossing-straight' | 'sync-async' | 'compatible' | 'book-related';

export type PatternRelative = {
  pattern: Pattern;
  kind: RelativeKind;
  label: string;
};

const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13',
};

/** Family key: the name without club counts, juggler counts, sync/async, crossing/straight and punctuation. */
export const familyKey = (name: string) => {
  let s = name.toLowerCase().replace(/[’‘']/g, '');
  s = s.replace(/\(.*?\)/g, ' ');
  s = s.replace(/\b\d+\+?\s*-?\s*clubs?\b\s*:?/g, ' ');
  s = s.replace(/\b(a?sync(?:h|hronous)?|crossing|straight|for \d+ jugglers?|with|passes|version)\b/g, ' ');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  s = s
    .split(' ')
    .filter(Boolean)
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(' ');
  s = s.replace(/\b(\d+) count\b/g, '$1count').replace(/\b(the|of|a)\b/g, '');
  return s.replace(/\s+/g, ' ').trim();
};

const normName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[’‘']/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();

let cache: { library: Pattern[]; byFamily: Map<string, Pattern[]>; byName: Map<string, Pattern>; analyses: Map<string, SiteswapAnalysis> } | null = null;

const index = (library: Pattern[]) => {
  if (cache && cache.library === library) return cache;
  const byFamily = new Map<string, Pattern[]>();
  const byName = new Map<string, Pattern>();
  const analyses = new Map<string, SiteswapAnalysis>();
  for (const pattern of library) {
    const key = familyKey(pattern.name);
    if (key) byFamily.set(key, [...(byFamily.get(key) ?? []), pattern]);
    byName.set(normName(pattern.name), pattern);
    for (const alias of pattern.aliases ?? []) {
      if (!byName.has(normName(alias))) byName.set(normName(alias), pattern);
    }
    const ss = pattern.derived?.siteswap;
    if (ss) {
      const analysis = analyzeSiteswap(ss);
      if (analysis) analyses.set(pattern.id, analysis);
    }
  }
  cache = { library, byFamily, byName, analyses };
  return cache;
};

const sameJugglers = (a: Pattern, b: Pattern) => getPatternJugglerBounds(a).min === getPatternJugglerBounds(b).min;

export const getPatternRelatives = (pattern: Pattern, library: Pattern[]): PatternRelative[] => {
  const { byFamily, byName, analyses } = index(library);
  const out: PatternRelative[] = [];
  const seen = new Set<string>([pattern.id]);
  const push = (candidate: Pattern | undefined, kind: RelativeKind, label: string) => {
    if (!candidate || seen.has(candidate.id)) return;
    seen.add(candidate.id);
    out.push({ pattern: candidate, kind, label });
  };

  const clubs = getPatternObjectCount(pattern);
  const lowerName = pattern.name.toLowerCase();
  const family = byFamily.get(familyKey(pattern.name)) ?? [];
  const familyWithSameJugglers = family.filter((p) => p.id !== pattern.id && sameJugglers(p, pattern));

  // Same family, different club count (+1 first, then -1, then the rest).
  for (const candidate of familyWithSameJugglers) {
    const other = getPatternObjectCount(candidate);
    if (clubs && other && other === clubs + 1) push(candidate, 'more-clubs', `+1 club (${other})`);
  }
  for (const candidate of familyWithSameJugglers) {
    const other = getPatternObjectCount(candidate);
    if (clubs && other && other === clubs - 1) push(candidate, 'fewer-clubs', `−1 club (${other})`);
  }
  // Crossing / straight and sync / async siblings share the family key too.
  for (const candidate of familyWithSameJugglers) {
    const candidateName = candidate.name.toLowerCase();
    const crossing = /crossing|straight/.test(candidateName) !== /crossing|straight/.test(lowerName);
    const sync = /\basync|asynchronous\b/.test(candidateName) !== /\basync|asynchronous\b/.test(lowerName) || /\bsync(h|hronous)?\b/.test(candidateName) !== /\bsync(h|hronous)?\b/.test(lowerName);
    const other = getPatternObjectCount(candidate);
    if (crossing && (!clubs || !other || other === clubs)) push(candidate, 'crossing-straight', /crossing/.test(candidateName) ? 'crossing version' : 'straight version');
    else if (sync && (!clubs || !other || other === clubs)) push(candidate, 'sync-async', /async/.test(candidateName) ? 'async version' : 'sync version');
  }
  for (const candidate of familyWithSameJugglers) {
    const other = getPatternObjectCount(candidate);
    if (other && clubs && other !== clubs) push(candidate, other > clubs ? 'more-clubs' : 'fewer-clubs', `${other} clubs`);
    else push(candidate, 'same-family', 'same family');
  }

  // Siteswap-compatible partners: same period and catching interface, so the two can be juggled against each other.
  const analysis = analyses.get(pattern.id);
  if (analysis) {
    for (const candidate of library) {
      if (candidate.id === pattern.id) continue;
      const other = analyses.get(candidate.id);
      if (other && other.input !== analysis.input && siteswapsCompatible(analysis, other)) {
        push(candidate, 'compatible', `compatible (${other.input}, ${other.clubs} clubs)`);
      }
    }
  }

  // Will Murray's printed relatives (by name, or by siteswap when the name is a siteswap).
  for (const rel of pattern.derived?.related ?? []) {
    let candidate = byName.get(normName(rel.name));
    if (!candidate && /^[0-9a-f]+$/i.test(rel.name)) {
      candidate = library.find((p) => p.derived?.siteswap === rel.name.toLowerCase());
    }
    if (candidate) {
      push(candidate, 'book-related', rel.relation === 'add' ? 'add a club (Will Murray)' : rel.relation === 'subtract' ? 'subtract a club (Will Murray)' : 'related (Will Murray)');
    }
  }

  return out;
};
