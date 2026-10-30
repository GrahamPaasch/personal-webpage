/**
 * Eligibility engine for PatternPals randomizer.
 *
 * Builds a constrained pool of patterns eligible for a given juggler count and
 * optional filters, then draws a random pattern from that pool, tracking
 * recent draw history to avoid immediate repeats.
 */

import { getPatternSources, getPatternTiming, patternSupportsJugglers, getPatternObjectCount, getPatternType } from './atlas';
import type { PatternTiming } from './atlas';
import { getDifficultyBand } from './difficulty';
import type { DifficultyBand } from './difficulty';
import type { Pattern, PatternType } from './types';

export type EligibilityOptions = {
  /** Number of jugglers present. Required. */
  jugglerCount: number;
  /** Optional pattern type filter. */
  patternType?: PatternType | 'all';
  /** Optional exact object count filter. */
  objectCount?: number | null;
  /** Optional inclusive club-count range; patterns with an unknown count are kept. */
  clubsMin?: number | null;
  clubsMax?: number | null;
  /** Optional timing filter; patterns with unknown timing are excluded when set. */
  timing?: PatternTiming | 'all';
  /** Optional difficulty band; with `stretch` the band one notch above is used instead. */
  difficultyBand?: DifficultyBand | null;
  stretch?: boolean;
  /** Optional free-text search over name, aliases and notation. */
  query?: string;
  /** If true, only patterns with at least one mapped source book are included. */
  sourceBacked?: boolean;
};

export const normalizeQuery = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2019\u2018']/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();

/** Text a pattern can be found by: name, aliases, rhythm, siteswap/prechac notation. */
export const patternSearchText = (pattern: Pattern) => {
  const anthology = pattern.derived?.anthology;
  return normalizeQuery(
    [pattern.name, ...(pattern.aliases ?? []), pattern.rhythm ?? '', anthology?.global ?? '', anthology?.local ?? '', anthology?.prechac ?? '', anthology?.sequence ?? '']
      .filter(Boolean)
      .join(' '),
  );
};

export const matchesQuery = (pattern: Pattern, query: string) => {
  const q = normalizeQuery(query);
  if (!q) return true;
  const haystack = patternSearchText(pattern);
  return q.split(' ').every((term) => haystack.includes(term));
};

export const effectiveDifficultyBand = (band: DifficultyBand | null | undefined, stretch: boolean | undefined): DifficultyBand | null => {
  if (!band) return stretch ? 3 : null;
  return stretch ? (Math.min(4, band + 1) as DifficultyBand) : band;
};

export type EligibilityResult = {
  /** Patterns that match all constraints. */
  eligible: Pattern[];
  /** Human-readable reasons why each non-eligible pattern was excluded, keyed by pattern id. */
  exclusionReasons: Record<string, string[]>;
  /** Total patterns evaluated. */
  totalEvaluated: number;
};

export type DrawHistoryEntry = {
  pattern: Pattern;
  drawnAt: number; // Date.now()
};

/**
 * Build a pool of patterns eligible for the given constraints.
 */
export function buildEligiblePatternPool(
  patterns: Pattern[],
  options: EligibilityOptions,
): EligibilityResult {
  const {
    jugglerCount,
    patternType = 'all',
    objectCount = null,
    clubsMin = null,
    clubsMax = null,
    timing = 'all',
    difficultyBand = null,
    stretch = false,
    query = '',
    sourceBacked = false,
  } = options;
  const band = effectiveDifficultyBand(difficultyBand, stretch);

  const eligible: Pattern[] = [];
  const exclusionReasons: Record<string, string[]> = {};

  for (const pattern of patterns) {
    const reasons: string[] = [];

    if (!patternSupportsJugglers(pattern, jugglerCount)) {
      reasons.push(`Requires a different number of jugglers (not ${jugglerCount})`);
    }

    if (patternType !== 'all' && getPatternType(pattern) !== patternType) {
      reasons.push(`Pattern type is not "${patternType}"`);
    }

    if (typeof objectCount === 'number' && getPatternObjectCount(pattern) !== objectCount) {
      reasons.push(`Object count is not ${objectCount}`);
    }

    const clubs = getPatternObjectCount(pattern);
    if (typeof clubs === 'number') {
      if (typeof clubsMin === 'number' && clubs < clubsMin) reasons.push(`Fewer than ${clubsMin} clubs`);
      if (typeof clubsMax === 'number' && clubs > clubsMax) reasons.push(`More than ${clubsMax} clubs`);
    }

    if (timing !== 'all' && getPatternTiming(pattern) !== timing) {
      reasons.push(`Timing is not ${timing}`);
    }

    if (band !== null && getDifficultyBand(pattern) !== band) {
      reasons.push(`Difficulty band is not ${band}`);
    }

    if (query && !matchesQuery(pattern, query)) {
      reasons.push('Does not match the search');
    }

    if (sourceBacked) {
      const { sources } = getPatternSources(pattern);
      if (sources.length === 0) {
        reasons.push('No mapped source book');
      }
    }

    if (reasons.length > 0) {
      exclusionReasons[pattern.id] = reasons;
    } else {
      eligible.push(pattern);
    }
  }

  return { eligible, exclusionReasons, totalEvaluated: patterns.length };
}

/**
 * Draw one random pattern from the eligible pool.
 * Avoids patterns in `recentHistory` (up to `avoidCount` entries) when
 * the pool is large enough to have alternatives.
 */
export function drawRandomPattern(
  eligible: Pattern[],
  recentHistory: DrawHistoryEntry[] = [],
  avoidCount = 5,
): Pattern | null {
  if (eligible.length === 0) return null;

  const recentIds = new Set(recentHistory.slice(-avoidCount).map((entry) => entry.pattern.id));
  const preferred = eligible.filter((p) => !recentIds.has(p.id));
  const pool = preferred.length > 0 ? preferred : eligible;

  const index = Math.floor(Math.random() * pool.length);
  const drawn = pool[index];

  // Defensive check: verify the drawn pattern is from our eligible pool
  // (this should always be true, but helps catch bugs)
  if (!drawn) return null;

  return drawn;
}
