export type ExperienceLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export type MetadataConfidence = 'verified' | 'curated' | 'inferred' | 'unverified' | 'unset';

export type MetadataSourceKind = 'source' | 'community' | 'maintainer' | 'heuristic' | 'legacy-ai' | 'unset';

export type MetadataProvenance = {
  confidence: MetadataConfidence;
  source: MetadataSourceKind;
  note: string;
};

export type PropType = 'clubs' | 'balls' | 'rings';

export type PatternStatus = 'known' | 'working' | 'curious';

export type PracticeMode = 'solo' | 'passing';

export type PracticeAttemptVerdict = 'too-easy' | 'good-fit' | 'too-hard' | 'unsure';

export type MovementComfort = 'stationary' | 'moderate' | 'high';

export type GroupJugglerInput = {
  id: string;
  name: string;
  comfortableObjects: number;
  comfortableCount: number;
  movementComfort: MovementComfort;
};

export type PositionDifficultyEstimate = {
  role: string;
  averageObjects: number;
  count: number | null;
  movement: MovementComfort;
  difficultyScore: number;
  notes: string[];
};

export type PositionAssignment = PositionDifficultyEstimate & {
  juggler: GroupJugglerInput;
  fitScore: number;
  fitLabel: 'easy' | 'good-fit' | 'stretch' | 'overloaded';
  reasons: string[];
};

export type GroupPatternRecommendation = {
  pattern: Pattern;
  score: number;
  assignments: PositionAssignment[];
  reasons: string[];
  dataQuality: 'structured' | 'partial' | 'inferred';
};

export type PatternType =
  | 'passing'
  | 'feed'
  | 'line'
  | 'takeout'
  | 'triangle'
  | 'moving'
  | 'solo'
  | 'warmup'
  | 'other';

export type Pattern = {
  id: string;
  name: string;
  difficulty: ExperienceLevel;
  difficultyProvenance?: MetadataProvenance;
  requiredJugglers: number;
  props: PropType[];
  description: string;
  tags: string[];
  prerequisites: string[];
  patternType?: PatternType;
  patternTypeProvenance?: MetadataProvenance;
  rhythm?: string;
  numObjects?: number;
  numJugglers?: number;
  roles?: string[];
  aliases?: string[];
  commonMistakes?: string[];
};

export type JugglerProfile = {
  id: string;
  name: string;
  experience: ExperienceLevel;
  props: PropType[];
  createdAt: string;
  updatedAt: string;
};

export type ProgressEntry = {
  id: string;
  jugglerId: string;
  patternId: string;
  status: PatternStatus;
  updatedAt: string;
};

export type SessionStatus = 'scheduled' | 'completed' | 'canceled';

export type ReadinessState = 'ready' | 'stretch' | 'blocked';

export type SessionReadinessSnapshot = {
  patternId: string;
  readiness: ReadinessState;
  reasons: string[];
  participantCount: number;
};

export type SessionEntry = {
  id: string;
  hostId: string;
  partnerId: string | null;
  partnerName: string | null;
  participantIds: string[];
  participantNames: string[];
  practiceMode: PracticeMode;
  scheduledFor: string;
  durationMinutes: number | null;
  location: string | null;
  focusPatterns: string[];
  readinessSnapshot: SessionReadinessSnapshot[];
  status: SessionStatus;
  outcome: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PracticeAttemptEntry = {
  id: string;
  hostId: string;
  patternId: string;
  sessionId: string | null;
  verdict: PracticeAttemptVerdict;
  note: string | null;
  rosterSnapshot: GroupJugglerInput[];
  createdAt: string;
};

export type PatternRecommendation = {
  pattern: Pattern;
  score: number;
  reasons: string[];
  readiness: ReadinessState;
};

export type CurationSignal = 'tip' | 'variation' | 'warning' | 'source' | 'diagram';

export type CurationStatus = 'pending' | 'reviewed';

export type VisualAidKind = 'source-excerpt' | 'diagram-needed' | 'community-diagram' | 'video-reference';

export type PatternVisualAid = {
  id: string;
  patternId: string;
  kind: VisualAidKind;
  title: string;
  description: string;
  href: string | null;
  image: string | null;
  sourceTitle: string | null;
  page: number | null;
  alt: string | null;
  status: CurationStatus;
  createdAt: string;
};

export type PatternCurationEntry = {
  id: string;
  patternId: string;
  authorId: string | null;
  authorName: string;
  signal: CurationSignal;
  note: string;
  visualAid: PatternVisualAid | null;
  status: CurationStatus;
  createdAt: string;
};

export type AtlasContributionTarget = 'alias' | 'teaching' | 'source' | 'diagram' | 'variant' | 'safety';

export type AtlasContributionStatus = 'pending' | 'accepted' | 'needs-review';
