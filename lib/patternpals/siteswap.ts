/**
 * Four-handed siteswap and two-juggler prechac helpers.
 *
 * Conventions (as in the Highgate book, Passist and the Passing Pattern Anthology):
 * - A 4-handed siteswap is a vanilla siteswap over the four hands of two jugglers,
 *   throws alternating A-right, B-right, A-left, B-left ... Odd throws are passes,
 *   even throws are selfs. The average is the number of clubs.
 * - Prechac (two jugglers): each juggler's local sequence, where a pass is written
 *   with "p" and its value is half the global value (3.5p == global 7).
 */

export type SiteswapAnalysis = {
  input: string;
  throws: number[];
  period: number;
  clubs: number;
  /** Which beats are passes ('p') or selfs ('s'), by throw. */
  throwKinds: string;
  /** Kästner-style interface: what lands on each beat, 'p' for a pass, 's' for a self. */
  interface: string;
  /** Prechac per juggler, A on even beats, B on odd beats (period doubled when odd). */
  local: { A: string[]; B: string[] };
  orbitsSync: boolean;
};

const DIGITS = '0123456789abcdef';

export const parseSiteswapThrows = (text: string): number[] | null => {
  const cleaned = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleaned || !/^[0-9a-f]+$/.test(cleaned)) return null;
  return Array.from(cleaned).map((ch) => DIGITS.indexOf(ch));
};

/** Vanilla siteswap validity: integral average and no two throws landing on the same beat. */
export const isValidSiteswap = (throws: number[]): boolean => {
  if (throws.length === 0) return false;
  const period = throws.length;
  const sum = throws.reduce((a, b) => a + b, 0);
  if (sum % period !== 0) return false;
  const landings = new Set<number>();
  for (let i = 0; i < period; i += 1) {
    const land = (i + throws[i]) % period;
    if (landings.has(land)) return false;
    landings.add(land);
  }
  return true;
};

const formatPrechacValue = (globalValue: number) => {
  const half = globalValue / 2;
  if (globalValue % 2 === 1) return `${half}p`;
  return `${half}`;
};

/** Rotate a string so the lexicographically smallest rotation comes first (for comparing interfaces). */
export const canonicalRotation = (text: string) => {
  let best = text;
  for (let i = 1; i < text.length; i += 1) {
    const candidate = text.slice(i) + text.slice(0, i);
    if (candidate < best) best = candidate;
  }
  return best;
};

export const analyzeSiteswap = (text: string): SiteswapAnalysis | null => {
  const throws = parseSiteswapThrows(text);
  if (!throws || !isValidSiteswap(throws)) return null;
  const period = throws.length;
  const clubs = throws.reduce((a, b) => a + b, 0) / period;
  const throwKinds = throws.map((t) => (t % 2 === 1 ? 'p' : 's')).join('');
  const landing: string[] = new Array(period).fill('s');
  for (let i = 0; i < period; i += 1) {
    landing[(i + throws[i]) % period] = throws[i] % 2 === 1 ? 'p' : 's';
  }
  // Doubling an odd period makes A and B's local sequences explicit.
  const expanded = period % 2 === 1 ? [...throws, ...throws] : throws;
  const A: string[] = [];
  const B: string[] = [];
  expanded.forEach((t, index) => (index % 2 === 0 ? A : B).push(formatPrechacValue(t)));
  return {
    input: text.trim().toLowerCase(),
    throws,
    period,
    clubs,
    throwKinds,
    interface: landing.join(''),
    local: { A, B },
    orbitsSync: false,
  };
};

/** Two 4-handed siteswaps are compatible when they have the same period and the same catching interface (up to rotation). */
export const siteswapsCompatible = (a: SiteswapAnalysis, b: SiteswapAnalysis) =>
  a.period === b.period && canonicalRotation(a.interface) === canonicalRotation(b.interface);

export type PrechacThrow = { value: number; pass: boolean };

