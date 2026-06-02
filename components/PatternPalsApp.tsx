'use client';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';
import { createDefaultGroupJugglers, recommendGroupPatterns } from '@/lib/patternpals/groupRecommendations';
import { getPatternExcerpt } from '@/lib/patternpals/excerpts';
import {
  PATTERN_BOOKS,
  PATTERN_TYPE_LABELS,
  buildAtlasHealth,
  buildPatternAtlasEntry,
  buildWorkshopPlan,
  getCatalogJugglerCounts,
  getCatalogMaxJugglers,
  getDifficultyClassification,
  getPatternAliases,
  getPatternJugglerBounds,
  getPatternJugglerCount,
  getPatternObjectCount,
  getPatternRhythm,
  getPatternSources,
  getPatternType,
  getPatternTypeClassification,
  getVisualAidBrief,
  patternSupportsJugglers,
  summarizeCommunityMemory,
} from '@/lib/patternpals/atlas';
import type {
  CurationSignal,
  ExperienceLevel,
  GroupJugglerInput,
  GroupPatternRecommendation,
  JugglerProfile,
  MovementComfort,
  Pattern,
  PatternCurationEntry,
  PatternStatus,
  PatternType,
  PracticeMode,
  PracticeAttemptEntry,
  PracticeAttemptVerdict,
  ProgressEntry,
  PropType,
  ReadinessState,
  SessionCompositionPlan,
  SessionEntry,
  SessionReadinessSnapshot,
} from '@/lib/patternpals/types';

const PATTERNPALS_TAGLINE =
  'A group-fit planner for passing jugglers: enter who is at practice, then choose patterns whose positions give each person the right challenge.';

const LOCAL_KEYS = {
  activeId: 'patternpals-active-juggler',
  partnerId: 'patternpals-partner-juggler',
  groupJugglers: 'patternpals-group-jugglers',
  tryMode: 'patternpals-try-mode',
};

type PatternPalsAppProps = {
  initialPatternId?: string;
};

const EXPERIENCE_OPTIONS: ExperienceLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const PROP_OPTIONS: PropType[] = ['clubs', 'balls', 'rings'];
const PATTERN_TYPE_OPTIONS: PatternType[] = [
  'passing',
  'feed',
  'line',
  'takeout',
  'triangle',
  'moving',
  'solo',
  'warmup',
  'other',
];

const DEFAULT_PATTERN_LIMIT = 60;
const PATTERN_PAGE_SIZE = 60;
const SEARCH_PATTERN_LIMIT = 200;
const MAX_SESSION_FOCUS_PATTERNS = 24;
const MAX_RECOMMENDATION_COMFORT_COUNT = 12;
const CATALOG_JUGGLER_COUNTS = getCatalogJugglerCounts(PATTERN_LIBRARY).filter((count) => count >= 2);
const MAX_CATALOG_JUGGLERS = getCatalogMaxJugglers(PATTERN_LIBRARY);
const MAX_GROUP_JUGGLERS = Math.max(24, MAX_CATALOG_JUGGLERS);
const COMFORT_COUNT_OPTIONS = Array.from({ length: MAX_RECOMMENDATION_COMFORT_COUNT }, (_, index) => index + 1);

const parseGroupJugglers = (value: string | null): GroupJugglerInput[] => {
  if (!value) return createDefaultGroupJugglers();
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return createDefaultGroupJugglers();
    const normalized = parsed
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        return {
          id: typeof row.id === 'string' && row.id ? row.id : `group-juggler-${index + 1}`,
          name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `Juggler ${index + 1}`,
          comfortableObjects:
            typeof row.comfortableObjects === 'number' && Number.isFinite(row.comfortableObjects)
              ? row.comfortableObjects
              : 3,
          comfortableCount:
            typeof row.comfortableCount === 'number' && Number.isFinite(row.comfortableCount)
              ? Math.round(row.comfortableCount)
              : 4,
          movementComfort:
            row.movementComfort === 'high' || row.movementComfort === 'moderate' || row.movementComfort === 'stationary'
              ? row.movementComfort
              : 'stationary',
        } satisfies GroupJugglerInput;
      })
      .filter((item): item is GroupJugglerInput => Boolean(item && item.name));
    return normalized.length >= 2 ? normalized.slice(0, MAX_GROUP_JUGGLERS) : createDefaultGroupJugglers();
  } catch {
    return createDefaultGroupJugglers();
  }
};

const CURATION_SIGNAL_OPTIONS: { value: CurationSignal; label: string; description: string }[] = [
  { value: 'tip', label: 'Teaching tip', description: 'A cue that helped your group learn the pattern.' },
  { value: 'variation', label: 'Variation', description: 'A local name, easier entry, harder version, or compatible twist.' },
  { value: 'warning', label: 'Common trap', description: 'A mistake or safety issue future groups should watch for.' },
  { value: 'source', label: 'Source note', description: 'A correction, citation, or page-reference improvement.' },
  { value: 'diagram', label: 'Visual aid request', description: 'A diagram, floor map, or video reference the pattern still needs.' },
];

type PatternFilterState = {
  difficulty: 'all' | ExperienceLevel;
  patternType: 'all' | PatternType;
  jugglers: 'all' | string;
  objects: 'all' | string;
};

const DEFAULT_PATTERN_FILTERS: PatternFilterState = {
  difficulty: 'all',
  patternType: 'all',
  jugglers: 'all',
  objects: 'all',
};

const normalizeSearchText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compactSearchText = (value: string) => normalizeSearchText(value).replace(/\s+/g, '');

const isSubsequence = (needle: string, haystack: string) => {
  if (!needle) return true;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
};

const buildPatternSearchFields = (pattern: Pattern) => {
  const sources = getPatternSources(pattern).sources.map((source) => source.title);
  const difficultyClassification = getDifficultyClassification(pattern);
  const patternTypeClassification = getPatternTypeClassification(pattern);
  return [
    pattern.id,
    pattern.name,
    pattern.description,
    difficultyClassification.value ? difficultyClassification.displayName : '',
    patternTypeClassification.displayName,
    getPatternRhythm(pattern) ?? '',
    String(getPatternJugglerCount(pattern)),
    String(getPatternObjectCount(pattern) ?? ''),
    ...pattern.tags,
    ...getPatternAliases(pattern),
    ...(pattern.roles ?? []),
    ...(pattern.commonMistakes ?? []),
    ...sources,
  ].filter(Boolean);
};

const scorePatternSearch = (pattern: Pattern, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const fields = buildPatternSearchFields(pattern).map((field) => ({
    normalized: normalizeSearchText(field),
    compact: compactSearchText(field),
  }));
  const compactName = compactSearchText(pattern.name);

  let totalScore = 0;
  for (const term of terms) {
    const compactTerm = compactSearchText(term);
    let termScore = 0;
    for (const field of fields) {
      if (!field.normalized) continue;
      if (field.normalized === term || field.compact === compactTerm) {
        termScore = Math.max(termScore, 120);
      } else if (field.normalized.includes(term) || field.compact.includes(compactTerm)) {
        termScore = Math.max(termScore, 90);
      } else if (field.normalized.split(' ').some((word) => word.startsWith(term))) {
        termScore = Math.max(termScore, 70);
      } else if (isSubsequence(compactTerm, field.compact)) {
        termScore = Math.max(termScore, 35);
      }
    }
    if (compactName.includes(compactTerm)) termScore += 20;
    if (termScore === 0) return 0;
    totalScore += termScore;
  }

  return totalScore;
};

const matchesPatternFilters = (pattern: Pattern, filters: PatternFilterState) => {
  const difficultyClassification = getDifficultyClassification(pattern);
  const patternTypeClassification = getPatternTypeClassification(pattern);
  if (filters.difficulty !== 'all' && difficultyClassification.value !== filters.difficulty) return false;
  if (filters.patternType !== 'all' && patternTypeClassification.value !== filters.patternType) return false;
  if (filters.jugglers !== 'all' && !patternSupportsJugglers(pattern, Number(filters.jugglers))) return false;
  if (filters.objects !== 'all' && getPatternObjectCount(pattern) !== Number(filters.objects)) return false;
  return true;
};

const buildStatusCounts = (entries: ProgressEntry[]) => {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    },
    { known: 0, working: 0, curious: 0 } as Record<PatternStatus, number>,
  );
};

const READINESS_LABELS: Record<ReadinessState, string> = {
  ready: 'Ready',
  stretch: 'Stretch',
  blocked: 'Blocked',
};

const formatPattern = (patternId: string) => getPatternById(patternId)?.name ?? patternId.replace(/_/g, ' ');

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

type PracticeReadiness = SessionReadinessSnapshot & {
  pattern: Pattern;
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
const normalizePersonName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const buildCompositionPlanFromRecommendation = (recommendation: GroupPatternRecommendation): SessionCompositionPlan | null => {
  const laneMap = new Map<number, SessionCompositionPlan['lanes'][number]>();

  recommendation.assignments.forEach((assignment) => {
    const match = assignment.role.match(/^Lane\s+(\d+):\s*/i);
    if (!match) return;
    const laneNumber = Number(match[1]);
    if (!Number.isFinite(laneNumber) || laneNumber <= 0) return;
    const laneId = `lane-${laneNumber}`;
    const existing = laneMap.get(laneNumber) ?? {
      laneId,
      label: `Lane ${laneNumber}`,
      participantIds: [],
      participantNames: [],
    };

    if (!existing.participantIds.includes(assignment.juggler.id)) {
      existing.participantIds.push(assignment.juggler.id);
    }
    if (!existing.participantNames.includes(assignment.juggler.name)) {
      existing.participantNames.push(assignment.juggler.name);
    }
    laneMap.set(laneNumber, existing);
  });

  const lanes = Array.from(laneMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, lane]) => lane);

  if (lanes.length < 2) return null;

  const totalJugglers = lanes.reduce((total, lane) => total + lane.participantIds.length, 0);
  const baseJugglers = lanes[0]?.participantIds.length ?? 0;
  if (baseJugglers < 2 || totalJugglers < 4) return null;

  const notes = recommendation.reasons.find((reason) => reason.toLowerCase().includes('composed as')) ?? null;

  return {
    patternId: recommendation.pattern.id,
    strategy: 'stacked-lanes',
    baseJugglers,
    totalJugglers,
    lanes,
    notes,
  };
};

