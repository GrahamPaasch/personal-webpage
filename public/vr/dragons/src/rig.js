/**
 * rig.js: a dragon's skeleton and how it moves. Pure (no three.js).
 *
 * Model frame: +z is forward (the nose), +y is up (the back), +x is the dragon's LEFT. Metres.
 * In the rest pose the dragon is stretched out straight with both wings spread flat, as in a
 * glide; every bone's rest rotation is the identity, so a bone is just a joint position and a
 * parent, and a pose is one small rotation per joint.
 *
 * What makes the flight read as alive, in order of importance:
 *   - the wing does not move as a board: elbow and wrist follow the shoulder late, so the tip
 *     trails behind the root on the way down and on the way up;
 *   - on the upstroke the wing folds (elbow in, hand swept back, fingers closing) and it opens
 *     flat for the downstroke;
 *   - the body rises on each downstroke, and neck and tail soak that up so the head stays level;
 *   - the spine curves into a turn, and the head looks where it is going (or at you).
 */

const DEG = Math.PI / 180;

export const BONE = {
  chest: 0, hips: 1,
  tail1: 2, tail2: 3, tail3: 4, tail4: 5, tail5: 6,
  neck1: 7, neck2: 8, neck3: 9, head: 10, jaw: 11,
  humerusL: 12, forearmL: 13, handL: 14, finger2L: 15, finger3L: 16,
  humerusR: 17, forearmR: 18, handR: 19, finger2R: 20, finger3R: 21,
  legL: 22, legR: 23, // the thighs (from the hip joint)
  shinL: 24, shinR: 25, // from the knee
  footL: 26, footR: 27, // from the ankle: the long bone of the foot, and the toes and talons on it
};
export const BONE_COUNT = 28;

/** Default proportions. All lengths are for scale 1: a dragon about 13.6 m from wingtip to wingtip. */
export const DEFAULT_BUILD = {
  scale: 1,
  neck: 1, // neck length
  tail: 1, // tail length
  wing: 1, // wing length
  bulk: 1, // body thickness
  horn: 1, // horn length
  legs: 'new', // 'new': thick hind legs with knees, feet and talons; 'old': the first, thin stalks
};

/**
 * Where the joints of a hind leg are in the rest pose (scale 1, the left leg; x is outward and
 * is multiplied by the build's bulk): standing, as a bird stands, the thigh forward and down to
 * the knee, the shin back and down to the ankle, the long foot down and a little forward to the
 * ball of the foot, where the toes spread. The flight tucks it all up from there (poseSkeleton).
 */
export const LEG = {
  hip: [0.42, -0.35, -0.9],
  knee: [0.6, -1.08, -0.36],
  ankle: [0.6, -1.98, -0.94],
  ball: [0.57, -2.52, -0.7],
};

/**
 * The skeleton for a build: joint positions (rest pose), parents, and the named points of the
 * wings that the geometry is hung on.
 */
