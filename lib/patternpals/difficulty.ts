/**
 * Heuristic difficulty for passing patterns.
 *
 * The books rarely state a difficulty, but they encode it structurally: clubs
 * per juggler, pass density, tricks (zaps, heffs, triples, popcorn), movement
 * (runarounds, weaves, takeouts) and group size. The score below is additive
 * and explainable: every contribution is returned as a reason so the UI can
 * show why a pattern landed in a band. Provenance is always "heuristic".
 */
import { getPatternJugglerBounds, getPatternObjectCount } from './atlas';
import type { Pattern } from './types';

export type DifficultyBand = 1 | 2 | 3 | 4;

export const DIFFICULTY_BANDS: Record<DifficultyBand, { label: string; blurb: string }> = {
  1: { label: 'Starter', blurb: '3 clubs each: 4-count, 3-count, 2-count, standard feeds and boxes' },
  2: { label: 'Club night', blurb: 'PPS, period-5 zip patterns, 1-count, triangles, runarounds, boxes' },
  3: { label: 'Advanced', blurb: '7 clubs for two, 10-club feeds, popcorn, takeouts, 13-club four-person' },
  4: { label: 'Expert', blurb: '8+ clubs for two, 11+-club feeds, big sandwiches and weaves' },
};

export type DifficultyEstimate = {
  band: DifficultyBand;
  label: string;
  score: number;
  reasons: string[];
};

const clubsPerJugglerPoints = (ratio: number): [number, string] | null => {
  if (ratio <= 3.01) return null;
  if (ratio < 3.5) return [2.5, `${ratio.toFixed(2)} clubs per juggler`];
  if (ratio < 3.51) return [3, '3.5 clubs per juggler'];
  if (ratio < 4) return [4, `${ratio.toFixed(2)} clubs per juggler`];
  if (ratio < 4.01) return [4.5, '4 clubs per juggler'];
  return [5.5, `${ratio.toFixed(1)} clubs per juggler`];
};

type Rule = { test: RegExp; points: number; reason: string; unless?: RegExp };

const NAME_RULES: Rule[] = [
  { test: /\b(1[ -]?count|ultimates?|one count)\b/i, points: 2, reason: '1-count' },
  { test: /\b(2[ -]?count|two count)\b/i, points: 0.5, reason: '2-count' },
  { test: /\bpps\b|pass pass self/i, points: 1.5, reason: 'pass pass self' },
  { test: /\b(6|8)[ -]?count\b/i, points: -0.5, reason: 'slow count' },
  { test: /\bzaps?\b/i, points: 1, reason: 'zaps' },
  { test: /\bheffs?\b/i, points: 1, reason: 'heffs' },
  { test: /\btriples?\b/i, points: 1, reason: 'triples' },
  { test: /\bdoubles?\b/i, points: 0.5, reason: 'doubles', unless: /double (weave|feed|rotation|unicycle|twister|banana|chocolate|gandini|vision|decker|handled|time|dresser|urban|three|trapeze|hold|self|heff|zip|zap|returns)/i },
  { test: /\bpopcorn/i, points: 1.5, reason: 'popcorn' },
  { test: /\bhurr(y|ies|ied)\b/i, points: 1, reason: 'hurries' },
  { test: /\b(why ?not|not ?why|maybe|parsnip|funky bookends|jim.?s|martin.?s|brainstorm|madness|mildness|psychosis|neurosis|sunshine|countdown|bookends)\b/i, points: 1.5, reason: 'period-5 / zip rhythm' },
  { test: /\b(sync|synch|synchronous|simul)\b/i, points: 1, reason: 'synchronous', unless: /\basync|asynchronous\b/i },
  { test: /\bcrossing\b/i, points: 0.5, reason: 'crossing passes' },
  { test: /\bhijack|lo-jack/i, points: 1.5, reason: 'hijacking' },
  { test: /\b(slow|fast)[\/ -]?(fast|slow)|vs\b/i, points: 1.5, reason: 'two rhythms at once' },
  { test: /\brunaround|run-around/i, points: 1.5, reason: 'runaround' },
  { test: /\bweave/i, points: 1, reason: 'weave' },
  { test: /\bwalk|moving|moveable|dosado|square dance|minuet/i, points: 1, reason: 'walking' },
  { test: /\b(takeouts?|scrambled|unscrambled|muckabout|roundabout|messabout|walkabout|chopabout|dolby|toast|ivy)\b/i, points: 3, reason: 'takeouts / manipulation' },
  { test: /\bfeast/i, points: 1, reason: 'everyone feeds' },
  { test: /\bfeed/i, points: 0.5, reason: 'feed' },
  { test: /\b(box|line)\b/i, points: 0.5, reason: 'box / line' },
  { test: /\b(sandwich|twister|blast|hinge|clover|egg beater|razor|benzene|apollo|turbo)\b/i, points: 1, reason: 'large moving pattern' },
];

export const estimateDifficulty = (pattern: Pattern): DifficultyEstimate => {
  const reasons: string[] = [];
  let score = 0;
  const bounds = getPatternJugglerBounds(pattern);
  const jugglers = Math.max(1, bounds.min);
  const clubs = getPatternObjectCount(pattern) ?? jugglers * 3;
  const cpj = clubsPerJugglerPoints(clubs / jugglers);
  if (cpj) {
    score += cpj[0];
    reasons.push(cpj[1]);
  } else if (clubs / jugglers < 2.6 && jugglers <= 2) {
    // 4-club patterns are drills rather than full passing
    score -= 0.5;
  }
  const searchable = `${pattern.name} ${(pattern.aliases ?? []).join(' ')}`;
  for (const rule of NAME_RULES) {
    if (rule.test.test(searchable) && !(rule.unless && rule.unless.test(searchable))) {
      score += rule.points;
      reasons.push(rule.reason);
    }
  }
  const sequence = pattern.derived?.anthology?.sequence;
  if (sequence) {
    const zips = (sequence.match(/\bz\b/g) ?? []).length;
    const heffs = (sequence.match(/\bh\b/g) ?? []).length;
    const bigThrows = (sequence.match(/[psh][23]/g) ?? []).length;
    if (zips && !reasons.includes('zaps') && !reasons.includes('period-5 / zip rhythm')) {
      score += 0.5;
      reasons.push('zips in the sequence');
    }
    if (heffs && !reasons.includes('heffs')) {
      score += 0.5;
      reasons.push('heffs in the sequence');
    }
    if (bigThrows && !reasons.includes('doubles') && !reasons.includes('triples')) {
      score += 0.5;
      reasons.push('doubles/triples in the sequence');
    }
  }
  if (jugglers >= 7) {
    score += 2;
    reasons.push(`${jugglers} jugglers to organise`);
  } else if (jugglers >= 5) {
    score += 1;
    reasons.push(`${jugglers} jugglers to organise`);
  }
  const sources = pattern.tags.filter((tag) => tag.startsWith('source:'));
  if (sources.includes('source:curriculum_flowchart') && clubs / jugglers <= 3 && score < 2) {
    score -= 0.5;
    reasons.push('on the passing progression flowchart');
  }
  const section = pattern.derived?.anthology?.page;
  if (section && /\bbasics?\b/i.test(pattern.derived?.anthology?.remark ?? '')) {
    score -= 0.5;
  }
  const band: DifficultyBand = score <= 1 ? 1 : score <= 2.5 ? 2 : score <= 5 ? 3 : 4;
  return { band, label: DIFFICULTY_BANDS[band].label, score: Math.round(score * 10) / 10, reasons };
};

export const getDifficultyBand = (pattern: Pattern): DifficultyBand => estimateDifficulty(pattern).band;
