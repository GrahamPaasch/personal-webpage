import { getPatternExcerpt } from './excerpts';
import { getPatternById } from './patterns';
import type {
  ExperienceLevel,
  MetadataProvenance,
  Pattern,
  PatternCurationEntry,
  PatternStatus,
  PatternType,
  ProgressEntry,
  SessionEntry,
} from './types';

export type PatternBook = {
  tag: string;
  title: string;
  file: string;
};

export type AtlasSourceCitation = PatternBook & {
  hasExcerpt: boolean;
  page: number | null;
  excerptImage: string | null;
};

export type AtlasHealth = {
  totalPatterns: number;
  sourceBackedPatterns: number;
  excerptBackedPatterns: number;
  aliasedPatterns: number;
  teachablePatterns: number;
  sourceCount: number;
};

export type TeachingProgressionStep = {
  label: string;
  description: string;
  patternIds: string[];
};

export type PatternAtlasEntry = {
  pattern: Pattern;
  canonicalName: string;
  summary: string;
  family: PatternType;
  difficultyProvenance: MetadataProvenance;
  patternTypeProvenance: MetadataProvenance;
  sourceCitations: AtlasSourceCitation[];
  aliases: string[];
  localNames: string[];
  keySkills: string[];
  teachingProgression: TeachingProgressionStep[];
  commonFailureModes: string[];
  variants: string[];
  communityNotes: PatternCurationEntry[];
  visualAidCount: number;
  knowledgeGaps: string[];
};

export type CommunityMemorySummary = {
  total: number;
  pending: number;
  reviewed: number;
  visualAidRequests: number;
  bySignal: Record<string, number>;
  recent: PatternCurationEntry[];
};

export type WorkshopPlanSection = {
  title: string;
  intent: string;
  patterns: Pattern[];
};

export type WorkshopPlan = {
  title: string;
  framing: string;
  sections: WorkshopPlanSection[];
  facilitationPrompts: string[];
};

export const PATTERN_BOOKS: PatternBook[] = [
  {
    tag: 'source:majbook_v3',
    title: 'Madison Juggling Club Passing Book (v3)',
    file: '/patternpals/books/majbook_v3.pdf',
  },
  {
    tag: 'source:highgate2014-05-16',
    title: 'Highgate Passing Patterns (2014)',
    file: '/patternpals/books/highgate2014-05-16.pdf',
  },
  {
    tag: 'source:passingpatternsaug06',
    title: 'Passing Patterns Compendium (Aug 2006)',
    file: '/patternpals/books/PassingPatternsAug06.pdf',
  },
  {
    tag: 'source:willpatterns',
    title: 'Will Murray Passing Patterns',
    file: '/patternpals/books/WillPatterns.pdf',
  },
  {
    tag: 'source:madison_patterns_v1_2',
    title: 'Madison Patterns V1-2',
    file: '/patternpals/books/Madison_Patterns_V1-2.pdf',
  },
  {
    tag: 'source:takeouts',
    title: 'Takeouts',
    file: '/patternpals/books/takeouts.pdf',
  },
  {
    tag: 'source:anthology',
    title: 'Passing Pattern Anthology',
    file: '/patternpals/books/anthology.pdf',
  },
  {
    tag: 'source:curriculum_flowchart',
    title: 'Passing Progression Flowchart',
    file: '/patternpals/books/Curriculum-Flowchart.pdf',
  },
];

const BOOKS_BY_TAG = new Map(PATTERN_BOOKS.map((book) => [book.tag, book]));

export const PATTERN_TYPE_LABELS: Record<PatternType, string> = {
  passing: 'Passing',
  feed: 'Feed',
  line: 'Line',
  takeout: 'Takeout',
  triangle: 'Triangle',
  moving: 'Moving',
  solo: 'Solo',
  warmup: 'Warmup',
  other: 'Other',
};

export type MetadataClassification<T> = {
  value: T | null;
  provenance: MetadataProvenance;
  displayName: string;
  sourceBacked: boolean;
};

const LEGACY_DIFFICULTY_PROVENANCE: MetadataProvenance = {
  confidence: 'unverified',
  source: 'legacy-ai',
  note: 'Legacy catalog difficulty was generated during import and has not been checked against a source citation or reviewer.',
};

const CURATED_PATTERN_TYPE_PROVENANCE: MetadataProvenance = {
  confidence: 'curated',
  source: 'maintainer',
  note: 'Maintainer-provided atlas override for browsing; useful but not yet tied to a source citation.',
};

