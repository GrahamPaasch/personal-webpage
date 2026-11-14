/**
 * hands.js: where each ghost hand is at any moment, and so where a held ball is.
 * Pure functions (no DOM, no three.js).
 *
 * What is exact, straight from physics.js:
 *   - when and where each hand catches and when and where it releases,
 *   - which hand throws on which beat (they alternate),
 *   - the hand's velocity at the release: it equals the launch velocity of the ball.
 *
 * What is a drawing choice (assumption A5 in the README): the path between those moments. Kalvan
 * leaves it open ("the exact path is unspecified" [K96]); only catch and throw points are part of
 * his optimum. Here the hand follows a cubic Hermite curve in time between the knots and is
 * momentarily still at the instant a ball lands. The result is the standard inward scoop: catch
 * outside, dip down and in while holding, release inside moving up, return over the top empty.
 * Seen by the juggler, the right hand circles clockwise and the left hand counter-clockwise.
 *
 * A hand with more time than one normal dwell (a 2, i.e. a hold) waits at the catch point and
 * starts its scoop one normal dwell before the release. A hand with a long empty gap (a 0) goes to
 * its next catch point in one normal empty time and waits there.
 */

import { RIGHT, LEFT, handSign, mod, throwAtBeat, ballStates } from './physics.js';

const EPS = 1e-9;

/**
 * Precompute the catch and release knots of both hands over one full cycle of the pattern
 * (with enough margin on both sides that every moment has a knot before and after it).
 */
export function buildHandTimeline(pattern) {
  const margin = pattern.cycleBeats + pattern.maxThrow + 2;
  const hands = [[], []];
  for (let i = -margin; i <= pattern.cycleBeats + margin; i++) {
    const rec = throwAtBeat(pattern, i);
    if (!rec.air) continue;
    hands[rec.hand].push({
      t: rec.tThrow,
      type: 'throw',
      x: rec.x0,
      y: 0,
      vx: rec.vx,
      vy: rec.vy,
      ball: rec.ball,
      beat: rec.beat,
      value: rec.value,
    });
    hands[rec.toHand].push({
      t: rec.tCatch,
      type: 'catch',
      x: rec.x1,
      y: 0,
      vx: 0,
      vy: 0,
      ball: rec.ball,
      beat: rec.beat,
      value: rec.value,
    });
  }
  hands[RIGHT].sort((a, b) => a.t - b.t);
  hands[LEFT].sort((a, b) => a.t - b.t);
  return {
    knots: hands,
    cycleTime: pattern.cycleTime,
    dwell: pattern.dwell,
    empty: pattern.empty,
    rest: [
      { x: handSign(RIGHT) * pattern.layout.xC, y: 0 },
      { x: handSign(LEFT) * pattern.layout.xC, y: 0 },
    ],
  };
}

/**
 * Position and velocity of one hand at time t: { x, y, vx, vy, carrying }.
 * `carrying` is true between a catch and the following release.
 * Pass an object as `out` to have it filled in and returned (the draw loop does, to make no
 * garbage); without it a fresh object is returned.
 */
export function handState(timeline, hand, t, out) {
  const o = out || { x: 0, y: 0, vx: 0, vy: 0, carrying: false };
  const knots = timeline.knots[hand];
  if (knots.length === 0) {
    // This hand never throws or catches (it holds a ball as a 2 forever, or is always empty).
    const rest = timeline.rest[hand];
    return put(o, rest.x, rest.y, 0, 0, false);
  }
  const tt = mod(t, timeline.cycleTime);

  // Last knot at or before tt (binary search; the margins guarantee one exists on each side).
  let lo = 0;
  let hi = knots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (knots[mid].t <= tt + EPS) lo = mid;
    else hi = mid - 1;
  }
  const a = knots[lo];
  const b = knots[Math.min(lo + 1, knots.length - 1)];
  const span = b.t - a.t;
  if (span <= EPS) return put(o, a.x, a.y, a.vx, a.vy, a.type === 'catch');

  if (a.type === 'catch') {
    // Carrying a ball from the catch to the release.
    const scoop = Math.min(span, timeline.dwell);
    const start = b.t - scoop;
    if (tt <= start) return put(o, a.x, a.y, 0, 0, true);
    hermite(o, a.x, a.y, 0, 0, b.x, b.y, b.vx, b.vy, scoop, tt - start);
    o.carrying = true;
    return o;
  }

  // Empty: from the release to the next catch.
  const travel = Math.min(span, timeline.empty);
  if (tt >= a.t + travel) return put(o, b.x, b.y, 0, 0, false);
  hermite(o, a.x, a.y, a.vx, a.vy, b.x, b.y, 0, 0, travel, tt - a.t);
  o.carrying = false;
  return o;
}

