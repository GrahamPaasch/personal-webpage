import {
  getPatternJugglerBounds,
  getPatternJugglerCount,
  getPatternObjectCount,
  getPatternRhythm,
  getPatternType,
} from './atlas';
import type {
  GroupJugglerInput,
  GroupPatternRecommendation,
  MovementComfort,
  Pattern,
  PatternType,
  PositionAssignment,
  PositionDifficultyEstimate,
  PracticeAttemptEntry,
  PracticeAttemptVerdict,
} from './types';

const MOVEMENT_SCORE: Record<MovementComfort, number> = {
  stationary: 0,
  moderate: 1,
  high: 2,
};

const DEFAULT_GROUP_JUGGLERS: GroupJugglerInput[] = [
  { id: 'group-juggler-1', name: 'Juggler 1', comfortableObjects: 3, comfortableCount: 4, movementComfort: 'stationary' },
  { id: 'group-juggler-2', name: 'Juggler 2', comfortableObjects: 3, comfortableCount: 4, movementComfort: 'stationary' },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

const normalizeCount = (value: number) => clamp(Math.round(value), 1, 12);

const inferCountFromText = (value: string | null | undefined) => {
  if (!value) return null;
  const count = value.match(/\b(1[0-2]|[1-9])[ -]?count\b/i);
  if (count) return Number(count[1]);

  const normalized = value.toLowerCase();
  if (/\b1c\b|one count|ultimates?/.test(normalized)) return 1;
  if (/\b2c\b|two count/.test(normalized)) return 2;
  if (/\b3c\b|three count|waltz/.test(normalized)) return 3;
  if (/\b4c\b|four count/.test(normalized)) return 4;

  const ppsLike = value.match(/\bP[PSZ]{1,5}\b/i)?.[0].toUpperCase();
  if (ppsLike) {
    const cycleLength = ppsLike.length;
    const passCount = (ppsLike.match(/P/g) ?? []).length;
    if (passCount >= 3) return 1;
    if (passCount === 2 && cycleLength <= 3) return 2;
    if (passCount === 1 && cycleLength >= 3) return 3;
  }

  return null;
};

const getPatternCount = (pattern: Pattern) => {
  const rhythmCount = inferCountFromText(getPatternRhythm(pattern));
  if (rhythmCount) return rhythmCount;
  return inferCountFromText(`${pattern.name} ${pattern.tags.join(' ')}`);
};

const getPatternAverageObjects = (pattern: Pattern, patternType: PatternType) => {
  const jugglerCount = getPatternJugglerCount(pattern);
  const objectCount = getPatternObjectCount(pattern);
  if (objectCount && jugglerCount > 0) return objectCount / jugglerCount;

  if (patternType === 'moving') return 3.4;
  if (patternType === 'takeout') return 3.3;
  if (patternType === 'feed' || patternType === 'line' || patternType === 'triangle') return 3.2;
  return 3;
};

const inferMovementRequirement = (pattern: Pattern, patternType: PatternType): MovementComfort => {
  const searchable = `${pattern.name} ${getPatternRhythm(pattern) ?? ''} ${pattern.tags.join(' ')} ${(pattern.roles ?? []).join(' ')}`.toLowerCase();
  if (
    patternType === 'moving' ||
    /runaround|moving|zap|zip|heff|scrambled|takeout|take out|rotate|rotating|turn|walking|orbit|weave/.test(searchable)
  ) {
    return 'high';
  }
  if (patternType === 'takeout' || patternType === 'line' || patternType === 'feed' || /line|triangle|bookend|switch|cross/.test(searchable)) {
    return 'moderate';
  }
  return 'stationary';
};

const roleAdjustment = (role: string, patternType: PatternType) => {
  const normalized = role.toLowerCase();
  let adjustment = 0;
  if (/feeder|current feeder/.test(normalized)) adjustment += 0.35;
  if (/manipulator|takeout|carrier|base/.test(normalized)) adjustment += 0.4;
  if (/zap|zip|heff/.test(normalized)) adjustment += 0.35;
  if (/end|bookend|rotate|next feeder/.test(normalized)) adjustment += 0.2;
  if (/feedee|support/.test(normalized)) adjustment -= 0.15;
  if (patternType === 'moving') adjustment += 0.15;
  return adjustment;
};

const roleMovement = (role: string, patternMovement: MovementComfort): MovementComfort => {
  const normalized = role.toLowerCase();
  if (/manipulator|takeout|carrier|zap|zip|heff|rotate|next feeder|moving/.test(normalized)) return 'high';
  if (/feeder|end|bookend|line|base|turn/.test(normalized) && patternMovement !== 'high') return 'moderate';
  return patternMovement;
};

const roleCount = (role: string, patternCount: number | null) => inferCountFromText(role) ?? patternCount;

const countPressure = (count: number | null) => {
  if (!count) return 1.2;
  if (count <= 1) return 4;
  if (count === 2) return 3;
  if (count === 3) return 2;
  if (count === 4) return 1;
  return 0.6;
};

const buildRoles = (pattern: Pattern) => {
  const jugglerCount = getPatternJugglerCount(pattern);
  const roles = pattern.roles?.filter(Boolean) ?? [];
  if (roles.length >= jugglerCount) return roles.slice(0, jugglerCount);
  return Array.from({ length: jugglerCount }, (_, index) => roles[index] ?? `Position ${index + 1}`);
};

export const buildPositionDifficulties = (pattern: Pattern): PositionDifficultyEstimate[] => {
  const patternType = getPatternType(pattern);
  const patternCount = getPatternCount(pattern);
  const patternMovement = inferMovementRequirement(pattern, patternType);
  const averageObjects = getPatternAverageObjects(pattern, patternType);

  return buildRoles(pattern).map((role) => {
    const count = roleCount(role, patternCount);
    const movement = roleMovement(role, patternMovement);
    const adjustment = roleAdjustment(role, patternType);
    const roleObjects = clamp(averageObjects + adjustment, 1.5, 6);
    const difficultyScore = roleObjects * 2 + countPressure(count) * 0.9 + MOVEMENT_SCORE[movement] * 0.9;
    const notes = [
      `${roundToTenth(roleObjects)} average clubs`,
      count ? `${count}-count pressure` : 'count inferred from pattern family',
      movement === 'stationary' ? 'stationary role' : `${movement} movement/turning`,
    ];

    return {
      role,
      averageObjects: roundToTenth(roleObjects),
      count,
      movement,
      difficultyScore: roundToTenth(difficultyScore),
      notes,
    };
  });
};

const fitPosition = (juggler: GroupJugglerInput, position: PositionDifficultyEstimate): PositionAssignment => {
  const objectDelta = position.averageObjects - juggler.comfortableObjects;
  const countDelta = position.count ? juggler.comfortableCount - position.count : 0;
  const movementDelta = MOVEMENT_SCORE[position.movement] - MOVEMENT_SCORE[juggler.movementComfort];
  const overload = Math.max(0, objectDelta) * 34 + Math.max(0, countDelta) * 16 + Math.max(0, movementDelta) * 22;
  const tooEasy = Math.max(0, -objectDelta - 0.35) * 9 + Math.max(0, -countDelta - 1) * 4;
  const productiveStretch = objectDelta >= 0 && objectDelta <= 0.45 ? 8 : objectDelta > 0.45 && objectDelta <= 0.8 ? 3 : 0;
  const fitScore = clamp(92 - overload - tooEasy + productiveStretch, 0, 100);

  let fitLabel: PositionAssignment['fitLabel'] = 'good-fit';
  if (overload >= 38 || fitScore < 55) fitLabel = 'overloaded';
  else if (overload >= 16 || objectDelta > 0.35 || countDelta > 0 || movementDelta > 0) fitLabel = 'stretch';
  else if (tooEasy >= 10 || objectDelta < -0.7) fitLabel = 'easy';

  const reasons: string[] = [];
  if (objectDelta > 0.45) reasons.push(`${roundToTenth(objectDelta)} more average clubs than ${juggler.name}'s comfort target.`);
  else if (objectDelta >= 0) reasons.push(`Club load is a useful ${roundToTenth(objectDelta)}-club stretch.`);
  else reasons.push(`Club load is ${roundToTenth(Math.abs(objectDelta))} below ${juggler.name}'s comfort target.`);

  if (position.count) {
    if (countDelta > 0) reasons.push(`${position.count}-count is faster than ${juggler.name}'s ${juggler.comfortableCount}-count comfort.`);
    else if (countDelta === 0) reasons.push(`Count matches ${juggler.name}'s ${juggler.comfortableCount}-count comfort.`);
    else reasons.push(`${position.count}-count should feel easier than ${juggler.name}'s comfort threshold.`);
  } else {
    reasons.push('Count is not explicit in the catalog, so this role uses a conservative estimate.');
  }

  if (movementDelta > 0) reasons.push(`Movement is above ${juggler.name}'s current movement comfort.`);
  else if (position.movement === 'stationary') reasons.push('No meaningful movement or turning pressure detected.');
  else reasons.push(`${juggler.name}'s movement comfort covers this ${position.movement} role.`);

  return {
    ...position,
    juggler,
    fitScore: Math.round(fitScore),
    fitLabel,
    reasons: reasons.slice(0, 3),
  };
};

const assignmentScore = (assignments: PositionAssignment[]) => {
  const averageFit = assignments.reduce((total, assignment) => total + assignment.fitScore, 0) / assignments.length;
  const overloadedCount = assignments.filter((assignment) => assignment.fitLabel === 'overloaded').length;
  const stretchCount = assignments.filter((assignment) => assignment.fitLabel === 'stretch').length;
  const balancePenalty = Math.max(...assignments.map((assignment) => assignment.fitScore)) - Math.min(...assignments.map((assignment) => assignment.fitScore));
  return averageFit - overloadedCount * 20 + Math.min(stretchCount, 2) * 2 - balancePenalty * 0.15;
};

const exhaustiveBestAssignment = (jugglers: GroupJugglerInput[], positions: PositionDifficultyEstimate[]) => {
  let best: PositionAssignment[] = [];
  let bestScore = -Infinity;
  const used = new Set<number>();
  const current: PositionAssignment[] = [];

  const visit = (positionIndex: number) => {
    if (positionIndex === positions.length) {
      const score = assignmentScore(current);
      if (score > bestScore) {
        bestScore = score;
        best = current.map((assignment) => ({ ...assignment }));
      }
      return;
    }

    for (let jugglerIndex = 0; jugglerIndex < jugglers.length; jugglerIndex += 1) {
      if (used.has(jugglerIndex)) continue;
      used.add(jugglerIndex);
      current.push(fitPosition(jugglers[jugglerIndex], positions[positionIndex]));
      visit(positionIndex + 1);
      current.pop();
      used.delete(jugglerIndex);
    }
  };

  visit(0);
  return best;
};

const greedyBestAssignment = (jugglers: GroupJugglerInput[], positions: PositionDifficultyEstimate[]) => {
  const remaining = [...jugglers];
  return [...positions]
    .sort((a, b) => b.difficultyScore - a.difficultyScore)
    .map((position) => {
      let bestIndex = 0;
      let bestFit = fitPosition(remaining[0], position);
      for (let index = 1; index < remaining.length; index += 1) {
        const fit = fitPosition(remaining[index], position);
        if (fit.fitScore > bestFit.fitScore) {
          bestFit = fit;
          bestIndex = index;
        }
      }
      remaining.splice(bestIndex, 1);
      return bestFit;
    });
};

const bestAssignment = (jugglers: GroupJugglerInput[], positions: PositionDifficultyEstimate[]) => {
  if (jugglers.length <= 6) return exhaustiveBestAssignment(jugglers, positions);
  return greedyBestAssignment(jugglers, positions);
};

const dataQuality = (pattern: Pattern): GroupPatternRecommendation['dataQuality'] => {
  const hasObjects = typeof getPatternObjectCount(pattern) === 'number';
  const hasRhythm = Boolean(getPatternRhythm(pattern));
  const hasRoles = (pattern.roles ?? []).length >= getPatternJugglerCount(pattern);
  if (hasObjects && hasRhythm && hasRoles) return 'structured';
  if ([hasObjects, hasRhythm, hasRoles].filter(Boolean).length >= 2) return 'partial';
  return 'inferred';
};

const qualityAdjustment = (quality: GroupPatternRecommendation['dataQuality']) => {
  if (quality === 'structured') return 4;
  if (quality === 'partial') return -2;
  return -10;
};

const qualityRank = (quality: GroupPatternRecommendation['dataQuality']) => {
  if (quality === 'structured') return 3;
  if (quality === 'partial') return 2;
  return 1;
};

const verdictImpact: Record<PracticeAttemptVerdict, number> = {
  'too-easy': -4,
  'good-fit': 6,
  'too-hard': -8,
  unsure: 0,
};

const buildAttemptAdjustment = (attempts: PracticeAttemptEntry[], patternId: string) => {
  const recent = attempts
    .filter((attempt) => attempt.patternId === patternId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  if (recent.length === 0) {
    return { score: 0, reasons: [] as string[] };
  }

  const total = recent.reduce((sum, attempt) => sum + verdictImpact[attempt.verdict], 0);
  const reasons: string[] = [];

  if (recent.some((attempt) => attempt.verdict === 'good-fit')) {
    reasons.push('Recent try feedback says this pattern fit well for a similar roster.');
  }
  if (recent.some((attempt) => attempt.verdict === 'too-hard')) {
    reasons.push('Recent try feedback flagged this pattern as too hard.');
  }
  if (recent.some((attempt) => attempt.verdict === 'too-easy')) {
    reasons.push('Recent try feedback suggests this pattern may need more challenge.');
  }

  return { score: total, reasons };
};

const buildRecommendationReasons = (assignments: PositionAssignment[], quality: GroupPatternRecommendation['dataQuality']) => {
  const overloaded = assignments.filter((assignment) => assignment.fitLabel === 'overloaded');
  const stretches = assignments.filter((assignment) => assignment.fitLabel === 'stretch');
  const goodFits = assignments.filter((assignment) => assignment.fitLabel === 'good-fit');
  const reasons: string[] = [];

  if (overloaded.length === 0) reasons.push('No position is clearly overloaded by club load, count, or movement.');
  else reasons.push(`${overloaded.length} position${overloaded.length === 1 ? '' : 's'} may be overloaded.`);

  if (stretches.length > 0) reasons.push(`${stretches.length} role${stretches.length === 1 ? '' : 's'} offer a productive stretch.`);
  else if (goodFits.length > 0) reasons.push('Most roles are close to the group comfort targets.');
  else reasons.push('This pattern is likely a consolidation drill rather than a stretch.');

  if (quality === 'structured') reasons.push('Uses structured role, count, and object metadata from the catalog.');
  else if (quality === 'partial') reasons.push('Uses partial catalog metadata with some heuristic inference.');
  else reasons.push('Mostly heuristic because role/count/object metadata is sparse for this entry.');

  return reasons;
};

const splitIntoLanes = (group: GroupJugglerInput[], laneCount: number) => {
  if (laneCount <= 1) return [group];
  const lanes = Array.from({ length: laneCount }, () => [] as GroupJugglerInput[]);
  const sorted = [...group].sort((a, b) => b.comfortableObjects - a.comfortableObjects || b.comfortableCount - a.comfortableCount);
  sorted.forEach((juggler, index) => {
    lanes[index % laneCount].push(juggler);
  });
  return lanes;
};

const selectLanePositions = (positions: PositionDifficultyEstimate[], laneSize: number) => {
  if (laneSize >= positions.length) return positions;
  return [...positions]
    .sort((a, b) => a.difficultyScore - b.difficultyScore || a.role.localeCompare(b.role))
    .slice(0, laneSize)
    .map((position) => ({
      ...position,
      notes: [...position.notes, 'Partial-lane adaptation for non-divisible group size.'].slice(0, 4),
    }));
};

const buildComposedRecommendation = (
  pattern: Pattern,
  normalizedGroup: GroupJugglerInput[],
  attempts: PracticeAttemptEntry[],
): GroupPatternRecommendation | null => {
  const baseSize = getPatternJugglerCount(pattern);
  const total = normalizedGroup.length;
  if (baseSize < 2 || total <= baseSize) return null;

  const computedLaneCount = Math.ceil(total / baseSize);
  if (computedLaneCount < 2) return null;

  const positions = buildPositionDifficulties(pattern);
  if (positions.length !== baseSize) return null;

  const lanes = splitIntoLanes(normalizedGroup, computedLaneCount);
  if (lanes.some((lane) => lane.length < 2)) return null;

  const laneAssignments = lanes.map((lane, laneIndex) =>
    bestAssignment(lane, selectLanePositions(positions, lane.length)).map((assignment) => {
      const partial = lane.length < baseSize;
      return {
        ...assignment,
        role: `Lane ${laneIndex + 1}: ${assignment.role}`,
        reasons: [
          partial
            ? `Lane ${laneIndex + 1} uses partial-lane adaptation (${lane.length}/${baseSize} roles).`
            : `Lane ${laneIndex + 1} assignment`,
          ...assignment.reasons,
        ].slice(0, 3),
      };
    }),
  );

  const assignments = laneAssignments.flat();
  const quality = dataQuality(pattern);
  const attemptAdjustment = buildAttemptAdjustment(attempts, pattern.id);
  const laneScore = laneAssignments.reduce((sum, lane) => sum + assignmentScore(lane), 0) / laneAssignments.length;
  const partialLaneCount = lanes.filter((lane) => lane.length < baseSize).length;
  const compositionPenalty = Math.max(0, computedLaneCount - 2) * 2 + partialLaneCount * 3;
  const score = Math.round(
    clamp(laneScore + qualityAdjustment(quality) - compositionPenalty + attemptAdjustment.score, 0, 100),
  );

  return {
    pattern,
    score,
    assignments,
    reasons: [
      partialLaneCount > 0
        ? `Composed as ${computedLaneCount} lanes with partial-lane adaptation for ${total} jugglers.`
        : `Composed as ${computedLaneCount} synchronized lanes of ${baseSize} jugglers.`,
      `Scales ${pattern.name} to ${total} jugglers via stacked-lane practice.`,
      ...buildRecommendationReasons(assignments, quality),
      ...attemptAdjustment.reasons,
    ].slice(0, 4),
    dataQuality: quality,
  };
};

export const recommendGroupPatterns = (
  patterns: Pattern[],
  group: GroupJugglerInput[],
  limit = 10,
  attempts: PracticeAttemptEntry[] = [],
): GroupPatternRecommendation[] => {
  const normalizedGroup = group
    .map((juggler, index) => ({
      ...juggler,
      id: juggler.id || `group-juggler-${index + 1}`,
      name: juggler.name.trim() || `Juggler ${index + 1}`,
      comfortableObjects: clamp(Number.isFinite(juggler.comfortableObjects) ? juggler.comfortableObjects : 3, 1.5, 5.5),
      comfortableCount: normalizeCount(Number.isFinite(juggler.comfortableCount) ? juggler.comfortableCount : 4),
      movementComfort: juggler.movementComfort,
    }))
    .filter((juggler) => juggler.name);

  if (normalizedGroup.length < 2) return [];

  const exact = patterns
    .filter((pattern) => {
      if (!pattern.props.includes('clubs')) return false;
      const bounds = getPatternJugglerBounds(pattern);
      return bounds.min === normalizedGroup.length && bounds.max === normalizedGroup.length;
    })
    .map((pattern) => {
      const positions = buildPositionDifficulties(pattern);
      const assignments = bestAssignment(normalizedGroup, positions);
      const quality = dataQuality(pattern);
      const attemptAdjustment = buildAttemptAdjustment(attempts, pattern.id);
      const score = Math.round(
        clamp(assignmentScore(assignments) + qualityAdjustment(quality) + attemptAdjustment.score, 0, 100),
      );
      return {
        pattern,
        score,
        assignments,
        reasons: [...buildRecommendationReasons(assignments, quality), ...attemptAdjustment.reasons].slice(0, 4),
        dataQuality: quality,
      } satisfies GroupPatternRecommendation;
    });

  const composed = patterns
    .filter((pattern) => {
      if (!pattern.props.includes('clubs')) return false;
      const bounds = getPatternJugglerBounds(pattern);
      return bounds.strategy === 'fixed' && bounds.min >= 2 && bounds.max === bounds.min;
    })
    .map((pattern) => buildComposedRecommendation(pattern, normalizedGroup, attempts))
    .filter((item): item is GroupPatternRecommendation => Boolean(item));

  const preferExact = exact.length > 0;
  const combined = preferExact
    ? [...exact, ...composed.filter((item) => item.score >= 70)]
    : [...composed, ...exact];

  return combined
    .sort(
      (a, b) => b.score - a.score || qualityRank(b.dataQuality) - qualityRank(a.dataQuality) || a.pattern.name.localeCompare(b.pattern.name),
    )
    .slice(0, limit);
};

export const createDefaultGroupJugglers = () => DEFAULT_GROUP_JUGGLERS.map((juggler) => ({ ...juggler }));