const INFERRED_PATTERN_TYPE_PROVENANCE: MetadataProvenance = {
  confidence: 'inferred',
  source: 'heuristic',
  note: 'Derived from the pattern name, tags, or juggler count; requires human review before becoming canonical.',
};

const isSourceBacked = (provenance: MetadataProvenance) =>
  provenance.confidence === 'verified' && provenance.source === 'source';

const inferPatternType = (pattern: Pattern): PatternType => {
  const searchable = `${pattern.name} ${pattern.tags.join(' ')}`.toLowerCase();
  if (searchable.includes('feed')) return 'feed';
  if (searchable.includes('line')) return 'line';
  if (searchable.includes('takeout') || searchable.includes('scrambled')) return 'takeout';
  if (searchable.includes('triangle')) return 'triangle';
  if (searchable.includes('runaround') || searchable.includes('zap') || searchable.includes('zip')) return 'moving';
  if (pattern.requiredJugglers <= 1) return 'solo';
  return 'passing';
};

export const getDifficultyClassification = (pattern: Pattern): MetadataClassification<ExperienceLevel> => {
  const provenance = pattern.difficultyProvenance ?? LEGACY_DIFFICULTY_PROVENANCE;
  const sourceBacked = isSourceBacked(provenance);
  return {
    value: sourceBacked ? pattern.difficulty : null,
    provenance,
    displayName: sourceBacked ? pattern.difficulty : 'Difficulty unclassified',
    sourceBacked,
  };
};

export const getPatternTypeClassification = (pattern: Pattern): MetadataClassification<PatternType> => {
  const value = pattern.patternType ?? inferPatternType(pattern);
  const provenance = pattern.patternType
    ? (pattern.patternTypeProvenance ?? CURATED_PATTERN_TYPE_PROVENANCE)
    : INFERRED_PATTERN_TYPE_PROVENANCE;
  return {
    value,
    provenance,
    displayName: PATTERN_TYPE_LABELS[value],
    sourceBacked: isSourceBacked(provenance),
  };
};

export const getPatternType = (pattern: Pattern): PatternType => getPatternTypeClassification(pattern).value ?? 'other';

export const getPatternJugglerCount = (pattern: Pattern) => pattern.numJugglers ?? pattern.requiredJugglers;

const inferOpenEndedMinimumFromText = (pattern: Pattern): number | null => {
  const searchable = `${pattern.name} ${pattern.description} ${pattern.tags.join(' ')}`.toLowerCase();
  const orMore = searchable.match(/\b(\d{1,2})\s*(?:or more|\+)\s*jugglers?\b/i);
  if (orMore) return Number(orMore[1]);
  const forAtLeast = searchable.match(/\b(?:at least|minimum)\s*(\d{1,2})\s*jugglers?\b/i);
  if (forAtLeast) return Number(forAtLeast[1]);
  return null;
};

export const getPatternJugglerBounds = (pattern: Pattern) => {
  if (pattern.scaling) {
    return {
      min: Math.max(1, Math.round(pattern.scaling.minJugglers)),
      max: typeof pattern.scaling.maxJugglers === 'number' ? Math.max(pattern.scaling.minJugglers, Math.round(pattern.scaling.maxJugglers)) : null,
      strategy: pattern.scaling.strategy,
      notes: pattern.scaling.notes ?? null,
    } as const;
  }

  const inferredMin = inferOpenEndedMinimumFromText(pattern);
  if (typeof inferredMin === 'number' && inferredMin > 0) {
    return {
      min: inferredMin,
      max: null,
      strategy: 'open-ended' as const,
      notes: 'Inferred from catalog text indicating open-ended juggler support.',
    };
  }

  const fixed = getPatternJugglerCount(pattern);
  return {
    min: fixed,
    max: fixed,
    strategy: 'fixed' as const,
    notes: null,
  };
};

export const patternSupportsJugglers = (pattern: Pattern, jugglers: number) => {
  const normalized = Math.max(1, Math.round(jugglers));
  const bounds = getPatternJugglerBounds(pattern);
  if (normalized < bounds.min) return false;
  if (typeof bounds.max === 'number' && normalized > bounds.max) return false;
  return true;
};

export const getCatalogJugglerCounts = (patterns: Pattern[]) => {
  return Array.from(
    new Set(
      patterns.flatMap((pattern) => {
        const bounds = getPatternJugglerBounds(pattern);
        if (typeof bounds.max === 'number') {
          return Array.from({ length: bounds.max - bounds.min + 1 }, (_, index) => bounds.min + index);
        }
        return [bounds.min];
      }),
    ),
  ).sort((a, b) => a - b);
};

