/**
 * accuracy.js: how well the person's own hand followed the ghost hand through one throw, and so
 * which colour the thrown ball takes. Pure (no DOM, no three.js).
 *
 * Every ball is white. While a ghost hand makes its scoop (from the start of the carry motion to
 * the release, see scoopWindow in hands.js) the person's palm point on that side is recorded, in
 * the pattern frame. At the release the recording is compared with the ghost and the ball that
 * leaves takes a colour, which it keeps for its whole flight. It is white again when caught.
 *
 * Three things are measured, and the worst of them decides the colour:
 *
 *   timing     The shift in time that lays the person's path best over the ghost's: how early or
 *              late the same motion was made. As a fraction of the scoop's duration.
 *   position   What is left once that shift is taken out: the root-mean-square distance between
 *              the palm and the ghost hand over the scoop. Distance out of the pattern's plane
 *              (nearer or farther from the body) counts half, because depth is the hardest thing
 *              to judge in a headset and the math says nothing about it. Measured against the
 *              length of the ghost's scoop, so a 7-ball pattern allows more centimetres than a
 *              3-ball one, with a floor of a few centimetres for very small motions.
 *   direction  The angle between the way the palm moved over the last 40% of the scoop and the
 *              way the ghost did, whose velocity at the release is the launch velocity of the
 *              ball. The ghost's direction is read with a little slack in time (15% of the
 *              scoop either side of the measured shift), because on a curving path a small
 *              uncertainty in timing would otherwise show up as a large angle. A palm that hardly moved in that stretch (under a quarter of the ghost's
 *              travel) made no throwing motion: red. Left out when the ghost itself moves under
 *              8 cm there (the hand-across before a 1: the direction would be mostly noise)
 *              or when too few samples fall in that stretch.
 *
 * Times are pattern time, so slow motion gives proportionally more real time for the same
 * colour: the green window of the 3-ball cascade is 69 ms either way at full speed and 139 ms
 * at 0.5x.
 *
 * No colour is given (the ball stays white) when the hand was not tracked for the scoop: fewer
 * than three samples, more than a fifth of the frames without a palm, or a recording that starts
 * late or stops early.
 */

import { RIGHT, LEFT } from './physics.js';
import { handState, scoopWindow } from './hands.js';

export const GRADE = Object.freeze({ NONE: 0, GREEN: 1, YELLOW: 2, RED: 3 });

/** The limits. `green` and `yellow` are the largest error that still earns that colour. */
export const THRESHOLDS = Object.freeze({
  position: Object.freeze({ green: 0.15, yellow: 0.35 }), // x the length of the ghost's scoop path
  positionFloor: Object.freeze({ green: 0.04, yellow: 0.08 }), // metres: never stricter than this
  timing: Object.freeze({ green: 0.2, yellow: 0.4 }), // x the duration of the scoop
  direction: Object.freeze({ green: 35, yellow: 70 }), // degrees
  depthWeight: 0.5, // distance out of the pattern's plane counts this much
});

const MAX_SAMPLES = 64;
const LAG_STEPS = 24; // each side of zero
const LAG_RANGE = 0.6; // x the scoop duration, each side
const PATH_STEPS = 16;
const DIRECTION_SPAN = 0.4; // the last part of the scoop, x its duration
const DIRECTION_SLACK = 0.15; // x the scoop duration, each side of the best time shift
const DIRECTION_TRIES = 3; // shifts tried on each side
const MIN_TRAVEL = 0.08; // metres the ghost must move in that part for a direction to mean anything
const STILL = 0.25; // a palm that moves less than this x the ghost's travel is not throwing
const MIN_SAMPLES = 3;
const MAX_MISSED = 0.2; // of the frames in the scoop
const LATE_START = 0.35; // the first sample must come within this much of the scoop, x duration
const EARLY_END = 0.35; // and the last sample no earlier than this before the release

const ghost = { x: 0, y: 0, vx: 0, vy: 0, carrying: false };

