/**
 * governor.js: holds the frame rate. Pure (no three.js, no DOM).
 *
 * A headset that misses frames is worse than one that draws fewer trees, so when frames keep
 * coming late the page does less, one step at a time: the sound is driven the cheap way (plain
 * panning, no echo off the hills: that is processor time), fewer of the forest's trees are drawn
 * (they are sorted so that any fraction of them is spread evenly), fewer leaves in the air, and
 * in the end no mirror images of the dragons in the lake. It never steps back up within a
 * session: a picture that breathes in and out is worse than either.
 *
 * None of those steps makes the picture smaller, and pixels are what a Quest 1 runs out of
 * first. The size of the picture and its anti-aliasing cannot be changed while a session runs,
 * so those are changed between sessions: nextSession() looks at how the last one went and says
 * what the next one should start with, and the page remembers that.
 */

/**
 * What is drawn and heard at each step. Step 0 is everything. `air` is the see-through things
 * (the motes and sparks, the shafts of sunlight, the mist on the lake): they are what costs a
 * headset pixels rather than triangles, so they thin from the first step and are gone by the
 * last.
 */
export const QUALITY = [
  { forest: 1, leaves: 1, mirror: true, sound: 'full', air: 1 },
  { forest: 0.8, leaves: 0.7, mirror: true, sound: 'lite', air: 0.6 },
  { forest: 0.62, leaves: 0.45, mirror: false, sound: 'lite', air: 0.3 },
  { forest: 0.45, leaves: 0.25, mirror: false, sound: 'lite', air: 0 },
];

/** What each step gave up, in words, for the line about how a session went. */
export const QUALITY_WORDS = [
  'everything drawn',
  'simpler sound, a fifth of the forest left out, thinner mist and fewer motes',
  'two fifths of the forest and the dragons’ mirror images left out, little mist',
  'more than half the forest left out, and no mist, motes or shafts of sunlight',
];

/** Seconds per judgement. (A length of time, not a number of frames: a headset at half rate must not be given twice as long.) */
const WINDOW = 2;
/** Frames at least this long (seconds) are pauses, and are not judged. */
const PAUSE = 0.095;
/** A window is bad if it ran this much slower than asked on average, or if this share of its frames came late. */
const SLOW = 1.12;
const LATE_SHARE = 0.07;

export class Governor {
  constructor(steps) {
    this.steps = steps === undefined ? QUALITY.length : steps;
    this.reset();
  }

  /** A new session: back to everything, with a clean record. */
  reset(level) {
    this.level = level || 0;
    this.frames = 0;
    this.late = 0;
    this.seconds = 0;
    this.strikes = 0;
    this.skip = 1; // windows still to ignore: shaders compile and things settle at the start
    this.history = [];
  }

  /**
   * One frame took `dt` seconds where `nominal` was wanted. Returns true when the level has
   * just gone up (the caller applies QUALITY[level]).
   */
  frame(dt, nominal) {
    if (!(dt > 0) || !(nominal > 0)) return false;
    // A tenth of a second or more is not a slow frame, it is a pause: the page was in the
    // background, a menu was up, something was compiling. It says nothing about the picture.
    if (dt >= PAUSE) return false;
    this.frames++;
    this.seconds += dt;
    if (dt > nominal * 1.5) this.late++;
    if (this.seconds < WINDOW) return false;
    const mean = this.seconds / this.frames;
    const lateShare = this.late / this.frames;
    this.frames = 0;
    this.late = 0;
    this.seconds = 0;
    if (this.skip > 0) {
      this.skip--;
      return false;
    }
    // Slow on average, or too many single frames missed: one frame in fourteen is five
    // stutters a second, and that is seen.
    const bad = mean > nominal * SLOW || lateShare > LATE_SHARE;
    this.history.push({ mean, lateShare, bad, level: this.level });
    if (this.history.length > 30) this.history.shift();
    if (!bad) {
      this.strikes = Math.max(0, this.strikes - 1);
      return false;
    }
    this.strikes++;
    if (this.strikes < 2 || this.level >= this.steps - 1) return false;
    this.level++;
    this.strikes = 0;
    this.skip = 1;
    return true;
  }
}

/** The sizes the VR picture is tried at, as a fraction of the headset's own, and the least it is ever made. */
const SCALES = [1, 0.8, 0.65];

/**
 * What the next VR session should start with, from how the last one went.
 *
 * memory: { scale: size of the picture (1 = the headset's own), aa: anti-aliasing on? } as it
 * was for the session that just ended. report: { seconds, fps, target, late (share of frames),
 * level (the step the governor reached) }.
 *
 * A session that went badly (it ended two steps down, or a tenth of its frames came late, or it
 * ran at under 85% of the rate asked for) makes the next one cheaper in pixels: first a smaller
 * picture (0.8: a third fewer pixels), then no anti-aliasing, then a smaller picture again. A
 * session that went well changes nothing, and nothing is ever put back by itself.
 *
 * Returns { scale, aa, change: '' | 'scale' | 'aa', words: what will be different, for the person }.
 */
export function nextSession(memory, report) {
  const scale = memory && memory.scale > 0 ? memory.scale : 1;
  const aa = !memory || memory.aa !== false;
  const same = { scale, aa, change: '', words: '' };
  if (!report || !(report.seconds >= 20)) return same;
  const poor = report.level >= 2 || report.late > 0.1 || report.fps < report.target * 0.85;
  if (!poor) return same;
  const at = SCALES.findIndex((s) => s <= scale + 1e-6);
  // The first remedy is a smaller picture; the second, no anti-aliasing; the third, smaller again.
  if (at === 0) return { scale: SCALES[1], aa, change: 'scale', words: 'Next time the picture will be drawn at ' + SCALES[1] + ' of full size, which is a third fewer pixels.' };
  if (aa) return { scale, aa: false, change: 'aa', words: 'Next time (after the page is loaded again) the picture will be drawn without anti-aliasing.' };
  if (at === 1) return { scale: SCALES[2], aa, change: 'scale', words: 'Next time the picture will be drawn at ' + SCALES[2] + ' of full size.' };
  return { scale, aa, change: '', words: 'There is nothing left to make cheaper: this headset cannot hold the rate with this page.' };
}
