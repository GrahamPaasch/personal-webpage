export type ExperienceLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export type PropType = 'clubs' | 'balls' | 'rings';

export type PatternStatus = 'known' | 'working' | 'curious';

export type PracticeMode = 'solo' | 'passing';

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
  requiredJugglers: number;
  props: PropType[];
  description: string;
  tags: string[];
  prerequisites: string[];
  patternType?: PatternType;
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
