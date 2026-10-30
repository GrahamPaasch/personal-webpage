import { describe, expect, test } from 'vitest';

import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';
import { getExternalLinks, getProvenance, passistSiteswapUrl } from '@/lib/patternpals/sources';

describe('external sources', () => {
  test('passist deep links follow /siteswap/<ss>?jugglers=N', () => {
    expect(passistSiteswapUrl('77862')).toBe('https://passist.org/siteswap/77862?jugglers=2');
    expect(passistSiteswapUrl('9 96', 2)).toBe('https://passist.org/siteswap/996?jugglers=2');
  });

  test('patterns with a siteswap link out to Passist and Kästner with attribution', () => {
    const links = getExternalLinks(getPatternById('why_not')!);
    expect(links.map((l) => l.provider)).toEqual(expect.arrayContaining(['passist', 'kaestner-list', 'modern-passing']));
    expect(links.find((l) => l.provider === 'passist')?.href).toBe('https://passist.org/siteswap/77862?jugglers=2');
    for (const link of links) {
      expect(link.attribution.length).toBeGreaterThan(5);
      expect(link.href.startsWith('https://')).toBe(true);
    }
    expect(getExternalLinks(getPatternById('feast_4')!)).toEqual([]);
  });

  test('every pattern has provenance for its counts', () => {
    let withJugglers = 0;
    for (const pattern of PATTERN_LIBRARY) {
      const lines = getProvenance(pattern);
      expect(lines.length).toBeGreaterThan(0);
      if (lines.some((l) => l.field === 'Jugglers')) withJugglers += 1;
    }
    expect(withJugglers / PATTERN_LIBRARY.length).toBeGreaterThan(0.97);
    const seed = getProvenance(getPatternById('7_clubs_4_vs_3_4_counts')!);
    expect(seed.find((l) => l.field === 'Local siteswaps')?.value).toBe('53p53 | 33p33');
  });
});
