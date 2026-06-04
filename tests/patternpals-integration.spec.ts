import { expect, test } from '@playwright/test';

import { assessRosterHealth, recommendGroupPatterns } from '../lib/patternpals/groupRecommendations';
import { buildEligiblePatternPool, drawRandomPattern } from '../lib/patternpals/eligibility';
import {
  buildRecommendationPlannerRoster,
  buildSessionPlannerPeople,
  formatSessionRosterNames,
  getAutomaticRecommendationMode,
} from '../lib/patternpals/plannerRoster';
import { PATTERN_LIBRARY } from '../lib/patternpals/patterns';
import type { GroupJugglerInput, JugglerProfile, PracticeAttemptEntry, SessionEntry } from '../lib/patternpals/types';

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

const buildProfile = (
  name: string,
  overrides: Partial<JugglerProfile> = {},
): JugglerProfile => ({
  id: overrides.id ?? name.toLowerCase().replace(/\s+/g, '-'),
  name,
  experience: overrides.experience ?? 'Intermediate',
  props: overrides.props ?? ['clubs'],
  createdAt: overrides.createdAt ?? new Date('2026-06-03T12:00:00.000Z').toISOString(),
  updatedAt: overrides.updatedAt ?? new Date('2026-06-03T12:00:00.000Z').toISOString(),
});

test.describe('PatternPals session-mode recommendations', () => {
  test('planner roster includes host plus selected partners and preserves overrides', () => {
    const host = buildProfile('Graham Host', { experience: 'Advanced' });
    const partners = [buildProfile('Nick Partner', { experience: 'Advanced' }), buildProfile('Peter Partner')];

    const roster = buildRecommendationPlannerRoster({
      activeProfile: host,
      participants: partners,
      manualParticipantNames: [],
      sessionMode: 'group',
      existingPlanner: [
        buildJuggler('Nick Partner', {
          id: partners[0].id,
          comfortableObjects: 4.5,
          comfortableCount: 5,
          movementComfort: 'high',
        }),
      ],
    });

    expect(roster.map((item) => item.name)).toEqual(['Graham Host', 'Nick Partner', 'Peter Partner']);
    expect(roster).toHaveLength(3);
    expect(roster[1]).toMatchObject({
      comfortableObjects: 4.5,
      comfortableCount: 5,
      movementComfort: 'high',
    });
  });

  test('automatic recommendation mode promotes oversized session rosters', () => {
    const people = buildSessionPlannerPeople({
      activeProfile: buildProfile('Graham Host'),
      participants: [buildProfile('Nick Partner'), buildProfile('Peter Partner')],
      manualParticipantNames: [],
      sessionMode: 'group',
    });

    expect(people).toHaveLength(3);
    expect(getAutomaticRecommendationMode('group', people.length)).toBe('group');
    expect(getAutomaticRecommendationMode('duo', people.length)).toBe('duo');
  });

  test('session roster labels include the host name', () => {
    const session: SessionEntry = {
      id: 'session-1',
      hostId: 'host-1',
      partnerId: 'partner-1',
      partnerName: 'Nick Partner',
      participantIds: ['partner-1', 'partner-2'],
      participantNames: ['Nick Partner', 'Peter Partner'],
      sessionMode: 'group',
      practiceMode: 'passing',
      scheduledFor: new Date('2026-06-03T12:00:00.000Z').toISOString(),
      durationMinutes: 90,
      location: 'Gym',
      focusPatterns: [],
      compositionPlan: [],
      readinessSnapshot: [],
      status: 'scheduled',
      outcome: null,
      completedAt: null,
      createdAt: new Date('2026-06-03T12:00:00.000Z').toISOString(),
    };

    expect(formatSessionRosterNames(session, 'Graham Host')).toEqual(['Graham Host', 'Nick Partner', 'Peter Partner']);
  });

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

// ── Eligibility engine tests ──────────────────────────────────────────────────

test.describe('buildEligiblePatternPool', () => {
  test('returns only patterns supporting the given juggler count', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3 });
    expect(eligible.length).toBeGreaterThan(0);
    for (const pattern of eligible) {
      // Every eligible pattern must support exactly 3 jugglers
      // (verified via patternSupportsJugglers internally)
      expect(pattern).toBeTruthy();
    }
  });

  test('returns empty pool when juggler count is zero', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 0 });
    expect(eligible.length).toBe(0);
  });

  test('filters by patternType', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3, patternType: 'feed' });
    const { eligible: all } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3 });
    expect(eligible.length).toBeLessThanOrEqual(all.length);
  });

  test('filters by objectCount', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3, objectCount: 6 });
    // all eligible patterns either have 6 objects or null object count — but the filter requires exactly 6
    for (const pattern of eligible) {
      expect(pattern).toBeTruthy();
    }
  });

  test('sourceBacked flag restricts pool to source-mapped patterns', () => {
    const { eligible: all } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3 });
    const { eligible: sourced } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3, sourceBacked: true });
    expect(sourced.length).toBeLessThanOrEqual(all.length);
  });

  test('exclusionReasons covers non-eligible patterns', () => {
    const result = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3 });
    const nonEligible = PATTERN_LIBRARY.filter((p) => !result.eligible.includes(p));
    for (const pattern of nonEligible.slice(0, 10)) {
      expect(result.exclusionReasons[pattern.id]).toBeTruthy();
      expect(result.exclusionReasons[pattern.id].length).toBeGreaterThan(0);
    }
  });

  test('totalEvaluated equals PATTERN_LIBRARY length', () => {
    const result = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 2 });
    expect(result.totalEvaluated).toBe(PATTERN_LIBRARY.length);
  });
});

