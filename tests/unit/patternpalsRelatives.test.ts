import { describe, expect, test } from 'vitest';

import { getPatternTiming } from '@/lib/patternpals/atlas';
import { PATTERN_DERIVED } from '@/lib/patternpals/derived';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';
import { familyKey, getPatternRelatives } from '@/lib/patternpals/relatives';
import { analyzeSiteswap, validateSyncPair } from '@/lib/patternpals/siteswap';

const byId = (id: string) => {
  const pattern = getPatternById(id);
  if (!pattern) throw new Error(`missing pattern ${id}`);
  return pattern;
};

describe('structure derived from the books', () => {
  test('every stored siteswap is valid and agrees with the club count', () => {
    let count = 0;
    for (const pattern of PATTERN_LIBRARY) {
      const ss = pattern.derived?.siteswap;
      if (!ss) continue;
      count += 1;
      const analysis = analyzeSiteswap(ss);
      expect(analysis, `${pattern.id} ${ss}`).not.toBeNull();
      expect(analysis!.clubs, `${pattern.id} ${ss}`).toBe(pattern.numObjects);
    }
    expect(count).toBeGreaterThan(90);
  });

  test('every stored sync pair validates', () => {
    let count = 0;
    for (const pattern of PATTERN_LIBRARY) {
      const pair = pattern.derived?.syncPair;
      if (!pair) continue;
      const result = validateSyncPair(pair[0], pair[1]);
      if (result) {
        count += 1;
        expect(result.clubs, `${pattern.id} ${pair.join('|')}`).toBe(pattern.numObjects);
      }
    }
    expect(count).toBeGreaterThan(30);
  });

  test('the 7 clubs: 4 vs 3 4-counts seed carries its pair and timing', () => {
    const pattern = byId('7_clubs_4_vs_3_4_counts');
    expect(pattern.derived?.syncPair).toEqual(['53p53', '33p33']);
    expect(pattern.numObjects).toBe(7);
    expect(getPatternTiming(pattern)).toBe('sync');
    expect(getPatternTiming(byId('why_not'))).toBe('async');
    expect(PATTERN_DERIVED.why_not.siteswap).toBe('77862');
  });
});

describe('relatives', () => {
  test('family keys ignore club counts and timing words', () => {
    expect(familyKey('Why not (7 clubs)')).toBe(familyKey('why not?'));
    expect(familyKey('6 clubs: Jim’s 2-count')).toBe(familyKey("Jim's two count"));
    expect(familyKey('async Jim’s 2-count')).toBe(familyKey("Jim's 2-count"));
    expect(familyKey('Four count with crossing passes')).toBe(familyKey('Four count'));
  });

  test('club variants and siblings are found', () => {
    const whyNot = getPatternRelatives(byId('why_not'), PATTERN_LIBRARY);
    expect(whyNot.some((r) => r.kind === 'more-clubs' || r.kind === 'fewer-clubs')).toBe(true);
    expect(whyNot.map((r) => r.pattern.id)).toContain('why_not_7_clubs');
    const fourCount = getPatternRelatives(byId('four_count'), PATTERN_LIBRARY);
    expect(fourCount.some((r) => r.kind === 'crossing-straight')).toBe(true);
    const jims = getPatternRelatives(byId('jim_s_2_count'), PATTERN_LIBRARY);
    expect(jims.some((r) => r.kind === 'sync-async')).toBe(true);
  });

  test('compatible siteswaps and Will Murray relatives', () => {
    const threeCount = getPatternRelatives(byId('7_club_3_count'), PATTERN_LIBRARY); // 966
    expect(threeCount.some((r) => r.kind === 'compatible' && r.pattern.derived?.siteswap === '786')).toBe(true);
    const par = getPatternRelatives(byId('55513p'), PATTERN_LIBRARY);
    expect(par.some((r) => r.kind === 'book-related' && r.pattern.id === 'par')).toBe(true);
  });
});