export const getCatalogMaxJugglers = (patterns: Pattern[]) => {
  const fixedMax = patterns.reduce((max, pattern) => {
    const bounds = getPatternJugglerBounds(pattern);
    if (typeof bounds.max === 'number') return Math.max(max, bounds.max);
    return Math.max(max, bounds.min);
  }, 2);
  return fixedMax;
};

export const getPatternObjectCount = (pattern: Pattern) => {
  if (typeof pattern.numObjects === 'number') return pattern.numObjects;
  const fromName = pattern.name.match(/\b(\d+)[ -]?(clubs?|balls?|rings?)\b/i);
  if (fromName) return Number(fromName[1]);
  const fromId = pattern.id.match(/^(\d+)_clubs?/i);
  if (fromId) return Number(fromId[1]);
  return null;
};

export const getPatternRhythm = (pattern: Pattern) => {
  if (pattern.rhythm) return pattern.rhythm;
  const count = pattern.name.match(/\b(\d+)[ -]?count\b/i);
  if (count) return `${count[1]}-count`;
  const acronym = pattern.name.match(/\bP[PSZ]{1,6}\b/i);
  if (acronym) return acronym[0].toUpperCase();
  if (pattern.tags.includes('count')) return 'count-based';
  return null;
};

export const getPatternAliases = (pattern: Pattern) => pattern.aliases ?? [];

export const getPatternSources = (pattern: Pattern) => {
  const tags = pattern.tags.filter((tag) => tag.startsWith('source:'));
  const sources = tags
    .map((tag) => BOOKS_BY_TAG.get(tag))
    .filter((book): book is PatternBook => Boolean(book));
  const missing = tags.filter((tag) => !BOOKS_BY_TAG.has(tag));
  return { sources, missing };
};

export const getVisualAidBrief = (pattern: Pattern) => {
  const patternType = PATTERN_TYPE_LABELS[getPatternType(pattern)].toLowerCase();
  const jugglerCount = getPatternJugglerCount(pattern);
  const objectCount = getPatternObjectCount(pattern);
  const objectPhrase = objectCount ? `${objectCount} objects` : pattern.props.join(', ');
  return `Create a ${patternType} diagram for ${pattern.name}: ${jugglerCount} jugglers, ${objectPhrase}, props ${pattern.props.join(', ')}, with handoff direction and role labels.`;
};

const deriveKeySkills = (pattern: Pattern) => {
  const skills = new Set<string>();
  skills.add(`${getPatternJugglerCount(pattern)}-person coordination`);
  skills.add(`${pattern.props.join('/')} passing`);
  const type = getPatternType(pattern);
  if (type === 'feed') skills.add('feed timing and role rotation');
  if (type === 'takeout') skills.add('takeout entries and exits');
  if (type === 'line') skills.add('line geometry');
  if (type === 'moving') skills.add('movement path awareness');
  if (type === 'triangle') skills.add('triangle spacing');
  const rhythm = getPatternRhythm(pattern);
  if (rhythm) skills.add(`${rhythm} rhythm`);
  (pattern.roles ?? []).slice(0, 3).forEach((role) => skills.add(role));
  return Array.from(skills).slice(0, 6);
};

const buildAtlasSummary = (pattern: Pattern) => {
  const typeClassification = getPatternTypeClassification(pattern);
  const type = typeClassification.displayName.toLowerCase();
  const difficultyClassification = getDifficultyClassification(pattern);
  const jugglerCount = getPatternJugglerCount(pattern);
  const objectCount = getPatternObjectCount(pattern);
  const objects = objectCount ? `${objectCount} objects` : pattern.props.join(', ');
  const rhythm = getPatternRhythm(pattern);
  const rhythmPhrase = rhythm ? ` It is organized around ${rhythm}.` : '';
  const difficultyPhrase = difficultyClassification.sourceBacked
    ? ` Its source-backed difficulty is ${difficultyClassification.displayName.toLowerCase()}.`
    : ' Its difficulty is not yet source-classified.';
  const typePhrase = typeClassification.sourceBacked
    ? `source-backed ${type}`
    : `${type} (${typeClassification.provenance.confidence})`;
  return `${pattern.name} is a ${typePhrase} pattern for ${jugglerCount} juggler${jugglerCount === 1 ? '' : 's'} using ${objects}.${rhythmPhrase}${difficultyPhrase}`;
};

