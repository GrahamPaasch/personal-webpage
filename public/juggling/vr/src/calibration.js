/**
 * calibration.js: the decisions of calibration, as pure functions (no DOM, no three.js), so that
 * they are unit tested: what a trigger pull records, when a remembered calibration may be used
 * again, and how a palm nudge moves the pattern.
 *
 * None of this is physics. The math only cares about height above the hands; calibration decides
 * where in the room the hands are.
 *
 * Frames. World: y up, metres. A heading ("yaw") is the angle about the vertical axis, 0 = facing
 * -Z, positive = turned to the left. The pattern frame is the world turned by the pattern's yaw:
 * +x is the juggler's right, +y is up, -z is straight ahead of the juggler.
 *
 * Palm frame (the WebXR grip space, or its equivalent built from hand joints): the back of the
 * right hand faces +X and the back of the left hand faces -X, +Y points back toward the wrist and
 * -Z points toward the thumb.
 */

export const RIGHT = 0;
export const LEFT = 1;

/**
 * Where the pattern sits before anyone calibrates. Placeholders for a standing adult; calibration
 * and the sliders replace them.
 */
export const DEFAULT_PLACEMENT = { handHeight: 1.05, distance: 0.35, eyeHeight: 1.65 };

/** In VR, before calibration, the hands are guessed this far below the head. */
export const HAND_BELOW_EYES = 0.6;

export const HAND_HEIGHT_RANGE = [0.1, 1.9]; // metres above the floor (low enough for sitting on a bed)
export const DISTANCE_RANGE = [0.15, 0.8]; // metres in front of the head
export const NUDGE_RANGE = 0.06; // metres either way, each axis

/**
 * A remembered calibration is used again only if the head is within this much of the eye height
 * it was made at. Sitting and standing differ by 35 cm or more; a head that is tilted or a little
 * slouched differs by a few centimetres. A threshold chosen between the two, not a measurement.
 */
export const POSTURE_TOLERANCE = 0.1;

const clamp = (v, range) => Math.min(Math.max(v, range[0]), range[1]);

export function clampHandHeight(v) {
  return clamp(v, HAND_HEIGHT_RANGE);
}

export function clampDistance(v) {
  return clamp(v, DISTANCE_RANGE);
}

export function clampNudge(v) {
  return Math.min(Math.max(v, -NUDGE_RANGE), NUDGE_RANGE);
}

/** May a remembered calibration be used for a head at this height? */
export function fitsPosture(saved, headHeight) {
  return (
    !!saved && saved.done === true && Number.isFinite(saved.eyeHeight) && Number.isFinite(headHeight) &&
    Math.abs(headHeight - saved.eyeHeight) <= POSTURE_TOLERANCE
  );
}

/** A first guess for someone who has not calibrated in this posture. It is shown, never saved. */
export function provisionalPlacement(headHeight) {
  return {
    handHeight: clampHandHeight(headHeight - HAND_BELOW_EYES),
    distance: DEFAULT_PLACEMENT.distance,
  };
}

/**
 * What a trigger pull records.
 *
 * `sample` = { head: {x,y,z}, headYaw, palms: [right, left], frames: [right, left], trackable }
 *   palms      world position of each palm point, or null if that hand is not tracked now;
 *   frames     world orientation of each palm frame as a quaternion [x, y, z, w], or null;
 *   trackable  false if this device has nothing that could ever give a palm (a phone in a
 *              cardboard viewer, for instance).
 *
 * Both palms are needed: with one hand the pattern would be centred on that hand, and both its
 * distance from the body and the way it faces would be wrong.
 *
 * Returns { ok: false, reason } with reason 'untrackable', 'both', 'right' or 'left' (which hand
 * is missing), or
 *   { ok: true, spotX, spotZ, eyeHeight, yaw, handHeight, distance, frames }
 * where the juggler's spot is under the head, the pattern faces from the head toward the point
 * midway between the palms, and `frames` are the palm frames turned into the pattern frame (kept
 * for nudgeShift).
 */
