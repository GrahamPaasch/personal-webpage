/**
 * Eligibility engine for PatternPals randomizer.
 *
 * Builds a constrained pool of patterns eligible for a given juggler count and
 * optional filters, then draws a random pattern from that pool, tracking
 * recent draw history to avoid immediate repeats.
 */

import { getPatternSources, patternSupportsJugglers, getPatternObjectCount, getPatternType } from './atlas';
import type { Pattern, PatternType } from './types';

export type EligibilityOptions = {
  /** Number of jugglers present. Required. */
  jugglerCount: number;
  /** Optional pattern type filter. */
  patternType?: PatternType | 'all';
  /** Optional exact object count filter. */
  objectCount?: number | null;
  /** If true, only patterns with at least one mapped source book are included. */
  sourceBacked?: boolean;
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
  const { jugglerCount, patternType = 'all', objectCount = null, sourceBacked = false } = options;

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
  return pool[index];
}
