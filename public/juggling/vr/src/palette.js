/**
 * palette.js: the colours a ball is drawn in, indexed by GRADE in accuracy.js. Pure, no three.js.
 *
 * Two palettes, the same judging behind both:
 *
 *   NORMAL      white, then green / yellow / red for a thrown ball.
 *   COLORBLIND  the "colorblind" toggle. Red-green colour blindness makes the normal green, yellow
 *               and red hard to tell apart, so here each grade is told twice: by a hue from the
 *               Okabe-Ito set (blue and orange, which stay apart for protan, deutan and tritan
 *               types), and by brightness, so it reads with no colour vision at all:
 *                 unjudged  mid-gray (never confused with a good throw)
 *                 good      bright glowing sky blue, the brightest
 *                 ok        dim orange, darker than the gray
 *                 bad       dark, the darkest, with a thin white outline so it never disappears
 *                           against the dark background
 *
 * `intensity` is the emissive intensity (the emissive colour is the colour itself). A high one
 * makes a ball glow: it stays bright on the side away from the light. The colorblind toggle is
 * never remembered: every launch starts in the normal palette.
 */

/** @typedef {{ color: number, intensity: number, outline?: boolean }} BallLook */

/** @type {readonly BallLook[]} */
export const NORMAL = Object.freeze([
  { color: 0xffffff, intensity: 0.22 },
  { color: 0x35d45f, intensity: 0.45 },
  { color: 0xffd21f, intensity: 0.45 },
  { color: 0xff3b3b, intensity: 0.45 },
]);

/** @type {readonly BallLook[]} */
export const COLORBLIND = Object.freeze([
  { color: 0x8c8c8c, intensity: 0.12 }, // unjudged: neutral mid-gray
  { color: 0x56b4e9, intensity: 0.9 }, // good: Okabe-Ito sky blue, glowing
  { color: 0x845200, intensity: 0.1 }, // ok: Okabe-Ito orange (#e69f00), dimmed
  { color: 0x2a1608, intensity: 0, outline: true }, // bad: Okabe-Ito vermillion (#d55e00), nearly black
]);

/** The outline around a "bad" ball in the colorblind palette: white, this many ball radii out. */
export const OUTLINE_COLOR = 0xffffff;
export const OUTLINE_SCALE = 1.14;
