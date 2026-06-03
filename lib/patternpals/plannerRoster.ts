import type {
  ExperienceLevel,
  GroupJugglerInput,
  JugglerProfile,
  SessionEntry,
  SessionMode,
} from './types';

const DEFAULTS_BY_EXPERIENCE: Record<ExperienceLevel, Omit<GroupJugglerInput, 'id' | 'name'>> = {
  Beginner: {
    comfortableObjects: 3,
    comfortableCount: 3,
    movementComfort: 'stationary',
  },
  Intermediate: {
    comfortableObjects: 3.5,
    comfortableCount: 4,
    movementComfort: 'moderate',
  },
  Advanced: {
    comfortableObjects: 4,
    comfortableCount: 5,
    movementComfort: 'high',
  },
};

export type PlannerRosterPerson = {
  id: string;
  name: string;
  experience?: ExperienceLevel;
};

const normalizeRosterKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const uniqueNames = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeRosterKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const createPlannerEntry = (
  person: PlannerRosterPerson,
  existingMatch?: GroupJugglerInput,
): GroupJugglerInput => {
  const defaults = person.experience ? DEFAULTS_BY_EXPERIENCE[person.experience] : DEFAULTS_BY_EXPERIENCE.Beginner;
  return {
    id: person.id,
    name: person.name,
    comfortableObjects: existingMatch?.comfortableObjects ?? defaults.comfortableObjects,
    comfortableCount: existingMatch?.comfortableCount ?? defaults.comfortableCount,
    movementComfort: existingMatch?.movementComfort ?? defaults.movementComfort,
  };
};

export const buildSessionPlannerPeople = ({
  activeProfile,
  participants,
  manualParticipantNames,
  sessionMode,
}: {
  activeProfile: JugglerProfile | null;
  participants: JugglerProfile[];
  manualParticipantNames: string[];
  sessionMode: SessionMode;
}): PlannerRosterPerson[] => {
  const selectedParticipants =
    sessionMode === 'solo'
      ? []
      : sessionMode === 'duo'
        ? participants.slice(0, 1)
        : participants;

  const selectedManualNames =
    sessionMode === 'solo'
      ? []
      : sessionMode === 'duo'
        ? uniqueNames(manualParticipantNames).slice(0, 1)
        : uniqueNames(manualParticipantNames);

  const people: PlannerRosterPerson[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const pushPerson = (person: PlannerRosterPerson | null) => {
    if (!person) return;
    const normalizedName = normalizeRosterKey(person.name);
    if (!normalizedName) return;
    if (seenIds.has(person.id) || seenNames.has(normalizedName)) return;
    seenIds.add(person.id);
    seenNames.add(normalizedName);
    people.push(person);
  };

  pushPerson(activeProfile ? { id: activeProfile.id, name: activeProfile.name, experience: activeProfile.experience } : null);

  selectedParticipants.forEach((participant) => {
    pushPerson({
      id: participant.id,
      name: participant.name,
      experience: participant.experience,
    });
  });

  selectedManualNames.forEach((name) => {
    pushPerson({
      id: `manual:${normalizeRosterKey(name).replace(/[^a-z0-9]+/g, '-')}`,
      name,
    });
  });

  return people;
};

export const buildRecommendationPlannerRoster = ({
  activeProfile,
  participants,
  manualParticipantNames,
  sessionMode,
  existingPlanner,
}: {
  activeProfile: JugglerProfile | null;
  participants: JugglerProfile[];
  manualParticipantNames: string[];
  sessionMode: SessionMode;
  existingPlanner: GroupJugglerInput[];
}): GroupJugglerInput[] => {
  const canonicalPeople = buildSessionPlannerPeople({
    activeProfile,
    participants,
    manualParticipantNames,
    sessionMode,
  });

  const matchedIds = new Set<string>();
  const canonicalRoster = canonicalPeople.map((person) => {
    const match =
      existingPlanner.find((item) => item.id === person.id) ??
      existingPlanner.find((item) => normalizeRosterKey(item.name) === normalizeRosterKey(person.name));
    if (match) matchedIds.add(match.id);
    return createPlannerEntry(person, match);
  });

  const extras = existingPlanner.filter((item) => {
    if (matchedIds.has(item.id)) return false;
    const normalizedName = normalizeRosterKey(item.name);
    return canonicalRoster.every((canonical) => canonical.id !== item.id && normalizeRosterKey(canonical.name) !== normalizedName);
  });

  const merged = [...canonicalRoster, ...extras];
  return merged.length > 0 ? merged : existingPlanner;
};

export const getAutomaticRecommendationMode = (
  sessionMode: SessionMode,
  plannerCount: number,
): SessionMode => {
  if (sessionMode === 'solo') return 'solo';
  if (sessionMode === 'duo') return plannerCount >= 2 ? 'duo' : 'solo';
  if (plannerCount >= 3) return 'group';
  if (plannerCount === 2) return 'duo';
  return 'solo';
};

export const formatSessionRosterNames = (
  session: SessionEntry,
  hostName: string | null,
) => {
  const names = uniqueNames([
    hostName ?? '',
    ...(session.participantNames ?? []),
    session.partnerName ?? '',
  ]);
  return names;
};
