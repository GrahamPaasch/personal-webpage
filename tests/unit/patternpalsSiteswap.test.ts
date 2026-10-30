import { describe, expect, test } from 'vitest';

import {
  analyzeSiteswap,
  canonicalRotation,
  isValidSiteswap,
  parsePrechac,
  parseSiteswapThrows,
  prechacClubs,
  prechacToGlobal,
  siteswapsCompatible,
  validateSyncPair,
} from '@/lib/patternpals/siteswap';

describe('four-handed siteswap validation', () => {
  test('accepts well-known passing siteswaps', () => {
    for (const ss of ['5', '7', '996', '966', '975', '77722', '77862', '78627', '86277', '744', '972', '9969268', 'a77', '7777786']) {
      expect(isValidSiteswap(parseSiteswapThrows(ss)!), ss).toBe(true);
    }
  });

  test('rejects collisions and non-integral averages', () => {
    expect(isValidSiteswap(parseSiteswapThrows('543')!)).toBe(false); // 5 and 4 land together
    expect(isValidSiteswap(parseSiteswapThrows('76')!)).toBe(false); // average 6.5
    expect(parseSiteswapThrows('7x7')).toBeNull();
    expect(analyzeSiteswap('')).toBeNull();
  });

  test('derives clubs, passes and local prechac', () => {
    const whyNot = analyzeSiteswap('77862')!;
    expect(whyNot.clubs).toBe(6);
    expect(whyNot.throwKinds).toBe('ppsss'); // 7 7 8 6 2 → pass pass self self self
    expect(whyNot.local.A).toEqual(['3.5p', '4', '1', '3.5p', '3']); // the Highgate prechac 3.5p413.5p3
    const pps8 = analyzeSiteswap('996')!;
    expect(pps8.clubs).toBe(8);
    expect(pps8.period).toBe(3);
    expect(analyzeSiteswap('5')!.clubs).toBe(5);
    expect(analyzeSiteswap('7')!.clubs).toBe(7);
  });

  test('compatibility follows the catching interface', () => {
    // Kästner: 7-club three-count (966) and French three-count (786) are compatible (interface pxx)
    expect(siteswapsCompatible(analyzeSiteswap('966')!, analyzeSiteswap('786')!)).toBe(true);
    expect(siteswapsCompatible(analyzeSiteswap('744')!, analyzeSiteswap('726')!)).toBe(true);
    // Parsnip (77722) and why not (77862) have different interfaces
    expect(siteswapsCompatible(analyzeSiteswap('77722')!, analyzeSiteswap('77862')!)).toBe(false);
    expect(siteswapsCompatible(analyzeSiteswap('996')!, analyzeSiteswap('77722')!)).toBe(false);
    expect(canonicalRotation('spp')).toBe('pps');
  });
});

describe('prechac', () => {
  test('parses Highgate-style prechac and converts to the global siteswap', () => {
    const seq = parsePrechac('3.5p413.5p3')!;
    expect(seq).toHaveLength(5);
    expect(seq[0]).toEqual({ value: 3.5, pass: true });
    expect(prechacToGlobal(seq)).toBe('77862');
    expect(prechacToGlobal(parsePrechac('3.5p3.5p3.5p33.5p3.5p4')!)).toBe('7777786');
    expect(prechacClubs(seq, 2)).toBe(6);
    expect(prechacToGlobal(parsePrechac('3p')!)).toBeNull(); // a pass must be a half integer in a 2-person async pattern
  });

  test('validates synchronous pairs from the Compendium', () => {
    expect(validateSyncPair('53p53', '33p33')).toEqual({ clubs: 7, passesPerPeriod: 1 }); // 7 clubs: 4 vs 3 4-counts
    expect(validateSyncPair('4p444', '33p33')).toEqual({ clubs: 7, passesPerPeriod: 1 });
    expect(validateSyncPair('4p 3', '3 4p')).toEqual({ clubs: 7, passesPerPeriod: 1 }); // 7-club 2-count
    expect(validateSyncPair('53p53', '33p3')).toBeNull(); // different periods
    expect(validateSyncPair('53p53', '3333')).toBeNull(); // pass counts differ
  });
});
