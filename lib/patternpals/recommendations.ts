import type {
  JugglerProfile,
  Pattern,
  PatternRecommendation,
  PatternStatus,
  PracticeMode,
  ProgressEntry,
} from './types';

type RecommendationContext = {
  mode: PracticeMode;
  myProfile: JugglerProfile;
  myProgress: ProgressEntry[];
  partnerProfile?: JugglerProfile | null;
  partnerProgress?: ProgressEntry[];
  recentPatternIds?: string[];
};

const difficultyOrder = ['Beginner', 'Intermediate', 'Advanced'] as const;

const rankDifficulty = (level: string) => {
  const idx = difficultyOrder.indexOf(level as typeof difficultyOrder[number]);
  return idx === -1 ? 1 : idx;
};

const toStatusSet = (entries: ProgressEntry[], status: PatternStatus) =>
  new Set(entries.filter((entry) => entry.status === status).map((entry) => entry.patternId));

const uniqueReasons = (reasons: string[]) => Array.from(new Set(reasons));

export const recommendPatterns = (
  patterns: Pattern[],
  context: RecommendationContext,
): PatternRecommendation[] => {
  const { mode, myProfile, myProgress, partnerProgress, recentPatternIds } = context;
  const known = toStatusSet(myProgress, 'known');
  const working = toStatusSet(myProgress, 'working');
  const curious = toStatusSet(myProgress, 'curious');
  const partnerKnown = partnerProgress ? toStatusSet(partnerProgress, 'known') : new Set<string>();
  const recent = new Set(recentPatternIds ?? []);

  const recommendations: PatternRecommendation[] = [];

  for (const pattern of patterns) {
    if (known.has(pattern.id)) continue;
    if (mode === 'solo' && pattern.requiredJugglers !== 1) continue;
    if (mode === 'passing' && pattern.requiredJugglers < 2) continue;

    const reasons: string[] = [];
    let score = 0;

    const missingPrereqs = pattern.prerequisites.filter((id) => !known.has(id));
    if (missingPrereqs.length === 0) {
      score += 3;
      reasons.push('Prerequisites met');
    } else if (missingPrereqs.length === 1) {
      score += 0.5;
      reasons.push('One prerequisite to lock in');
    } else {
      score -= missingPrereqs.length;
      reasons.push('Needs prerequisites');
    }

    const diffDelta = rankDifficulty(pattern.difficulty) - rankDifficulty(myProfile.experience);
    if (diffDelta === 0) {
      score += 2;
      reasons.push('Matches your level');
    } else if (diffDelta === 1) {
      score += 1;
      reasons.push('Stretch goal');
    } else if (diffDelta >= 2) {
      score -= 1.5;
      reasons.push('Very advanced');
    }

    const sharedProps = pattern.props.filter((prop) => myProfile.props.includes(prop));
    if (sharedProps.length > 0) {
      score += 1;
      reasons.push(`Matches your props (${sharedProps.join(', ')})`);
    }

    if (working.has(pattern.id)) {
      score += 2;
      reasons.push('Already in your working list');
    } else if (curious.has(pattern.id)) {
      score += 1;
      reasons.push('On your wishlist');
    }

    if (partnerKnown.has(pattern.id)) {
      score += 2;
      reasons.push('Partner already knows it');
    }

    if (recent.size > 0 && pattern.prerequisites.some((id) => recent.has(id))) {
      score += 1;
      reasons.push('Builds on a recent session');
    }

    const readiness: PatternRecommendation['readiness'] =
      missingPrereqs.length === 0 ? 'ready' : missingPrereqs.length === 1 ? 'stretch' : 'blocked';

    recommendations.push({
      pattern,
      score,
      reasons: uniqueReasons(reasons),
      readiness,
    });
  }

  return recommendations.sort((a, b) => b.score - a.score);
};
