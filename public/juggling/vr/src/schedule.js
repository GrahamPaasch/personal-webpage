/**
 * schedule.js: the one clock, and which sound events are due. Pure (no DOM, no audio), so the
 * rules that keep slow motion honest and every sound single are unit tested.
 */

import { eventsBetween } from './physics.js';

/**
 * The one clock. Simulation time advances by (real time x speed) and nothing else depends on the
 * speed: gravity, flight times and heights are functions of simulation time only, so slow motion
 * shows exactly the same arcs, later.
 */
export function advanceClock(simTime, realSeconds, speed) {
  return simTime + realSeconds * speed;
}

/** The speeds on offer: 0.1x to 1x in steps of 0.01. Never faster than real time. */
export function clampSpeed(value) {
  const v = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(v)) return 1;
  return Math.min(Math.max(v, 0.1), 1);
}

const NONE = Object.freeze([]);

/**
 * Hands each sound event to the audio clock once, a little ahead of time.
 *
 * `horizon` is the simulation time up to which events have been handed over. Each frame the
 * events between it and (now + lookahead) are due. When the speed or the pattern changes, the
 * sounds that have not started are cancelled and scheduled afresh; restart() is told which had
 * already started, so that none of them is handed over (and heard) a second time.
 */
export class SoundSchedule {
  /** `lookahead`: seconds of real time handed over ahead of now. */
  constructor(lookahead) {
    this.lookahead = lookahead;
    this.horizon = 0;
    this.started = -Infinity; // the latest simulation time of a sound known to have started
    this.quietUntil = -Infinity; // no event can fall between the horizon and this time
    this.info = { next: 0 };
  }

  /**
   * Start again from simulation time `simTime`: sound just came on, or the speed or the pattern
   * changed. `kept` is what SoundBoard.cancelPending() returned, the simulation time of the
   * latest sound that had already started (-Infinity if none).
   *
   * That time is remembered across restarts: after slowing down, a sound that has started can
   * stay ahead of the clock for a long while, through any number of further changes.
   */
  restart(simTime, kept) {
    if (kept > this.started) this.started = kept;
    this.horizon = this.started > simTime ? this.started : simTime;
    this.quietUntil = -Infinity;
  }

  /**
   * The events to hand over now: those later than the horizon and no later than `lookahead` of
   * real time from now. Returns an empty list on most frames, without looking at the pattern.
   */
  due(pattern, simTime, speed) {
    const horizon = simTime + this.lookahead * speed;
    if (!(horizon > this.horizon)) return NONE;
    if (horizon < this.quietUntil) {
      this.horizon = horizon;
      return NONE;
    }
    // After a stall (a hidden tab) skip what was missed instead of playing it late in a burst.
    const from = Math.max(this.horizon, simTime - 0.02);
    const events = eventsBetween(pattern, from, horizon, this.info);
    this.horizon = horizon;
    this.quietUntil = this.info.next;
    return events;
  }
}
