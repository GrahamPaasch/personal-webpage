// Guideline scoring. Pure functions.
export const LINE_SCORES = [0, 100, 300, 500, 800];
export const TSPIN_SCORES = [400, 800, 1200, 1600];
export const MINI_SCORES = [100, 200, 400, 400];
export const PC_SCORES = [0, 800, 1200, 1800, 2000];
export const PC_B2B_QUAD = 3200;

export function gravitySeconds(level) {
  const l = Math.max(1, level);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1);
}

// Is this clear "difficult" (eligible for back-to-back)?
export function isDifficult(lines, tspin) {
  return lines === 4 || (lines > 0 && tspin !== null);
}

/**
 * Score a lock.
 * @param {object} p {lines, tspin: null|'mini'|'full', level, b2bActive (previous difficult clear chain), combo (>=0 after this lock, -1 if none), perfect}
 * @returns {{points, base, b2b, comboBonus, pcBonus, difficult}}
 */
export function scoreLock({ lines, tspin, level, b2bActive, combo, perfect }) {
  let base;
  if (tspin === 'full') base = TSPIN_SCORES[lines];
  else if (tspin === 'mini') base = MINI_SCORES[lines];
  else base = LINE_SCORES[lines];
  const difficult = isDifficult(lines, tspin);
  const b2b = difficult && b2bActive;
  let points = base * level;
  if (b2b) points = Math.floor(points * 1.5);
  const comboBonus = lines > 0 && combo > 0 ? 50 * combo * level : 0;
  let pcBonus = 0;
  if (perfect && lines > 0) pcBonus = (lines === 4 && b2b ? PC_B2B_QUAD : PC_SCORES[lines]) * level;
  return { points: points + comboBonus + pcBonus, base, b2b, comboBonus, pcBonus, difficult };
}
