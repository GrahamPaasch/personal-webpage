/**
 * governor.js: holds the frame rate. Pure (no three.js, no DOM).
 *
 * A headset that misses frames is worse than one that draws fewer trees, so when frames keep
 * coming late the picture is thinned, one step at a time: fewer of the forest's trees (which
 * are sorted so that any fraction of them is spread evenly), fewer leaves in the air, and in the
 * end no mirror images of the dragons in the lake. It never steps back up within a session: a
 * picture that breathes in and out is worse than either.
 */

/** What is drawn at each step. Step 0 is everything. */
export const QUALITY = [
  { forest: 1, leaves: 1, mirror: true },
  { forest: 0.8, leaves: 0.7, mirror: true },
  { forest: 0.62, leaves: 0.45, mirror: false },
  { forest: 0.45, leaves: 0.25, mirror: false },
];

/** Frames per judgement: two seconds at 72 a second. */
const WINDOW = 144;
/** Frames at least this long (seconds) are pauses, and are not judged. */
const PAUSE = 0.095;

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
    if (this.frames < WINDOW) return false;
    const mean = this.seconds / this.frames;
    const lateShare = this.late / this.frames;
    this.frames = 0;
    this.late = 0;
    this.seconds = 0;
    if (this.skip > 0) {
      this.skip--;
      return false;
    }
    // Slow on average, or too many single frames missed.
    const bad = mean > nominal * 1.12 || lateShare > 0.12;
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