const buildTeachingProgression = (pattern: Pattern): TeachingProgressionStep[] => {
  const prereqNames = pattern.prerequisites.map((id) => getPatternById(id)?.name ?? id);
  const steps: TeachingProgressionStep[] = [];
  steps.push({
    label: 'Orient the group',
    description: `Name the canonical pattern, roles, object count, and the ${PATTERN_TYPE_LABELS[getPatternType(pattern)].toLowerCase()} shape before anyone throws.`,
    patternIds: [],
  });
  if (pattern.prerequisites.length > 0) {
    steps.push({
      label: 'Warm up prerequisites',
      description: `Run ${prereqNames.slice(0, 3).join(', ')} until the timing feels stable.`,
      patternIds: pattern.prerequisites.slice(0, 4),
    });
  }
  steps.push({
    label: 'Run the smallest teachable version',
    description: `Start ${pattern.name} slowly, freeze after the first full cycle, and confirm every juggler can describe their next throw.`,
    patternIds: [pattern.id],
  });
  steps.push({
    label: 'Diagnose common failures',
    description: (pattern.commonMistakes?.[0] ?? 'Watch spacing, late passes, wrong-hand starts, and role confusion before adding speed.'),
    patternIds: [pattern.id],
  });
  steps.push({
    label: 'Preserve the local lesson',
    description: 'Record the cue, local name, easier entry, or diagram that made the pattern click for this group.',
    patternIds: [pattern.id],
  });
  return steps;
};

export const buildPatternAtlasEntry = (pattern: Pattern, communityNotes: PatternCurationEntry[] = []): PatternAtlasEntry => {
  const excerpt = getPatternExcerpt(pattern.id);
  const { sources, missing } = getPatternSources(pattern);
  const sourceCitations = sources.map((source) => ({
    ...source,
    hasExcerpt: excerpt?.sourceTag === source.tag,
    page: excerpt?.sourceTag === source.tag ? excerpt.page : null,
    excerptImage: excerpt?.sourceTag === source.tag ? excerpt.image : null,
  }));
  const visualAidCount = communityNotes.filter((note) => note.visualAid).length + (excerpt ? 1 : 0);
  const aliases = getPatternAliases(pattern);
  const localNames = communityNotes
    .filter((entry) => entry.signal === 'variation')
    .map((entry) => entry.note.split(/[.;]/)[0]?.trim())
    .filter(Boolean)
    .slice(0, 5);
  const difficultyClassification = getDifficultyClassification(pattern);
  const patternTypeClassification = getPatternTypeClassification(pattern);
  const knowledgeGaps = [
    sourceCitations.length === 0 ? 'Needs verified source citation' : '',
    !difficultyClassification.sourceBacked ? 'Needs source-backed difficulty classification' : '',
    patternTypeClassification.provenance.confidence === 'inferred' ? 'Needs reviewed pattern-family classification' : '',
    patternTypeClassification.provenance.confidence === 'curated' && !patternTypeClassification.sourceBacked ? 'Needs source-backed pattern-family citation' : '',
    !excerpt ? 'Needs source-page visual excerpt or diagram' : '',
    aliases.length === 0 ? 'Needs aliases or local names from clubs' : '',
    !(pattern.commonMistakes?.length) ? 'Needs common failure modes' : '',
    communityNotes.length === 0 ? 'Needs field-tested community notes' : '',
    ...missing.map((tag) => `Unmapped source tag: ${tag}`),
  ].filter(Boolean);


  return {
    pattern,
    canonicalName: pattern.name,
    summary: buildAtlasSummary(pattern),
    family: patternTypeClassification.value ?? 'other',
    difficultyProvenance: difficultyClassification.provenance,
    patternTypeProvenance: patternTypeClassification.provenance,
    sourceCitations,
    aliases,
    localNames,
    keySkills: deriveKeySkills(pattern),
    teachingProgression: buildTeachingProgression(pattern),
    commonFailureModes: pattern.commonMistakes ?? [],
    variants: communityNotes.filter((entry) => entry.signal === 'variation').map((entry) => entry.note).slice(0, 4),
    communityNotes,
    visualAidCount,
    knowledgeGaps,
  };
};

