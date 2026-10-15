// Timing math for the lookahead scheduler. Pure.
export const LOOKAHEAD = 0.12; // seconds scheduled ahead
export const TICK_MS = 25; // scheduler wake-up interval
export const TOLERANCE = 0.03; // a player event within 30 ms after a 16th plays immediately
export const STEPS_PER_BAR = 16;

export const stepDuration = bpm => 60 / bpm / 4;

/**
 * Quantize time `t` to the 16th-note grid defined by a known grid point `gridTime` and `stepDur`.
 * If the previous grid point passed less than `tol` ago, play right now (t). Otherwise play at the
 * next grid point.
 */
export function quantizeTime(t, gridTime, stepDur, tol = TOLERANCE) {
  const k = Math.floor((t - gridTime) / stepDur + 1e-9);
  const prev = gridTime + k * stepDur;
  if (t - prev <= tol) return t;
  return prev + stepDur;
}

// Which grid slot a quantized time falls into (used to collapse same-type events per 16th).
export function slotOf(t, gridTime, stepDur) { return Math.round((t - gridTime) / stepDur); }