function gradeOf(error, limits) {
  if (error <= limits.green) return GRADE.GREEN;
  if (error <= limits.yellow) return GRADE.YELLOW;
  return GRADE.RED;
}

/** Position limits in metres for a scoop whose ghost path is `pathLength` long. */
export function positionLimits(pathLength, out) {
  const o = out || { green: 0, yellow: 0 };
  o.green = Math.max(THRESHOLDS.positionFloor.green, THRESHOLDS.position.green * pathLength);
  o.yellow = Math.max(THRESHOLDS.positionFloor.yellow, THRESHOLDS.position.yellow * pathLength);
  return o;
}

/** Length of the ghost hand's path from `start` to `release`. */
export function scoopLength(timeline, hand, start, release) {
  let length = 0;
  let px = 0;
  let py = 0;
  for (let k = 0; k <= PATH_STEPS; k++) {
    // Stay a hair inside the scoop: at the release itself the hand is already on its way back.
    const g = handState(timeline, hand, start + ((release - start) * k) / PATH_STEPS - (k === PATH_STEPS ? 1e-7 : 0), ghost);
    if (k > 0) length += Math.hypot(g.x - px, g.y - py);
    px = g.x;
    py = g.y;
  }
  return length;
}

function meanSquare(timeline, hand, rec, lag) {
  const wz = THRESHOLDS.depthWeight;
  let sum = 0;
  for (let i = 0; i < rec.n; i++) {
    const g = handState(timeline, hand, rec.t[i] - lag, ghost);
    const dx = rec.x[i] - g.x;
    const dy = rec.y[i] - g.y;
    const dz = rec.z[i] * wz;
    sum += dx * dx + dy * dy + dz * dz;
  }
  return sum / rec.n;
}

const limitsScratch = { green: 0, yellow: 0 };

/**
 * Judge one throw. `rec` is the recording: { n, t, x, y, z } with the palm point in the pattern
 * frame at pattern times t[0..n-1] (ascending), and { seen, missed }: the frames the scoop lasted
 * and how many of them had no palm. Fills in and returns `out`:
 *
 *   grade       GRADE.NONE / GREEN / YELLOW / RED
 *   position    metres (root mean square, at the best time shift);  positionGrade
 *   lag         seconds of pattern time, positive = the person was late;  timingGrade
 *   angle       degrees, or -1 when there is no direction to speak of;  directionGrade (NONE when
 *               left out, RED when the palm made no throwing motion)
 *   pathLength  metres, the ghost's scoop
 */