export const buildAtlasHealth = (patterns: Pattern[]): AtlasHealth => {
  return patterns.reduce(
    (acc, pattern) => {
      const sources = getPatternSources(pattern).sources;
      const excerpt = getPatternExcerpt(pattern.id);
      acc.totalPatterns += 1;
      if (sources.length > 0) acc.sourceBackedPatterns += 1;
      if (excerpt) acc.excerptBackedPatterns += 1;
      if ((pattern.aliases ?? []).length > 0) acc.aliasedPatterns += 1;
      if ((pattern.commonMistakes ?? []).length > 0 || pattern.prerequisites.length > 0 || (pattern.roles ?? []).length > 0) {
        acc.teachablePatterns += 1;
      }
      return acc;
    },
    {
      totalPatterns: 0,
      sourceBackedPatterns: 0,
      excerptBackedPatterns: 0,
      aliasedPatterns: 0,
      teachablePatterns: 0,
      sourceCount: PATTERN_BOOKS.length,
    },
  );
};

export const summarizeCommunityMemory = (entries: PatternCurationEntry[]): CommunityMemorySummary => {
  return entries.reduce(
    (acc, entry) => {
      acc.total += 1;
      if (entry.status === 'pending') acc.pending += 1;
      if (entry.status === 'reviewed') acc.reviewed += 1;
      if (entry.visualAid || entry.signal === 'diagram') acc.visualAidRequests += 1;
      acc.bySignal[entry.signal] = (acc.bySignal[entry.signal] ?? 0) + 1;
      return acc;
    },
    {
      total: 0,
      pending: 0,
      reviewed: 0,
      visualAidRequests: 0,
      bySignal: {} as Record<string, number>,
      recent: entries
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    },
  );
};

const byDifficulty = (pattern: Pattern, experience: ExperienceLevel | undefined) => {
  if (!experience) return true;
  const difficultyClassification = getDifficultyClassification(pattern);
  if (!difficultyClassification.value) return true;
  if (experience === 'Beginner') return difficultyClassification.value === 'Beginner';
  if (experience === 'Intermediate') return difficultyClassification.value !== 'Advanced';
  return true;
};

export const buildWorkshopPlan = ({
  patterns,
  activeExperience,
  progress,
  sessions,
}: {
  patterns: Pattern[];
  activeExperience?: ExperienceLevel;
  progress: ProgressEntry[];
  sessions: SessionEntry[];
}): WorkshopPlan => {
  const progressMap = new Map(progress.map((entry) => [entry.patternId, entry.status]));
  const practicedRecently = new Set<string>();
  sessions
    .filter((session) => session.status === 'completed')
    .slice(-8)
    .forEach((session) => session.focusPatterns.forEach((patternId) => practicedRecently.add(patternId)));

  const accessible = patterns.filter((pattern) => byDifficulty(pattern, activeExperience));
  const warmups = accessible
    .filter((pattern) => getPatternType(pattern) === 'warmup' || pattern.prerequisites.length === 0 || progressMap.get(pattern.id) === 'known')
    .slice(0, 3);
  const reviews = accessible
    .filter((pattern) => progressMap.get(pattern.id) === 'working' || practicedRecently.has(pattern.id))
    .slice(0, 4);
  const teachable = accessible
    .filter((pattern) => progressMap.get(pattern.id) !== 'known' && pattern.prerequisites.every((id) => progressMap.get(id) === 'known' || progressMap.get(id) === 'working'))
    .slice(0, 4);
  const explore = accessible
    .filter((pattern) => progressMap.get(pattern.id) === 'curious' || getPatternSources(pattern).sources.length > 0)
    .slice(0, 3);

  return {
    title: 'Atlas-informed practice plan',
    framing: 'Use the atlas to choose a teachable sequence, not just a ranked next pattern.',
    sections: [
      { title: 'Warm up shared timing', intent: 'Stabilize prerequisites and group rhythm before introducing novelty.', patterns: warmups },
      { title: 'Review what the club is retaining', intent: 'Keep partially learned patterns alive through spaced return visits.', patterns: reviews },
      { title: 'Teach one new pattern deeply', intent: 'Pick one pattern with explainable prerequisites, roles, and failure modes.', patterns: teachable },
      { title: 'Capture community memory', intent: 'End by recording the local cue, alias, diagram need, or source correction.', patterns: explore },
    ],
    facilitationPrompts: [
      'What name does this club actually use for the pattern?',
      'Which prerequisite failed first, and what cue fixed it?',
      'What diagram or video would have shortened the teaching time?',
      'Should this be marked known, working, curious, or avoided for this roster?',
    ],
  };
};
