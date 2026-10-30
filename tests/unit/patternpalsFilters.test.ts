import { describe, expect, test } from 'vitest';

import { getPatternTiming } from '@/lib/patternpals/atlas';
import { DIFFICULTY_BANDS, estimateDifficulty, getDifficultyBand } from '@/lib/patternpals/difficulty';
import { buildEligiblePatternPool, effectiveDifficultyBand, matchesQuery } from '@/lib/patternpals/eligibility';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';

const byId = (id: string) => {
  const pattern = getPatternById(id);
  if (!pattern) throw new Error(`missing pattern ${id}`);
  return pattern;
};

describe('difficulty heuristic', () => {
  test('bands follow clubs per juggler and tricks', () => {
    expect(getDifficultyBand(byId('6_clubs_4_count'))).toBe(1); // 6 clubs, 4-count
    expect(getDifficultyBand(byId('6_clubs_pps'))).toBe(2); // pass pass self
    expect(getDifficultyBand(byId('why_not'))).toBe(2); // period-5 zip pattern
    expect(getDifficultyBand(byId('7_clubs_4_count'))).toBe(3); // 3.5 clubs each
    expect(getDifficultyBand(byId('8_clubs_pps'))).toBe(4); // 4 clubs each plus PPS
    expect(getDifficultyBand(byId('scrambled_v'))).toBe(3); // takeouts
    expect(getDifficultyBand(byId('two_count_feed'))).toBe(1); // standard 9-club feed
  });

  test('every band is populated and reasons are explainable', () => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const pattern of PATTERN_LIBRARY) counts[getDifficultyBand(pattern)] += 1;
    for (const band of [1, 2, 3, 4] as const) expect(counts[band], DIFFICULTY_BANDS[band].label).toBeGreaterThan(20);
    const estimate = estimateDifficulty(byId('7_clubs_5_count_popcorn'));
    expect(estimate.reasons).toContain('popcorn');
    expect(estimate.reasons).toContain('3.5 clubs per juggler');
  });

  test('stretch me moves one band up and caps at expert', () => {
    expect(effectiveDifficultyBand(1, true)).toBe(2);
    expect(effectiveDifficultyBand(4, true)).toBe(4);
    expect(effectiveDifficultyBand(null, false)).toBeNull();
    expect(effectiveDifficultyBand(null, true)).toBe(3);
  });
});

describe('timing', () => {
  test('derives sync/async from names and anthology notation', () => {
    expect(getPatternTiming(byId('synchronous_one_count'))).toBe('sync');
    expect(getPatternTiming(byId('async_jim_s_2_count'))).toBe('async');
    expect(getPatternTiming(byId('parsnip'))).toBe('async'); // 4-handed siteswap 77722
  });
});

describe('filters and search', () => {
  test('club range keeps two beginners away from 11-club patterns', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 2, clubsMin: 5, clubsMax: 6 });
    expect(eligible.length).toBeGreaterThan(50);
    for (const pattern of eligible) {
      const clubs = pattern.numObjects;
      if (typeof clubs === 'number') expect(clubs, pattern.id).toBeLessThanOrEqual(6);
    }
  });

  test('difficulty band and stretch narrow the pool', () => {
    const starter = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 2, difficultyBand: 1 });
    const stretched = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 2, difficultyBand: 1, stretch: true });
    expect(starter.eligible.length).toBeGreaterThan(10);
    expect(stretched.eligible.every((p) => getDifficultyBand(p) === 2)).toBe(true);
    expect(starter.eligible.some((p) => stretched.eligible.includes(p))).toBe(false);
  });

  test('search matches names, aliases and siteswaps', () => {
    expect(matchesQuery(byId('why_not'), 'why not')).toBe(true);
    expect(matchesQuery(byId('why_not'), 'WHY')).toBe(true);
    expect(matchesQuery(byId('parsnip'), '77722')).toBe(true);
    expect(matchesQuery(byId('6_club_2_count'), 'pass self')).toBe(true); // alias
    expect(matchesQuery(byId('parsnip'), 'feast')).toBe(false);
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 2, query: 'popcorn' });
    expect(eligible.length).toBeGreaterThan(5);
    expect(eligible.every((p) => /popcorn/i.test(p.name))).toBe(true);
  });

  test('timing filter excludes unknown timing', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 2, timing: 'sync' });
    expect(eligible.length).toBeGreaterThan(5);
    expect(eligible.every((p) => getPatternTiming(p) === 'sync')).toBe(true);
  });
});