export function scoreThrow(timeline, hand, start, release, rec, out) {
  const o = out || {};
  o.grade = GRADE.NONE;
  o.position = 0;
  o.positionGrade = GRADE.NONE;
  o.lag = 0;
  o.timingGrade = GRADE.NONE;
  o.angle = -1;
  o.directionGrade = GRADE.NONE;
  o.pathLength = 0;
  const duration = release - start;
  const n = rec.n;
  if (!(duration > 0) || n < MIN_SAMPLES) return o;
  if (rec.seen > 0 && rec.missed > MAX_MISSED * rec.seen) return o;
  if (rec.t[0] > start + LATE_START * duration || rec.t[n - 1] < release - EARLY_END * duration) return o;

  // Timing: the shift that fits best. Zero is tried first and only a strictly better fit
  // replaces it.
  const step = (LAG_RANGE * duration) / LAG_STEPS;
  let best = meanSquare(timeline, hand, rec, 0);
  let bestK = 0;
  for (let k = 1; k <= LAG_STEPS; k++) {
    for (let sign = -1; sign <= 1; sign += 2) {
      const e = meanSquare(timeline, hand, rec, sign * k * step);
      if (e < best) {
        best = e;
        bestK = sign * k;
      }
    }
  }
  let lag = bestK * step;
  if (Math.abs(bestK) < LAG_STEPS && best > 0) {
    // Between the steps: the low point of the parabola through the best fit and its neighbours.
    const a = meanSquare(timeline, hand, rec, (bestK - 1) * step);
    const c = meanSquare(timeline, hand, rec, (bestK + 1) * step);
    const curve = a - 2 * best + c;
    if (curve > 0) lag += Math.min(Math.max((0.5 * (a - c)) / curve, -0.5), 0.5) * step;
  }
  o.lag = lag;
  o.timingGrade = gradeOf(Math.abs(lag) / duration, THRESHOLDS.timing);

  o.pathLength = scoopLength(timeline, hand, start, release);
  o.position = Math.sqrt(best);
  o.positionGrade = gradeOf(o.position, positionLimits(o.pathLength, limitsScratch));

  // Direction over the last part of the scoop.
  const from = release - DIRECTION_SPAN * duration;
  let ia = n - 1;
  while (ia > 0 && rec.t[ia - 1] >= from) ia--;
  const ib = n - 1;
  if (ib - ia >= 1 && rec.t[ib] - rec.t[ia] >= 0.1 * duration) {
    const ux = rec.x[ib] - rec.x[ia];
    const uy = rec.y[ib] - rec.y[ia];
    const uz = rec.z[ib] - rec.z[ia];
    const ul = Math.hypot(ux, uy, uz);
    // The ghost over the same stretch of its own motion. Which stretch that is, is only known
    // as well as the time shift (on a short path a few centimetres along it and a few
    // hundredths of a second look the same), and the path curves: so the ghost's direction is
    // read at a few shifts around the best one and the kindest is taken.
    let travel = 0;
    let cosBest = -2;
    for (let k = -DIRECTION_TRIES; k <= DIRECTION_TRIES; k++) {
      const shift = lag + (k / DIRECTION_TRIES) * DIRECTION_SLACK * duration;
      let g = handState(timeline, hand, Math.min(rec.t[ia] - shift, release - 1e-7), ghost);
      const gx0 = g.x;
      const gy0 = g.y;
      g = handState(timeline, hand, Math.min(rec.t[ib] - shift, release - 1e-7), ghost);
      const gx = g.x - gx0;
      const gy = g.y - gy0;
      const gl = Math.hypot(gx, gy);
      if (k === 0) travel = gl;
      if (gl < 1e-6 || ul < 1e-6) continue;
      const cos = (ux * gx + uy * gy) / (ul * gl);
      if (cos > cosBest) cosBest = cos;
    }
    if (travel >= MIN_TRAVEL) {
      if (ul < STILL * travel) {
        o.directionGrade = GRADE.RED;
      } else if (cosBest > -2) {
        o.angle = (Math.acos(Math.min(Math.max(cosBest, -1), 1)) * 180) / Math.PI;
        o.directionGrade = gradeOf(o.angle, THRESHOLDS.direction);
      }
    }
  }

  o.grade = Math.max(o.positionGrade, o.timingGrade, o.directionGrade);
  return o;
}

function makeRecording() {
  return {
    active: false,
    judged: false, // the scoop ending at `release` has been judged
    start: 0,
    release: 0,
    ball: -1,
    n: 0,
    seen: 0,
    missed: 0,
    stride: 1,
    t: new Float64Array(MAX_SAMPLES),
    x: new Float32Array(MAX_SAMPLES),
    y: new Float32Array(MAX_SAMPLES),
    z: new Float32Array(MAX_SAMPLES),
  };
}

function makeResult() {
  return { grade: 0, position: 0, positionGrade: 0, lag: 0, timingGrade: 0, angle: -1, directionGrade: 0, pathLength: 0, ball: -1, count: 0 };
}

/**
 * Follows the pattern frame by frame and keeps the colour of every ball.
 *
 *   scorer.setPattern(pattern, timeline)
 *   scorer.step(scene, t, palms)      once a frame; scene = sceneAt(...), palms = [right, left],
 *                                     each { tracked, x, y, z } in the pattern frame
 *   scorer.grades[ball]               GRADE.* for each ball, to draw it by
 *   scorer.last[hand]                 the measurements of that hand's latest throw
 *
 * Everything is allocated once; step() makes no garbage.
 */