/** Parse one juggler's prechac sequence like "3.5p413.5p3", "4p 4p 2", "53p53" or "3p 3 3". */
export const parsePrechac = (text: string): PrechacThrow[] | null => {
  // '*' marks a hurry and 'x' a crossing throw in the Compendium; neither changes the siteswap arithmetic.
  const cleaned = text.trim().toLowerCase().replace(/[\s,*]+/g, '').replace(/x/g, '');
  if (!cleaned) return null;
  // Single-digit values with an optional .5 (prechac) — 3.5p413.5p3 reads 3.5p 4 1 3.5p 3.
  const tokens = cleaned.match(/\d(?:\.\d)?p?|[a-f]p?/g);
  if (!tokens || tokens.join('') !== cleaned) return null;
  return tokens.map((token) => {
    const pass = token.includes('p');
    const raw = token.replace(/[px]/g, '');
    const value = /^[a-f]$/.test(raw) ? DIGITS.indexOf(raw) : Number(raw);
    return { value, pass };
  });
};

/**
 * Convert one juggler's prechac sequence (the symmetric two-juggler async case, as printed in the
 * Highgate book: "3.5p413.5p3" -> 77862) to the global 4-handed siteswap.
 *
 * A throws on the even global beats. For an odd local period n the global period is also n and
 * g[k] = 2 * a[(k * (n + 1) / 2) mod n]; for an even n, B juggles A's sequence rotated by n / 2 and the
 * global period is 2n. Returns null when the result is not a valid siteswap.
 */
export const prechacToGlobal = (sequence: PrechacThrow[]): string | null => {
  const n = sequence.length;
  if (n === 0) return null;
  const doubled: number[] = [];
  for (const t of sequence) {
    const g = Math.round(t.value * 2);
    if (Math.abs(t.value * 2 - g) > 1e-9) return null;
    if (t.pass !== (g % 2 === 1)) return null; // a pass must be a half-integer, a self an integer
    doubled.push(g);
  }
  let globalThrows: number[];
  if (n % 2 === 1) {
    const step = (n + 1) / 2;
    globalThrows = Array.from({ length: n }, (_, k) => doubled[(k * step) % n]);
  } else {
    globalThrows = [];
    for (let i = 0; i < n; i += 1) {
      globalThrows.push(doubled[i], doubled[(i + n / 2) % n]);
    }
  }
  if (!isValidSiteswap(globalThrows)) return null;
  if (globalThrows.some((g) => g >= DIGITS.length)) return null;
  return globalThrows.map((g) => DIGITS[g]).join('');
};

/** Clubs implied by a prechac sequence for n jugglers all juggling the same sequence. */
export const prechacClubs = (sequence: PrechacThrow[], jugglers: number) => {
  const avg = sequence.reduce((a, t) => a + t.value, 0) / sequence.length;
  return Math.round(avg * jugglers * 100) / 100;
};

/**
 * Validate a synchronous two-juggler pair written as local siteswaps with p for passes,
 * e.g. "53p53" vs "33p33" (7 clubs: 4 vs 3 4-counts). Both jugglers throw on every beat; a
 * throw of value v lands v beats later in the thrower's own pattern, or in the partner's when it
 * is a pass. The pair is valid when every (juggler, beat) receives exactly one club.
 */
export const validateSyncPair = (a: string, b: string): { clubs: number; passesPerPeriod: number } | null => {
  const pa = parsePrechac(a);
  const pb = parsePrechac(b);
  if (!pa || !pb || pa.length !== pb.length) return null;
  const n = pa.length;
  if (![...pa, ...pb].every((t) => Number.isInteger(t.value) && t.value >= 1)) return null;
  const landings = [new Set<number>(), new Set<number>()];
  const sequences = [pa, pb];
  for (let juggler = 0; juggler < 2; juggler += 1) {
    for (let beat = 0; beat < n; beat += 1) {
      const t = sequences[juggler][beat];
      const target = t.pass ? 1 - juggler : juggler;
      const land = (beat + t.value) % n;
      if (landings[target].has(land)) return null;
      landings[target].add(land);
    }
  }
  if (landings[0].size !== n || landings[1].size !== n) return null;
  const total = [...pa, ...pb].reduce((sum, t) => sum + t.value, 0);
  if (total % n !== 0) return null;
  const passesA = pa.filter((t) => t.pass).length;
  const passesB = pb.filter((t) => t.pass).length;
  return { clubs: total / n, passesPerPeriod: Math.max(passesA, passesB) };
};
