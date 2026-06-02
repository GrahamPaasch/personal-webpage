import { expect, test } from '@playwright/test';

import { assessRosterHealth, recommendGroupPatterns } from '../lib/patternpals/groupRecommendations';
import { PATTERN_LIBRARY } from '../lib/patternpals/patterns';
import type { GroupJugglerInput, PracticeAttemptEntry } from '../lib/patternpals/types';

const buildJuggler = (
  name: string,
  overrides: Partial<GroupJugglerInput> = {},
): GroupJugglerInput => ({
  id: overrides.id ?? name.toLowerCase().replace(/\s+/g, '-'),
  name,
  comfortableObjects: overrides.comfortableObjects ?? 3,
  comfortableCount: overrides.comfortableCount ?? 4,
  movementComfort: overrides.movementComfort ?? 'stationary',
});

const buildAttempt = (
  patternId: string,
  overrides: Partial<PracticeAttemptEntry> = {},
): PracticeAttemptEntry => ({
  id: overrides.id ?? `${patternId}-attempt`,
  hostId: overrides.hostId ?? 'host-1',
  patternId,
  sessionId: overrides.sessionId ?? null,
  verdict: overrides.verdict ?? 'good-fit',
  outcomeScore: overrides.outcomeScore ?? 7,
  note: overrides.note ?? null,
  rosterSnapshot: overrides.rosterSnapshot ?? [],
  createdAt: overrides.createdAt ?? new Date('2026-06-02T12:00:00.000Z').toISOString(),
});