export class ThrowScorer {
  constructor() {
    this.timeline = null;
    this.grades = new Uint8Array(0);
    this.hands = [makeRecording(), makeRecording()];
    this.last = [makeResult(), makeResult()];
    this.window = { active: false, start: 0, release: 0 };
    this.lastT = NaN;
    this.coloured = false; // is any ball not white?
  }

  setPattern(pattern, timeline) {
    this.timeline = timeline;
    if (this.grades.length < pattern.balls) this.grades = new Uint8Array(pattern.balls);
    this.clear();
  }

  /** All balls white, and nothing half recorded. */
  clear() {
    this.grades.fill(GRADE.NONE);
    this.coloured = false;
    this.forget();
  }

  /** Drop what is being recorded (the pattern moved, or time jumped). Colours in flight stay. */
  forget() {
    for (let hand = 0; hand < 2; hand++) {
      const rec = this.hands[hand];
      rec.active = false;
      rec.judged = false;
      rec.release = NaN;
    }
    this.lastT = NaN;
  }

  step(scene, t, palms) {
    const timeline = this.timeline;
    if (!timeline) return;
    // The clock only runs forward, a frame at a time. Anything else: start the recordings again.
    if (t < this.lastT - 0.05 || t > this.lastT + 0.5) this.forget();
    this.lastT = t;

    for (let hand = 0; hand < 2; hand++) {
      const rec = this.hands[hand];
      // (A hair early: the ball is drawn as thrown from that same hair before the release.)
      if (rec.active && t >= rec.release - 1e-10) {
        rec.active = false;
        rec.judged = true;
        const result = scoreThrow(timeline, hand, rec.start, rec.release, rec, this.last[hand]);
        result.ball = rec.ball;
        result.count++;
        if (rec.ball >= 0 && rec.ball < this.grades.length) this.grades[rec.ball] = result.grade;
      }
      const w = scoopWindow(timeline, hand, t, this.window);
      if (!w.active) continue;
      const same = Math.abs(w.release - rec.release) < 1e-6;
      // A headset shows each frame at a time it predicts, and that can step back a hair: the
      // scoop that was just judged is not started over.
      if (same && rec.judged) continue;
      if (!rec.active || !same) {
        rec.active = true;
        rec.judged = false;
        rec.start = w.start;
        rec.release = w.release;
        rec.ball = -1;
        rec.n = 0;
        rec.seen = 0;
        rec.missed = 0;
        rec.stride = 1;
      }
      const holding = scene.hands[hand].holding;
      if (holding >= 0) rec.ball = holding;
      const palm = palms[hand];
      rec.seen++;
      if (!palm.tracked) {
        rec.missed++;
      } else if (rec.seen % rec.stride === 0) {
        if (rec.n === MAX_SAMPLES) {
          // Full (very slow motion): keep every other sample and record half as often from here.
          let k = 0;
          for (let i = 0; i < MAX_SAMPLES; i += 2, k++) {
            rec.t[k] = rec.t[i];
            rec.x[k] = rec.x[i];
            rec.y[k] = rec.y[i];
            rec.z[k] = rec.z[i];
          }
          rec.n = k;
          rec.stride *= 2;
        }
        if (rec.seen % rec.stride === 0) {
          rec.t[rec.n] = t;
          rec.x[rec.n] = palm.x;
          rec.y[rec.n] = palm.y;
          rec.z[rec.n] = palm.z;
          rec.n++;
        }
      }
    }

    // A ball in a hand is white: the colour lasts from the release to the catch.
    let coloured = false;
    const balls = scene.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (!b.air) {
        // (Not the ball this hand has just been judged on, if the time stepped back over its release.)
        const rec = this.hands[b.hand];
        if (!(rec.judged && rec.ball === b.ball && t > rec.release - 0.05 && t <= rec.release)) this.grades[b.ball] = GRADE.NONE;
      }
      if (this.grades[b.ball] !== GRADE.NONE) coloured = true;
    }
    this.coloured = coloured;
  }
}