export function measure(sample) {
  if (!sample || !sample.head) return { ok: false, reason: 'both' };
  if (sample.trackable === false) return { ok: false, reason: 'untrackable' };
  const right = sample.palms ? sample.palms[RIGHT] : null;
  const left = sample.palms ? sample.palms[LEFT] : null;
  if (!right && !left) return { ok: false, reason: 'both' };
  if (!right) return { ok: false, reason: 'right' };
  if (!left) return { ok: false, reason: 'left' };

  const mx = (right.x + left.x) / 2;
  const my = (right.y + left.y) / 2;
  const mz = (right.z + left.z) / 2;
  const dx = mx - sample.head.x;
  const dz = mz - sample.head.z;
  const out = Math.hypot(dx, dz);
  // Hands held right under the chin give no direction: face the way the head faces.
  const yaw = out > 0.08 ? Math.atan2(-dx, -dz) : sample.headYaw || 0;

  let frames = null;
  if (sample.frames && sample.frames[RIGHT] && sample.frames[LEFT]) {
    const undo = [0, Math.sin(-yaw / 2), 0, Math.cos(-yaw / 2)]; // world -> pattern frame
    frames = [multiply(undo, sample.frames[RIGHT]), multiply(undo, sample.frames[LEFT])];
  }
  return {
    ok: true,
    spotX: sample.head.x,
    spotZ: sample.head.z,
    eyeHeight: sample.head.y,
    yaw,
    handHeight: clampHandHeight(my),
    distance: clampDistance(out),
    frames,
  };
}

/** Where the palm point sits in its palm frame, for one hand and one set of nudges. */
export function nudgeOffset(side, nudge) {
  const toPalm = side === RIGHT ? -1 : 1; // out of the palm is -X on the right hand, +X on the left
  return [toPalm * nudge.palm, nudge.wrist, -nudge.thumb];
}

/**
 * How far the point midway between the palms moves when the nudges change from `before` to
 * `after`, with the hands held as they were at calibration (`frames`, from measure()).
 * Returns { up, out }: metres up, and metres further from the body. The pattern is moved by the
 * same amounts, so the place a ball lands stays in the palm. (Sideways the pattern stays centred
 * on the juggler: mirrored hands cancel there.)
 */
export function nudgeShift(frames, before, after) {
  if (!frames || !frames[RIGHT] || !frames[LEFT]) return { up: 0, out: 0 };
  let y = 0;
  let z = 0;
  for (const side of [RIGHT, LEFT]) {
    const a = nudgeOffset(side, after);
    const b = nudgeOffset(side, before);
    const moved = rotate(frames[side], [a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
    y += moved[1] / 2;
    z += moved[2] / 2;
  }
  return { up: y, out: -z };
}

/** Quaternion product a * b ([x, y, z, w]): b's rotation first, then a's. */
export function multiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Rotate vector v by unit quaternion q. */
export function rotate(q, v) {
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];
  // t = 2 q_xyz x v ;  v' = v + w t + q_xyz x t
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

/**
 * Read a remembered calibration back from storage, trusting nothing: anything that is not a
 * sensible number falls back to the default, and a calibration without a real eye height (the
 * floor is at 0) does not count as one.
 */
export function restoreCalibration(saved) {
  const s = saved || {};
  const number = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const eye = number(s.eyeHeight, DEFAULT_PLACEMENT.eyeHeight);
  const frames =
    Array.isArray(s.frames) && s.frames.length === 2 && s.frames.every((q) => Array.isArray(q) && q.length === 4 && q.every(Number.isFinite))
      ? s.frames
      : null;
  return {
    done: s.calibrated === true && eye > 0,
    handHeight: clampHandHeight(number(s.handHeight, DEFAULT_PLACEMENT.handHeight)),
    distance: clampDistance(number(s.distance, DEFAULT_PLACEMENT.distance)),
    eyeHeight: eye > 0 ? eye : DEFAULT_PLACEMENT.eyeHeight,
    frames,
    palmChecked: s.palmChecked === true,
  };
}