function put(o, x, y, vx, vy, carrying) {
  o.x = x;
  o.y = y;
  o.vx = vx;
  o.vy = vy;
  o.carrying = carrying;
  return o;
}

/** Cubic Hermite interpolation in time: matches position and velocity at both ends. */
function hermite(o, x0, y0, vx0, vy0, x1, y1, vx1, vy1, duration, elapsed) {
  const s = Math.min(Math.max(elapsed / duration, 0), 1);
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  // Derivatives with respect to s; divide by duration for velocity.
  const d00 = 6 * s2 - 6 * s;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = -6 * s2 + 6 * s;
  const d11 = 3 * s2 - 2 * s;
  o.x = h00 * x0 + h10 * duration * vx0 + h01 * x1 + h11 * duration * vx1;
  o.y = h00 * y0 + h10 * duration * vy0 + h01 * y1 + h11 * duration * vy1;
  o.vx = (d00 * x0 + d01 * x1) / duration + d10 * vx0 + d11 * vx1;
  o.vy = (d00 * y0 + d01 * y1) / duration + d10 * vy0 + d11 * vy1;
  return o;
}

/**
 * Everything to draw at time t:
 *   hands: [right, left], each { x, y, vx, vy, carrying, holding } (holding = ball id or -1)
 *   balls: one per ball, { ball, air, x, y, hand, value } with `hand` = -1 while in the air
 * Pass the result of the previous call as `scratch` to have its objects reused.
 */
export function sceneAt(pattern, timeline, t, scratch) {
  const scene = scratch || { hands: [null, null], balls: [], states: [] };
  const hands = scene.hands;
  hands[RIGHT] = handState(timeline, RIGHT, t, hands[RIGHT] || undefined);
  hands[LEFT] = handState(timeline, LEFT, t, hands[LEFT] || undefined);
  hands[RIGHT].holding = -1;
  hands[LEFT].holding = -1;
  const states = ballStates(pattern, t, scene.states);
  const balls = scene.balls;
  for (let i = 0; i < states.length; i++) {
    const b = states[i];
    let e = balls[i];
    if (e === undefined) e = balls[i] = { ball: 0, air: false, x: 0, y: 0, hand: -1, value: 0 };
    e.ball = b.ball;
    e.air = b.air;
    e.value = b.throw.value;
    if (b.air) {
      e.x = b.x;
      e.y = b.y;
      e.hand = -1;
    } else {
      const h = hands[b.hand];
      h.holding = b.ball;
      h.carrying = true; // also covers a hand that holds a 2 forever and so has no knots
      e.x = h.x;
      e.y = h.y;
      e.hand = b.hand;
    }
  }
  balls.length = states.length;
  return scene;
}

/**
 * The closed path a hand traces over one cycle, as `samples` points { x, y, carrying }.
 * Used to draw the faint guide loop under the ghost hands.
 */
export function handPath(timeline, hand, samples) {
  const n = samples || 96;
  const out = [];
  for (let k = 0; k <= n; k++) {
    const s = handState(timeline, hand, (k / n) * timeline.cycleTime);
    out.push({ x: s.x, y: s.y, carrying: s.carrying });
  }
  return out;
}