export function makeSkeleton(build) {
  const b = Object.assign({}, DEFAULT_BUILD, build || {});
  const s = b.scale;
  const pos = new Array(BONE_COUNT);
  const parent = new Array(BONE_COUNT).fill(-1);
  const set = (i, p, x, y, z) => {
    pos[i] = [x * s, y * s, z * s];
    parent[i] = p;
  };
  set(BONE.chest, -1, 0, 0, 0.5);
  set(BONE.hips, BONE.chest, 0, 0, -0.3);
  const tailStep = 1.25 * b.tail;
  for (let i = 0; i < 5; i++) set(BONE.tail1 + i, i === 0 ? BONE.hips : BONE.tail1 + i - 1, 0, 0, -1.7 - tailStep * i);
  const n = b.neck;
  set(BONE.neck1, BONE.chest, 0, 0.25, 1.7);
  set(BONE.neck2, BONE.neck1, 0, 0.25 + 0.2 * n, 1.7 + 0.85 * n);
  set(BONE.neck3, BONE.neck2, 0, 0.25 + 0.37 * n, 1.7 + 1.7 * n);
  set(BONE.head, BONE.neck3, 0, 0.25 + 0.47 * n, 1.7 + 2.5 * n);
  set(BONE.jaw, BONE.head, 0, 0.08 + 0.47 * n, 1.7 + 2.6 * n);

  // Left wing, seen from above: the arm is a flat Z. Angles are measured from straight out (+x),
  // positive toward the tail.
  const w = b.wing;
  const dir = (deg, len) => [Math.cos(deg * DEG) * len * w, 0, -Math.sin(deg * DEG) * len * w];
  const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
  const shoulder = [0.55 * b.bulk, 0.5, 1.15];
  const elbow = add(shoulder, dir(25, 1.75));
  const wrist = add(elbow, dir(-20, 2.05));
  const tip1 = add(wrist, dir(28, 3.1));
  const tip2 = add(wrist, dir(62, 3.0));
  const tip3 = add(wrist, dir(100, 2.8));
  const wingL = { shoulder, elbow, wrist, tip1, tip2, tip3 };
  const mirror = (p) => [-p[0], p[1], p[2]];
  const wingR = {};
  for (const k of Object.keys(wingL)) wingR[k] = mirror(wingL[k]);
  for (const [side, o] of [[wingL, 0], [wingR, 5]]) {
    set(BONE.humerusL + o, BONE.chest, ...side.shoulder);
    set(BONE.forearmL + o, BONE.humerusL + o, ...side.elbow);
    set(BONE.handL + o, BONE.forearmL + o, ...side.wrist);
    set(BONE.finger2L + o, BONE.handL + o, ...side.wrist);
    set(BONE.finger3L + o, BONE.handL + o, ...side.wrist);
  }
  for (const [side, thigh, shin, foot] of [[1, BONE.legL, BONE.shinL, BONE.footL], [-1, BONE.legR, BONE.shinR, BONE.footR]]) {
    set(thigh, BONE.hips, side * LEG.hip[0] * b.bulk, LEG.hip[1], LEG.hip[2]);
    set(shin, thigh, side * LEG.knee[0] * b.bulk, LEG.knee[1], LEG.knee[2]);
    set(foot, shin, side * LEG.ankle[0] * b.bulk, LEG.ankle[1], LEG.ankle[2]);
  }

  const scalePoints = (wing) => {
    const out = {};
    for (const k of Object.keys(wing)) out[k] = [wing[k][0] * s, wing[k][1] * s, wing[k][2] * s];
    return out;
  };
  return { build: b, pos, parent, wingL: scalePoints(wingL), wingR: scalePoints(wingR), tailStep: tailStep * s };
}

// ---------------------------------------------------------------------------------------------
// 3x4 matrices: three rows of four numbers (rotation | translation), in one Float32Array per
// skeleton. This is also the layout the vertex shader reads.
// ---------------------------------------------------------------------------------------------

function setTranslation(m, o, x, y, z) {
  m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = x;
  m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = y;
  m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = z;
}

/** m[o] = m[p] * translate(x, y, z): a child joint in its parent's frame. */
function child(m, o, p, x, y, z) {
  for (let r = 0; r < 12; r += 4) {
    const a = m[p + r];
    const b = m[p + r + 1];
    const c = m[p + r + 2];
    m[o + r] = a;
    m[o + r + 1] = b;
    m[o + r + 2] = c;
    m[o + r + 3] = a * x + b * y + c * z + m[p + r + 3];
  }
}

/** Turn the frame m[o] about its own x axis (and so on): m = m * R. */
function turnX(m, o, a) {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let r = 0; r < 12; r += 4) {
    const y = m[o + r + 1];
    const z = m[o + r + 2];
    m[o + r + 1] = c * y + s * z;
    m[o + r + 2] = c * z - s * y;
  }
}
function turnY(m, o, a) {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let r = 0; r < 12; r += 4) {
    const x = m[o + r];
    const z = m[o + r + 2];
    m[o + r] = c * x - s * z;
    m[o + r + 2] = s * x + c * z;
  }
}
function turnZ(m, o, a) {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  for (let r = 0; r < 12; r += 4) {
    const x = m[o + r];
    const y = m[o + r + 1];
    m[o + r] = c * x + s * y;
    m[o + r + 1] = c * y - s * x;
  }
}

