import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { getPatternJugglerBounds, getPatternObjectCount, patternSupportsJugglers } from '@/lib/patternpals/atlas';
import { PATTERN_DERIVED, REMOVED_PATTERN_IDS } from '@/lib/patternpals/derived';
import { PATTERN_EXCERPTS } from '@/lib/patternpals/excerpts';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';

const JUNK_NAMES = ['pA', 'pB', 'z', 'throw', 'Jugglers', 'Juggler', 'Variation:', 'Version 1.2', 'Appendix', 'Games', 'Positions', 'It', 'That'];

describe('PatternPals catalog cleanup', () => {
  test('book index / heading junk entries are gone', () => {
    const names = new Set(PATTERN_LIBRARY.map((p) => p.name));
    for (const junk of JUNK_NAMES) expect(names.has(junk), junk).toBe(false);
    for (const id of Object.keys(REMOVED_PATTERN_IDS)) expect(getPatternById(id), id).toBeUndefined();
  });

  test('merged ids point at patterns that still exist', () => {
    for (const [id, target] of Object.entries(REMOVED_PATTERN_IDS)) {
      if (target) expect(getPatternById(target), `${id} -> ${target}`).toBeDefined();
    }
  });

  test('ids and names are unique', () => {
    const ids = PATTERN_LIBRARY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every pattern has a sane juggler count and every excerpt image exists', () => {
    for (const pattern of PATTERN_LIBRARY) {
      const bounds = getPatternJugglerBounds(pattern);
      expect(bounds.min, pattern.id).toBeGreaterThanOrEqual(1);
      expect(bounds.min, pattern.id).toBeLessThanOrEqual(48);
      const excerpt = PATTERN_EXCERPTS[pattern.id];
      if (excerpt) {
        expect(existsSync(join(process.cwd(), 'public', excerpt.image)), excerpt.image).toBe(true);
        expect(excerpt.page).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('most patterns carry a book-derived juggler count', () => {
    const derived = PATTERN_LIBRARY.filter((p) => typeof PATTERN_DERIVED[p.id]?.numJugglers === 'number').length;
    expect(derived / PATTERN_LIBRARY.length).toBeGreaterThan(0.97);
  });

  test('juggler counts follow each book\'s convention', () => {
    const expectations: Record<string, number> = {
      urban_terror_feed: 4, // Highgate four-person feeds chapter
      two_count_triangle: 3, // Highgate triangles chapter
      why_not_box: 4, // Highgate box feeds
      y2k: 4, // Madison v1.2 "(for 4 jugglers)"
      big_hinge: 12, // Madison v3 big patterns
      '7_clubs_4_vs_3_4_counts': 2, // Compendium "7 clubs:" prefix
      two_harbour_y_4: 4, // Compendium "(4)" suffix
      '55513pfeed': 3, // Will "Jugglers: 3"
      scrambled_v: 4, // takeouts: three passers plus a manipulator
      feast_2_count: 6, // anthology "6 jugglers" chapter
      '1_2_3_apollo': 6, // Madison v3 chapter 6
    };
    for (const [id, jugglers] of Object.entries(expectations)) {
      const pattern = getPatternById(id);
      expect(pattern, id).toBeDefined();
      expect(getPatternJugglerBounds(pattern!).min, id).toBe(jugglers);
    }
  });

  test('open-ended patterns accept larger groups and carry club counts', () => {
    const feast = getPatternById('feast_4')!;
    expect(getPatternJugglerBounds(feast)).toMatchObject({ min: 4, max: null });
    expect(patternSupportsJugglers(feast, 9)).toBe(true);
    expect(getPatternObjectCount(getPatternById('7_clubs_4_vs_3_4_counts')!)).toBe(7);
    expect(getPatternObjectCount(getPatternById('55513pfeed')!)).toBe(11);
    expect(getPatternObjectCount(getPatternById('parsnip')!)).toBe(5);
  });
});