test.describe('PatternPals session-mode recommendations', () => {
  test('solo mode returns shadow-drill recommendations for one juggler', () => {
    const recommendations = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [buildJuggler('Ada Solo', { comfortableObjects: 3.5, comfortableCount: 4 })],
      5,
      [],
      'solo',
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every((item) => item.sessionMode === 'solo')).toBeTruthy();
    expect(recommendations.every((item) => item.assignments.length === 1)).toBeTruthy();
    expect(
      recommendations.some((item) =>
        item.reasons.some((reason) => /solo shadow|shadow drill|solo/i.test(reason)),
      ),
    ).toBeTruthy();
  });

  test('solo mode ignores extra planner rows after the first juggler', () => {
    const firstOnly = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [buildJuggler('Ada Solo', { comfortableObjects: 3.5, comfortableCount: 4 })],
      5,
      [],
      'solo',
    );
    const withExtras = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [
        buildJuggler('Ada Solo', { comfortableObjects: 3.5, comfortableCount: 4 }),
        buildJuggler('Ben Extra', { comfortableObjects: 4, comfortableCount: 3, movementComfort: 'moderate' }),
        buildJuggler('Cy Extra', { comfortableObjects: 3, comfortableCount: 5, movementComfort: 'high' }),
      ],
      5,
      [],
      'solo',
    );

    expect(withExtras.map((item) => item.pattern.id)).toEqual(firstOnly.map((item) => item.pattern.id));
  });

  test('duo mode returns duo-fit recommendations for two jugglers', () => {
    const recommendations = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [
        buildJuggler('Ada Duo', { comfortableObjects: 3.5, comfortableCount: 4 }),
        buildJuggler('Ben Duo', { comfortableObjects: 3, comfortableCount: 3, movementComfort: 'moderate' }),
      ],
      5,
      [],
      'duo',
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every((item) => item.sessionMode === 'duo')).toBeTruthy();
    expect(recommendations[0]?.assignments).toHaveLength(2);
    expect(recommendations[0]?.score ?? 0).toBeGreaterThan(0);
  });

  test('group mode returns group recommendations with full-group assignments', () => {
    const recommendations = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [
        buildJuggler('Ada Group', { comfortableObjects: 3.5, comfortableCount: 4 }),
        buildJuggler('Ben Group', { comfortableObjects: 3, comfortableCount: 3, movementComfort: 'moderate' }),
        buildJuggler('Cy Group', { comfortableObjects: 4, comfortableCount: 4, movementComfort: 'moderate' }),
        buildJuggler('Di Group', { comfortableObjects: 3, comfortableCount: 5, movementComfort: 'high' }),
      ],
      5,
      [],
      'group',
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.every((item) => item.sessionMode === 'group')).toBeTruthy();
    expect(recommendations.some((item) => item.assignments.length >= 4)).toBeTruthy();
  });

  test('group mode emits scalable lane metadata for composed recommendations', () => {
    const recommendations = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [
        buildJuggler('Ada Scale', { comfortableObjects: 3.5, comfortableCount: 4 }),
        buildJuggler('Ben Scale', { comfortableObjects: 3, comfortableCount: 3, movementComfort: 'moderate' }),
        buildJuggler('Cy Scale', { comfortableObjects: 4, comfortableCount: 4, movementComfort: 'moderate' }),
        buildJuggler('Di Scale', { comfortableObjects: 3, comfortableCount: 5, movementComfort: 'high' }),
        buildJuggler('Eli Scale', { comfortableObjects: 3, comfortableCount: 4, movementComfort: 'stationary' }),
        buildJuggler('Fox Scale', { comfortableObjects: 4, comfortableCount: 3, movementComfort: 'moderate' }),
        buildJuggler('Gia Scale', { comfortableObjects: 3, comfortableCount: 4, movementComfort: 'high' }),
      ],
      10,
      [],
      'group',
    );

    const composed = recommendations.find((item) => item.composition);

    expect(composed).toBeTruthy();
    expect(composed?.composition?.strategy).toBe('stacked-lanes');
    expect((composed?.composition?.lanes.length ?? 0) >= 2).toBeTruthy();
    expect((composed?.composition?.adaptationNotes.length ?? 0) > 0).toBeTruthy();
    expect(
      composed?.composition?.lanes.every((lane) => lane.roleLabels.length > 0 && typeof lane.targetJugglers === 'number'),
    ).toBeTruthy();
  });

  test('recommendation modes produce meaningfully different assignment shapes', () => {
    const solo = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [buildJuggler('Ada Solo', { comfortableObjects: 3.5, comfortableCount: 4 })],
      3,
      [],
      'solo',
    );
    const duo = recommendGroupPatterns(
      PATTERN_LIBRARY,
      [
        buildJuggler('Ada Duo', { comfortableObjects: 3.5, comfortableCount: 4 }),
        buildJuggler('Ben Duo', { comfortableObjects: 3, comfortableCount: 3, movementComfort: 'moderate' }),
      ],
      3,
      [],
      'duo',
    );

    expect(solo[0]?.pattern.id).toBeTruthy();
    expect(duo[0]?.pattern.id).toBeTruthy();
    expect(solo[0]?.sessionMode).toBe('solo');
    expect(duo[0]?.sessionMode).toBe('duo');
    expect(solo[0]?.assignments).toHaveLength(1);
    expect(duo[0]?.assignments).toHaveLength(2);
  });

  test('roster health flags a fragile low-comfort duo roster', () => {
    const health = assessRosterHealth(
      PATTERN_LIBRARY,
      [
        buildJuggler('Ada Tight', { comfortableObjects: 2.5, comfortableCount: 2, movementComfort: 'stationary' }),
        buildJuggler('Ben Tight', { comfortableObjects: 2.5, comfortableCount: 2, movementComfort: 'stationary' }),
      ],
      'duo',
    );

    expect(health.status).toBe('fragile');
    expect(health.score).toBeLessThan(52);
    expect(health.warnings.some((warning) => /club comfort|Fast-count comfort|stationary/i.test(warning))).toBeTruthy();
    expect(health.suggestions.length).toBeGreaterThan(0);
  });

  test('roster health rewards a varied group roster', () => {
    const health = assessRosterHealth(
      PATTERN_LIBRARY,
      [
        buildJuggler('Ada Varied', { comfortableObjects: 3.2, comfortableCount: 4, movementComfort: 'stationary' }),
        buildJuggler('Ben Varied', { comfortableObjects: 3.8, comfortableCount: 5, movementComfort: 'moderate' }),
        buildJuggler('Cy Varied', { comfortableObjects: 4.2, comfortableCount: 4, movementComfort: 'high' }),
        buildJuggler('Di Varied', { comfortableObjects: 3.4, comfortableCount: 5, movementComfort: 'moderate' }),
      ],
      'group',
    );

    expect(health.status).toBe('strong');
    expect(health.score).toBeGreaterThanOrEqual(75);
    expect(health.strengths.length).toBeGreaterThan(0);
    expect(health.supportedPatternCount).toBeGreaterThan(10);
  });

  test('outcome scores boost patterns that recently worked well', () => {
    const roster = [
      buildJuggler('Ada Outcome', { comfortableObjects: 3.5, comfortableCount: 4 }),
      buildJuggler('Ben Outcome', { comfortableObjects: 3, comfortableCount: 3, movementComfort: 'moderate' }),
    ];

    const baseline = recommendGroupPatterns(PATTERN_LIBRARY, roster, 20, [], 'duo');
    const target = baseline[0];

    expect(target?.pattern.id).toBeTruthy();

    const withPositiveOutcome = recommendGroupPatterns(
      PATTERN_LIBRARY,
      roster,
      20,
      [buildAttempt(target!.pattern.id, { verdict: 'good-fit', outcomeScore: 10 })],
      'duo',
    );

    const boosted = withPositiveOutcome.find((item) => item.pattern.id === target!.pattern.id);

    expect(boosted).toBeTruthy();
    expect((boosted?.score ?? 0) > target!.score).toBeTruthy();
  });

  test('low outcome scores reduce confidence in recently struggled patterns', () => {
    const roster = [
      buildJuggler('Ada Outcome', { comfortableObjects: 3.5, comfortableCount: 4 }),
      buildJuggler('Ben Outcome', { comfortableObjects: 3, comfortableCount: 3, movementComfort: 'moderate' }),
    ];

    const baseline = recommendGroupPatterns(PATTERN_LIBRARY, roster, 20, [], 'duo');
    const target = baseline[0];

    expect(target?.pattern.id).toBeTruthy();

    const withNegativeOutcome = recommendGroupPatterns(
      PATTERN_LIBRARY,
      roster,
      20,
      [buildAttempt(target!.pattern.id, { verdict: 'too-hard', outcomeScore: 2 })],
      'duo',
    );

    const damped = withNegativeOutcome.find((item) => item.pattern.id === target!.pattern.id);

    expect(damped ? damped.score < target!.score : true).toBeTruthy();
  });
});