/** A pose with everything at rest: a level glide. Fill in what should differ. */
export function restPose() {
  return {
    flap: 0, // where in the wingbeat, radians: 0 = wings at the top, pi = at the bottom
    power: 0, // 0 gliding .. 1 beating as hard as it can
    tuck: 0, // 0 wings spread .. 1 swept back for a dive
    brake: 0, // 0 .. 1 wings held high and cupped to slow down
    turn: 0, // -1 .. 1: the spine curves into a turn (positive: to the dragon's left)
    arch: 0, // -1 .. 1: the spine curves up (positive) as it pulls out of a dive
    lookYaw: 0, // the head turns (radians, positive to its left)
    lookPitch: 0, // the head lifts (radians)
    jaw: 0, // 0 shut .. 1 wide open
    time: 0, // seconds, for the small idle movements
    // Off the wing (fetch.js): landing, standing, carrying.
    legs: 0, // 0 tucked up for flight .. 1 let down under it, to stand on
    reach: 0, // 0 .. 1 the feet thrust forward, to land or to strike
    crouch: 0, // 0 .. 1 knees bent: to spring, to put its head down to the ground
    hipPitch: 0, // radians: the body is pitched up this much, so the legs are turned back as much to stay upright
    fold: 0, // 0 .. 1 the wings folded at its sides, as it stands
    neckRaise: 0, // radians: the neck rises from the shoulders (the head is kept level)
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, f) => a + (b - a) * f;

/**
 * The legs' angles at the hip, the knee and the ankle (degrees, from the standing rest pose):
 * tucked for flight, and what reaching and crouching add. The old legs were one stalk swept back
 * along the tail; let down, they swing forward under the body, which is all they can do.
 */
const LEG_NEW = { tucked: [112, -52, 72], down: [0, 0, 0], reach: [-28, -6, -30], crouch: [-34, 58, -26] };
const LEG_OLD = { tucked: [0, 0, 0], down: [-70, 0, 0], reach: [-15, 0, 0], crouch: [-10, 0, 0] };
/**
 * The wings folded at its sides (degrees, added at full fold): found by search (the arm back
 * along the flank to the elbow, the forearm up and forward so the wrist stands by the shoulder,
 * the fingers back along the body), with the least turning that gets there.
 */
let FOLD = { lift: 26, sweep: 60, twist: -33, elbow: 104, wrist: 113, elbowDrop: 6, wristDrop: -13 };
/** (For finding FOLD: tools only.) */
export function __setFold(f) {
  FOLD = f;
}

/** The joints of the neck from the chest to the head, and the share of a look each one takes. */
const NECK = [BONE.neck1, BONE.neck2, BONE.neck3, BONE.head];
const NECK_SHARE = [0.2, 0.2, 0.2, 0.4];
/** How a raised neck is shared out: up from the shoulders, and the head tipped back down to level. */
const NECK_RAISE = [0.6, 0.4, -0.2, -0.8];

/**
 * Work out every bone for a pose.
 *   world: Float32Array(BONE_COUNT * 12), each joint's frame in model space
 *   skin:  Float32Array(BONE_COUNT * 12), what the vertex shader multiplies rest positions by
 * Returns skin.
 */
export function poseSkeleton(skeleton, pose, world, skin) {
  const { pos, parent } = skeleton;
  const th = pose.flap;
  const power = clamp(pose.power, 0, 1);
  const tuck = clamp(pose.tuck, 0, 1);
  const brake = clamp(pose.brake, 0, 1);
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  // 1 in the middle of the upstroke, 0 through the whole downstroke.
  const up = Math.pow(Math.max(-sin, 0), 1.3) * power;
  const t = pose.time;

  const place = (i) => {
    const o = i * 12;
    const p = parent[i];
    if (p < 0) setTranslation(world, o, pos[i][0], pos[i][1], pos[i][2]);
    else child(world, o, p * 12, pos[i][0] - pos[p][0], pos[i][1] - pos[p][1], pos[i][2] - pos[p][2]);
    return o;
  };

  // --- Body. The chest carries the wings; it rocks a little with each beat.
  let o = place(BONE.chest);
  turnX(world, o, (-2.5 * sin * power - 7 * brake + 3 * tuck) * DEG);
  o = place(BONE.hips);
  turnX(world, o, (3.5 * Math.cos(th - 1.0) * power + 5 * brake + 6 * pose.arch) * DEG);
  turnY(world, o, -5 * pose.turn * DEG);

  // --- Tail: a wave that runs down it after each beat, a slow idle sway, and the curve of the
  // turn. (The tail points along -z, so turning it toward the dragon's left is a negative
  // rotation about y, and lifting it is a positive rotation about x.)
  for (let i = 0; i < 5; i++) {
    o = place(BONE.tail1 + i);
    const lag = 1.0 + 0.6 * (i + 1);
    turnX(world, o, ((3 + i) * Math.cos(th - lag) * power + 7 * pose.arch + 2.5 * brake) * DEG);
    turnY(world, o, (-8 * pose.turn + (2.2 + 0.5 * i) * Math.sin(t * 1.15 - 0.8 * i)) * DEG);
  }

  // --- Neck and head. The neck undoes the chest's rocking and the heave of the body, and
  // carries most of a look to the side; the head finishes it.
  const raise = pose.neckRaise || 0;
  for (let i = 0; i < 4; i++) {
    o = place(NECK[i]);
    const settle = i < 3 ? (0.9 * sin * power + 2.4 * brake - 1.0 * tuck) * DEG : 0;
    turnY(world, o, pose.lookYaw * NECK_SHARE[i] + 6 * pose.turn * DEG * (i < 3 ? 1 : 0.6));
    turnX(world, o, -pose.lookPitch * NECK_SHARE[i] + settle - 5 * pose.arch * DEG * (i < 3 ? 1 : 0.5) + 1.2 * Math.sin(t * 0.7 + i) * DEG - raise * NECK_RAISE[i]);
  }
  o = place(BONE.jaw);
  turnX(world, o, clamp(pose.jaw, 0, 1) * 30 * DEG);

  // --- Wings. `side` is +1 for the left wing and -1 for the right: lifting the left wing is a
  // positive turn about z, lifting the right one a negative turn, and likewise for sweep.
  const amp = power;
  // Folded at its sides, standing: the arm drawn up and back along the body, forearm against
  // it, the hand folded back along the forearm and the fan of fingers shut, as a bat's.
  const fold = clamp(pose.fold || 0, 0, 1);
  // Shoulder: up and down, forward on the way down, leading edge down on the way down.
  const lift = (9 + 42 * cos) * amp + 6 * (1 - amp) * (1 - tuck) + 4 * tuck + 26 * brake + 1.5 * Math.sin(t * 0.9) * (1 - amp) + FOLD.lift * fold;
  const sweep = -13 * sin * amp + 22 * tuck - 6 * brake + FOLD.sweep * fold; // positive: swept back
  const twist = 15 * sin * amp - 12 * brake + 3 * tuck + FOLD.twist * fold;
  // Elbow and wrist: bend against the motion (the outer wing trails), fold on the way up.
  const elbowLag = 11 * sin * amp + FOLD.elbowDrop * fold;
  const wristLag = 20 * sin * amp - 16 * up + FOLD.wristDrop * fold;
  const elbowFold = 6 + 30 * up + 52 * tuck * (1 - fold) + 10 * brake + FOLD.elbow * fold;
  const wristFold = 8 + 50 * up + 80 * tuck * (1 - fold) + 4 * brake + FOLD.wrist * fold;
  const close = clamp(0.75 * up + 0.85 * tuck + fold, 0, 1); // the fingers of the fan close
  const flutter2 = 6 * Math.sin(th - 0.5) * amp;
  const flutter3 = 9 * Math.sin(th - 0.9) * amp;
  for (let w = 0; w < 2; w++) {
    const side = w === 0 ? 1 : -1;
    const k = w === 0 ? 0 : 5;
    o = place(BONE.humerusL + k);
    turnZ(world, o, side * lift * DEG);
    turnY(world, o, side * sweep * DEG);
    turnX(world, o, twist * DEG);
    o = place(BONE.forearmL + k);
    turnZ(world, o, side * elbowLag * DEG);
    turnY(world, o, -side * elbowFold * DEG);
    o = place(BONE.handL + k);
    turnZ(world, o, side * wristLag * DEG);
    turnY(world, o, side * wristFold * DEG);
    turnX(world, o, 0.5 * twist * DEG);
    o = place(BONE.finger2L + k);
    turnY(world, o, -side * 30 * close * DEG);
    turnZ(world, o, side * flutter2 * DEG);
    o = place(BONE.finger3L + k);
    turnY(world, o, -side * 62 * close * DEG);
    turnZ(world, o, side * flutter3 * DEG);
  }

  // --- Legs. In flight tucked up under the tail, swinging a little with the beat; let down to
  // land, thrust forward to reach, bent to crouch. (Each angle is a turn about the joint's x
  // axis: positive swings what hangs below it back toward the tail.)
  const legs = clamp(pose.legs || 0, 0, 1);
  const reach = clamp(pose.reach || 0, 0, 1);
  const crouch = clamp(pose.crouch || 0, 0, 1);
  const swing = (4 * Math.cos(th - 1.5) * power + 14 * brake * (1 - legs)) * DEG;
  const A = skeleton.build.legs === 'old' ? LEG_OLD : LEG_NEW;
  const thighA = lerp(A.tucked[0], A.down[0], legs) + A.reach[0] * reach + A.crouch[0] * crouch;
  const shinA = lerp(A.tucked[1], A.down[1], legs) + A.reach[1] * reach + A.crouch[1] * crouch;
  const footA = lerp(A.tucked[2], A.down[2], legs) + A.reach[2] * reach + A.crouch[2] * crouch;
  const hip = (pose.hipPitch || 0) * legs;
  for (let leg = 0; leg < 2; leg++) {
    const k = leg === 0 ? 0 : 1;
    // The two legs are not quite in step.
    const own = (leg === 0 ? 1 : -1) * 2.5 * Math.sin(t * 0.8) * DEG * (1 - legs);
    o = place(BONE.legL + k);
    turnX(world, o, thighA * DEG + swing + hip + own);
    o = place(BONE.shinL + k);
    turnX(world, o, shinA * DEG);
    o = place(BONE.footL + k);
    turnX(world, o, footA * DEG + 0.5 * swing);
  }

  // Skin matrix = joint frame * translate(-rest position).
  for (let i = 0; i < BONE_COUNT; i++) {
    const w = i * 12;
    const x = pos[i][0];
    const y = pos[i][1];
    const z = pos[i][2];
    for (let r = 0; r < 12; r += 4) {
      const a = world[w + r];
      const b = world[w + r + 1];
      const c = world[w + r + 2];
      skin[w + r] = a;
      skin[w + r + 1] = b;
      skin[w + r + 2] = c;
      skin[w + r + 3] = world[w + r + 3] - (a * x + b * y + c * z);
    }
  }
  return skin;
}

/**
 * Fill a pose from the state of a flyer (flight.js): what the picture shows of how it is
 * flying. `time` is the clock for the small idle movements. Returns the pose.
 */
export function poseFromFlyer(pose, f, time) {
  pose.flap = f.flap;
  pose.power = f.power;
  pose.tuck = f.tuck;
  // With the wings set for a glide past something (f.set) they are spread wide and nearly
  // flat, cupped only a little: the brake is on, but what is seen is a great still wing,
  // not one held high like a goose's coming down on water.
  pose.brake = f.brake * (1 - 0.6 * (f.set || 0));
  pose.turn = f.turn;
  pose.arch = f.arch;
  pose.lookYaw = f.lookYaw;
  pose.lookPitch = f.lookPitch;
  pose.jaw = f.jaw;
  pose.time = time;
  pose.legs = f.legs || 0;
  pose.reach = f.reach || 0;
  pose.crouch = f.crouch || 0;
  pose.hipPitch = f.hipPitch || 0;
  pose.fold = f.fold || 0;
  pose.neckRaise = f.neckRaise || 0;
  return pose;
}

/** How far the whole body rides up (metres, at scale 1) at this point of the beat. */
export function heave(pose) {
  return -0.3 * Math.cos(pose.flap - 0.45) * clamp(pose.power, 0, 1);
}

/**
 * How far below the body's origin the lowest of its feet is, as it is posed and pitched (nose
 * up by `pitch` radians) and with no bank: so that a dragon standing on something can be set
 * down with its feet on it, whatever its legs are doing. feet: [{ bone, p }] from buildDragon.
 * Call after poseSkeleton (this reads the skin it filled). Returns metres (positive: below).
 */
export function footDrop(skin, feet, pitch) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  let low = -Infinity;
  for (let i = 0; i < feet.length; i++) {
    skinPoint(skin, feet[i].bone, feet[i].p, TIP);
    // Nose up by pitch: a point forward (+z) rises, a point below drops back.
    const y = TIP[1] * c + TIP[2] * s;
    if (-y > low) low = -y;
  }
  return low;
}

