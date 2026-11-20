/**
 * guides.js: where the guidelines go (spec 35, amendment 2026-11-20: "I just want guidelines").
 * Pure: reads a pattern from physics.js, returns numbers in the pattern frame (x = the juggler's
 * right, y = up from the hands, metres).
 *
 *   left, right   the outermost ball centres: the catch points, as far out as any ball goes
 *                 (a ball moves straight sideways between release and catch, so its extremes are
 *                 its release and landing points)
 *   center        the centre line, x = 0
 *   crossY        the height of the horizontal line: where the balls cross the centre line, for
 *                 the highest crossing throw (an odd throw of 3 or more). A pattern with no
 *                 crossing throw (a fountain, or 441) has no crossing, so the line marks the top
 *                 of its highest throw instead, and `crossing` is false.
 *   bottom, top   how far the vertical lines run: from a little below the hands to a little above
 *                 the highest peak
 */

import { G, throwAtBeat } from './physics.js';

const BELOW = 0.15; // the vertical lines start this far below the hands
const ABOVE = 0.1; // and end this far above the highest peak

export function guideLines(pattern) {
  let edge = 0;
  let crossValue = 0;
  let crossY = 0;
  for (let i = 0; i < pattern.cycleBeats; i++) {
    const rec = throwAtBeat(pattern, i);
    if (!rec.air) continue;
    edge = Math.max(edge, Math.abs(rec.x0), Math.abs(rec.x1));
    // Crosses the centre line: released on one side, caught on the other. A 1 is handed across
    // at the hands, not crossed in the air, so it does not count.
    if (rec.value >= 3 && rec.x0 * rec.x1 < 0 && rec.value > crossValue) {
      const s = -rec.x0 / rec.vx;
      crossValue = rec.value;
      crossY = rec.vy * s - 0.5 * G * s * s;
    }
  }
  const peak = pattern.heightByValue[pattern.maxThrow] || 0;
  const crossing = crossValue > 0;
  return {
    left: -edge,
    right: edge,
    center: 0,
    crossY: crossing ? crossY : peak,
    crossing,
    crossValue,
    bottom: -BELOW,
    top: peak + ABOVE,
  };
}