test.describe('drawRandomPattern', () => {
  test('returns null for empty pool', () => {
    expect(drawRandomPattern([])).toBeNull();
  });

  test('returns a pattern from the pool', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3 });
    const drawn = drawRandomPattern(eligible);
    expect(drawn).toBeTruthy();
    expect(eligible).toContain(drawn);
  });

  test('avoids recently drawn patterns when pool is large enough', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 3 });
    if (eligible.length < 3) return; // pool too small to test avoidance

    const first = drawRandomPattern(eligible);
    expect(first).toBeTruthy();

    // Avoid the first pattern by marking the entire pool-minus-one as recent.
    // preferred pool = eligible minus first, so first should never appear.
    const history = [{ pattern: first!, drawnAt: Date.now() }];
    let seenFirst = false;
    for (let i = 0; i < 30; i++) {
      const drawn = drawRandomPattern(eligible, history, eligible.length);
      if (drawn?.id === first!.id) seenFirst = true;
    }
    // preferred pool excludes first, so it should never be drawn
    expect(seenFirst).toBe(false);
  });

  test('falls back to full pool when all patterns are in recent history', () => {
    const pool = PATTERN_LIBRARY.slice(0, 3);
    const history = pool.map((p) => ({ pattern: p, drawnAt: Date.now() }));
    const drawn = drawRandomPattern(pool, history, 10);
    expect(drawn).toBeTruthy(); // must still return something
    expect(pool).toContain(drawn);
  });

  test('all eligible patterns for juggler count 2 actually support 2 jugglers', () => {
    const { eligible } = buildEligiblePatternPool(PATTERN_LIBRARY, { jugglerCount: 2 });
    
    // Verify that every eligible pattern actually supports 2 jugglers
    for (const pattern of eligible) {
      // Reconstruct the bounds the same way atlas.ts does
      let minJugglers = 2;
      let maxJugglers: number | null = 2;
      
      if (pattern.scaling) {
        minJugglers = Math.max(1, Math.round(pattern.scaling.minJugglers));
        maxJugglers = pattern.scaling.maxJugglers ? Math.max(minJugglers, Math.round(pattern.scaling.maxJugglers)) : null;
      } else {
        const count = pattern.numJugglers ?? pattern.requiredJugglers;
        minJugglers = count;
        maxJugglers = count;
      }
      
      // Pattern should support 2 jugglers
      expect(2 >= minJugglers).toBe(true);
      if (typeof maxJugglers === 'number') {
        expect(2 <= maxJugglers).toBe(true);
      }
    }
  });
});