const normalizeCompositionAttendees = (
  attendees: { id: string | null; name: string }[],
) => {
  const seen = new Set<string>();
  return attendees
    .map((attendee) => ({ id: attendee.id, name: attendee.name.trim() }))
    .filter((attendee) => attendee.name)
    .filter((attendee) => {
      const key = normalizePersonName(attendee.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const assessPracticeReadiness = ({
  focusPatternIds,
  activeProfile,
  participants,
  manualParticipantNames,
  progressMap,
}: {
  focusPatternIds: string[];
  activeProfile: JugglerProfile | null;
  participants: JugglerProfile[];
  manualParticipantNames: string[];
  progressMap: Map<string, PatternStatus>;
}): PracticeReadiness[] => {
  if (focusPatternIds.length === 0) return [];

  const roster = activeProfile ? [activeProfile, ...participants] : participants;
  const participantCount = roster.length + manualParticipantNames.length;

  return focusPatternIds
    .map((patternId) => getPatternById(patternId))
    .filter((pattern): pattern is Pattern => Boolean(pattern))
    .map((pattern) => {
      const reasons: string[] = [];
      let readiness: ReadinessState = 'ready';

      if (!activeProfile) {
        readiness = 'blocked';
        reasons.push('Create or select your profile first.');
      }

      const jugglerBounds = getPatternJugglerBounds(pattern);
      const neededJugglers = jugglerBounds.min;
      if (participantCount < jugglerBounds.min) {
        readiness = 'blocked';
        reasons.push(`Needs at least ${jugglerBounds.min} jugglers; this plan has ${participantCount}.`);
      } else {
        if (typeof jugglerBounds.max === 'number') {
          reasons.push(`${participantCount} juggler${participantCount === 1 ? '' : 's'} planned for a ${jugglerBounds.min}-to-${jugglerBounds.max} juggler pattern.`);
        } else {
          reasons.push(`${participantCount} juggler${participantCount === 1 ? '' : 's'} planned for an open-ended pattern (minimum ${jugglerBounds.min}).`);
        }
      }

      const missingPrerequisites = pattern.prerequisites.filter((prereq) => progressMap.get(prereq) !== 'known');
      if (missingPrerequisites.length > 1) {
        readiness = 'blocked';
        reasons.push(`Missing prerequisites: ${missingPrerequisites.slice(0, 3).map(formatPattern).join(', ')}.`);
      } else if (missingPrerequisites.length === 1 && readiness !== 'blocked') {
        readiness = 'stretch';
        reasons.push(`Warm up prerequisite first: ${formatPattern(missingPrerequisites[0])}.`);
      }

      const activeStatus = progressMap.get(pattern.id);
      if (activeStatus === 'known') {
        reasons.push('Already known; good for polishing or teaching.');
      } else if (activeStatus === 'working') {
        reasons.push('Currently marked working, so it is a strong practice candidate.');
      } else if (activeStatus === 'curious' && readiness === 'ready') {
        readiness = 'stretch';
        reasons.push('Marked curious; try it after an easier warmup.');
      } else if (!activeStatus && readiness === 'ready') {
        readiness = 'stretch';
        reasons.push('No progress recorded yet; treat the first run as exploratory.');
      }

      if (activeProfile && !pattern.props.some((prop) => activeProfile.props.includes(prop))) {
        if (readiness !== 'blocked') readiness = 'stretch';
        reasons.push(`Your profile does not list ${pattern.props.join(' or ')} yet.`);
      }

      if (reasons.length === 0) {
        reasons.push('Prerequisites, props, and group size look aligned.');
      }

      return {
        pattern,
        patternId: pattern.id,
        readiness,
        reasons: reasons.slice(0, 5),
        participantCount,
      };
    });
};

type PatternListProps = {
  patterns: Pattern[];
  total: number;
  searchActive: boolean;
  progressMap: Map<string, PatternStatus>;
  hasMore: boolean;
  onSelect: (pattern: Pattern) => void;
  onUpdateStatus: (patternId: string, status: PatternStatus) => void;
  onLoadMore: () => void;
};

type PatternRowProps = {
  pattern: Pattern;
  status?: PatternStatus;
  onSelect: (pattern: Pattern) => void;
  onUpdateStatus: (patternId: string, status: PatternStatus) => void;
};

const PatternRow = memo(({ pattern, status, onSelect, onUpdateStatus }: PatternRowProps) => {
  const difficultyClassification = getDifficultyClassification(pattern);
  const patternTypeClassification = getPatternTypeClassification(pattern);
  const rhythm = getPatternRhythm(pattern);
  const objectCount = getPatternObjectCount(pattern);
  const jugglerCount = getPatternJugglerCount(pattern);

  return (
    <div className="patternpals-pattern-row">
      <div className="patternpals-pattern-main">
        <button
          type="button"
          className="patternpals-pattern-trigger"
          onClick={() => onSelect(pattern)}
        >
          <span className="patternpals-pattern-title">{pattern.name}</span>
          <span className="muted small">
            {difficultyClassification.displayName} - {jugglerCount} jugglers - {pattern.props.join(', ')}
          </span>
          <span className="patternpals-pattern-badges" aria-label="Pattern metadata">
            <span className={`patternpals-metadata-pill ${difficultyClassification.provenance.confidence}`}>
              {difficultyClassification.sourceBacked ? 'Source-backed difficulty' : 'Difficulty needs review'}
            </span>
            <span className={`patternpals-metadata-pill ${patternTypeClassification.provenance.confidence}`}>
              {patternTypeClassification.displayName} · {patternTypeClassification.provenance.confidence}
            </span>
            {rhythm ? <span>{rhythm}</span> : null}
            {objectCount ? <span>{objectCount} objects</span> : null}
          </span>
        </button>
      </div>
      <div className="patternpals-status-buttons">
        {(['known', 'working', 'curious'] as PatternStatus[]).map((state) => (
          <button
            key={state}
            type="button"
            className={`patternpals-mini-button${status === state ? ' active' : ''}`}
            onClick={() => onUpdateStatus(pattern.id, state)}
          >
            {state}
          </button>
        ))}
      </div>
    </div>
  );
});

PatternRow.displayName = 'PatternRow';

const PatternList = memo(
  ({ patterns, total, searchActive, progressMap, hasMore, onSelect, onUpdateStatus, onLoadMore }: PatternListProps) => {
    return (
      <>
        <div className="patternpals-pattern-summary muted small">
          Showing {patterns.length} of {total} patterns.
          {searchActive ? ' Refine your search to see more results.' : ' Use search to jump to a pattern quickly.'}
        </div>
        <div className="patternpals-pattern-list">
          {patterns.map((pattern) => {
            const status = progressMap.get(pattern.id);
            return (
              <PatternRow
                key={pattern.id}
                pattern={pattern}
                status={status}
                onSelect={onSelect}
                onUpdateStatus={onUpdateStatus}
              />
            );
          })}
        </div>
        {hasMore ? (
          <div className="patternpals-pattern-actions">
            <button type="button" className="patternpals-mini-button" onClick={onLoadMore}>
              Load more patterns
            </button>
          </div>
        ) : null}
      </>
    );
  },
);

PatternList.displayName = 'PatternList';

export default function PatternPalsApp({ initialPatternId }: PatternPalsAppProps = {}) {
  const [jugglers, setJugglers] = useState<JugglerProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [groupJugglers, setGroupJugglers] = useState<GroupJugglerInput[]>(() => createDefaultGroupJugglers());
  const [attempts, setAttempts] = useState<PracticeAttemptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [patternSearch, setPatternSearch] = useState('');
  const [patternFilters, setPatternFilters] = useState<PatternFilterState>(DEFAULT_PATTERN_FILTERS);
  const deferredPatternSearch = useDeferredValue(patternSearch);
  const [patternLimit, setPatternLimit] = useState(DEFAULT_PATTERN_LIMIT);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(() =>
    initialPatternId ? getPatternById(initialPatternId) ?? null : null,
  );
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [curationEntries, setCurationEntries] = useState<PatternCurationEntry[]>([]);
  const [allCurationEntries, setAllCurationEntries] = useState<PatternCurationEntry[]>([]);
  const [curationStatus, setCurationStatus] = useState<string | null>(null);
  const [curationForm, setCurationForm] = useState<{ signal: CurationSignal; note: string; visualAidTitle: string; visualAidUrl: string }>({
    signal: 'tip',
    note: '',
    visualAidTitle: '',
    visualAidUrl: '',
  });
  const [tryModeEnabled, setTryModeEnabled] = useState(false);
  const [tryFeedbackNote, setTryFeedbackNote] = useState('');
  const deferredProgress = useDeferredValue(progress);

  const [profileForm, setProfileForm] = useState<{
    name: string;
    experience: ExperienceLevel;
    props: PropType[];
  }>({
    name: '',
    experience: 'Beginner',
    props: [],
  });
  const [editingProfile, setEditingProfile] = useState(false);

  const [partnerForm, setPartnerForm] = useState<{
    name: string;
    experience: ExperienceLevel;
    props: PropType[];
  }>({
    name: '',
    experience: 'Beginner',
    props: [],
  });
  const [selectedRosterPartnerId, setSelectedRosterPartnerId] = useState('');

  const [sessionForm, setSessionForm] = useState<{
    scheduledFor: string;
    durationMinutes: number;
    location: string;
    partnerId: string;
    partnerName: string;
    participantIds: string[];
    participantNames: string;
    practiceMode: PracticeMode;
    focusPatterns: string[];
    compositionPlan: SessionCompositionPlan[];
    outcome: string;
  }>({
    scheduledFor: '',
    durationMinutes: 90,
    location: '',
    partnerId: '',
    partnerName: '',
    participantIds: [],
    participantNames: '',
    practiceMode: 'passing',
    focusPatterns: [],
    compositionPlan: [],
    outcome: '',
  });
  const [focusInput, setFocusInput] = useState('');

  const activeProfile = useMemo(
    () => jugglers.find((juggler) => juggler.id === activeId) ?? null,
    [jugglers, activeId],
  );
  const partnerProfile = useMemo(
    () => jugglers.find((juggler) => juggler.id === partnerId) ?? null,
    [jugglers, partnerId],
  );

  const rosterPartners = useMemo(() => {
    const seen = new Set<string>();
    return jugglers
      .filter((juggler) => juggler.id !== activeId)
      .filter((juggler) => {
        const key = normalizePersonName(juggler.name);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [jugglers, activeId]);

  const progressMap = useMemo(
    () => new Map(progress.map((entry) => [entry.patternId, entry.status])),
    [progress],
  );

  const progressCounts = useMemo(() => buildStatusCounts(progress), [progress]);

  const upcomingSessions = useMemo(() => {
    const now = Date.now();
    return sessions.filter((session) => {
      const scheduled = new Date(session.scheduledFor).getTime();
      return session.status === 'scheduled' && scheduled >= now;
    });
  }, [sessions]);

  const completedSessions = useMemo(() => {
    return sessions
      .filter((session) => session.status === 'completed')
      .sort((a, b) => new Date(b.completedAt ?? b.scheduledFor).getTime() - new Date(a.completedAt ?? a.scheduledFor).getTime());
  }, [sessions]);

  const practiceMinutes = useMemo(() => {
    return completedSessions.reduce((total, session) => total + (session.durationMinutes ?? 0), 0);
  }, [completedSessions]);

  const atlasHealth = useMemo(() => buildAtlasHealth(PATTERN_LIBRARY), []);

  const communityMemory = useMemo(() => summarizeCommunityMemory(allCurationEntries), [allCurationEntries]);

  const workshopPlan = useMemo(() =>
    buildWorkshopPlan({
      patterns: PATTERN_LIBRARY,
      activeExperience: activeProfile?.experience,
      progress: deferredProgress,
      sessions,
    }),
    [activeProfile?.experience, deferredProgress, sessions],
  );

  const recommendations = useMemo(
    () => recommendGroupPatterns(PATTERN_LIBRARY, groupJugglers, 10, attempts),
    [attempts, groupJugglers],
  );

  const filteredPatterns = useMemo(() => {
    const query = deferredPatternSearch.trim();
    const scored = PATTERN_LIBRARY.map((pattern, index) => ({
      pattern,
      index,
      score: scorePatternSearch(pattern, query),
    })).filter(({ pattern, score }) => score > 0 && matchesPatternFilters(pattern, patternFilters));

    if (query) {
      scored.sort((a, b) => b.score - a.score || a.index - b.index);
    }

    return scored.map(({ pattern }) => pattern);
  }, [deferredPatternSearch, patternFilters]);

  const visiblePatterns = useMemo(() => {
    if (deferredPatternSearch.trim()) {
      return filteredPatterns.slice(0, SEARCH_PATTERN_LIMIT);
    }
    return filteredPatterns.slice(0, patternLimit);
  }, [filteredPatterns, deferredPatternSearch, patternLimit]);

  const hasMorePatterns = useMemo(() => {
    if (deferredPatternSearch.trim()) {
      return filteredPatterns.length > SEARCH_PATTERN_LIMIT;
    }
    return filteredPatterns.length > patternLimit;
  }, [filteredPatterns.length, deferredPatternSearch, patternLimit]);

  const patternFiltersActive = useMemo(
    () =>
      Boolean(patternSearch.trim()) ||
      patternFilters.difficulty !== 'all' ||
      patternFilters.patternType !== 'all' ||
      patternFilters.jugglers !== 'all' ||
      patternFilters.objects !== 'all',
    [patternFilters, patternSearch],
  );

  const resetPatternBrowser = useCallback(() => {
    setPatternSearch('');
    setPatternFilters(DEFAULT_PATTERN_FILTERS);
  }, []);

  const focusOptions = useMemo(() => {
    const query = focusInput.trim();
    if (!query) return PATTERN_LIBRARY.slice(0, 40);
    return PATTERN_LIBRARY.map((pattern, index) => ({
      pattern,
      index,
      score: scorePatternSearch(pattern, query),
    }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 40)
      .map(({ pattern }) => pattern);
  }, [focusInput]);

  const selectedParticipantProfiles = useMemo(() => {
    return sessionForm.participantIds
      .map((id) => jugglers.find((juggler) => juggler.id === id))
      .filter((juggler): juggler is JugglerProfile => Boolean(juggler));
  }, [jugglers, sessionForm.participantIds]);

  const manualParticipantNames = useMemo(() => {
    return uniqueStrings(sessionForm.participantNames.split(',').map((name) => name.trim()));
  }, [sessionForm.participantNames]);

  const practiceReadiness = useMemo(() => {
    const participants = sessionForm.practiceMode === 'solo' ? [] : selectedParticipantProfiles;
    const manualNames = sessionForm.practiceMode === 'solo' ? [] : manualParticipantNames;
    return assessPracticeReadiness({
      focusPatternIds: sessionForm.focusPatterns,
      activeProfile,
      participants,
      manualParticipantNames: manualNames,
      progressMap,
    });
  }, [activeProfile, manualParticipantNames, progressMap, selectedParticipantProfiles, sessionForm.focusPatterns, sessionForm.practiceMode]);

  const readinessSnapshot = useMemo<SessionReadinessSnapshot[]>(() => {
    return practiceReadiness.map(({ pattern: _pattern, ...snapshot }) => snapshot);
  }, [practiceReadiness]);

  const selectedSources = useMemo(() => {
    if (!selectedPattern) return { sources: [], missing: [] as string[] };
    return getPatternSources(selectedPattern);
  }, [selectedPattern]);

  const selectedExcerpt = useMemo(() => {
    if (!selectedPattern) return undefined;
    return getPatternExcerpt(selectedPattern.id);
  }, [selectedPattern]);

  const selectedPatternMetadata = useMemo(() => {
    if (!selectedPattern) return null;
    return {
      difficultyClassification: getDifficultyClassification(selectedPattern),
      patternType: getPatternType(selectedPattern),
      patternTypeClassification: getPatternTypeClassification(selectedPattern),
      rhythm: getPatternRhythm(selectedPattern),
      objectCount: getPatternObjectCount(selectedPattern),
      jugglerCount: getPatternJugglerCount(selectedPattern),
      aliases: getPatternAliases(selectedPattern),
      roles: selectedPattern.roles ?? [],
      commonMistakes: selectedPattern.commonMistakes ?? [],
    };
  }, [selectedPattern]);

  const selectedAtlasEntry = useMemo(() => {
    if (!selectedPattern) return null;
    return buildPatternAtlasEntry(selectedPattern, curationEntries);
  }, [curationEntries, selectedPattern]);

  const selectedPatternPath = selectedPattern ? `/patternpals/patterns/${selectedPattern.id}` : '/patternpals';

  const selectedVisualAidBrief = useMemo(() => {
    if (!selectedPattern) return '';
    return getVisualAidBrief(selectedPattern);
  }, [selectedPattern]);

  const selectedVisualAidContributions = useMemo(() => {
    return curationEntries.filter((entry) => entry.visualAid);
  }, [curationEntries]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/patternpals/jugglers');
        if (!res.ok) throw new Error('Failed to load jugglers.');
        const data = await res.json();
        if (!cancelled) {
          setJugglers(data.items ?? []);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load jugglers.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCAL_KEYS.groupJugglers);
      const next = parseGroupJugglers(stored);
      setGroupJugglers(next);
    } catch {
      setGroupJugglers(createDefaultGroupJugglers());
    }

    try {
      setTryModeEnabled(window.localStorage.getItem(LOCAL_KEYS.tryMode) === 'true');
    } catch {
      setTryModeEnabled(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/patternpals/curation')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load community memory.');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setAllCurationEntries(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllCurationEntries([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (jugglers.length === 0) return;
    if (!activeId) {
      const stored = window.localStorage.getItem(LOCAL_KEYS.activeId);
      if (stored && jugglers.some((juggler) => juggler.id === stored)) {
        setActiveId(stored);
      }
    }
    if (!partnerId) {
      const storedPartner = window.localStorage.getItem(LOCAL_KEYS.partnerId);
      if (storedPartner && rosterPartners.some((juggler) => juggler.id === storedPartner)) {
        setPartnerId(storedPartner);
      } else if (storedPartner) {
        window.localStorage.removeItem(LOCAL_KEYS.partnerId);
      }
    }
  }, [jugglers, activeId, partnerId, rosterPartners]);

  useEffect(() => {
    if (activeId) {
      window.localStorage.setItem(LOCAL_KEYS.activeId, activeId);
    }
  }, [activeId]);

  useEffect(() => {
    if (partnerId) {
      window.localStorage.setItem(LOCAL_KEYS.partnerId, partnerId);
    } else {
      window.localStorage.removeItem(LOCAL_KEYS.partnerId);
    }
  }, [partnerId]);

  useEffect(() => {
    if (selectedRosterPartnerId && !rosterPartners.some((juggler) => juggler.id === selectedRosterPartnerId)) {
      setSelectedRosterPartnerId('');
    }
  }, [rosterPartners, selectedRosterPartnerId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_KEYS.groupJugglers, JSON.stringify(groupJugglers));
    } catch {
      // Ignore storage failures.
    }
  }, [groupJugglers]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_KEYS.tryMode, tryModeEnabled ? 'true' : 'false');
    } catch {
      // Ignore storage failures.
    }
  }, [tryModeEnabled]);

  useEffect(() => {
    setPatternLimit(DEFAULT_PATTERN_LIMIT);
  }, [deferredPatternSearch, patternFilters]);

  useEffect(() => {
    if (!selectedPattern) {
      setCurationEntries([]);
      setCurationStatus(null);
      return;
    }

    let cancelled = false;
    setCurationStatus('Loading community notes...');
    setCurationForm({ signal: 'tip', note: '', visualAidTitle: '', visualAidUrl: '' });
    fetch(`/api/patternpals/curation?patternId=${encodeURIComponent(selectedPattern.id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load community notes.');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setCurationEntries(data.items ?? []);
          setCurationStatus(null);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setCurationStatus(err?.message || 'Could not load community notes.');
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPattern]);

  useEffect(() => {
    if (!selectedPattern) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPattern(null);
        setShareStatus(null);
        if (window.location.pathname.startsWith('/patternpals/patterns/')) {
          window.history.pushState({}, '', '/patternpals');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedPattern]);

  useEffect(() => {
    if (!activeId) {
      setProgress([]);
      setSessions([]);
      setAttempts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [progressRes, sessionsRes, attemptsRes] = await Promise.all([
          fetch(`/api/patternpals/progress?jugglerId=${encodeURIComponent(activeId)}`),
          fetch(`/api/patternpals/sessions?hostId=${encodeURIComponent(activeId)}`),
          fetch(`/api/patternpals/attempts?hostId=${encodeURIComponent(activeId)}`),
        ]);
        if (!progressRes.ok || !sessionsRes.ok) {
          throw new Error('Failed to load profile data.');
        }
        const progressData = await progressRes.json();
        const sessionsData = await sessionsRes.json();
        if (!cancelled) {
          setProgress(progressData.items ?? []);
          setSessions(sessionsData.items ?? []);
          if (attemptsRes && attemptsRes.ok) {
            const attemptsData = await attemptsRes.json();
            setAttempts(attemptsData.items ?? []);
          } else {
            setAttempts([]);
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Could not load profile data.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (activeProfile && !editingProfile) {
      setProfileForm({
        name: activeProfile.name,
        experience: activeProfile.experience,
        props: activeProfile.props,
      });
    }
  }, [activeProfile, editingProfile]);

  useEffect(() => {
    if (partnerProfile && !sessionForm.partnerId) {
      setSessionForm((prev) => ({
        ...prev,
        partnerId: partnerProfile.id,
        partnerName: partnerProfile.name,
        participantIds: prev.participantIds.includes(partnerProfile.id)
          ? prev.participantIds
          : [partnerProfile.id, ...prev.participantIds],
      }));
    }
  }, [partnerProfile, sessionForm.partnerId]);

  const handleCreateProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    if (!profileForm.name.trim()) {
      setError('Name is required.');
      return;
    }
    try {
      const res = await fetch('/api/patternpals/jugglers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create profile.');
      }
      const created = await res.json();
      setJugglers((prev) => [...prev, created]);
      setActiveId(created.id);
      setEditingProfile(false);
      setStatusMessage('Profile created.');
    } catch (err: any) {
      setError(err?.message || 'Profile creation failed.');
    }
  };

  const handleUpdateProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeProfile) return;
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/patternpals/jugglers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeProfile.id, ...profileForm }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update profile.');
      }
      const updated = await res.json();
      setJugglers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingProfile(false);
      setStatusMessage('Profile updated.');
    } catch (err: any) {
      setError(err?.message || 'Profile update failed.');
    }
  };

  const handleCreatePartner = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    const nextName = partnerForm.name.trim();
    if (!nextName) {
      setError('Partner name is required.');
      return;
    }

    const existingPartner = rosterPartners.find(
      (juggler) => normalizePersonName(juggler.name) === normalizePersonName(nextName),
    );
    if (existingPartner) {
      setPartnerId(existingPartner.id);
      setSelectedRosterPartnerId(existingPartner.id);
      setStatusMessage('Partner already exists. Selected existing partner.');
      return;
    }

    try {
      const res = await fetch('/api/patternpals/jugglers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...partnerForm,
          name: nextName,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add partner.');
      }
      const created = await res.json();
      setJugglers((prev) => [...prev, created]);
      setPartnerId(created.id);
      setSelectedRosterPartnerId(created.id);
      setPartnerForm({ name: '', experience: 'Beginner', props: [] });
      setStatusMessage('Partner added.');
    } catch (err: any) {
      setError(err?.message || 'Partner add failed.');
    }
  };

  const handleSetActive = (id: string) => {
    setActiveId(id);
    setStatusMessage('Active profile switched.');
  };

  const handleSetPartner = (id: string | null) => {
    setPartnerId(id);
    setSelectedRosterPartnerId(id ?? '');
    setSessionForm((prev) => {
      if (!id) {
        return {
          ...prev,
          partnerId: '',
          partnerName: '',
        };
      }

      const participantIds = prev.participantIds.includes(id)
        ? prev.participantIds
        : [id, ...prev.participantIds];
      return {
        ...prev,
        partnerId: id,
        partnerName: jugglers.find((juggler) => juggler.id === id)?.name ?? '',
        participantIds,
      };
    });
  };

  const updatePatternStatus = useCallback(async (patternId: string, status: PatternStatus) => {
    if (!activeProfile) return;
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/patternpals/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugglerId: activeProfile.id, patternId, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update pattern status.');
      }
      const entry = await res.json();
      setProgress((prev) => {
        const idx = prev.findIndex((item) => item.patternId === entry.patternId);
        if (idx === -1) return [...prev, entry];
        const updated = [...prev];
        updated[idx] = entry;
        return updated;
      });
      setStatusMessage('Pattern status updated.');
    } catch (err: any) {
      setError(err?.message || 'Pattern status update failed.');
    }
  }, [activeProfile]);

  const handleSessionCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeProfile) return;
    setError(null);
    setStatusMessage(null);
    if (!sessionForm.scheduledFor) {
      setError('Please choose a session time.');
      return;
    }
    const participants = sessionForm.practiceMode === 'solo' ? [] : selectedParticipantProfiles;
    const participantIds = participants.map((participant) => participant.id);
    const participantNames = uniqueStrings([
      ...participants.map((participant) => participant.name),
      ...manualParticipantNames,
    ]);
    const partner = participants[0] ?? null;
    const payload = {
      hostId: activeProfile.id,
      partnerId: partner ? partner.id : null,
      partnerName: partner ? partner.name : sessionForm.partnerName.trim() || null,
      participantIds,
      participantNames,
      practiceMode: sessionForm.practiceMode,
      scheduledFor: new Date(sessionForm.scheduledFor).toISOString(),
      durationMinutes: sessionForm.durationMinutes,
      location: sessionForm.location.trim() || null,
      focusPatterns: sessionForm.focusPatterns,
      compositionPlan: sessionForm.compositionPlan,
      readinessSnapshot,
      status: 'scheduled',
      outcome: sessionForm.outcome.trim() || null,
      completedAt: null,
    };
    try {
      const res = await fetch('/api/patternpals/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to schedule session.');
      }
      const created = await res.json();
      setSessions((prev) => [...prev, created]);
      setSessionForm({
        scheduledFor: '',
        durationMinutes: 90,
        location: '',
        partnerId: partner?.id ?? '',
        partnerName: partner?.name ?? '',
        participantIds,
        participantNames: manualParticipantNames.join(', '),
        practiceMode: sessionForm.practiceMode,
        focusPatterns: [],
        compositionPlan: [],
        outcome: '',
      });
      setFocusInput('');
      setStatusMessage('Session scheduled.');
    } catch (err: any) {
      setError(err?.message || 'Session scheduling failed.');
    }
  };

  const handleSessionStatus = async (sessionId: string, status: SessionEntry['status']) => {
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/patternpals/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionId,
          status,
          completedAt: status === 'completed' ? new Date().toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update session.');
      }
      const updated = await res.json();
      setSessions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setStatusMessage('Session updated.');
    } catch (err: any) {
      setError(err?.message || 'Session update failed.');
    }
  };

  const submitPracticeAttempt = async (patternId: string, verdict: PracticeAttemptVerdict) => {
    if (!activeProfile) return;
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/patternpals/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: activeProfile.id,
          patternId,
          sessionId: null,
          verdict,
          note: tryFeedbackNote.trim() || null,
          rosterSnapshot: groupJugglers,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save try-mode feedback.');
      }
      const entry = await res.json();
      setAttempts((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)]);
      setTryFeedbackNote('');
      setStatusMessage('Try-mode feedback saved.');
    } catch (err: any) {
      setError(err?.message || 'Try-mode feedback failed.');
    }
  };

  const handleSelectPattern = useCallback((pattern: Pattern) => {
    setSelectedPattern(pattern);
    setShareStatus(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/patternpals/patterns/${pattern.id}`);
    }
  }, []);

  const closePatternDetail = useCallback(() => {
    setSelectedPattern(null);
    setShareStatus(null);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/patternpals/patterns/')) {
      window.history.pushState({}, '', '/patternpals');
    }
  }, []);

  const copySelectedPatternLink = useCallback(async () => {
    if (!selectedPattern || typeof window === 'undefined') return;
    const url = `${window.location.origin}/patternpals/patterns/${selectedPattern.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Pattern link copied.');
    } catch {
      setShareStatus(url);
    }
  }, [selectedPattern]);

  const copyVisualAidBrief = useCallback(async () => {
    if (!selectedVisualAidBrief) return;
    try {
      await navigator.clipboard.writeText(selectedVisualAidBrief);
      setShareStatus('Visual-aid brief copied.');
    } catch {
      setShareStatus(selectedVisualAidBrief);
    }
  }, [selectedVisualAidBrief]);

  const handleCurationSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPattern) return;
    if (curationForm.note.trim().length < 8) {
      setCurationStatus('Add a note of at least 8 characters before submitting.');
      return;
    }

    const visualAid = curationForm.signal === 'diagram' || curationForm.visualAidTitle.trim() || curationForm.visualAidUrl.trim()
      ? {
          kind: curationForm.signal === 'diagram' ? 'diagram-needed' : 'video-reference',
          title: curationForm.visualAidTitle.trim() || `Visual aid for ${selectedPattern.name}`,
          description: selectedVisualAidBrief,
          href: curationForm.visualAidUrl.trim() || null,
          image: null,
          sourceTitle: null,
          page: null,
          alt: null,
        }
      : null;

    try {
      setCurationStatus('Saving community note...');
      const res = await fetch('/api/patternpals/curation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patternId: selectedPattern.id,
          authorId: activeProfile?.id ?? null,
          authorName: activeProfile?.name ?? 'PatternPals contributor',
          signal: curationForm.signal,
          note: curationForm.note,
          visualAid,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save community note.');
      }

      const data = await res.json();
      setCurationEntries((prev) => [data.item, ...prev]);
      setAllCurationEntries((prev) => [data.item, ...prev.filter((entry) => entry.id !== data.item.id)]);
      setCurationForm({ signal: 'tip', note: '', visualAidTitle: '', visualAidUrl: '' });
      setCurationStatus('Community note saved for review.');
    } catch (err: any) {
      setCurationStatus(err?.message || 'Could not save community note.');
    }
  };

  const handleLoadMorePatterns = useCallback(() => {
    setPatternLimit((prev) => prev + PATTERN_PAGE_SIZE);
  }, []);
  const addFocusPattern = useCallback(() => {
    const raw = focusInput.trim();
    if (!raw) return;
    const match =
      PATTERN_LIBRARY.find((pattern) => pattern.id === raw) ??
      PATTERN_LIBRARY.find((pattern) => pattern.name.toLowerCase() === raw.toLowerCase());
    if (!match) {
      setError('Pattern not found in the library.');
      return;
    }
    setSessionForm((prev) => {
      if (prev.focusPatterns.includes(match.id)) return prev;
      return { ...prev, focusPatterns: [...prev.focusPatterns, match.id] };
    });
    setFocusInput('');
  }, [focusInput]);

  const removeFocusPattern = useCallback((patternId: string) => {
    setSessionForm((prev) => ({
      ...prev,
      focusPatterns: prev.focusPatterns.filter((id) => id !== patternId),
      compositionPlan: prev.compositionPlan.filter((plan) => plan.patternId !== patternId),
    }));
  }, []);

  const addPatternToSession = useCallback((recommendation: GroupPatternRecommendation) => {
    const compositionPlan = buildCompositionPlanFromRecommendation(recommendation);
    setSessionForm((prev) => {
      const focusPatterns = Array.from(new Set([...prev.focusPatterns, recommendation.pattern.id])).slice(0, MAX_SESSION_FOCUS_PATTERNS);
      const withoutExisting = prev.compositionPlan.filter((plan) => plan.patternId !== recommendation.pattern.id);
      return {
        ...prev,
        focusPatterns,
        compositionPlan: compositionPlan ? [...withoutExisting, compositionPlan] : withoutExisting,
        practiceMode: 'passing',
      };
    });
  }, []);

  const updateGroupJuggler = useCallback((id: string, updates: Partial<GroupJugglerInput>) => {
    setGroupJugglers((prev) => prev.map((juggler) => (juggler.id === id ? { ...juggler, ...updates } : juggler)));
  }, []);

  const addGroupJuggler = useCallback(() => {
    setGroupJugglers((prev) => {
      if (prev.length >= MAX_GROUP_JUGGLERS) {
        setStatusMessage(`Reached planner limit of ${MAX_GROUP_JUGGLERS} jugglers.`);
        return prev;
      }
      return [
        ...prev,
        {
          id: `group-juggler-${Date.now()}`,
          name: `Juggler ${prev.length + 1}`,
          comfortableObjects: 3,
          comfortableCount: 4,
          movementComfort: 'stationary',
        },
      ];
    });
  }, []);

  const removeGroupJuggler = useCallback((id: string) => {
    setGroupJugglers((prev) => (prev.length <= 2 ? prev : prev.filter((juggler) => juggler.id !== id)));
  }, []);

  const seedGroupFromSession = useCallback(() => {
    const roster = uniqueStrings([
      ...(activeProfile ? [activeProfile.name] : []),
      ...selectedParticipantProfiles.map((participant) => participant.name),
      ...manualParticipantNames,
    ]);
    if (roster.length < 2) return;
    setGroupJugglers(
      roster.map((name, index) => ({
        id: `group-juggler-${index + 1}`,
        name,
        comfortableObjects: 3,
        comfortableCount: 4,
        movementComfort: 'stationary' as MovementComfort,
      })),
    );
  }, [activeProfile, manualParticipantNames, selectedParticipantProfiles]);

  const addWorkshopSectionToSession = useCallback((patternIds: string[]) => {
    setSessionForm((prev) => ({
      ...prev,
      focusPatterns: Array.from(new Set([...prev.focusPatterns, ...patternIds])).slice(0, MAX_SESSION_FOCUS_PATTERNS),
      outcome: prev.outcome || 'Atlas-guided practice: teach one pattern deeply, review retention, and capture community memory.',
    }));
  }, []);

  const toggleSessionParticipant = useCallback((jugglerId: string) => {
    setSessionForm((prev) => {
      const participantIds = prev.participantIds.includes(jugglerId)
        ? prev.participantIds.filter((id) => id !== jugglerId)
        : [...prev.participantIds, jugglerId];
      return {
        ...prev,
        participantIds,
        partnerId: participantIds[0] ?? '',
        partnerName: jugglers.find((juggler) => juggler.id === participantIds[0])?.name ?? '',
      };
    });
  }, [jugglers]);

  const removeCompositionPlan = useCallback((patternId: string) => {
    setSessionForm((prev) => ({
      ...prev,
      compositionPlan: prev.compositionPlan.filter((plan) => plan.patternId !== patternId),
    }));
  }, []);

  const updateCompositionLaneLabel = useCallback((patternId: string, laneId: string, label: string) => {
    setSessionForm((prev) => ({
      ...prev,
      compositionPlan: prev.compositionPlan.map((plan) =>
        plan.patternId !== patternId
          ? plan
          : {
              ...plan,
              lanes: plan.lanes.map((lane) => (lane.laneId === laneId ? { ...lane, label } : lane)),
            },
      ),
    }));
  }, []);

  const updateCompositionNotes = useCallback((patternId: string, notes: string) => {
    setSessionForm((prev) => ({
      ...prev,
      compositionPlan: prev.compositionPlan.map((plan) =>
        plan.patternId !== patternId
          ? plan
          : {
              ...plan,
              notes: notes,
            },
      ),
    }));
  }, []);

  const rebuildCompositionPlanFromSessionRoster = useCallback((patternId: string) => {
    setSessionForm((prev) => {
      const plan = prev.compositionPlan.find((item) => item.patternId === patternId);
      if (!plan) return prev;

      const participantProfiles = prev.participantIds
        .map((id) => jugglers.find((juggler) => juggler.id === id))
        .filter((juggler): juggler is JugglerProfile => Boolean(juggler));
      const manualNames = uniqueStrings(prev.participantNames.split(',').map((name) => name.trim()));
      const attendees = normalizeCompositionAttendees([
        ...(activeProfile ? [{ id: activeProfile.id, name: activeProfile.name }] : []),
        ...participantProfiles.map((participant) => ({ id: participant.id, name: participant.name })),
        ...manualNames.map((name, index) => ({ id: `manual-${index + 1}`, name })),
      ]);

      if (attendees.length < 2) return prev;

      const baseJugglers = Math.max(2, plan.baseJugglers);
      const laneCount = Math.max(1, Math.ceil(attendees.length / baseJugglers));
      const lanes = Array.from({ length: laneCount }, (_, index) => {
        const slice = attendees.slice(index * baseJugglers, (index + 1) * baseJugglers);
        return {
          laneId: plan.lanes[index]?.laneId ?? `lane-${index + 1}`,
          label: plan.lanes[index]?.label ?? `Lane ${index + 1}`,
          participantIds: slice.map((attendee) => attendee.id).filter((id): id is string => Boolean(id && !id.startsWith('manual-'))),
          participantNames: slice.map((attendee) => attendee.name),
        };
      }).filter((lane) => lane.participantNames.length > 0);

      const rebuiltPlan: SessionCompositionPlan = {
        ...plan,
        lanes,
        totalJugglers: attendees.length,
        notes: `Roster rebuilt into ${lanes.length} lane${lanes.length === 1 ? '' : 's'} from current participants.`,
      };

      return {
        ...prev,
        compositionPlan: prev.compositionPlan.map((item) => (item.patternId === patternId ? rebuiltPlan : item)),
      };
    });
  }, [activeProfile, jugglers]);

  const renderPropPicker = (
    value: PropType[],
    onChange: (next: PropType[]) => void,
  ) => {
    return (
      <div className="patternpals-props">
        {PROP_OPTIONS.map((prop) => (
          <button
            key={prop}
            type="button"
            className={`patternpals-prop-chip${value.includes(prop) ? ' active' : ''}`}
            onClick={() => {
              if (value.includes(prop)) {
                onChange(value.filter((item) => item !== prop));
              } else {
                onChange([...value, prop]);
              }
            }}
          >
            {prop}
          </button>
        ))}
      </div>
    );
  };

  if (loading) {
    return <p className="muted">Loading PatternPals...</p>;
  }

  return (
    <section className="grid patternpals-grid">
      <article className="card patternpals-hero">
        <div className="patternpals-hero-content">
          <div>
            <h1>PatternPals</h1>
            <p className="muted">
              {PATTERNPALS_TAGLINE}
            </p>
            <div className="patternpals-hero-actions">
              <a className="button primary" href="#patternpals-atlas">
                Open the pattern atlas
              </a>
              <a className="button" href="#patternpals-workshop">
                Plan a workshop
              </a>
            </div>
          </div>
          <div className="patternpals-stat-grid">
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Atlas entries</span>
              <strong>{atlasHealth.totalPatterns}</strong>
            </div>
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Source-backed</span>
              <strong>{atlasHealth.sourceBackedPatterns}</strong>
            </div>
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Visual excerpts</span>
              <strong>{atlasHealth.excerptBackedPatterns}</strong>
            </div>
            <div className="patternpals-stat">
              <span className="patternpals-stat-label">Community notes</span>
              <strong>{communityMemory.total}</strong>
            </div>
          </div>
        </div>
        {statusMessage ? <p className="patternpals-note success">{statusMessage}</p> : null}
        {error ? <p className="patternpals-note error">{error}</p> : null}
      </article>

      <article className="card patternpals-atlas-manifesto" id="patternpals-atlas">
        <div className="patternpals-section-header">
          <div>
            <p className="patternpals-detail-label">Product center</p>
            <h2>The Pattern Atlas</h2>
            <p className="muted">
              PatternPals now starts from the practical question at practice: which ten patterns fit this exact group, and which position should each juggler try?
            </p>
          </div>
          <a className="patternpals-mini-button" href="#patternpals-library">
            Browse entries
          </a>
        </div>
        <div className="patternpals-pillar-grid">
          <div className="patternpals-pillar-card">
            <strong>Find</strong>
            <p className="muted small">Search names, aliases, roles, rhythms, source books, juggler counts, and object counts instead of guessing the catalog’s exact wording.</p>
          </div>
          <div className="patternpals-pillar-card">
            <strong>Understand</strong>
            <p className="muted small">Every atlas entry explains what the pattern is, where it comes from, what skills it uses, and what visual aid would make it clearer.</p>
          </div>
          <div className="patternpals-pillar-card">
            <strong>Teach</strong>
            <p className="muted small">Teaching progressions, prerequisites, readiness checks, and workshop plans help groups run practices rather than just pick patterns.</p>
          </div>
          <div className="patternpals-pillar-card">
            <strong>Preserve</strong>
            <p className="muted small">Local aliases, corrections, diagrams, warnings, and field-tested cues become pending community memory instead of disappearing after practice.</p>
          </div>
        </div>
        <div className="patternpals-atlas-health">
          <span><strong>{atlasHealth.sourceCount}</strong> mapped source books</span>
          <span><strong>{atlasHealth.aliasedPatterns}</strong> entries with aliases</span>
          <span><strong>{atlasHealth.teachablePatterns}</strong> entries with teaching structure</span>
          <span><strong>{communityMemory.pending}</strong> pending community notes</span>
        </div>
      </article>

      <article className="card half" id="patternpals-profile">
        <h2>Your profile</h2>
        {activeProfile && !editingProfile ? (
          <div className="patternpals-profile">
            <div>
              <p className="patternpals-profile-name">{activeProfile.name}</p>
              <p className="muted">
                {activeProfile.experience} - {activeProfile.props.join(', ') || 'No props yet'}
              </p>
            </div>
            <div className="patternpals-profile-actions">
              <button
                type="button"
                className="button"
                onClick={() => setEditingProfile(true)}
              >
                Edit profile
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={activeProfile ? handleUpdateProfile : handleCreateProfile} className="patternpals-form">
            <label>
              Name
              <input
                value={profileForm.name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Your name"
                required
              />
            </label>
            <label>
              Experience
              <select
                value={profileForm.experience}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    experience: event.target.value as ExperienceLevel,
                  }))
                }
              >
                {EXPERIENCE_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="muted small">Preferred props</p>
              {renderPropPicker(profileForm.props, (next) =>
                setProfileForm((prev) => ({ ...prev, props: next })),
              )}
            </div>
            <div className="patternpals-form-actions">
              <button type="submit" className="button primary">
                {activeProfile ? 'Save changes' : 'Create profile'}
              </button>
              {activeProfile ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => setEditingProfile(false)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        )}
      </article>

      <article className="card half">
        <h2>Roster</h2>
        <p className="muted">Add jugglers you pass with. Saved roster names can seed the MVP group-fit planner.</p>
        <div className="patternpals-inline-actions">
          <label>
            Select existing partner
            <select
              value={selectedRosterPartnerId}
              onChange={(event) => setSelectedRosterPartnerId(event.target.value)}
            >
              <option value="">Choose from roster</option>
              {rosterPartners.map((juggler) => (
                <option key={juggler.id} value={juggler.id}>
                  {juggler.name} ({juggler.experience})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="patternpals-mini-button"
            onClick={() => handleSetPartner(selectedRosterPartnerId || null)}
            disabled={!selectedRosterPartnerId}
          >
            Use selected partner
          </button>
        </div>
        <div className="patternpals-roster">
          {rosterPartners
            .map((juggler) => (
              <div key={juggler.id} className="patternpals-roster-row">
                <div>
                  <strong>{juggler.name}</strong>
                  <div className="muted small">{juggler.experience}</div>
                </div>
                <div className="patternpals-roster-actions">
                  <button
                    type="button"
                    className={`patternpals-mini-button${partnerId === juggler.id ? ' active' : ''}`}
                    onClick={() => handleSetPartner(juggler.id)}
                  >
                    {partnerId === juggler.id ? 'Active partner' : 'Use partner'}
                  </button>
                  <button
                    type="button"
                    className="patternpals-mini-button ghost"
                    onClick={() => handleSetActive(juggler.id)}
                  >
                    Switch to profile
                  </button>
                </div>
              </div>
            ))}
          {rosterPartners.length === 0 ? (
            <p className="muted small">No partners yet. Add a few below.</p>
          ) : null}
        </div>
        <form onSubmit={handleCreatePartner} className="patternpals-form">
          <label>
            Partner name
            <input
              value={partnerForm.name}
              onChange={(event) => setPartnerForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="New partner"
              required
            />
          </label>
          <label>
            Experience
            <select
              value={partnerForm.experience}
              onChange={(event) =>
                setPartnerForm((prev) => ({
                  ...prev,
                  experience: event.target.value as ExperienceLevel,
                }))
              }
            >
              {EXPERIENCE_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="muted small">Props they use</p>
            {renderPropPicker(partnerForm.props, (next) =>
              setPartnerForm((prev) => ({ ...prev, props: next })),
            )}
          </div>
          <button type="submit" className="button">
            Add partner
          </button>
        </form>
      </article>
      <article className="card patternpals-recommendations">
        <div className="patternpals-section-header">
          <div>
            <p className="patternpals-detail-label">Minimum viable product</p>
            <h2>Top 10 group-fit patterns</h2>
            <p className="muted">
              Enter the jugglers you have, then PatternPals scores every position by average club load, passing count, and movement or turning pressure.
              The list below ranks the ten patterns most likely to give each person a useful challenge.
            </p>
            <p className="muted small">
              Atlas currently includes patterns for up to {MAX_CATALOG_JUGGLERS} jugglers. Planner supports up to {MAX_GROUP_JUGGLERS} so larger groups can be staged while composition planning lands next.
            </p>
          </div>
          <div className="patternpals-mode">
            <button type="button" className="patternpals-mini-button" onClick={addGroupJuggler}>
              Add juggler
            </button>
            <button type="button" className="patternpals-mini-button ghost" onClick={seedGroupFromSession}>
              Use session roster
            </button>
            <button
              type="button"
              className={`patternpals-mini-button${tryModeEnabled ? ' active' : ' ghost'}`}
              onClick={() => setTryModeEnabled((prev) => !prev)}
            >
              {tryModeEnabled ? 'Exit try mode' : 'Try mode'}
            </button>
          </div>
        </div>
        {tryModeEnabled ? (
          <div className="patternpals-inline-actions">
            <label className="patternpals-try-note">
              Try note
              <input
                value={tryFeedbackNote}
                onChange={(event) => setTryFeedbackNote(event.target.value)}
                placeholder="Optional note for the next try feedback"
              />
            </label>
            <span className="muted small">Use the quick buttons on each recommendation to save feedback.</span>
          </div>
        ) : null}
        <div className="patternpals-group-planner">
          {groupJugglers.map((juggler, index) => (
            <div key={juggler.id} className="patternpals-group-juggler">
              <label>
                Position candidate
                <input
                  value={juggler.name}
                  onChange={(event) => updateGroupJuggler(juggler.id, { name: event.target.value })}
                  placeholder={`Juggler ${index + 1}`}
                />
              </label>
              <label>
                Avg clubs comfort
                <input
                  type="number"
                  min={1.5}
                  max={5.5}
                  step={0.5}
                  value={juggler.comfortableObjects}
                  onChange={(event) => updateGroupJuggler(juggler.id, { comfortableObjects: Number(event.target.value || 3) })}
                />
              </label>
              <label>
                Fastest useful count
                <select
                  value={juggler.comfortableCount}
                  onChange={(event) => updateGroupJuggler(juggler.id, { comfortableCount: Number(event.target.value) })}
                >
                  {COMFORT_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count}-count
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Movement comfort
                <select
                  value={juggler.movementComfort}
                  onChange={(event) => updateGroupJuggler(juggler.id, { movementComfort: event.target.value as MovementComfort })}
                >
                  <option value="stationary">Stationary</option>
                  <option value="moderate">Some movement</option>
                  <option value="high">Turns / moving patterns</option>
                </select>
              </label>
              <button
                type="button"
                className="patternpals-mini-button ghost"
                onClick={() => removeGroupJuggler(juggler.id)}
                disabled={groupJugglers.length <= 2}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="patternpals-recommendation-grid">
          {recommendations.length === 0 ? (
            <p className="muted">Add at least two jugglers to see top pattern matches for that group size.</p>
          ) : (
            recommendations.map((item, index) => (
              <div key={item.pattern.id} className="patternpals-recommendation patternpals-mvp-recommendation">
                <div className="patternpals-recommendation-title">
                  <span className="patternpals-rank">#{index + 1}</span>
                  <div>
                    <h3>{item.pattern.name}</h3>
                    <p className="muted small">{item.pattern.description}</p>
                  </div>
                  <span className="patternpals-fit-score">{item.score}% fit</span>
                </div>
                <div className="patternpals-reasons">
                  {item.reasons.map((reason) => (
                    <span key={reason} className={`patternpals-reason ${item.dataQuality}`}>
                      {reason}
                    </span>
                  ))}
                </div>
                <div className="patternpals-position-fit-list">
                  {item.assignments.map((assignment) => (
                    <div key={`${item.pattern.id}-${assignment.role}`} className={`patternpals-position-fit ${assignment.fitLabel}`}>
                      <div>
                        <strong>{assignment.juggler.name}</strong>
                        <span>{assignment.role}</span>
                      </div>
                      <p>
                        {assignment.averageObjects} avg clubs · {assignment.count ? `${assignment.count}-count` : 'count inferred'} · {assignment.movement === 'stationary' ? 'stationary' : assignment.movement}
                      </p>
                      <span>{assignment.fitScore}% · {assignment.fitLabel.replace('-', ' ')}</span>
                    </div>
                  ))}
                </div>
                <div className="patternpals-recommendation-actions">
                  <button
                    type="button"
                    className="patternpals-mini-button"
                    onClick={() => addPatternToSession(item)}
                  >
                    Add to session
                  </button>
                  <button
                    type="button"
                    className="patternpals-mini-button ghost"
                    onClick={() => handleSelectPattern(item.pattern)}
                  >
                    View atlas entry
                  </button>
                  <button
                    type="button"
                    className="patternpals-mini-button ghost"
                    onClick={() => updatePatternStatus(item.pattern.id, 'working')}
                  >
                    Mark working
                  </button>
                  {tryModeEnabled ? (
                    <>
                      <button
                        type="button"
                        className="patternpals-mini-button ghost"
                        onClick={() => submitPracticeAttempt(item.pattern.id, 'too-easy')}
                      >
                        Too easy
                      </button>
                      <button
                        type="button"
                        className="patternpals-mini-button ghost"
                        onClick={() => submitPracticeAttempt(item.pattern.id, 'good-fit')}
                      >
                        Good fit
                      </button>
                      <button
                        type="button"
                        className="patternpals-mini-button ghost"
                        onClick={() => submitPracticeAttempt(item.pattern.id, 'too-hard')}
                      >
                        Too hard
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="card patternpals-workshop" id="patternpals-workshop">
        <div className="patternpals-section-header">
          <div>
            <p className="patternpals-detail-label">Teaching companion</p>
            <h2>{workshopPlan.title}</h2>
            <p className="muted">{workshopPlan.framing}</p>
          </div>
          <span className="patternpals-mini-button ghost">{practiceMinutes} logged minutes</span>
        </div>
        <div className="patternpals-workshop-grid">
          {workshopPlan.sections.map((section) => (
            <div key={section.title} className="patternpals-workshop-card">
              <div>
                <strong>{section.title}</strong>
                <p className="muted small">{section.intent}</p>
              </div>
              <div className="patternpals-chip-row">
                {section.patterns.length === 0 ? (
                  <span className="muted small">Add progress or search the atlas to seed this section.</span>
                ) : (
                  section.patterns.slice(0, 4).map((pattern) => (
                    <button
                      key={pattern.id}
                      type="button"
                      className="patternpals-chip patternpals-chip-button"
                      onClick={() => handleSelectPattern(pattern)}
                    >
                      {pattern.name}
                    </button>
                  ))
                )}
              </div>
              {section.patterns.length > 0 ? (
                <button
                  type="button"
                  className="patternpals-mini-button ghost"
                  onClick={() => addWorkshopSectionToSession(section.patterns.map((pattern) => pattern.id))}
                >
                  Add section to session
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <div className="patternpals-facilitation-prompts">
          <strong>Facilitation prompts</strong>
          <ul>
            {workshopPlan.facilitationPrompts.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </div>
      </article>

      <article className="card half" id="patternpals-session-planner">
        <h2>Schedule a practice or workshop</h2>
        <form onSubmit={handleSessionCreate} className="patternpals-form">
          <label>
            When
            <input
              type="datetime-local"
              value={sessionForm.scheduledFor}
              onChange={(event) =>
                setSessionForm((prev) => ({ ...prev, scheduledFor: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Duration (minutes)
            <input
              type="number"
              min={15}
              max={240}
              value={sessionForm.durationMinutes}
              onChange={(event) =>
                setSessionForm((prev) => ({
                  ...prev,
                  durationMinutes: Number(event.target.value || 0),
                }))
              }
            />
          </label>
          <label>
            Location
            <input
              value={sessionForm.location}
              onChange={(event) => setSessionForm((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="Field, gym, or park"
            />
          </label>
          <div>
            <p className="muted small">Practice type</p>
            <div className="patternpals-mode">
              <button
                type="button"
                className={`patternpals-mini-button${sessionForm.practiceMode === 'solo' ? ' active' : ''}`}
                onClick={() =>
                  setSessionForm((prev) => ({
                    ...prev,
                    practiceMode: 'solo',
                    participantIds: [],
                    partnerId: '',
                    partnerName: '',
                  }))
                }
              >
                Solo practice
              </button>
              <button
                type="button"
                className={`patternpals-mini-button${sessionForm.practiceMode === 'passing' ? ' active' : ''}`}
                onClick={() => setSessionForm((prev) => ({ ...prev, practiceMode: 'passing' }))}
              >
                Group session
              </button>
            </div>
          </div>
          {sessionForm.practiceMode === 'passing' ? (
            <div>
              <p className="muted small">Who is at practice?</p>
              <div className="patternpals-participant-grid">
                {rosterPartners
                  .map((juggler) => (
                    <button
                      key={juggler.id}
                      type="button"
                      className={`patternpals-participant-chip${sessionForm.participantIds.includes(juggler.id) ? ' active' : ''}`}
                      onClick={() => toggleSessionParticipant(juggler.id)}
                    >
                      <strong>{juggler.name}</strong>
                      <span>{juggler.experience}</span>
                    </button>
                  ))}
              </div>
              <label>
                Additional attendees
                <input
                  value={sessionForm.participantNames}
                  onChange={(event) =>
                    setSessionForm((prev) => ({ ...prev, participantNames: event.target.value }))
                  }
                  placeholder="Comma-separated names for guests not on the roster"
                />
              </label>
            </div>
          ) : null}
          <div>
            <label>
              Focus pattern
              <input
                list="patternpals-patterns"
                value={focusInput}
                onChange={(event) => setFocusInput(event.target.value)}
                placeholder="Start typing a pattern"
              />
            </label>
            <div className="patternpals-inline-actions">
              <button type="button" className="patternpals-mini-button" onClick={addFocusPattern}>
                Add pattern
              </button>
            </div>
            <datalist id="patternpals-patterns">
              {focusOptions.map((pattern) => (
                <option key={pattern.id} value={pattern.name} />
              ))}
            </datalist>
            {sessionForm.focusPatterns.length > 0 ? (
              <div className="patternpals-chip-row">
                {sessionForm.focusPatterns.map((patternId) => (
                  <span key={patternId} className="patternpals-chip">
                    {formatPattern(patternId)}
                    <button
                      type="button"
                      onClick={() => removeFocusPattern(patternId)}
                      aria-label={`Remove ${formatPattern(patternId)}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {sessionForm.compositionPlan.length > 0 ? (
              <div className="patternpals-readiness-panel" aria-label="Session composition plans">
                <div>
                  <h3>Composition plans</h3>
                  <p className="muted small">Patterns marked with lanes can scale beyond fixed-size formations.</p>
                </div>
                {sessionForm.compositionPlan.map((plan) => (
                  <div key={plan.patternId} className="patternpals-readiness-card stretch">
                    <div>
                      <strong>{formatPattern(plan.patternId)}</strong>
                      <span>{plan.strategy}</span>
                    </div>
                    <ul>
                      <li>{plan.totalJugglers} jugglers across {plan.lanes.length} lanes ({plan.baseJugglers} each).</li>
                      {plan.lanes.map((lane) => (
                        <li key={lane.laneId}>
                          <div className="patternpals-inline-actions">
                            <input
                              value={lane.label}
                              onChange={(event) => updateCompositionLaneLabel(plan.patternId, lane.laneId, event.target.value)}
                              placeholder="Lane label"
                            />
                            <span className="muted small">{lane.participantNames.join(', ') || 'No names yet'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <label>
                      Composition notes
                      <input
                        value={plan.notes ?? ''}
                        onChange={(event) => updateCompositionNotes(plan.patternId, event.target.value)}
                        placeholder="Optional notes for this composed plan"
                      />
                    </label>
                    <div className="patternpals-inline-actions">
                      <button
                        type="button"
                        className="patternpals-mini-button ghost"
                        onClick={() => rebuildCompositionPlanFromSessionRoster(plan.patternId)}
                      >
                        Rebuild lanes from roster
                      </button>
                      <button
                        type="button"
                        className="patternpals-mini-button ghost"
                        onClick={() => removeCompositionPlan(plan.patternId)}
                      >
                        Remove composition
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {practiceReadiness.length > 0 ? (
            <div className="patternpals-readiness-panel" aria-label="Practice readiness">
              <div>
                <h3>Practice readiness</h3>
                <p className="muted small">Check group size, prerequisites, and progress before you schedule.</p>
              </div>
              {practiceReadiness.map((item) => (
                <div key={item.pattern.id} className={`patternpals-readiness-card ${item.readiness}`}>
                  <div>
                    <strong>{item.pattern.name}</strong>
                    <span>{READINESS_LABELS[item.readiness]}</span>
                  </div>
                  <ul>
                    {item.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
          <label>
            Session notes
            <input
              value={sessionForm.outcome}
              onChange={(event) => setSessionForm((prev) => ({ ...prev, outcome: event.target.value }))}
              placeholder="Focus, goals, or outcomes"
            />
          </label>
          <button type="submit" className="button primary">
            Schedule session
          </button>
        </form>
      </article>
      <article className="card half">
        <h2>Upcoming sessions</h2>
        {upcomingSessions.length === 0 ? (
          <p className="muted">No sessions scheduled yet.</p>
        ) : (
          <div className="patternpals-session-list">
            {upcomingSessions.map((session) => (
              <div key={session.id} className="patternpals-session-card">
                <div>
                  <strong>{formatDateTime(session.scheduledFor)}</strong>
                  <p className="muted small">
                    {(session.participantNames?.length ? session.participantNames.join(', ') : session.partnerName) || 'Open session'} ·{' '}
                    {session.location || 'Location TBD'}
                  </p>
                  <p className="muted small">
                    Focus: {session.focusPatterns.map(formatPattern).join(', ') || 'Open focus'}
                  </p>
                  {session.readinessSnapshot?.length ? (
                    <p className="muted small">
                      Readiness: {session.readinessSnapshot.map((item) => `${formatPattern(item.patternId)} is ${item.readiness}`).join('; ')}
                    </p>
                  ) : null}
                </div>
                <div className="patternpals-session-actions">
                  <button
                    type="button"
                    className="patternpals-mini-button"
                    onClick={() => handleSessionStatus(session.id, 'completed')}
                  >
                    Mark completed
                  </button>
                  <button
                    type="button"
                    className="patternpals-mini-button ghost"
                    onClick={() => handleSessionStatus(session.id, 'canceled')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
      <article className="card half patternpals-history">
        <h2>Learning history</h2>
        <p className="muted">Completed sessions become a lightweight practice log for remembering what worked.</p>
        {completedSessions.length === 0 ? (
          <p className="muted small">No completed sessions yet. Mark an upcoming session completed to start your history.</p>
        ) : (
          <div className="patternpals-session-list">
            {completedSessions.slice(0, 6).map((session) => (
              <div key={session.id} className="patternpals-session-card">
                <div>
                  <strong>{formatDateTime(session.completedAt ?? session.scheduledFor)}</strong>
                  <p className="muted small">
                    {(session.participantNames?.length ? session.participantNames.join(', ') : session.partnerName) || 'Solo practice'}
                    {session.durationMinutes ? ` · ${session.durationMinutes} minutes` : ''}
                  </p>
                  <p className="muted small">
                    Patterns: {session.focusPatterns.map(formatPattern).join(', ') || 'Open focus'}
                  </p>
                  {session.outcome ? <p>{session.outcome}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="card half patternpals-community-memory">
        <div className="patternpals-section-header">
          <div>
            <p className="patternpals-detail-label">Community archive</p>
            <h2>Community memory</h2>
            <p className="muted">Pending notes, visual-aid requests, aliases, and source corrections turn local practice lore into reviewable atlas improvements.</p>
          </div>
        </div>
        <div className="patternpals-memory-stats">
          <span><strong>{communityMemory.total}</strong> notes</span>
          <span><strong>{communityMemory.pending}</strong> pending</span>
          <span><strong>{communityMemory.visualAidRequests}</strong> visual hooks</span>
        </div>
        <div className="patternpals-curation-list">
          {communityMemory.recent.length === 0 ? (
            <p className="muted small">Open any atlas entry and submit a teaching cue, alias, warning, source correction, or diagram request.</p>
          ) : (
            communityMemory.recent.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="patternpals-memory-row"
                onClick={() => {
                  const pattern = getPatternById(entry.patternId);
                  if (pattern) handleSelectPattern(pattern);
                }}
              >
                <strong>{formatPattern(entry.patternId)}</strong>
                <span>{CURATION_SIGNAL_OPTIONS.find((option) => option.value === entry.signal)?.label ?? entry.signal} · {entry.status}</span>
              </button>
            ))
          )}
        </div>
      </article>

      <article className="card patternpals-progress" id="patternpals-library">
        <div className="patternpals-section-header">
          <div>
            <p className="patternpals-detail-label">Living knowledge base</p>
            <h2>Pattern atlas browser</h2>
            <p className="muted">
              Browse canonical entries, source citations, aliases, teaching notes, visual aids, and community memory hooks. Mark progress only when it helps your practice plan.
            </p>
          </div>
          <div className="patternpals-search-panel">
            <div className="patternpals-search">
              <input
                value={patternSearch}
                onChange={(event) => setPatternSearch(event.target.value)}
                placeholder="Search names, aliases, roles, rhythms, or source books"
              />
            </div>
            <div className="patternpals-filter-grid" aria-label="Pattern filters">
              <label>
                Verified difficulty
                <select
                  value={patternFilters.difficulty}
                  onChange={(event) =>
                    setPatternFilters((prev) => ({
                      ...prev,
                      difficulty: event.target.value as PatternFilterState['difficulty'],
                    }))
                  }
                >
                  <option value="all">Any / unclassified</option>
                  {EXPERIENCE_OPTIONS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Pattern type (includes inferred)
                <select
                  value={patternFilters.patternType}
                  onChange={(event) =>
                    setPatternFilters((prev) => ({
                      ...prev,
                      patternType: event.target.value as PatternFilterState['patternType'],
                    }))
                  }
                >
                  <option value="all">Any</option>
                  {PATTERN_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {PATTERN_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Jugglers
                <select
                  value={patternFilters.jugglers}
                  onChange={(event) =>
                    setPatternFilters((prev) => ({ ...prev, jugglers: event.target.value }))
                  }
                >
                  <option value="all">Any</option>
                  {CATALOG_JUGGLER_COUNTS.map((count) => (
                    <option key={count} value={String(count)}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Objects
                <select
                  value={patternFilters.objects}
                  onChange={(event) =>
                    setPatternFilters((prev) => ({ ...prev, objects: event.target.value }))
                  }
                >
                  <option value="all">Any</option>
                  {[5, 6, 7, 8, 9, 10, 11].map((count) => (
                    <option key={count} value={String(count)}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted small patternpals-filter-note">
              Difficulty filters only use source-backed classifications. Legacy AI difficulty labels are hidden as unclassified until reviewed.
              Pattern type filters may include inferred or maintainer-curated families and are marked in each entry.
            </p>
            {patternFiltersActive ? (
              <button type="button" className="patternpals-mini-button ghost" onClick={resetPatternBrowser}>
                Reset search and filters
              </button>
            ) : null}
          </div>
        </div>
        <PatternList
          patterns={visiblePatterns}
          total={filteredPatterns.length}
          searchActive={Boolean(deferredPatternSearch.trim())}
          progressMap={progressMap}
          hasMore={hasMorePatterns}
          onSelect={handleSelectPattern}
          onUpdateStatus={updatePatternStatus}
          onLoadMore={handleLoadMorePatterns}
        />
      </article>
      {selectedPattern ? (
        <div
          className="patternpals-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="patternpals-detail-title"
          onClick={(event) => {
              if (event.target === event.currentTarget) {
                closePatternDetail();
              }
          }}
        >
          <div className="patternpals-detail-card">
            <div className="patternpals-detail-header">
              <div>
                <p className="patternpals-detail-label">Canonical atlas entry</p>
                <h3 id="patternpals-detail-title">{selectedAtlasEntry?.canonicalName ?? selectedPattern.name}</h3>
              </div>
              <div className="patternpals-detail-actions">
                <a className="patternpals-mini-button" href={selectedPatternPath}>
                  Share link
                </a>
                <button
                  type="button"
                  className="patternpals-mini-button ghost"
                  onClick={copySelectedPatternLink}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="patternpals-mini-button ghost"
                  onClick={closePatternDetail}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="patternpals-detail-meta">
              <span className={`patternpals-metadata-pill ${selectedPatternMetadata?.difficultyClassification.provenance.confidence ?? 'unset'}`}>
                {selectedPatternMetadata?.difficultyClassification.displayName ?? 'Difficulty unclassified'}
              </span>
              <span>{selectedPatternMetadata?.jugglerCount ?? selectedPattern.requiredJugglers} jugglers</span>
              <span>{selectedPattern.props.join(', ')}</span>
              {selectedPatternMetadata?.objectCount ? (
                <span>{selectedPatternMetadata.objectCount} objects</span>
              ) : null}
              {selectedPatternMetadata ? (
                <span className={`patternpals-metadata-pill ${selectedPatternMetadata.patternTypeClassification.provenance.confidence}`}>
                  {selectedPatternMetadata.patternTypeClassification.displayName} · {selectedPatternMetadata.patternTypeClassification.provenance.confidence}
                </span>
              ) : null}
              {selectedPatternMetadata?.rhythm ? <span>{selectedPatternMetadata.rhythm}</span> : null}
            </div>
            {shareStatus ? <p className="patternpals-share-status muted small">{shareStatus}</p> : null}
            <p className="muted">{selectedAtlasEntry?.summary ?? selectedPattern.description}</p>
            {selectedPatternMetadata ? (
              <div className="patternpals-detail-section patternpals-metadata-integrity">
                <h4>Metadata integrity</h4>
                <p className="muted small">
                  Difficulty: {selectedPatternMetadata.difficultyClassification.provenance.note}
                </p>
                <p className="muted small">
                  Pattern type: {selectedPatternMetadata.patternTypeClassification.provenance.note}
                </p>
              </div>
            ) : null}
            {selectedPatternMetadata?.aliases.length ? (
              <div className="patternpals-detail-section">
                <h4>Aliases and search terms</h4>
                <div className="patternpals-chip-row">
                  {selectedPatternMetadata.aliases.map((alias) => (
                    <span key={alias} className="patternpals-chip">
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedAtlasEntry ? (
              <div className="patternpals-detail-section patternpals-atlas-entry-summary">
                <h4>Atlas teaching summary</h4>
                <div className="patternpals-atlas-entry-grid">
                  <div>
                    <strong>Key skills</strong>
                    <div className="patternpals-chip-row">
                      {selectedAtlasEntry.keySkills.map((skill) => (
                        <span key={skill} className="patternpals-chip">{skill}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <strong>Knowledge gaps</strong>
                    <ul className="patternpals-detail-list muted small">
                      {selectedAtlasEntry.knowledgeGaps.length === 0 ? (
                        <li>This entry has citations, visual support, teaching structure, and community memory.</li>
                      ) : (
                        selectedAtlasEntry.knowledgeGaps.slice(0, 5).map((gap) => <li key={gap}>{gap}</li>)
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}
            {selectedPatternMetadata?.roles.length ? (
              <div className="patternpals-detail-section">
                <h4>Roles</h4>
                <p className="muted small">{selectedPatternMetadata.roles.join(', ')}</p>
              </div>
            ) : null}
            {selectedPattern.prerequisites.length > 0 ? (
              <div className="patternpals-detail-section">
                <h4>Prerequisites</h4>
                <p className="muted small">
                  {selectedPattern.prerequisites.map(formatPattern).join(', ')}
                </p>
              </div>
            ) : null}
            {selectedAtlasEntry ? (
              <div className="patternpals-detail-section">
                <h4>Teaching progression</h4>
                <div className="patternpals-progression-list">
                  {selectedAtlasEntry.teachingProgression.map((step, index) => (
                    <div key={`${step.label}-${index}`} className="patternpals-progression-step">
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.label}</strong>
                        <p className="muted small">{step.description}</p>
                        {step.patternIds.length > 0 ? (
                          <p className="muted small">Patterns: {step.patternIds.map(formatPattern).join(', ')}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedPatternMetadata?.commonMistakes.length ? (
              <div className="patternpals-detail-section">
                <h4>Common mistakes</h4>
                <ul className="patternpals-detail-list muted small">
                  {selectedPatternMetadata.commonMistakes.map((mistake) => (
                    <li key={mistake}>{mistake}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="patternpals-detail-section">
              <h4>Source excerpt</h4>
              <p className="muted small">
                See the relevant source-book notation directly here, with the original PDFs still available below.
              </p>
              <div className="patternpals-visual-aid-plan">
                <div>
                  <strong>Diagram brief</strong>
                  <p className="muted small">{selectedVisualAidBrief}</p>
                </div>
                <button type="button" className="patternpals-mini-button ghost" onClick={copyVisualAidBrief}>
                  Copy brief
                </button>
              </div>
              {selectedExcerpt ? (
                <div className="patternpals-excerpt-card">
                  <div className="patternpals-excerpt-header">
                    <div>
                      <strong>{selectedExcerpt.sourceTitle}</strong>
                      <span>Page {selectedExcerpt.page}</span>
                    </div>
                    <a
                      href={`${selectedExcerpt.bookFile}#page=${selectedExcerpt.page}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open PDF page
                    </a>
                  </div>
                  <a
                    className="patternpals-excerpt-image-link"
                    href={`${selectedExcerpt.bookFile}#page=${selectedExcerpt.page}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${selectedPattern.name} source page in PDF`}
                  >
                    {/* Static generated excerpts have variable natural heights, so a plain image preserves the PDF crop ratio. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedExcerpt.image} alt={selectedExcerpt.alt} loading="lazy" />
                  </a>
                </div>
              ) : (
                <p className="muted small">
                  No automatic source snapshot is available for this pattern yet. Use the mapped source PDFs below.
                </p>
              )}
            </div>
            <div className="patternpals-detail-section">
              <h4>Source citations</h4>
              <p className="muted small">
                Source-backed entries are the backbone of the atlas. Download the mapped PDFs for surrounding context, and use curation notes for corrections.
              </p>
              {selectedSources.sources.length > 0 ? (
                <div className="patternpals-book-list">
                  {selectedSources.sources.map((book) => (
                    <a
                      key={book.tag}
                      className="patternpals-book-link"
                      href={book.file}
                      target="_blank"
                      rel="noreferrer"
                      download
                    >
                      <span>{book.title}</span>
                      <span className="patternpals-book-action">Download PDF</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted small">No mapped source books for this pattern yet.</p>
              )}
              {selectedSources.missing.length > 0 ? (
                <p className="muted small">
                  Unmapped sources: {selectedSources.missing.join(', ')}
                </p>
              ) : null}
            </div>
            <div className="patternpals-detail-section">
              <h4>Community memory</h4>
              <p className="muted small">
                Capture the local names, teaching cues, source corrections, variants, warnings, and diagram requests that make this atlas better for the next club. New entries remain pending review before becoming canonical metadata.
              </p>
              <div className="patternpals-curation-list">
                {curationEntries.length === 0 ? (
                  <p className="muted small">No community notes for this pattern yet.</p>
                ) : (
                  curationEntries.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="patternpals-curation-card">
                      <div className="patternpals-curation-meta">
                        <strong>{CURATION_SIGNAL_OPTIONS.find((option) => option.value === entry.signal)?.label ?? entry.signal}</strong>
                        <span>{entry.status}</span>
                        <span>{formatDateTime(entry.createdAt)}</span>
                      </div>
                      <p>{entry.note}</p>
                      {entry.visualAid ? (
                        <p className="muted small">
                          Visual aid: {entry.visualAid.title}
                          {entry.visualAid.href ? (
                            <> · <a href={entry.visualAid.href} target="_blank" rel="noreferrer">Open reference</a></>
                          ) : null}
                        </p>
                      ) : null}
                      <p className="muted small">Contributed by {entry.authorName}</p>
                    </div>
                  ))
                )}
              </div>
              <form className="patternpals-form patternpals-curation-form" onSubmit={handleCurationSubmit}>
                <label>
                  Contribution type
                  <select
                    value={curationForm.signal}
                    onChange={(event) =>
                      setCurationForm((prev) => ({ ...prev, signal: event.target.value as CurationSignal }))
                    }
                  >
                    {CURATION_SIGNAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted small">
                  {CURATION_SIGNAL_OPTIONS.find((option) => option.value === curationForm.signal)?.description}
                </p>
                <label>
                  Note
                  <textarea
                    value={curationForm.note}
                    onChange={(event) => setCurationForm((prev) => ({ ...prev, note: event.target.value }))}
                    placeholder="What should other jugglers know before practicing this pattern?"
                    rows={4}
                  />
                </label>
                <div className="patternpals-curation-visual-fields">
                  <label>
                    Visual-aid title or request
                    <input
                      value={curationForm.visualAidTitle}
                      onChange={(event) => setCurationForm((prev) => ({ ...prev, visualAidTitle: event.target.value }))}
                      placeholder="e.g. floor map with feeder path"
                    />
                  </label>
                  <label>
                    Reference URL
                    <input
                      value={curationForm.visualAidUrl}
                      onChange={(event) => setCurationForm((prev) => ({ ...prev, visualAidUrl: event.target.value }))}
                      placeholder="Optional video, diagram, or source link"
                    />
                  </label>
                </div>
                <button type="submit" className="patternpals-mini-button">
                  Submit note
                </button>
                {curationStatus ? <p className="muted small">{curationStatus}</p> : null}
              </form>
              {selectedVisualAidContributions.length > 0 ? (
                <p className="muted small">
                  {selectedVisualAidContributions.length} community visual-aid hook{selectedVisualAidContributions.length === 1 ? '' : 's'} captured for this pattern.
                </p>
              ) : null}
            </div>
            <div className="patternpals-detail-section">
              <h4>All pattern books</h4>
              <div className="patternpals-book-grid">
                {PATTERN_BOOKS.map((book) => (
                  <a
                    key={book.tag}
                    className="patternpals-book-link"
                    href={book.file}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <span>{book.title}</span>
                    <span className="patternpals-book-action">Download PDF</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
