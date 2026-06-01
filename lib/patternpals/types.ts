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

export type SessionEntry = {
  id: string;
  hostId: string;
  partnerId: string | null;
  partnerName: string | null;
  scheduledFor: string;
  durationMinutes: number | null;
  location: string | null;
  focusPatterns: string[];
  status: SessionStatus;
  outcome: string | null;
  createdAt: string;
};

export type PatternRecommendation = {
  pattern: Pattern;
  score: number;
  reasons: string[];
  readiness: 'ready' | 'stretch' | 'blocked';
};
