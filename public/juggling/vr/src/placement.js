/**
 * placement.js: where the pattern stands in the room, and grabbing it to move it (spec 35,
 * amendment 2026-11-20: "you should be able to drag the pattern over to exactly where you want
 * it"). Pure: plain numbers in, plain numbers out.
 *
 * Yaw convention (as in main.js and scene.js): yaw 0 faces -Z, positive turns left. Facing yaw,
 *   forward = (-sin yaw, -cos yaw)      right = (cos yaw, -sin yaw)      (as x, z)
 *
 * The anchor is { spotX, spotZ, yaw, handHeight, distance, eyeHeight }: the juggler stands at the
 * spot facing yaw, and the pattern's centre is `distance` in front of the spot at hand height.
 *
 * A placement is how the pattern sits relative to a base pose { x, z, yaw } (the person's head
 * when they came into VR, or pressed "recenter"): { right, forward, turn }, the spot `right` and
 * `forward` metres from the base in the base's own directions, and the pattern turned `turn`
 * radians from the base's heading. Being relative to the person, it means the same thing on the
 * next entry, whatever the headset's origin is then. Hand height is kept by the calibration.
 */

export const NO_PLACEMENT = Object.freeze({ right: 0, forward: 0, turn: 0 });

/** How far a saved placement may put the pattern from the person (metres). */
export const MAX_OFFSET = 3;

export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Rotate a horizontal vector (x, z) about the vertical axis by `a` (positive = turning left). */
export function rotate(x, z, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/** Heading (yaw) of a direction (x, z); NaN if it is too close to vertical to have one. */
export function headingOf(x, z) {
  return Math.hypot(x, z) < 0.25 ? NaN : Math.atan2(-x, -z);
}

/** World position of the pattern's centre (the anchor group's origin). */
export function centreOf(a) {
  return { x: a.spotX - Math.sin(a.yaw) * a.distance, y: a.handHeight, z: a.spotZ - Math.cos(a.yaw) * a.distance };
}

/** The spot that puts the pattern's centre at (x, z) facing `yaw`, `distance` in front. */
export function spotFor(x, z, yaw, distance) {
  return { spotX: x + Math.sin(yaw) * distance, spotZ: z + Math.cos(yaw) * distance };
}

/** The placement of an anchor relative to a base pose. */
export function placementFrom(base, a) {
  const d = rotate(a.spotX - base.x, a.spotZ - base.z, -base.yaw); // into the base's frame
  // In the base's frame forward is -z and right is +x.
  return { right: d.x, forward: -d.z, turn: wrapAngle(a.yaw - base.yaw) };
}

/** Spot and yaw for a placement relative to a base pose. */
export function applyPlacement(base, p) {
  const d = rotate(p.right, -p.forward, base.yaw);
  return { spotX: base.x + d.x, spotZ: base.z + d.z, yaw: wrapAngle(base.yaw + p.turn) };
}

/** A placement read back from storage: finite, and within reach; anything else is no placement. */
export function cleanPlacement(saved) {
  if (!saved || typeof saved !== 'object') return { ...NO_PLACEMENT };
  const ok = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!ok(saved.right) || !ok(saved.forward) || !ok(saved.turn)) return { ...NO_PLACEMENT };
  if (Math.hypot(saved.right, saved.forward) > MAX_OFFSET) return { ...NO_PLACEMENT };
  return { right: saved.right, forward: saved.forward, turn: wrapAngle(saved.turn) };
}

/**
 * Grabbing the pattern. `grab` is what was true when the grab took:
 *   { hand: { x, y, z, heading }, centre: { x, y, z }, yaw }
 * and `hand` is where the grabbing hand is now. The pattern moves as if held: it follows the
 * hand's movement, and turns about the vertical through the hand as the hand turns. A hand whose
 * heading cannot be read (pointing straight up or down) moves the pattern without turning it.
 * Returns the new centre { x, y, z } and yaw.
 */
export function dragTo(grab, hand) {
  let turn = 0;
  if (Number.isFinite(grab.hand.heading) && Number.isFinite(hand.heading)) turn = wrapAngle(hand.heading - grab.hand.heading);
  const d = rotate(grab.centre.x - grab.hand.x, grab.centre.z - grab.hand.z, turn);
  return {
    x: hand.x + d.x,
    y: grab.centre.y + (hand.y - grab.hand.y),
    z: hand.z + d.z,
    yaw: wrapAngle(grab.yaw + turn),
  };
}