/** Where a rest-pose point bound to one bone ends up (model space). */
export function skinPoint(skin, bone, p, out) {
  const o = bone * 12;
  out[0] = skin[o] * p[0] + skin[o + 1] * p[1] + skin[o + 2] * p[2] + skin[o + 3];
  out[1] = skin[o + 4] * p[0] + skin[o + 5] * p[1] + skin[o + 6] * p[2] + skin[o + 7];
  out[2] = skin[o + 8] * p[0] + skin[o + 9] * p[1] + skin[o + 10] * p[2] + skin[o + 11];
  return out;
}

/**
 * How near a flying dragon's wings come to a point (the viewer's head): the least distance, in
 * metres, from `point` to any of its six finger tips, with the dragon posed and placed as the
 * picture has it (dragons.js). The tests and tools/flysim.mjs fly hours with this, to know
 * how close a wing really comes; the page itself never asks.
 *
 *   skeleton       from makeSkeleton
 *   pose           as poseSkeleton takes it (flap, power, tuck, brake, ...)
 *   f              { x, y, z, heading, pitch, bank } from the flight
 *   world, skin    Float32Array(BONE_COUNT * 12) each, to work in
 */
export function wingReach(skeleton, pose, f, point, world, skin) {
  poseSkeleton(skeleton, pose, world, skin);
  const s = skeleton.build.scale;
  const rise = heave(pose) * s;
  // Heading turns about y, pitch lifts the nose, a bank to the left drops the left wing: the
  // same turns, in the same order, as the picture makes (three.js 'YXZ' of -pitch, heading, -bank).
  const cy = Math.cos(f.heading);
  const sy = Math.sin(f.heading);
  const cx = Math.cos(-f.pitch);
  const sx = Math.sin(-f.pitch);
  const cz = Math.cos(-f.bank);
  const sz = Math.sin(-f.bank);
  let least = Infinity;
  for (let w = 0; w < 2; w++) {
    const wing = w === 0 ? skeleton.wingL : skeleton.wingR;
    const k = w === 0 ? 0 : 5;
    const tips = [[wing.tip1, BONE.handL + k], [wing.tip2, BONE.finger2L + k], [wing.tip3, BONE.finger3L + k]];
    for (let t = 0; t < 3; t++) {
      skinPoint(skin, tips[t][1], tips[t][0], TIP);
      // About z, then x, then y; the body rides up along its own "up" on each downstroke.
      const x1 = TIP[0] * cz - (TIP[1] + rise) * sz;
      const y1 = TIP[0] * sz + (TIP[1] + rise) * cz;
      const y2 = y1 * cx - TIP[2] * sx;
      const z2 = y1 * sx + TIP[2] * cx;
      const x3 = x1 * cy + z2 * sy;
      const z3 = -x1 * sy + z2 * cy;
      const d = Math.hypot(f.x + x3 - point[0], f.y + y2 - point[1], f.z + z3 - point[2]);
      if (d < least) least = d;
    }
  }
  return least;
}
const TIP = [0, 0, 0];

