/**
 * fetch.js: playing fetch with the two dragons. Pure (no three.js): the page drives it, and the
 * tests and tools/fetchsim.mjs play it for hours.
 *
 * The ball is a glowing amber orb a metre across that rests on the rock beside the viewer. Pick
 * it up (grip), throw it (let go of the grip) off the ledge over the valley, and both dragons
 * race for it: Tarn, the small quick one, tends to win the short throws, Ember, the big one, the
 * long dives. One that can reach it in the air takes it in the air. One that cannot follows it
 * down:
 *   - into the lake: a splash, the ball floats and glows, and the dragon comes down over it,
 *     beats at the water and scoops it out;
 *   - onto open ground: it lands, breathes fire at the sky (for joy: the trees do not burn),
 *     and picks the ball up;
 *   - into the trees, or onto the side of a hill: it hovers down and plucks it out.
 * Then it brings it back, one of two ways (the A button switches):
 *   - exercise (the first): it glides past the ledge and tosses the ball so that it rolls to a
 *     stop at the viewer's feet. Every throw is a squat to pick it up and a full throw;
 *   - perch: it lands on the rock spire beside the ledge, turns, swings its head over to chest
 *     height, and the viewer takes the ball out of its jaws.
 * Between throws the two circle close in front of the ledge, heads following the ball like
 * eager dogs, so that a lob can be snatched as they go by. Left too long, they get bored and go
 * back to flying the valley as before, until the ball is picked up (or held up) again. Swing
 * without letting go and both lunge after nothing, pull up, and look back, a little betrayed.
 * If anything goes wrong, a fresh ball is in the viewer's hand after twenty seconds.
 *
 * There is no score and nothing is counted: it is fetch.
 *
 * The director (flight.js) still flies the dragons; this tells it what each is doing when it is
 * playing: a point to chase and a speed (the flight model does the rest), or, off the wing
 * (landing, standing, hovering over the water), exactly where it is and how it is posed.
 */

import { ground, lakeDistance, LAKE_LEVEL, forestDensity, canopyHeight, slopeAt } from './world.js';
import { makeSkeleton, poseSkeleton, restPose, poseFromFlyer, skinPoint, footDrop, heave, BONE, BONE_COUNT } from './rig.js';
import { footPoints } from './dragonGeometry.js';
import { clamp, lerp, smoothstep } from './rng.js';

const G = 9.81;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** The ball: a metre across. */
export const BALL_RADIUS = 0.5;
/** Where it rests at the start, on the rock beside the viewer (x, z; it sits on the rock). */
export const REST_SPOT = [0.75, -0.55];
/**
 * The rock spire beside the ledge, front right, that a dragon perches on to hand the ball
 * back: x, z, the height of its top, and its radius there. Near enough for the big one's neck
 * to reach the viewer's chest from it; its top is below the rim of the ledge, so the dragon
 * stands a little lower than the viewer and reaches up and over.
 */
export const SPIRE = { x: 5.5, z: -5.9, top: -2.3, radius: 2.3 };
/** Seconds of nothing happening before the two lose interest and go back to the valley. */
export const BORED_SECONDS = 45;
/** Seconds a loose ball can lie with nobody going for it before a fresh one is in the hand. */
export const SAFETY_SECONDS = 20;
/** How far off a hand can be from the middle of the ball and still take it (metres). */
export const REACH = BALL_RADIUS + 0.3;
/**
 * The two circle here between throws: a ring in front of the ledge, its near side 24 m out
 * and a few metres below the viewer's eyes. [x, y, z] of its middle, and its radius.
 */
export const RING = { x: 0, y: -6, z: -53, radius: 29 };

/**
 * How fast the ball leaves the hand for a hand moving this fast (m/s): about four times as fast
 * at the speeds a hand moves throwing in a headset (3 to 6 m/s at the controller), easing off
 * above that, so that a soft lob drops close in front of the ledge, an easy throw lands 40 to
 * 70 m out, and a hard one (8 to 10 m/s at the hand) sails 80 to 100 m out over the valley and
 * into the lake. Nobody's throw goes much further than that.
 */
export function throwSpeed(hand) {
  const h = Math.max(hand, 0);
  return Math.min((4 * h) / Math.sqrt(1 + (h / 9) * (h / 9)), 32);
}

// ---------------------------------------------------------------------------------------------
// The ball
// ---------------------------------------------------------------------------------------------

/**
 * States: 'rest' on the ledge (where a hand can reach it), 'held' in a hand, 'flying',
 * 'rolling', 'ground' (lying still off the ledge), 'floating' on the lake, 'trees' (falling
 * through a crown), 'carried' in a dragon's mouth, 'offered' (in the jaws of a perched dragon),
 * 'lost' (off the world: never, but if it ever is, a fresh one comes at once).
 */
export class Ball {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.state = 'rest';
    this.age = 0; // seconds in this state
    this.hand = ''; // which hand holds it
    this.owner = -1; // the dragon whose mouth it is in
    this.home = false; // tossed back by a dragon: it is to come to rest at the viewer's feet
    this.target = [0, 0, 0]; // ... here
    this.spin = 0; // how far it has turned (radians), for the picture
    this.fresh = 1; // 0 .. 1 as a fresh ball appears
    this.place(REST_SPOT[0], REST_SPOT[1]);
  }

  /** Put it at rest on the ground at x, z. */
  place(x, z) {
    this.x = x;
    this.z = z;
    this.y = ground(x, z) + BALL_RADIUS;
    this.vx = this.vy = this.vz = 0;
    this.set('rest');
  }

  set(state) {
    if (state !== this.state) this.age = 0;
    this.state = state;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }

  /** Is it loose out there, with nobody holding it and not where the viewer can reach it? */
  get loose() {
    return this.state === 'flying' || this.state === 'rolling' || this.state === 'ground' || this.state === 'floating' || this.state === 'trees' || this.state === 'lost';
  }

  /**
   * One step of its own motion (in the air, rolling, floating). events: where to put what is
   * heard ('bounce', 'splash', 'rustle'). head: where the viewer's head is (the ledge).
   */
  step(dt, events) {
    this.age += dt;
    const s = this.state;
    if (s === 'flying' || s === 'trees') this.fly(dt, events);
    else if (s === 'rolling') this.roll(dt, events);
    else if (s === 'floating') this.float(dt);
    if (!(Math.abs(this.x) < 1200 && Math.abs(this.z) < 1200 && this.y > -200 && this.y < 600) || Number.isNaN(this.x + this.y + this.z)) {
      this.vx = this.vy = this.vz = 0;
      this.set('lost');
    }
    const v = Math.hypot(this.vx, this.vz);
    this.spin += (v / BALL_RADIUS) * dt;
  }

  fly(dt, events) {
    // A little air drag (none on the gentle toss home, which is aimed).
    const v = this.speed;
    const drag = this.home ? 0 : 0.0019 * v;
    const thick = this.state === 'trees' ? 2.6 : 0; // through a crown: twigs and leaves
    const k = Math.exp(-(drag + thick) * dt);
    this.vx *= k;
    this.vz *= k;
    this.vy = this.vy * k - G * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    // Into the lake.
    if (this.y - BALL_RADIUS * 0.4 < LAKE_LEVEL && lakeDistance(this.x, this.z) < 0) {
      events.push({ type: 'splash', x: this.x, y: LAKE_LEVEL, z: this.z, size: clamp(-this.vy / 18, 0.3, 1.2) });
      this.y = LAKE_LEVEL + 0.1;
      this.vx *= 0.2;
      this.vz *= 0.2;
      this.vy = 0;
      this.home = false;
      this.set('floating');
      return;
    }
    // Into the crown of a tree.
    if (this.state === 'flying' && forestDensity(this.x, this.z) > 0.42) {
      const top = canopyHeight(this.x, this.z);
      const floor = ground(this.x, this.z);
      if (this.y < top - 1 && this.y > floor + 3) {
        events.push({ type: 'rustle', x: this.x, y: this.y, z: this.z, size: 1 });
        this.set('trees');
      }
    }
    // The ground (or the rock of the ledge).
    const h = ground(this.x, this.z);
    if (this.y - BALL_RADIUS < h) {
      this.normal(this.x, this.z, N);
      this.y = h + BALL_RADIUS;
      const vn = this.vx * N[0] + this.vy * N[1] + this.vz * N[2];
      if (vn < 0) {
        const rock = h > -4 || slopeAt(this.x, this.z) > 0.8;
        // Tossed home onto the ledge: it lands with a thud, a small hop, and rolls the rest.
        const homing = this.home && Math.hypot(this.x - this.target[0], this.z - this.target[2]) < 3;
        const bounce = homing ? 0.18 : rock ? 0.38 : 0.26;
        if (homing) {
          this.vx *= 0.45;
          this.vz *= 0.45;
        }
        this.vx -= (1 + bounce) * vn * N[0];
        this.vy -= (1 + bounce) * vn * N[1];
        this.vz -= (1 + bounce) * vn * N[2];
        // Some of the way along goes too, at every bounce.
        const keep = rock ? 0.82 : 0.68;
        const tn = this.vx * N[0] + this.vy * N[1] + this.vz * N[2];
        this.vx = (this.vx - tn * N[0]) * keep + tn * N[0];
        this.vy = (this.vy - tn * N[1]) * keep + tn * N[1];
        this.vz = (this.vz - tn * N[2]) * keep + tn * N[2];
        if (-vn > 1.2) events.push({ type: 'bounce', x: this.x, y: this.y, z: this.z, size: clamp(-vn / 12, 0.1, 1), rock });
        if (-vn < 2.2 || (homing && this.age > 0.2)) this.set('rolling');
        else if (this.state === 'trees') this.set('flying');
      }
    }
  }

  roll(dt, events) {
    this.normal(this.x, this.z, N);
    const steep = Math.sqrt(1 - N[1] * N[1]); // sine of the slope
    // Down the slope (gravity along the ground), with rolling resistance against the way it goes.
    const ax = G * N[1] * N[0];
    const az = G * N[1] * N[2];
    const v = Math.hypot(this.vx, this.vz);
    const rock = this.y > -4;
    const resist = (rock ? 0.5 : 1.1) + 0.6 * v;
    let fx = 0;
    let fz = 0;
    if (v > 1e-4) {
      fx = (-this.vx / v) * resist;
      fz = (-this.vz / v) * resist;
    }
    this.vx += (ax + fx) * dt;
    this.vz += (az + fz) * dt;
    const homing = this.home && Math.hypot(this.x - this.target[0], this.z - this.target[2]) < 3.5;
    if (homing) {
      // Tossed home: it settles where it was meant to (as if in a hollow of the rock there).
      const tx = this.target[0] - this.x;
      const tz = this.target[2] - this.z;
      this.vx += (tx * 4 - this.vx * 3.2) * dt;
      this.vz += (tz * 4 - this.vz * 3.2) * dt;
    }
    // Stopped: friction holds it, if the ground is not too steep for that.
    if (Math.hypot(this.vx, this.vz) < 0.12 && steep < 0.42) {
      this.vx = this.vz = 0;
      this.vy = 0;
      this.y = ground(this.x, this.z) + BALL_RADIUS;
      const onLedge = Math.hypot(this.x, this.z) < 3.4 && this.y > -1.5;
      this.home = false;
      this.set(onLedge ? 'rest' : 'ground');
      return;
    }
    const was = ground(this.x, this.z);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const h = ground(this.x, this.z);
    // Off an edge: if the ground drops away faster than the ball can follow it, it is in the air.
    const fall = was - h;
    const speed = Math.hypot(this.vx, this.vz);
    if (!homing && fall > 0.05 && fall > (speed * dt) * 0.9 + 0.5 * G * dt * dt * 4) {
      this.vy = -fall / dt * 0.3;
      this.set('flying');
      return;
    }
    this.vy = (h + BALL_RADIUS - this.y) / dt;
    this.y = h + BALL_RADIUS;
    if (lakeDistance(this.x, this.z) < -0.5) {
      events.push({ type: 'splash', x: this.x, y: LAKE_LEVEL, z: this.z, size: 0.3 });
      this.home = false;
      this.y = LAKE_LEVEL + 0.1;
      this.vy = 0;
      this.set('floating');
    }
  }

  float(dt) {
    // It bobs, and drifts a little on the breeze.
    const k = Math.exp(-dt * 0.9);
    this.vx = this.vx * k + 0.04 * dt;
    this.vz = this.vz * k + 0.02 * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y = LAKE_LEVEL + 0.1 + 0.05 * Math.sin(this.age * 2.1);
    if (lakeDistance(this.x, this.z) > -2) {
      // Washed against the shore: it stays there, in the shallows.
      this.vx = this.vz = 0;
    }
  }

  /** The ground's normal at x, z (unit). */
  normal(x, z, out) {
    const e = 0.6;
    const dx = ground(x + e, z) - ground(x - e, z);
    const dz = ground(x, z + e) - ground(x, z - e);
    const nx = -dx / (2 * e);
    const nz = -dz / (2 * e);
    const l = Math.hypot(nx, 1, nz);
    out[0] = nx / l;
    out[1] = 1 / l;
    out[2] = nz / l;
    return out;
  }
}
const N = [0, 1, 0];

/**
 * Where a ball thrown from p with velocity v goes: samples of its flight every `step` seconds
 * until it lands (or `seconds` run out). Each is [t, x, y, z, how it ended: 0 still flying,
 * 1 ground, 2 lake, 3 trees]. Returns how many samples were written into `out` (an array of
 * arrays, reused).
 */
export function predict(p, v, out, seconds, step) {
  const b = PROBE;
  b.x = p[0];
  b.y = p[1];
  b.z = p[2];
  b.vx = v[0];
  b.vy = v[1];
  b.vz = v[2];
  b.state = 'flying';
  b.home = false;
  b.age = 0;
  const events = PROBE_EVENTS;
  let n = 0;
  const sub = 3;
  for (let t = 0; t <= seconds + 1e-9 && n < out.length; t += step) {
    const o = out[n++];
    o[0] = t;
    o[1] = b.x;
    o[2] = b.y;
    o[3] = b.z;
    o[4] = b.state === 'flying' ? 0 : b.state === 'floating' ? 2 : b.state === 'trees' ? 3 : 1;
    if (o[4] !== 0) break;
    events.length = 0;
    for (let k = 0; k < sub; k++) b.fly(step / sub, events);
  }
  return n;
}
const PROBE = new Ball();
const PROBE_EVENTS = [];

// ---------------------------------------------------------------------------------------------
// Where a dragon's mouth is
// ---------------------------------------------------------------------------------------------

/**
 * A dragon's own skeleton, to work out where its mouth is (and its feet) as it is posed: the
 * ball in its jaws goes where the mouth goes.
 */
class Body {
  constructor(spec) {
    this.build = Object.assign({}, spec.build);
    this.skeleton = makeSkeleton(this.build);
    this.scale = this.skeleton.build.scale;
    this.feet = footPoints(this.skeleton.build);
    this.world = new Float32Array(BONE_COUNT * 12);
    this.skin = new Float32Array(BONE_COUNT * 12);
    this.pose = restPose();
    const n = this.skeleton.build.neck;
    const s = this.scale;
    // The middle of a ball held in the jaws: at the front of the open mouth, a little low.
    this.held = [0, (0.25 + 0.28 * n) * s - 0.12, (1.7 + 3.72 * n) * s + 0.3];
  }

  /** Pose the skeleton as the flyer f is posed. */
  posed(f) {
    poseFromFlyer(this.pose, f, 0);
    this.pose.time = 0;
    poseSkeleton(this.skeleton, this.pose, this.world, this.skin);
    return this.pose;
  }

  /** Where the middle of a ball in its jaws is in the world, f posed and placed as it is. */
  mouth(f, out) {
    const pose = this.posed(f);
    skinPoint(this.skin, BONE.head, this.held, TMP);
    return toWorld(f, TMP, heave(pose) * this.scale, out);
  }

  /** How far below its origin its feet are, f posed as it is (metres). */
  drop(f) {
    this.posed(f);
    return footDrop(this.skin, this.feet, f.pitch);
  }
}
const TMP = [0, 0, 0];

/** A point in a dragon's own frame, into the world: as dragons.js and rig.wingReach turn it. */
export function toWorld(f, p, rise, out) {
  const cy = Math.cos(f.heading);
  const sy = Math.sin(f.heading);
  const cx = Math.cos(-f.pitch);
  const sx = Math.sin(-f.pitch);
  const cz = Math.cos(-f.bank);
  const sz = Math.sin(-f.bank);
  const py = p[1] + rise;
  const x1 = p[0] * cz - py * sz;
  const y1 = p[0] * sz + py * cz;
  const y2 = y1 * cx - p[2] * sx;
  const z2 = y1 * sx + p[2] * cx;
  out[0] = f.x + x1 * cy + z2 * sy;
  out[1] = f.y + y2;
  out[2] = f.z - x1 * sy + z2 * cy;
  return out;
}

const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

/** Smoothly from a to b as u goes from 0 to 1, with velocities va, vb at the ends (per second) over T seconds. */
function hermite(a, va, b, vb, T, u, out, vel) {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const d00 = 6 * u2 - 6 * u;
  const d10 = 3 * u2 - 4 * u + 1;
  const d01 = -6 * u2 + 6 * u;
  const d11 = 3 * u2 - 2 * u;
  for (let k = 0; k < 3; k++) {
    out[k] = h00 * a[k] + h10 * va[k] * T + h01 * b[k] + h11 * vb[k] * T;
    vel[k] = (d00 * a[k] + d10 * va[k] * T + d01 * b[k] + d11 * vb[k] * T) / T;
  }
}

// ---------------------------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------------------------

/**
 * How the two race (see Fetch.chase). Tarn is quick off the mark and turns tightly, Ember is
 * slow to get going and fast once it is: its speed grows with the distance it has to cover.
 * [speed for a short chase, extra for a long one, how far the catch reaches (m), at size 1]
 */
const RACE = [
  { near: 21, far: 17, reach: 2.6, pull: 23, fastest: 40 }, // Ember
  { near: 26, far: 6, reach: 2.5, pull: 25, fastest: 20 }, // Tarn
];
/**
 * A swoop (see Fetch.swoop) may not pass nearer the viewer's head than this, nor nearer the
 * ground (metres), and takes the ball no sooner than this after it is thrown (seconds: it is
 * seen to be thrown first).
 */
const SWOOP_CLEAR = 14;
const SWOOP_GROUND = 4;
const SWOOP_SOONEST = 0.9;
/**
 * ... and its mouth meets the ball no nearer the viewer than this, in plan (metres): a swoop
 * is flown across in front of the ledge or away from it, never toward it, so it may come in
 * closer than the ring round the ledge that everything else keeps out of.
 */
const SWOOP_NEAREST = 17;
/** How far out from the viewer (in plan, metres) every point a playing dragon chases is kept. */
const KEEP_CLEAR = 26;
/** A playing dragon whose path will bring it this near the viewer's head in a second and a half is turned away off the wing (see veer). */
const VEER_NEAR = 22;

export class Fetch {
  /**
   * director: the Director (flight.js) that flies the two; this hooks itself into it.
   * specs: the two dragons (dragonGeometry.js, DRAGONS).
   */
  constructor(director, specs) {
    this.director = director;
    this.bodies = specs.map((s) => new Body(s));
    this.sizes = specs.map((s) => s.build.scale);
    director.game = this;
    this.head = [0, 1.62, 0];
    this.events = [];
    this.samples = [];
    for (let i = 0; i < 200; i++) this.samples.push([0, 0, 0, 0, 0]);
    this.sampleCount = 0;
    this.reset();
  }

  /** Back to the start: the ball on the rock, the two far off and not yet interested. */
  reset() {
    this.ball = new Ball();
    this.mode = 'exercise';
    this.eager = false;
    this.idle = 0;
    this.watch = 0; // seconds a loose ball has gone without anybody going for it
    this.claim = -1; // the dragon that is going for the ball
    this.throws = 0;
    this.time = 0;
    this.lastHand = 'right';
    this.handAt = [0, 1, -0.3];
    this.swingPeak = 0;
    this.swingDir = [0, 0, -1];
    this.swingAt = -10;
    this.fakeAt = -10;
    this.predictAt = -10;
    this.d = [0, 1].map(() => ({
      job: null, // what it is doing (see fly)
      script: null, // off the wing: a list of moves, and where in it it is
      vel: [0, 0, 0], // its velocity while off the wing
      extras: { legs: 0, reach: 0, crouch: 0, fold: 0, neckRaise: 0, hipPitch: 0 },
      look: null, // what it looks at (overrides the director), or null
      wide: false, // it may turn its head further round than usual (to look back at the viewer)
      intercept: [0, 0, 0],
      jaw: 0, // how far its jaw is held open (carrying)
      swooping: false,
    }));
    this.thrownAt = -10;
    this.events.length = 0;
  }

  // --- What the viewer does ----------------------------------------------------------------

  /** Where the viewer's head is (the world, metres). */
  setHead(x, y, z) {
    this.head[0] = x;
    this.head[1] = y;
    this.head[2] = z;
  }

  /** Can a hand at x, y, z take the ball? */
  canTake(x, y, z) {
    const b = this.ball;
    if (b.state !== 'rest' && b.state !== 'offered' && !(b.state === 'rolling' && b.home)) return false;
    return Math.hypot(x - b.x, y - b.y, z - b.z) <= REACH;
  }

  /** The grip closed with the hand at x, y, z. Returns true if it took the ball. */
  grab(hand, x, y, z) {
    if (!this.canTake(x, y, z)) return false;
    const b = this.ball;
    const from = b.state;
    if (from === 'offered') {
      // Out of the jaws: the dragon lets go.
      const i = b.owner;
      if (i >= 0) this.letGo(i);
      this.events.push({ type: 'take', dragon: i });
    }
    b.owner = -1;
    b.home = false;
    b.hand = hand;
    b.vx = b.vy = b.vz = 0;
    b.set('held');
    this.lastHand = hand;
    this.handAt[0] = x;
    this.handAt[1] = y;
    this.handAt[2] = z;
    // (The ball is held where it was: the hand is on its surface.)
    this.grip = [b.x - x, b.y - y, b.z - z];
    const l = Math.hypot(this.grip[0], this.grip[1], this.grip[2]);
    if (l > BALL_RADIUS * 0.9) for (let k = 0; k < 3; k++) this.grip[k] *= (BALL_RADIUS * 0.9) / l;
    this.wake('grab');
    this.events.push({ type: 'grab' });
    return true;
  }

  /**
   * Every frame while a hand holds the ball: where the hand is and how fast it is moving
   * (m/s). Watches for a throw that is not let go of (a fake).
   */
  hold(hand, x, y, z, vx, vy, vz) {
    const b = this.ball;
    if (b.state !== 'held' || b.hand !== hand) return;
    b.x = x + this.grip[0];
    b.y = y + this.grip[1];
    b.z = z + this.grip[2];
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    this.handAt[0] = x;
    this.handAt[1] = y;
    this.handAt[2] = z;
    // Held up over the head: that is asking for them.
    if (y > this.head[1] - 0.05 && !this.eager) this.wake('up');
    const speed = Math.hypot(vx, vy, vz);
    if (speed > 3.2 && speed > this.swingPeak) {
      this.swingPeak = speed;
      this.swingDir = [vx / speed, vy / speed, vz / speed];
      this.swingAt = this.time;
    }
    // A swing that came to nothing: the hand fast, then still, and the ball still in it.
    if (this.swingPeak > 0 && speed < 1.0 && this.time - this.swingAt > 0.18) {
      if (this.time - this.fakeAt > 2.5 && this.eager) this.fake(this.swingDir);
      this.swingPeak = 0;
    }
    if (this.time - this.swingAt > 1.2) this.swingPeak = 0;
  }

  /** The grip opened: the ball goes the way the hand was going, four times as fast (throwSpeed). */
  release(hand, vx, vy, vz) {
    const b = this.ball;
    if (b.state !== 'held' || b.hand !== hand) return;
    this.swingPeak = 0;
    const speed = Math.hypot(vx, vy, vz);
    const out = throwSpeed(speed);
    const k = speed > 1e-6 ? out / speed : 0;
    b.vx = vx * k;
    b.vy = vy * k;
    b.vz = vz * k;
    b.hand = '';
    b.home = false;
    b.set('flying');
    this.thrownAt = this.time;
    this.throws++;
    this.events.push({ type: 'throw', speed: out });
    this.wake('throw');
  }

  /** Throw from a flat screen: toward `yaw` (radians left of straight ahead), as hard as `hand` m/s at the hand. */
  throwFlat(yaw, hand) {
    const b = this.ball;
    if (b.state === 'rest' || b.state === 'offered' || (b.state === 'rolling' && b.home)) {
      const at = [this.head[0] + 0.3, this.head[1] - 0.25, this.head[2] - 0.2];
      if (b.state === 'offered' && b.owner >= 0) this.letGo(b.owner);
      b.owner = -1;
      b.set('held');
      b.hand = 'flat';
      b.x = at[0];
      b.y = at[1];
      b.z = at[2];
    }
    if (b.state !== 'held') return false;
    const up = 32 * DEG;
    const vx = -Math.sin(yaw) * Math.cos(up) * hand;
    const vz = -Math.cos(yaw) * Math.cos(up) * hand;
    const vy = Math.sin(up) * hand;
    b.hand = 'flat';
    this.release('flat', vx, vy, vz);
    return true;
  }

  /** The A button: exercise and perch, in turn. Returns the new mode. */
  toggleMode() {
    this.mode = this.mode === 'exercise' ? 'perch' : 'exercise';
    this.events.push({ type: 'mode', mode: this.mode });
    return this.mode;
  }

  /** Something happened that keeps them interested. */
  wake(why) {
    this.idle = 0;
    if (!this.eager) {
      this.eager = true;
      this.events.push({ type: 'eager', why });
    }
  }

  // --- One step of time (the director calls this first, every step) -------------------------

  step(dt) {
    this.time += dt;
    const b = this.ball;
    const dir = this.director;
    if (b.state !== 'held' && b.state !== 'carried' && b.state !== 'offered') b.step(dt, this.events);
    else b.age += dt;
    if (b.fresh < 1) b.fresh = Math.min(1, b.fresh + dt / 0.4);

    // Off the ledge and loose: both go after it.
    const out = Math.hypot(b.x - this.head[0], b.z - this.head[2]) > 4 || b.y < -3;
    if (b.loose && out && !b.home && this.claim < 0) {
      if (!this.eager) this.wake('loose');
      for (let i = 0; i < 2; i++) {
        const job = dir.jobs[i];
        if (job && job.kind === 'fetch' && (job.phase === 'chase' || job.phase === 'approach' || job.phase === 'scene')) continue;
        if (job && !job.kind) continue; // on a called pass: it joins in once that is over
        if (b.state === 'lost') continue;
        dir.jobs[i] = { kind: 'fetch', phase: 'chase', t: 0 };
      }
    }
    if (b.home && b.state === 'flying' && b.y < this.head[1] - 6) b.home = false; // missed the ledge: loose

    // The safety net: the ball lying out there (or floating) with no dragon picking it up, for
    // twenty seconds, or carried about for over a minute, or gone: a fresh one.
    const lying = b.state === 'ground' || b.state === 'floating';
    const picking = this.claim >= 0 && !!this.d[this.claim].script;
    if (lying && !picking) this.watch += dt;
    else if (!lying) this.watch = 0;
    if (b.state === 'lost' || this.watch > SAFETY_SECONDS || (b.state === 'carried' && b.age > 75)) this.freshBall();

    // Boredom: nothing thrown, nothing held up, for a while.
    const playing = this.claim >= 0 || b.loose || b.state === 'carried' || b.state === 'offered';
    if (this.eager && !playing) {
      this.idle += dt;
      if (this.idle > BORED_SECONDS) {
        this.eager = false;
        this.events.push({ type: 'bored' });
      }
    }

    // Each dragon that is off the wing is moved here (its flight model is not used).
    for (let i = 0; i < 2; i++) {
      this.d[i].look = null;
      this.d[i].wide = false;
      if (this.d[i].script) this.runScript(i, dt);
      else this.easeExtras(i, dt);
    }
    // Where a ball in the jaws is.
    if (b.state === 'carried' || b.state === 'offered') {
      const i = b.owner;
      if (i >= 0) {
        this.bodies[i].mouth(dir.flyers[i], TMP_M);
        b.vx = (TMP_M[0] - b.x) / dt;
        b.vy = (TMP_M[1] - b.y) / dt;
        b.vz = (TMP_M[2] - b.z) / dt;
        b.x = TMP_M[0];
        b.y = TMP_M[1];
        b.z = TMP_M[2];
      }
    }
  }

  /** Something went wrong (or the ball is gone): a fresh one in the hand that last threw, or on the rock. */
  freshBall() {
    const b = this.ball;
    const owner = b.owner;
    if (owner >= 0) this.dropJob(owner);
    for (let i = 0; i < 2; i++) {
      const job = this.director.jobs[i];
      if (job && job.kind === 'fetch' && job.phase !== 'yield') this.yieldJob(i);
    }
    this.claim = -1;
    this.watch = 0;
    b.owner = -1;
    b.home = false;
    b.fresh = 0;
    b.place(REST_SPOT[0], REST_SPOT[1]);
    if (this.inHand) {
      // In the hand, if there is a hand: the page puts it there on the next frame.
      b.set('held');
      b.hand = this.lastHand;
      b.x = this.handAt[0];
      b.y = this.handAt[1] - BALL_RADIUS * 0.8;
      b.z = this.handAt[2];
      this.grip = [0, -BALL_RADIUS * 0.8, 0];
    }
    this.events.push({ type: 'fresh' });
  }

  /** The page says whether there is a hand for a fresh ball to appear in (VR) or not (a flat screen). */
  setHands(present) {
    this.inHand = !!present;
  }

  // --- The director asks ---------------------------------------------------------------------

  /** Is dragon i off the wing (placed and posed here, not flown)? */
  posed(i) {
    return !!this.d[i].script;
  }

  /** What dragon i looks at, if this says (else undefined). */
  look(i) {
    const d = this.d[i];
    if (d.look) return d.look;
    const b = this.ball;
    // Eager: the ball, wherever it is (in the hand, on the rock, in the air).
    if (this.eager && !this.director.jobs[i] && b.state !== 'carried') return [b.x, b.y, b.z];
    return undefined;
  }

  /** May dragon i turn its head further round than in flight, to look back? */
  wideLook(i) {
    return this.d[i].wide;
  }

  /**
   * A dragon that is not on a job, while the two are eager: round the ring in front of the
   * ledge, on opposite sides of it. Sets its carrot; returns the speed to fly at.
   */
  circle(i, carrot, dt) {
    const f = this.director.flyers[i];
    const o = this.director.flyers[1 - i];
    const a = Math.atan2(f.x - RING.x, f.z - RING.z);
    const R = RING.radius * (i === 0 ? 1 : 0.92);
    const ahead = 26 / R;
    // Round the ring anticlockwise seen from above (out over the water on the left, in toward
    // the ledge on the right).
    const at = a - ahead;
    carrot[0] = RING.x + Math.sin(at) * R;
    carrot[2] = RING.z + Math.cos(at) * R;
    carrot[1] = RING.y + (i === 0 ? 2.5 : -3) + 1.5 * Math.sin(this.time * 0.4 + i * 2);
    // Keep to opposite sides: the one behind its place speeds up a little.
    let speed = 14.5;
    if (!this.director.jobs[1 - i]) {
      const ao = Math.atan2(o.x - RING.x, o.z - RING.z);
      const apart = wrap(a - ao); // pi when opposite
      const off = (Math.abs(apart) - Math.PI) * (apart > 0 ? -1 : 1);
      speed += clamp((i === 0 ? 1 : -1) * off * 2.5, -2.5, 2.5);
    }
    return speed;
  }

  /**
   * A dragon on a fetch job, in flight: where it is going (its carrot) and how fast. Returns
   * the speed; sets the director's setWant for it.
   */
  fly(i, job, dt, carrot) {
    return this.flyJob(i, job, dt, carrot);
  }

  /**
   * Nothing the game asks a dragon to fly at may be near the viewer: a point inside this ring
   * round the ledge (or over it, or under it) is moved out to its edge. (The lanes were drawn
   * with the viewer's head in mind, wings and all; what fetch asks for was not. And under the
   * ledge is the cliff: a dragon that went in there would have to climb out up its face.)
   */
  keepClear(c, i) {
    if (i !== undefined) this.steerClear(i, c);
    const dx = c[0] - this.head[0];
    const dz = c[2] - this.head[2];
    const flat = Math.hypot(dx, dz);
    const R = KEEP_CLEAR;
    if (flat >= R) return;
    const ux = flat > 0.5 ? dx / flat : 0;
    const uz = flat > 0.5 ? dz / flat : -1;
    c[0] = this.head[0] + ux * R;
    c[2] = this.head[2] + uz * R;
  }

  /**
   * A playing dragon flying in at the ledge, low (where the cliff is) or level with it, is
   * turned away in time: out and to whichever side it is already leaning toward, and not up
   * (up is the cliff face, and the viewer at the top of it). The flight model takes its turns
   * as an animal of its size does, and at twenty metres a second it needs twenty-odd metres
   * to turn in: the turn has to start well out.
   */
  steerClear(i, c) {
    const f = this.director.flyers[i];
    if (this.d[i].script) return;
    // About to come too near all the same (low by the cliff, the flight floor lifting it up
    // the face of it): off the wing and round, now.
    if (this.veer(i)) return;
    const dx = this.head[0] - f.x;
    const dz = this.head[2] - f.z;
    const r = Math.hypot(dx, dz);
    if (r > 60 || r < 1e-3 || f.y > this.head[1] + 32) return;
    const ux = Math.sin(f.heading);
    const uz = Math.cos(f.heading);
    const closing = (ux * dx + uz * dz) / r;
    // How soon it would be at the cliff, at this speed, and how much room a turn needs.
    const room = 1.2 * (f.speed * f.speed) / (G * Math.tan(50 * DEG)) + 18;
    if (closing < 0.15 || r > room + KEEP_CLEAR) return;
    // Away: out from the ledge, and round to the side it is already turned toward.
    const side = ux * -dz + uz * dx > 0 ? 1 : -1; // which way round is shorter
    const ox = -dx / r;
    const oz = -dz / r;
    const tx = -oz * side;
    const tz = ox * side;
    c[0] = f.x + (ox * 0.8 + tx) * 40;
    c[2] = f.z + (oz * 0.8 + tz) * 40;
    c[1] = Math.min(Math.max(c[1], f.y - 6), f.y);
  }

  /**
   * If where dragon i will be in a second and a half is within VEER_NEAR of the viewer's head,
   * take it off the wing into a turn away: a smooth path, out from the ledge and round to the
   * side it is turned toward, no harder a pull than a big animal can make, and nowhere on it
   * nearer the head than SWOOP_CLEAR. Returns true if it veered.
   */
  veer(i) {
    const f = this.director.flyers[i];
    const v0 = [Math.sin(f.heading) * Math.cos(f.gamma) * f.speed, Math.sin(f.gamma) * f.speed, Math.cos(f.heading) * Math.cos(f.gamma) * f.speed];
    const ahead = [f.x + v0[0] * 1.5, f.y + v0[1] * 1.5, f.z + v0[2] * 1.5];
    const near = Math.hypot(ahead[0] - this.head[0], ahead[1] - this.head[1], ahead[2] - this.head[2]);
    if (near > VEER_NEAR || Math.hypot(f.x - this.head[0], f.z - this.head[2]) > 70) return false;
    const dx = f.x - this.head[0];
    const dz = f.z - this.head[2];
    const r = Math.hypot(dx, dz) || 1;
    const ox = dx / r;
    const oz = dz / r;
    const s = this.sizes[i];
    for (const side of [1, -1]) {
      const tx = -oz * side;
      const tz = ox * side;
      for (const T of [2.2, 2.8, 3.4]) {
        const out = Math.max(f.speed, 14);
        const to = [f.x + (ox * 0.9 + tx * 0.6) * out * T * 0.6, Math.max(f.y, ground(f.x, f.z) + 8 * s), f.z + (oz * 0.9 + tz * 0.6) * out * T * 0.6];
        const v1 = [(ox * 0.8 + tx * 0.6) * out, 0, (oz * 0.8 + tz * 0.6) * out];
        if (!this.flyable([f.x, f.y, f.z], v0, to, v1, T, 30, s)) continue;
        const d = this.d[i];
        d.vel = v0;
        const job = this.director.jobs[i];
        d.script = {
          moves: [{
            name: 'veer', T, to, toVel: v1, heading: Math.atan2(v1[0], v1[2]),
            pose: (g, u) => {
              g.power = 0.8;
              g.brake = 0.4 * (1 - u);
              g.legs = 0;
              g.pitch = 6 * DEG;
              g.lookYaw = 0;
              g.lookPitch = 0;
            },
            end: () => this.backOnTheWing(i, null),
          }],
          k: 0, t: 0, from: [f.x, f.y, f.z], fromVel: v0.slice(), heading: f.heading, started: false,
        };
        if (job && job.kind === 'fetch' && job.phase === 'chase') job.t = 0;
        this.events.push({ type: 'veer', dragon: i });
        return true;
      }
    }
    return false;
  }

  flyJob(i, job, dt, carrot) {
    const dir = this.director;
    const f = dir.flyers[i];
    const b = this.ball;
    job.t += dt;
    dir.setWant[i] = 0;
    if (job.phase === 'chase') return this.chase(i, job, dt, carrot);
    if (job.phase === 'approach') return this.approach(i, job, dt, carrot);
    if (job.phase === 'carry') return this.carryToPerch(i, job, dt, carrot);
    if (job.phase === 'yield' || job.phase === 'betrayed' || job.phase === 'lunge' || job.phase === 'away') {
      // Off and away for a moment, then back to whatever the two were doing.
      carrot[0] = f.x + Math.sin(f.heading) * 40 + job.dir[0] * 10;
      carrot[2] = f.z + Math.cos(f.heading) * 40 + job.dir[2] * 10;
      carrot[1] = Math.max(f.y + job.climb, ground(carrot[0], carrot[2]) + 12);
      if (job.phase === 'lunge') {
        carrot[0] = job.at[0];
        carrot[1] = job.at[1];
        carrot[2] = job.at[2];
        if (job.t > 1.3) {
          // Nothing there. Up, and a look back at the one who did it.
          job.phase = 'betrayed';
          job.t = 0;
          job.climb = 10;
          f.cry = 0.6;
          this.events.push({ type: 'betrayed', dragon: i });
        }
        return job.speed;
      }
      if (job.phase === 'betrayed') {
        this.d[i].look = this.head;
        this.d[i].wide = true;
        if (job.t > 2.2) dir.jobs[i] = null;
        return 15;
      }
      if (job.t > job.length) dir.jobs[i] = null;
      return 17;
    }
    if (b.owner !== i) dir.jobs[i] = null;
    return 18;
  }

  /** Off after nothing, both of them (the ball was never let go). */
  fake(swing) {
    this.fakeAt = this.time;
    this.events.push({ type: 'fake' });
    const dir = this.director;
    for (let i = 0; i < 2; i++) {
      if (dir.jobs[i] || this.d[i].script) continue;
      const f = dir.flyers[i];
      // After where it would have gone: out along the swing, and down.
      const flat = Math.hypot(swing[0], swing[2]) || 1;
      const ux = swing[0] / flat;
      const uz = swing[2] / flat;
      const at = [this.head[0] + ux * 60, this.head[1] - 22, this.head[2] + uz * 60];
      // (Never toward the ledge from in front of it: then just down and out.)
      if ((at[0] - f.x) * -f.x + (at[2] - f.z) * -f.z > 0 && Math.hypot(f.x, f.z) < 50) {
        at[0] = f.x * 1.6;
        at[2] = f.z * 1.6;
      }
      at[1] = Math.max(at[1], ground(at[0], at[2]) + 14);
      dir.jobs[i] = { kind: 'fetch', phase: 'lunge', t: 0, at, speed: f.speed + 8, dir: [0, 0, 0], climb: 0 };
    }
  }

  /** Give up going for the ball: up and away for a few seconds. */
  yieldJob(i) {
    const f = this.director.flyers[i];
    this.director.jobs[i] = { kind: 'fetch', phase: 'yield', t: 0, length: 3.5, dir: [Math.sin(f.heading), 0, Math.cos(f.heading)], climb: 9 };
    if (this.claim === i) this.claim = -1;
  }

  /** Whatever it was doing with the ball, it stops (the ball has gone elsewhere). */
  dropJob(i) {
    const d = this.d[i];
    if (d.script) this.endScript(i, true);
    this.yieldJob(i);
  }

  // --- Chasing the ball ----------------------------------------------------------------------

  /**
   * After the ball, both of them. While it is in the air each makes for the first point of its
   * flight that it can reach in time (and, if its mouth gets there, takes it); once it is down,
   * the one that is nearer goes to fetch it and the other gives way.
   */
  chase(i, job, dt, carrot) {
    const dir = this.director;
    const f = dir.flyers[i];
    const b = this.ball;
    const race = RACE[i];
    const reach = race.reach * this.sizes[i];
    if (this.claim >= 0 && this.claim !== i) {
      this.yieldJob(i);
      return 17;
    }
    if (b.state === 'flying' || b.state === 'trees') {
      if (this.time - this.predictAt > 0.2) {
        this.sampleCount = predict([b.x, b.y, b.z], [b.vx, b.vy, b.vz], this.samples, 9, 0.1);
        this.predictAt = this.time;
        job.tried = -1;
      }
      // Can it get to the ball in the air from here? Then off the wing and after it.
      if (b.state === 'flying' && job.tried !== this.predictAt && !this.d[1 - i].swooping) {
        job.tried = this.predictAt;
        const mine = this.swoop(i);
        if (mine) {
          // A race: if the other can get there sooner, it goes, not this one.
          const other = this.director.jobs[1 - i];
          const theirs = other && other.kind === 'fetch' && other.phase === 'chase' ? this.swoop(1 - i) : null;
          if (!theirs || this.edge(1 - i, theirs) >= this.edge(i, mine) - 0.15) {
            this.startSwoop(i, mine.end, mine.v1, mine.T, mine.h, mine.meet);
            return f.speed;
          }
        }
      }
      // The first point of the ball's flight it can be at as soon as the ball.
      let pick = this.sampleCount - 1;
      const speed = Math.max(f.speed, 12);
      for (let k = 0; k < this.sampleCount; k++) {
        const s = this.samples[k];
        if (s[4] !== 0) {
          pick = k;
          break;
        }
        const t = s[0] - (this.time - this.predictAt);
        const dx = s[1] - f.x;
        const dy = s[2] - f.y;
        const dz = s[3] - f.z;
        const d = Math.hypot(dx, dy, dz) - reach - 4;
        const turn = Math.abs(wrap(Math.atan2(dx, dz) - f.heading));
        const need = d / (0.5 * (speed + race.near + race.far)) + turn * 0.9;
        if (t > 0.3 && need <= t) {
          pick = k;
          break;
        }
      }
      const s = this.samples[Math.max(pick, 0)];
      // Over the water or the ground it must not try to take the ball below the floor of its flight.
      carrot[0] = s[1];
      carrot[1] = s[2];
      carrot[2] = s[3];
      this.d[i].intercept[0] = s[1];
      this.d[i].intercept[1] = s[2];
      this.d[i].intercept[2] = s[3];
      // A point it is about to reach is chased from further back, so it flies through it.
      const dist = Math.hypot(s[1] - f.x, s[2] - f.y, s[3] - f.z);
      if (dist < 25) {
        const ux = Math.sin(f.heading);
        const uz = Math.cos(f.heading);
        carrot[0] += ux * (25 - dist) * 0.6;
        carrot[2] += uz * (25 - dist) * 0.6;
      }
      this.d[i].look = [b.x, b.y, b.z];
      // Open its jaws when it is close.
      this.bodies[i].mouth(f, TMP_M);
      const m = Math.hypot(TMP_M[0] - b.x, TMP_M[1] - b.y, TMP_M[2] - b.z);
      f.jaw = Math.max(f.jaw, clamp(1.4 - m / 8, 0, 0.8));
      if (m < reach && b.state === 'flying') {
        // Caught, in the air.
        this.caught(i, true);
        return f.speed;
      }
      return race.near + race.far * clamp((dist - 40) / 160, 0, 1);
    }
    if (b.state === 'held' || b.state === 'rest' || b.state === 'carried' || b.state === 'offered') {
      // Somebody else has it, or it is back on the ledge.
      this.yieldJob(i);
      return 17;
    }
    if (!this.down()) {
      // Still rolling down a slope: follow it from above.
      carrot[0] = b.x;
      carrot[1] = Math.max(b.y, ground(b.x, b.z)) + 14;
      carrot[2] = b.z;
      this.d[i].look = [b.x, b.y, b.z];
      return 20;
    }
    // Down (lying still, or floating): the one that can be there first goes.
    const other = dir.jobs[1 - i];
    const mine = this.eta(i);
    const theirs = other && other.kind === 'fetch' && other.phase === 'chase' ? this.eta(1 - i) : Infinity;
    if (mine <= theirs) {
      this.claim = i;
      job.phase = 'approach';
      job.t = 0;
      job.scene = null;
      return this.approach(i, job, dt, carrot);
    }
    this.yieldJob(i);
    return 17;
  }

  /**
   * A swoop: off the wing, along a smooth path from where it is (at the speed it is going) to
   * where its mouth meets the ball in the air, and on out of it at flying speed. Only if there
   * is one it can fly: no harder a pull than it has in it, no faster than it can go, clear of
   * the ground and well clear of the viewer. The ball's flight is known (predict); the first
   * point of it that can be reached is the one taken. Returns the swoop ({ end, v1, T, h, meet,
   * at: when it meets the ball, on the clock of the foretold flight }), or null.
   */
  swoop(i) {
    const f = this.director.flyers[i];
    const race = RACE[i];
    const body = this.bodies[i];
    const s = body.scale;
    const elapsed = this.time - this.predictAt;
    const p0 = [f.x, f.y, f.z];
    const v0 = [Math.sin(f.heading) * Math.cos(f.gamma) * f.speed, Math.sin(f.gamma) * f.speed, Math.cos(f.heading) * Math.cos(f.gamma) * f.speed];
    const thrown = this.time - this.thrownAt;
    for (let k = 1; k < this.sampleCount; k++) {
      const smp = this.samples[k];
      if (smp[4] !== 0) break;
      const T = smp[0] - elapsed;
      if (T < 0.8 || thrown + T < SWOOP_SOONEST) continue;
      if (T > 5) break;
      // Coming at the ball from where it is...
      let ux = smp[1] - f.x;
      let uz = smp[3] - f.z;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      // ... but not straight in at the ledge, and out of it sideways and away: it comes out of
      // the swoop turning, never flying on at the cliff.
      const bx = this.head[0] - smp[1];
      const bz = this.head[2] - smp[3];
      const bl = Math.hypot(bx, bz) || 1;
      const inward = (ux * bx + uz * bz) / bl;
      if (bl < 90 && inward > 0.6) continue;
      let wx = ux;
      let wz = uz;
      if (bl < 90 && inward > -0.3) {
        wx = ux - (bx / bl) * (inward + 0.3);
        wz = uz - (bz / bl) * (inward + 0.3);
        const wl = Math.hypot(wx, wz) || 1;
        wx /= wl;
        wz /= wl;
      }
      const h = Math.atan2(wx, wz);
      // Where its body must be for its mouth to be on the ball, facing the way it comes out.
      const reachOut = (1.7 + 3.72 * body.skeleton.build.neck) * s;
      const end = [smp[1] - wx * reachOut, smp[2] - 0.5 * s, smp[3] - wz * reachOut];
      const flat = Math.hypot(end[0] - f.x, end[2] - f.z);
      const avg = Math.hypot(flat, end[1] - f.y) / T;
      if (avg > race.fastest || avg < 8) continue;
      const out = clamp(avg, 14, 24);
      const v1 = [wx * out, 5, wz * out];
      const tl = Math.hypot(this.head[0] - end[0], this.head[2] - end[2]);
      if (tl < SWOOP_NEAREST) continue;
      if (!this.flyable(p0, v0, end, v1, T, race.pull, s)) continue;
      // And two seconds on from it, still clear.
      let clear = true;
      for (let k = 1; k <= 4 && clear; k++) {
        const q = [end[0] + v1[0] * k * 0.6, end[1] + v1[1] * k * 0.6, end[2] + v1[2] * k * 0.6];
        if (Math.hypot(q[0] - this.head[0], q[2] - this.head[2]) < SWOOP_NEAREST || q[1] < ground(q[0], q[2]) + 4 * s) clear = false;
      }
      if (!clear) continue;
      return { end, v1, T, h, meet: [smp[1], smp[2], smp[3]], at: smp[0] };
    }
    return null;
  }

  /**
   * When dragon i would have the ball by swoop `sw`, with its own edge in a race: the quick one
   * is quicker off the mark close in, and the big one, once it is going, faster far out.
   */
  edge(i, sw) {
    const far = Math.hypot(sw.meet[0] - this.head[0], sw.meet[2] - this.head[2]);
    const bonus = i === 0 ? 0.7 * clamp((far - 45) / 45, 0, 1) : 0.7 * clamp((60 - far) / 30, 0, 1);
    return sw.at - bonus;
  }

  /**
   * Can a dragon fly this path (hermite from p0 at v0 to p1 at v1 in T seconds): a pull of no
   * more than `pull` m/s/s anywhere, and nowhere near the ground or the viewer?
   */
  flyable(p0, v0, p1, v1, T, pull, s, landing) {
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      // (Coming down to stop, the end of the path is where it means to be: on the ground, or over the water.)
      const last = landing && u > 0.7;
      hermite(p0, v0, p1, v1, T, u, POS, VEL);
      // (The pull: how fast the velocity turns and changes, from the next point along.)
      if (k < 12) {
        hermite(p0, v0, p1, v1, T, u + 1 / 12, POS2, VEL2);
        const a = Math.hypot(VEL2[0] - VEL[0], VEL2[1] - VEL[1] + G * (T / 12), VEL2[2] - VEL[2]) / (T / 12);
        if (a > pull) return false;
      }
      const floor = Math.max(ground(POS[0], POS[2]), lakeDistance(POS[0], POS[2]) < 0 ? LAKE_LEVEL : -Infinity);
      const canopy = forestDensity(POS[0], POS[2]) > 0.3 ? canopyHeight(POS[0], POS[2]) : floor;
      // (Coming down to stop, no higher than where it is to stop: that is over the water or the ground already.)
      const clearance = Math.max(floor, canopy) + SWOOP_GROUND * s;
      if (!last && POS[1] < (landing ? Math.min(clearance, p1[1] - 0.5) : clearance)) return false;
      if (Math.hypot(POS[0] - this.head[0], POS[1] - this.head[1], POS[2] - this.head[2]) < SWOOP_CLEAR) return false;
      const speed = Math.hypot(VEL[0], VEL[1], VEL[2]);
      if (speed > 38 || (speed < 6 && !landing)) return false;
    }
    return true;
  }

  /** Off the wing into a swoop at the ball (see swoop). */
  startSwoop(i, end, v1, T, h, meet) {
    const f = this.director.flyers[i];
    const d = this.d[i];
    const job = this.director.jobs[i];
    job.phase = 'scene';
    job.t = 0;
    d.vel = [Math.sin(f.heading) * Math.cos(f.gamma) * f.speed, Math.sin(f.gamma) * f.speed, Math.cos(f.heading) * Math.cos(f.gamma) * f.speed];
    d.swooping = true;
    const dive = end[1] < f.y - 6;
    const move = {
      name: 'swoop', T, to: end, toVel: v1, heading: h,
      pose: (g, u) => {
        // Wings drawn back for speed going down, spread and braking as it reaches the ball.
        g.power = dive ? 0.3 * (1 - smoothstep(0, 0.4, u)) + 0.8 * smoothstep(0.85, 1, u) : 0.7;
        g.brake = 0.5 * smoothstep(0.7, 0.95, u);
        g.legs = 0.4 * smoothstep(0.75, 0.95, u);
        g.reach = 0.6 * smoothstep(0.75, 0.95, u);
        const v = d.vel;
        const flat = Math.hypot(v[0], v[2]);
        g.pitch = Math.atan2(v[1], Math.max(flat, 1)) + 8 * DEG * smoothstep(0.7, 1, u);
        g.tuck = dive ? smoothstep(0.05, 0.3, u) * (1 - smoothstep(0.6, 0.85, u)) : 0;
        g.lookPitch = 0;
        g.lookYaw = 0;
        g.jaw = 0.9 * smoothstep(0.6, 0.85, u);
      },
      look: meet,
      end: () => {
        d.swooping = false;
        const b = this.ball;
        this.bodies[i].mouth(f, TMP_M);
        const near = Math.hypot(TMP_M[0] - b.x, TMP_M[1] - b.y, TMP_M[2] - b.z);
        // (The ball's flight was foretold, so it is there, within the reach of a snap.)
        const got = b.state === 'flying' && near < RACE[i].reach * this.sizes[i] * 2.2;
        this.backOnTheWing(i, () => {
          if (got) this.caught(i, true);
          else this.director.jobs[i] = { kind: 'fetch', phase: 'chase', t: 0 };
        });
      },
    };
    d.script = { moves: [move], k: 0, t: 0, from: [f.x, f.y, f.z], fromVel: d.vel.slice(), heading: f.heading, started: false };
    this.events.push({ type: 'swoop', dragon: i });
  }

  /** Is the ball down, lying still enough out there to be fetched from where it is? */
  down() {
    const b = this.ball;
    return b.state === 'ground' || b.state === 'floating' || (b.state === 'rolling' && Math.hypot(b.vx, b.vz) < 1.2);
  }

  /** Roughly how long dragon i would take to get to the ball. */
  eta(i) {
    const f = this.director.flyers[i];
    const b = this.ball;
    const d = Math.hypot(b.x - f.x, b.y - f.y, b.z - f.z);
    const turn = Math.abs(wrap(Math.atan2(b.x - f.x, b.z - f.z) - f.heading));
    // (The quick one is quicker over a short way, the big one over a long one.)
    const r = RACE[i];
    return d / (r.near + r.far * clamp((d - 40) / 160, 0, 1)) + turn * (i === 1 ? 0.9 : 1.3);
  }

  /** Caught: the ball is in its mouth. In the air, `inAir`; or picked up (see the scenes). */
  caught(i, inAir) {
    const b = this.ball;
    b.owner = i;
    b.home = false;
    b.vx = b.vy = b.vz = 0;
    b.set('carried');
    this.claim = i;
    this.watch = 0;
    this.d[i].jaw = 0.5;
    this.events.push({ type: 'catch', dragon: i, air: !!inAir, x: b.x, y: b.y, z: b.z });
    const other = this.director.jobs[1 - i];
    if (other && other.kind === 'fetch' && (other.phase === 'chase' || other.phase === 'approach')) this.yieldJob(1 - i);
    if (inAir) this.bringBack(i);
  }

  /** Bring the ball back, the way the mode says. */
  bringBack(i) {
    const dir = this.director;
    if (this.mode === 'perch') {
      dir.jobs[i] = { kind: 'fetch', phase: 'carry', t: 0 };
    } else {
      // Past the ledge the way a called dragon comes (flight.js), tossing the ball as it goes by.
      // (It need not go as far out first as a called one does: it is low, and in a hurry.)
      dir.sendPast(i, { drop: true, t: 0, gate: 72, slow: 21 });
    }
  }

  /**
   * Called by the director while a dragon carrying the ball flies past the ledge (exercise):
   * when its mouth is as near the viewer as it is going to come, it tosses the ball so that
   * it lands short of the viewer's feet and rolls to them.
   */
  passing(i, job, ending) {
    const b = this.ball;
    if (b.owner !== i || b.state !== 'carried') {
      job.drop = false;
      return;
    }
    const f = this.director.flyers[i];
    this.bodies[i].mouth(f, TMP_M);
    const d = Math.hypot(TMP_M[0] - this.head[0], TMP_M[1] - this.head[1], TMP_M[2] - this.head[2]);
    const closing = job.lastMouth === undefined || d < job.lastMouth - 0.005;
    job.lastMouth = d;
    if (ending || (!closing && d < 30) || (job.phase === 'go' && d < 24)) this.toss(i, TMP_M, d);
  }

  /** Let the ball go from the mouth at p, aimed to come down short of the viewer's feet. */
  toss(i, p, d) {
    const b = this.ball;
    const feet = this.feet(TMP_F);
    // Come down a stride short of the feet, on the side it comes from, and roll the rest.
    const ax = p[0] - feet[0];
    const az = p[2] - feet[2];
    const al = Math.hypot(ax, az) || 1;
    const land = [feet[0] + (ax / al) * 1.1, ground(feet[0] + (ax / al) * 1.1, feet[2] + (az / al) * 1.1) + BALL_RADIUS, feet[2] + (az / al) * 1.1];
    const T = clamp(d / 11, 0.9, 1.8);
    b.x = p[0];
    b.y = p[1];
    b.z = p[2];
    b.vx = (land[0] - p[0]) / T;
    b.vz = (land[2] - p[2]) / T;
    b.vy = (land[1] - p[1]) / T + 0.5 * G * T;
    b.owner = -1;
    b.home = true;
    b.target[0] = feet[0];
    b.target[1] = feet[1];
    b.target[2] = feet[2];
    b.set('flying');
    this.claim = -1;
    this.d[i].jaw = 0;
    this.director.flyers[i].jaw = 0.9;
    this.events.push({ type: 'toss', dragon: i });
    this.idle = 0;
  }

  /** Where the viewer's feet are: under the head, kept on the ledge, a hand's breadth in front. */
  feet(out) {
    let x = this.head[0];
    let z = this.head[2] - 0.45;
    const r = Math.hypot(x, z);
    if (r > 1.1) {
      x *= 1.1 / r;
      z *= 1.1 / r;
    }
    out[0] = x;
    out[1] = ground(x, z) + BALL_RADIUS;
    out[2] = z;
    return out;
  }

  // --- Down there: lake, ground, trees ------------------------------------------------------

  /**
   * On its way to where the ball is lying (or floating): first to a gate a little way back from
   * it, low and in line, and from there off the wing, into one of the scenes.
   */
  approach(i, job, dt, carrot) {
    const dir = this.director;
    const f = dir.flyers[i];
    const b = this.ball;
    if (b.state === 'held' || b.state === 'rest' || b.state === 'carried' || b.state === 'offered') {
      this.yieldJob(i);
      return 17;
    }
    if (!this.down()) {
      // Not down yet after all (it bounced, or is rolling on): keep after it.
      job.phase = 'chase';
      this.claim = -1;
      return this.chase(i, job, dt, carrot);
    }
    if (job.t > 35) {
      // It could not get there: let the other try, or the safety net.
      this.yieldJob(i);
      return 17;
    }
    const water = b.state === 'floating';
    const open = !water && forestDensity(b.x, b.z) < 0.3 && slopeAt(b.x, b.z) < 0.38 && canopyHeight(b.x, b.z) - ground(b.x, b.z) < 4;
    const kind = water ? 'water' : open ? 'land' : 'pluck';
    // Runs in over the ball, from far enough out to come down at the end of one: in toward it,
    // and if it is not down by the time it is over it, out the far side and round again.
    const dx = f.x - b.x;
    const dz = f.z - b.z;
    const dl = Math.hypot(dx, dz) || 1;
    const floor = water ? LAKE_LEVEL : Math.max(ground(b.x, b.z), canopyHeight(b.x, b.z));
    if (!job.leg) job.leg = dl > 55 ? 'in' : 'out';
    if (job.leg === 'out') {
      // Out the way it is going (away from the ledge, if that is the way it is going anyway).
      if (!job.outTo) {
        let ux = Math.sin(f.heading);
        let uz = Math.cos(f.heading);
        const ax = b.x - this.head[0];
        const az = b.z - this.head[2];
        const al = Math.hypot(ax, az) || 1;
        if ((ux * -ax + uz * -az) / al > 0.3) {
          ux = ax / al;
          uz = az / al;
        }
        job.outTo = [b.x + ux * 68, b.z + uz * 68];
      }
      carrot[0] = job.outTo[0];
      carrot[2] = job.outTo[1];
      if (Math.hypot(job.outTo[0] - f.x, job.outTo[1] - f.z) < 22 || dl > 75) {
        job.leg = 'in';
        job.outTo = null;
      }
    } else {
      carrot[0] = b.x;
      carrot[2] = b.z;
      // Gone past it: out and round again.
      const passing = (Math.sin(f.heading) * -dx + Math.cos(f.heading) * -dz) / dl < 0;
      if (passing && dl < 30) job.leg = 'out';
    }
    carrot[1] = Math.max(floor, ground(carrot[0], carrot[2])) + 16;
    this.d[i].look = [b.x, b.y, b.z];
    if (this.time - (job.triedAt || -1) > 0.25) {
      job.triedAt = this.time;
      if (this.descend(i, kind)) return f.speed;
    }
    return dl > 120 ? 28 : lerp(15, 24, clamp((dl - 30) / 90, 0, 1));
  }

  /**
   * Can dragon i come down off the wing from where it is to take the ball (lying, or floating)?
   * Facing the way it is going, turned toward the ball: a smooth path to where its mouth is on
   * the ball, slowing to a stop, no harder a pull than it has, clear of the ground on the way
   * (the end is on or over it, of course) and of the viewer. If there is one, the scene starts.
   */
  descend(i, kind) {
    const f = this.director.flyers[i];
    const b = this.ball;
    const s = this.sizes[i];
    const dx = b.x - f.x;
    const dz = b.z - f.z;
    const flat = Math.hypot(dx, dz);
    const dy = f.y - b.y;
    if (flat < 14 || flat > 110 || dy < 2 || dy > 60) return false;
    // It comes round to face the ball (part of the way: the rest is the neck), and not at the ledge.
    const toBall = Math.atan2(dx, dz);
    const off = wrap(toBall - f.heading);
    if (Math.abs(off) > 125 * DEG) return false;
    const h = wrap(f.heading + clamp(off, -55 * DEG, 55 * DEG) + clamp(off, -1, 1) * 0.15);
    const tx = this.head[0] - b.x;
    const tz = this.head[2] - b.z;
    const tl = Math.hypot(tx, tz) || 1;
    if (tl < 110 && (Math.sin(h) * tx + Math.cos(h) * tz) / tl > 0.75) return false;
    const how = kind === 'land' ? 'ground' : kind === 'water' ? 'water' : 'hover';
    const pick = this.solveReach(i, h, [b.x, b.y, b.z], how);
    const to = pick.at;
    if (Math.hypot(to[0] - this.head[0], to[2] - this.head[2]) < KEEP_CLEAR - 6) return false;
    const p0 = [f.x, f.y, f.z];
    const v0 = [Math.sin(f.heading) * Math.cos(f.gamma) * f.speed, Math.sin(f.gamma) * f.speed, Math.cos(f.heading) * Math.cos(f.gamma) * f.speed];
    // As long as it takes to come down from that speed without a harder pull than a landing bird's.
    const dist = Math.hypot(to[0] - f.x, to[1] - f.y, to[2] - f.z);
    let T = 0;
    for (const k of [0.62, 0.5, 0.4]) {
      const t = clamp(dist / Math.max(f.speed * k, 6), 3, 7.5);
      if (this.flyable(p0, v0, to, ZERO3, t, 18, s, true)) {
        T = t;
        break;
      }
    }
    if (!T) return false;
    const job = this.director.jobs[i];
    job.scene = { kind, heading: h, pick, T };
    this.startScene(i, kind);
    return true;
  }

  // --- Off the wing ---------------------------------------------------------------------------

  /**
   * Take dragon i off the wing and into a scene: a list of moves, each of which places it along
   * a smooth path (from where it is, at the velocity it has, to where the move ends, at the
   * velocity it should have there) and poses it as it goes.
   */
  startScene(i, kind) {
    const f = this.director.flyers[i];
    const d = this.d[i];
    const b = this.ball;
    const job = this.director.jobs[i];
    const h = job && job.scene ? job.scene.heading : f.heading;
    const ux = Math.sin(h);
    const uz = Math.cos(h);
    const v = [Math.sin(f.heading) * Math.cos(f.gamma) * f.speed, Math.sin(f.gamma) * f.speed, Math.cos(f.heading) * Math.cos(f.gamma) * f.speed];
    d.vel = v;
    job.phase = 'scene';
    job.t = 0;
    const self = this;
    const s = this.sizes[i];
    const moves = [];
    const planned = job && job.scene && job.scene.pick;
    if (kind === 'land') {
      // Lands short of the ball, breathes fire at the sky, puts its head down and picks it up.
      const pick = planned || this.solveReach(i, h, [b.x, b.y, b.z], 'ground');
      const standAt = pick.at;
      moves.push({
        name: 'land', T: job.scene.T || 3.5, to: standAt, toVel: [0, 0, 0], heading: h,
        pose: (g, u) => {
          g.power = u < 0.55 ? 0.6 + 0.4 * smoothstep(0.2, 0.5, u) : lerp(1, 0.2, smoothstep(0.75, 1, u));
          g.brake = smoothstep(0, 0.35, u) * (1 - smoothstep(0.9, 1, u));
          g.legs = smoothstep(0.1, 0.5, u);
          g.reach = Math.sin(clamp(u / 0.95, 0, 1) * Math.PI) * 0.9;
          g.crouch = smoothstep(0.88, 1, u) * 0.5;
          g.pitch = lerp(5, 32, smoothstep(0, 0.6, u)) * DEG - smoothstep(0.75, 1, u) * 24 * DEG;
          g.fold = 0;
          g.neckRaise = 0;
          g.lookPitch = -0.2;
          g.lookYaw = 0;
          g.stand = smoothstep(0.93, 1, u);
        },
        end: () => this.events.push({ type: 'land', dragon: i, x: standAt[0], y: standAt[1], z: standAt[2] }),
      });
      moves.push({
        name: 'joy', T: 3.0, heading: h,
        start: () => {
          f.roar = 1.9;
          f.roarYaw = 0;
          this.events.push({ type: 'roar', dragon: i, kind: 'joy' });
        },
        pose: (g, u) => {
          g.power = 0;
          g.brake = 0.55 * (1 - smoothstep(0.7, 1, u));
          g.legs = 1;
          g.reach = 0;
          g.crouch = 0.35 - 0.25 * smoothstep(0, 0.2, u);
          g.pitch = lerp(14, 22, smoothstep(0, 0.3, u)) * DEG;
          g.fold = 0.35 * smoothstep(0.7, 1, u);
          g.neckRaise = 0.25;
          // Head up and a little aside: the fire goes into the sky, over the trees.
          g.lookPitch = 0.75 * smoothstep(0, 0.15, u) * (1 - smoothstep(0.75, 1, u));
          g.lookYaw = 0.35;
          g.stand = 1;
        },
      });
      moves.push({
        name: 'pick', T: 1.8, heading: h,
        pose: (g, u) => {
          const down = smoothstep(0, 0.45, u) * (1 - smoothstep(0.75, 1, u));
          g.power = 0;
          g.brake = 0;
          g.legs = 1;
          g.crouch = lerp(0.1, pick.pose.crouch, down);
          g.pitch = lerp(16, pick.pitch / DEG, down) * DEG;
          g.fold = lerp(0.35, 0.6, down);
          g.neckRaise = lerp(0.1, pick.pose.neckRaise, down);
          g.lookPitch = lerp(-0.1, pick.pose.lookPitch, down);
          g.lookYaw = lerp(0, pick.pose.lookYaw, down);
          g.stand = 1;
          g.jaw = u < 0.42 ? smoothstep(0.2, 0.4, u) * 0.8 : 0.5;
        },
        at: [[0.45, () => this.caught(i, false)]],
      });
      moves.push(this.takeOff(i, h, 'ground'));
    } else {
      // Down over it: hovering (beating at the water first, if it is in the lake), head down, and up with it.
      const water = kind === 'water';
      const pick = planned || this.solveReach(i, h, [b.x, b.y, b.z], water ? 'water' : 'hover');
      const hover = pick.at;
      moves.push({
        name: 'down', T: job.scene.T || 3.5, to: hover, toVel: [0, 0, 0], heading: h,
        pose: (g, u) => {
          g.power = lerp(0.7, 1, smoothstep(0.3, 0.7, u));
          g.brake = smoothstep(0, 0.4, u) * 0.85;
          g.legs = smoothstep(0.3, 0.8, u) * (water ? 1 : 0.6);
          g.reach = 0.4 * smoothstep(0.3, 0.8, u);
          g.pitch = lerp(5, 26, smoothstep(0, 0.6, u)) * DEG;
          g.lookPitch = lerp(-0.2, pick.pose.lookPitch * 0.6, smoothstep(0.5, 1, u));
          g.neckRaise = 0;
          g.fold = 0;
        },
      });
      if (water) {
        moves.push({
          name: 'thrash', T: 2.6, heading: h, bob: 0.7,
          start: () => (this.thrashAt = -1),
          pose: (g, u, t) => {
            g.power = 1;
            g.brake = 0.7;
            g.legs = 1;
            g.reach = 0.3 + 0.3 * Math.sin(t * 7);
            g.pitch = (24 + 6 * Math.sin(t * 5)) * DEG;
            g.lookPitch = lerp(pick.pose.lookPitch * 0.6, pick.pose.lookPitch, u);
            g.neckRaise = pick.pose.neckRaise * u;
            g.lookYaw = 0.25 * Math.sin(t * 3.1);
            g.jaw = 0.3 + 0.3 * Math.sin(t * 6);
            // Each downstroke beats the water up.
            const beat = Math.floor(t / 0.42);
            if (beat !== this.thrashAt) {
              this.thrashAt = beat;
              this.events.push({ type: 'splash', x: b.x + Math.sin(beat * 2.4) * 2 * s, y: LAKE_LEVEL, z: b.z + Math.cos(beat * 3.1) * 2 * s, size: 0.7, thrash: true });
            }
          },
        });
      }
      moves.push({
        name: 'scoop', T: 1.3, heading: h,
        pose: (g, u) => {
          g.power = 1;
          g.brake = 0.6;
          g.legs = water ? 1 : 0.6;
          g.reach = 0.2;
          g.pitch = pick.pitch;
          const dip = Math.sin(clamp(u / 0.8, 0, 1) * Math.PI);
          g.lookPitch = lerp(pick.pose.lookPitch * 0.7, pick.pose.lookPitch, dip);
          g.neckRaise = lerp(0, pick.pose.neckRaise, dip);
          g.lookYaw = pick.pose.lookYaw * dip;
          g.jaw = u < 0.4 ? 0.8 : 0.5;
        },
        at: [[0.4, () => this.caught(i, false)]],
      });
      moves.push(this.takeOff(i, h, water ? 'water' : 'hover'));
    }
    d.script = { moves, k: 0, t: 0, from: [f.x, f.y, f.z], fromVel: v.slice(), heading: f.heading, started: false };
    this.events.push({ type: 'scene', dragon: i, kind });
  }

  /** Up and away again with the ball, at flying speed, and back onto the wing. */
  takeOff(i, h, from) {
    const ux = Math.sin(h);
    const uz = Math.cos(h);
    return {
      name: 'up', T: from === 'ground' ? 2.6 : 2.2, heading: h,
      plan: (start) => {
        const to = [start[0] + ux * 18, start[1] + (from === 'ground' ? 9 : 8), start[2] + uz * 18];
        const g = ground(to[0], to[2]);
        to[1] = Math.max(to[1], Math.max(g, canopyHeight(to[0], to[2])) + 6, from === 'water' ? LAKE_LEVEL + 9 : -Infinity);
        return { to, toVel: [ux * 14, 4, uz * 14] };
      },
      pose: (g, u) => {
        const ground_ = from === 'ground';
        g.crouch = ground_ ? smoothstep(0, 0.15, u) * 0.85 * (1 - smoothstep(0.15, 0.3, u)) : 0;
        g.power = ground_ && u < 0.15 ? 0.3 : 1;
        g.brake = ground_ ? 0.6 * (1 - smoothstep(0.1, 0.5, u)) : 0.4 * (1 - u);
        g.legs = (ground_ || from === 'water' ? 1 : 0.6) * (1 - smoothstep(0.35, 0.9, u));
        g.reach = 0;
        g.fold = ground_ ? 0.6 * (1 - smoothstep(0, 0.2, u)) : 0;
        g.pitch = lerp(ground_ ? 12 : 20, 14, smoothstep(0, 1, u)) * DEG + (ground_ ? smoothstep(0.15, 0.4, u) * 12 * DEG * (1 - u) : 0);
        g.lookPitch = -0.1;
        g.lookYaw = 0;
        g.neckRaise = 0;
        g.jaw = 0.5;
        g.stand = ground_ ? 1 - smoothstep(0.15, 0.3, u) : 0;
      },
      end: () => this.backOnTheWing(i, () => this.bringBack(i)),
    };
  }

  /**
   * Where dragon i must be, facing `h`, for its mouth to be at `target`, posed for `how`:
   * 'ground' standing (its feet on the ground) with its head down, 'hover' or 'water' in the air
   * with its head down. Returns { at: where its body goes, pitch, pose: the head and neck }.
   */
  solveReach(i, h, target, how) {
    const body = this.bodies[i];
    const f = SOLVE_F;
    Object.assign(f, ZERO_F);
    f.heading = h;
    const standing = how === 'ground';
    f.legs = standing ? 1 : how === 'water' ? 1 : 0.6;
    f.power = standing ? 0 : 0.8;
    f.flap = 1.6;
    f.brake = standing ? 0 : 0.6;
    f.fold = standing ? 0.6 : 0;
    f.pitch = standing ? 6 * DEG : 22 * DEG;
    f.hipPitch = f.pitch;
    const s = body.scale;
    const ux = Math.sin(h);
    const uz = Math.cos(h);
    // The neck and head down toward the target, by search. The body is placed so the mouth
    // is over the target first, then the head is brought down to it.
    let best = null;
    const tries = standing ? [[0.35, -0.3, -0.9], [0.6, -0.5, -1.1], [0.15, -0.1, -0.7], [0.8, -0.6, -1.25]] : [[0, -0.3, -1.0], [0, -0.5, -1.2], [0, -0.1, -0.8]];
    for (const [crouch, raise, pitchHead] of tries) {
      f.crouch = crouch;
      f.neckRaise = raise;
      f.lookPitch = pitchHead;
      f.lookYaw = 0;
      f.x = 0;
      f.y = 0;
      f.z = 0;
      body.mouth(f, TMP_S);
      // Where the body goes so that the mouth is over the target.
      const at = [target[0] - TMP_S[0], 0, target[2] - TMP_S[2]];
      if (standing) {
        const drop = body.drop(f);
        at[1] = ground(at[0], at[2]) + drop;
        // How far the mouth is above or below the target, standing there.
        const miss = at[1] + TMP_S[1] - target[1];
        if (!best || Math.abs(miss) < Math.abs(best.miss)) best = { at, miss, crouch, raise, pitchHead };
      } else {
        at[1] = target[1] - TMP_S[1];
        best = best || { at, miss: 0, crouch, raise, pitchHead };
      }
    }
    // Clear of the water or the ground under it, in the air (its feet may trail in the water).
    if (!standing) {
      const low = how === 'water' ? LAKE_LEVEL + 1.2 * s : ground(best.at[0], best.at[2]) + 1.5 * s;
      if (best.at[1] < low) best.at[1] = low;
    }
    // Standing, the last of the way is made up by the neck: tip the head further down or up.
    let lookPitch = best.pitchHead;
    if (standing && Math.abs(best.miss) > 0.05) {
      lookPitch = clamp(best.pitchHead - best.miss / (2.4 * s), -1.5, 0.4);
    }
    // (Unused but kept for the picture's sake: how far forward of the body the mouth reaches.)
    void ux;
    void uz;
    return { at: best.at, pitch: f.pitch, pose: { crouch: best.crouch, neckRaise: best.raise, lookPitch, lookYaw: 0 } };
  }

  /** Back to flying: the flight model takes over where the script left it. */
  backOnTheWing(i, then) {
    const f = this.director.flyers[i];
    const d = this.d[i];
    const v = d.vel;
    const flat = Math.hypot(v[0], v[2]);
    const speed = Math.max(Math.hypot(v[0], v[1], v[2]), 10);
    const heading = flat > 0.5 ? Math.atan2(v[0], v[2]) : f.heading;
    const gamma = Math.atan2(v[1], Math.max(flat, 1));
    d.script = null;
    f.place(f.x, f.y, f.z, heading, speed);
    f.gamma = gamma;
    f.flapping = true;
    f.bank = 0;
    if (then) then();
  }

  endScript(i, aborted) {
    const d = this.d[i];
    if (!d.script) return;
    if (aborted) this.backOnTheWing(i, null);
    d.script = null;
  }

  /** One step of a dragon that is off the wing. */
  runScript(i, dt) {
    const d = this.d[i];
    const sc = d.script;
    const f = this.director.flyers[i];
    let m = sc.moves[sc.k];
    if (!sc.started) {
      sc.started = true;
      sc.t = 0;
      sc.from = [f.x, f.y, f.z];
      sc.fromVel = d.vel.slice();
      sc.heading = f.heading;
      sc.fired = 0;
      if (m.plan) Object.assign(m, m.plan(sc.from));
      if (m.start) m.start();
    }
    sc.t += dt;
    const u = clamp(sc.t / m.T, 0, 1);
    // Where it is.
    if (m.to) {
      hermite(sc.from, sc.fromVel, m.to, m.toVel || ZERO3, m.T, smoothU(u, m), POS, VEL);
      d.vel[0] = VEL[0];
      d.vel[1] = VEL[1];
      d.vel[2] = VEL[2];
      f.x = POS[0];
      f.y = POS[1];
      f.z = POS[2];
    } else {
      // In place (bobbing a little in the air, if it is hovering).
      const bob = m.bob ? Math.sin(sc.t * 3.2) * 0.35 * m.bob : 0;
      f.x = sc.from[0];
      f.z = sc.from[2];
      f.y = sc.from[1] + bob;
      d.vel[0] = 0;
      d.vel[1] = m.bob ? Math.cos(sc.t * 3.2) * 0.35 * m.bob * 3.2 : 0;
      d.vel[2] = 0;
    }
    // Which way it faces: the way it is going, turning onto the move's own heading as it slows.
    const want = typeof m.heading === 'number' ? m.heading : f.heading;
    const moving = Math.hypot(d.vel[0], d.vel[2]);
    let face = want;
    if (moving > 4) face = Math.atan2(d.vel[0], d.vel[2]);
    f.heading = wrap(f.heading + clamp(wrap(face - f.heading), -1.6 * dt, 1.6 * dt));
    // How it is posed.
    G_POSE.stand = 0;
    G_POSE.jaw = undefined;
    G_POSE.pitch = f.pitch;
    m.pose(G_POSE, u, sc.t);
    f.power = G_POSE.power;
    f.brake = G_POSE.brake;
    f.legs = G_POSE.legs;
    f.reach = G_POSE.reach || 0;
    f.crouch = G_POSE.crouch || 0;
    f.fold = G_POSE.fold || 0;
    f.neckRaise = G_POSE.neckRaise || 0;
    f.pitch = G_POSE.pitch;
    f.hipPitch = f.pitch;
    f.tuck = G_POSE.tuck || 0;
    G_POSE.tuck = 0;
    f.set = 0;
    f.turn *= Math.exp(-dt / 0.3);
    f.arch *= Math.exp(-dt / 0.3);
    f.bank *= Math.exp(-dt / 0.3);
    f.lookYaw += ((G_POSE.lookYaw || 0) - f.lookYaw) * (1 - Math.exp(-dt / 0.25));
    f.lookPitch += ((G_POSE.lookPitch || 0) - f.lookPitch) * (1 - Math.exp(-dt / 0.25));
    // Its jaw: as the move says, or held on the ball, or open for a roar.
    let jaw = G_POSE.jaw !== undefined ? G_POSE.jaw : this.ball.owner === i ? 0.5 : 0;
    if (f.roar > 0) {
      f.roar = Math.max(0, f.roar - dt);
      jaw = Math.max(jaw, Math.min(1, f.roar * 2.2) * Math.min(1, (1.9 - f.roar) * 6));
    }
    if (f.cry > 0) f.cry = Math.max(0, f.cry - dt);
    f.jaw += (jaw - f.jaw) * (1 - Math.exp(-dt / 0.08));
    // Standing: its feet on what it stands on.
    if (G_POSE.stand > 0) {
      const top = m.standOn !== undefined ? m.standOn : ground(f.x, f.z);
      const y = top + this.bodies[i].drop(f);
      f.y = lerp(f.y, y, G_POSE.stand);
    }
    f.speed = Math.hypot(d.vel[0], d.vel[1], d.vel[2]);
    f.gamma = Math.atan2(d.vel[1], Math.max(Math.hypot(d.vel[0], d.vel[2]), 0.5));
    f.omega = 0;
    // The wingbeat goes on (and is heard).
    const before = f.flap;
    f.flap += TAU * f.beat * (0.82 + 0.36 * f.power) * dt * (f.power > 0.05 ? 1 : 0);
    const mark = 0.3 * Math.PI;
    f.beatNow = 0;
    if (f.flap >= TAU) {
      f.flap -= TAU;
      if (mark <= f.flap && f.power > 0.2) f.beatNow = f.power;
    } else if (before < mark && f.flap >= mark && f.power > 0.2) {
      f.beatNow = f.power;
    }
    if (f.beatNow > 0) this.director.events.push({ type: 'beat', dragon: i, strength: f.beatNow });
    // Moments within the move.
    if (m.at) {
      for (let k = sc.fired; k < m.at.length; k++) {
        if (u >= m.at[k][0]) {
          sc.fired = k + 1;
          m.at[k][1]();
          if (!d.script) return; // (the moment ended the scene)
        }
      }
    }
    if (u >= 1) {
      if (m.end) m.end();
      if (d.script !== sc) return;
      sc.k++;
      sc.started = false;
      if (sc.k >= sc.moves.length) {
        d.script = null;
        return;
      }
      m = sc.moves[sc.k];
    }
  }

  /** A dragon on the wing eases its legs, wings and neck back to flying. */
  easeExtras(i, dt) {
    const f = this.director.flyers[i];
    const k = 1 - Math.exp(-dt / 0.5);
    f.legs = (f.legs || 0) * (1 - k);
    f.reach = (f.reach || 0) * (1 - k);
    f.crouch = (f.crouch || 0) * (1 - k);
    f.fold = (f.fold || 0) * (1 - k);
    f.neckRaise = (f.neckRaise || 0) * (1 - k);
    f.hipPitch = (f.hipPitch || 0) * (1 - k);
    // Carrying, its jaws stay on the ball.
    if (this.ball.owner === i) f.jaw = Math.max(f.jaw, 0.5);
  }

  // --- Perch -----------------------------------------------------------------------------------

  /**
   * Carrying the ball to the spire: out over the valley to the right, then in along the foot
   * of the bluff (so that what comes toward the viewer comes from the side, wings and all),
   * and off the wing onto the top of the spire.
   */
  carryToPerch(i, job, dt, carrot) {
    const f = this.director.flyers[i];
    if (this.ball.owner !== i) {
      this.director.jobs[i] = null;
      return 17;
    }
    if (job.t > 70) {
      // Something is wrong: put it down where it is, and let the safety net see to it.
      this.yieldJob(i);
      return 17;
    }
    // The way in: from the right, along the bluff, heading left (-x).
    const gate = [SPIRE.x + 46, SPIRE.top + 7, SPIRE.z - 4];
    const before = [gate[0] + 40, gate[1] + 4, gate[2] - 18];
    const dg = Math.hypot(gate[0] - f.x, gate[2] - f.z);
    const lined = Math.abs(wrap(f.heading + Math.PI / 2)) < 35 * DEG;
    if (!job.leg) job.leg = 'before';
    if (job.leg === 'before') {
      carrot[0] = before[0];
      carrot[1] = before[1];
      carrot[2] = before[2];
      if (Math.hypot(before[0] - f.x, before[2] - f.z) < 30) job.leg = 'gate';
      return 22;
    }
    carrot[0] = gate[0] - 12;
    carrot[1] = gate[1];
    carrot[2] = gate[2];
    if (dg < 14 || (f.x < gate[0] + 4 && lined)) {
      this.perchIn(i);
      return f.speed;
    }
    if (dg > 60) job.leg = 'before';
    return 16;
  }

  /** Off the wing, onto the spire; turn to the viewer; reach over with the ball. */
  perchIn(i) {
    const f = this.director.flyers[i];
    const d = this.d[i];
    const job = this.director.jobs[i];
    job.phase = 'scene';
    job.t = 0;
    d.vel = [Math.sin(f.heading) * Math.cos(f.gamma) * f.speed, Math.sin(f.gamma) * f.speed, Math.cos(f.heading) * Math.cos(f.gamma) * f.speed];
    const s = this.sizes[i];
    const land = -Math.PI / 2; // facing along the bluff, to the left
    // Its feet on the near side of the spire's top.
    const toViewer = Math.atan2(this.head[0] - SPIRE.x, this.head[2] - SPIRE.z);
    const feetAt = [SPIRE.x + Math.sin(toViewer) * SPIRE.radius * 0.35, SPIRE.top, SPIRE.z + Math.cos(toViewer) * SPIRE.radius * 0.35];
    const bodyAt = (heading) => [feetAt[0] + Math.sin(heading) * 0.7 * s, 0, feetAt[2] + Math.cos(heading) * 0.7 * s];
    const offerPose = this.solveOffer(i, toViewer, bodyAt(toViewer));
    const moves = [];
    const landAt = bodyAt(land);
    landAt[1] = SPIRE.top + 3 * s;
    moves.push({
      name: 'perch', T: 3.4, to: landAt, toVel: [0, 0, 0], heading: land, standOn: SPIRE.top,
      pose: (g, u) => {
        g.power = u < 0.55 ? 0.6 + 0.4 * smoothstep(0.2, 0.5, u) : lerp(1, 0.2, smoothstep(0.75, 1, u));
        g.brake = smoothstep(0, 0.35, u) * (1 - smoothstep(0.9, 1, u));
        g.legs = smoothstep(0.1, 0.5, u);
        g.reach = Math.sin(clamp(u / 0.95, 0, 1) * Math.PI) * 0.9;
        g.crouch = smoothstep(0.88, 1, u) * 0.5;
        g.pitch = lerp(5, 32, smoothstep(0, 0.6, u)) * DEG - smoothstep(0.75, 1, u) * 24 * DEG;
        g.lookPitch = -0.1;
        g.lookYaw = 0;
        g.stand = smoothstep(0.93, 1, u);
      },
      end: () => this.events.push({ type: 'land', dragon: i, x: f.x, y: SPIRE.top, z: f.z, perch: true }),
    });
    moves.push({
      name: 'turn', T: 2.2, heading: toViewer, standOn: SPIRE.top,
      plan: () => {
        const at = bodyAt(toViewer);
        return { to: [at[0] - Math.sin(toViewer) * offerPose.back, f.y, at[2] - Math.cos(toViewer) * offerPose.back], toVel: [0, 0, 0] };
      },
      pose: (g, u) => {
        g.power = 0;
        g.brake = 0.3 * (1 - u);
        g.legs = 1;
        g.crouch = lerp(0.5, 0.15, smoothstep(0, 0.6, u));
        g.fold = smoothstep(0, 0.6, u);
        g.pitch = 12 * DEG;
        g.lookPitch = -0.1;
        g.lookYaw = 0;
        g.stand = 1;
      },
    });
    moves.push({
      name: 'reach', T: 1.8, heading: toViewer, standOn: SPIRE.top,
      pose: (g, u) => {
        const e = smoothstep(0, 1, u);
        g.power = 0;
        g.brake = 0;
        g.legs = 1;
        g.fold = 1;
        g.crouch = lerp(0.15, offerPose.crouch, e);
        g.pitch = lerp(12 * DEG, offerPose.pitch, e);
        g.neckRaise = offerPose.neckRaise * e;
        g.lookPitch = lerp(-0.1, offerPose.lookPitch, e);
        g.lookYaw = offerPose.lookYaw * e;
        g.stand = 1;
      },
      end: () => {
        this.ball.set('offered');
        this.events.push({ type: 'offer', dragon: i });
      },
    });
    moves.push({
      name: 'offer', T: 60, heading: toViewer, standOn: SPIRE.top,
      pose: (g, u, t) => {
        g.power = 0;
        g.brake = 0;
        g.legs = 1;
        g.fold = 1;
        g.crouch = offerPose.crouch;
        g.pitch = offerPose.pitch;
        // Holding it out, breathing.
        g.neckRaise = offerPose.neckRaise + 0.02 * Math.sin(t * 1.3);
        g.lookPitch = offerPose.lookPitch + 0.015 * Math.sin(t * 0.9);
        g.lookYaw = offerPose.lookYaw;
        g.stand = 1;
      },
      // Not taken in a minute: it lets the ball fall at the viewer's feet, and goes.
      end: () => {
        const b = this.ball;
        if (b.owner === i && b.state === 'offered') {
          this.bodies[i].mouth(f, TMP_M);
          this.toss(i, TMP_M, 1);
          this.letGo(i);
        }
      },
    });
    d.script = { moves, k: 0, t: 0, from: [f.x, f.y, f.z], fromVel: d.vel.slice(), heading: f.heading, started: false };
    this.events.push({ type: 'scene', dragon: i, kind: 'perch' });
  }

  /**
   * The neck and head that bring the ball (in its jaws) to the viewer's chest from the spire:
   * found by search over how far it crouches, lifts its neck, and turns and tips its head.
   */
  solveOffer(i, heading, bodyXZ) {
    const body = this.bodies[i];
    const f = SOLVE_F;
    Object.assign(f, ZERO_F);
    f.heading = heading;
    f.legs = 1;
    f.fold = 1;
    f.pitch = 12 * DEG;
    f.hipPitch = f.pitch;
    f.x = bodyXZ[0];
    f.z = bodyXZ[2];
    // Chest height, a little in front of the viewer and toward the spire.
    const tx = SPIRE.x - this.head[0];
    const tz = SPIRE.z - this.head[2];
    const tl = Math.hypot(tx, tz) || 1;
    const target = [this.head[0] + (tx / tl) * 0.62, this.head[1] - 0.45, this.head[2] + (tz / tl) * 0.62];
    const p = { crouch: 0.2, neckRaise: 0.2, lookPitch: 0, lookYaw: 0, pitch: 12 * DEG, back: 0 };
    // (back: how far back from where it was put it stands, along the line to the viewer.)
    const ux = Math.sin(heading);
    const uz = Math.cos(heading);
    const cost = (q) => {
      f.x = bodyXZ[0] - ux * q.back;
      f.z = bodyXZ[2] - uz * q.back;
      f.crouch = q.crouch;
      f.neckRaise = q.neckRaise;
      f.lookPitch = q.lookPitch;
      f.lookYaw = q.lookYaw;
      f.pitch = q.pitch;
      f.hipPitch = q.pitch;
      f.y = SPIRE.top + body.drop(f);
      body.mouth(f, TMP_S);
      // (And a little against bending far from a natural pose.)
      return Math.hypot(TMP_S[0] - target[0], TMP_S[1] - target[1], TMP_S[2] - target[2]) + 0.04 * (Math.abs(q.lookPitch) + Math.abs(q.neckRaise) + Math.abs(q.pitch));
    };
    const keys = [['crouch', 0, 1], ['neckRaise', -0.9, 0.9], ['lookPitch', -1.4, 0.8], ['lookYaw', -0.6, 0.6], ['pitch', -24 * DEG, 30 * DEG], ['back', -0.7 * SPIRE.radius, 0.35 * SPIRE.radius]];
    let c = cost(p);
    for (let step = 0.3; step > 0.003; step *= 0.6) {
      let better = true;
      while (better) {
        better = false;
        for (const [k, lo, hi] of keys) {
          for (const sgn of [1, -1]) {
            const q = Object.assign({}, p);
            q[k] = clamp(q[k] + sgn * step, lo, hi);
            const e = cost(q);
            if (e < c - 1e-6) {
              c = e;
              Object.assign(p, q);
              better = true;
            }
          }
        }
      }
    }
    p.miss = c;
    this.offerMiss = c;
    return p;
  }

  /** The perched dragon has been relieved of the ball: head back, turn away, and off. */
  letGo(i) {
    const d = this.d[i];
    const f = this.director.flyers[i];
    if (!d.script) return;
    const s = this.sizes[i];
    const away = Math.atan2(SPIRE.x - this.head[0], SPIRE.z - this.head[2]) - 0.35;
    const from = { crouch: f.crouch, neckRaise: f.neckRaise, lookPitch: f.lookPitch, lookYaw: f.lookYaw, pitch: f.pitch };
    const moves = [
      {
        name: 'withdraw', T: 1.4, heading: f.heading, standOn: SPIRE.top,
        start: () => {
          f.cry = 0.6;
          this.events.push({ type: 'pleased', dragon: i });
        },
        pose: (g, u) => {
          const e = smoothstep(0, 1, u);
          g.power = 0;
          g.brake = 0;
          g.legs = 1;
          g.fold = 1;
          g.crouch = lerp(from.crouch, 0.2, e);
          g.pitch = lerp(from.pitch, 12 * DEG, e);
          g.neckRaise = lerp(from.neckRaise, 0.15, e);
          g.lookPitch = lerp(from.lookPitch, 0, e);
          g.lookYaw = lerp(from.lookYaw, 0, e);
          g.jaw = u < 0.3 ? 0.7 : 0.1;
          g.stand = 1;
        },
      },
      {
        name: 'turn away', T: 2.4, heading: away, standOn: SPIRE.top,
        pose: (g, u) => {
          g.power = 0;
          g.brake = 0;
          g.legs = 1;
          g.fold = 1 - smoothstep(0.6, 1, u);
          g.crouch = 0.2;
          g.pitch = 12 * DEG;
          g.neckRaise = 0.15;
          g.lookPitch = 0;
          g.lookYaw = 0;
          g.stand = 1;
        },
      },
      {
        name: 'leap', T: 2.4, heading: away,
        plan: (start) => {
          const ux = Math.sin(away);
          const uz = Math.cos(away);
          return { to: [start[0] + ux * 22, start[1] - 7, start[2] + uz * 22], toVel: [ux * 15, -2, uz * 15] };
        },
        pose: (g, u) => {
          g.crouch = smoothstep(0, 0.15, u) * 0.85 * (1 - smoothstep(0.15, 0.3, u));
          g.power = u < 0.18 ? 0.2 : 1;
          g.brake = 0.5 * (1 - smoothstep(0.15, 0.6, u));
          g.legs = 1 - smoothstep(0.3, 0.85, u);
          g.fold = 0;
          g.pitch = lerp(10, 2, u) * DEG;
          g.lookPitch = 0;
          g.lookYaw = 0;
          g.neckRaise = 0;
          g.jaw = 0;
          g.stand = 1 - smoothstep(0.12, 0.25, u);
        },
        end: () =>
          this.backOnTheWing(i, () => {
            this.director.jobs[i] = { kind: 'fetch', phase: 'away', t: 0, length: 4, dir: [Math.sin(away), 0, Math.cos(away)], climb: 6 };
          }),
      },
    ];
    // (s is the size: a smaller dragon leaps less far; the path above is the big one's.)
    void s;
    d.script = { moves, k: 0, t: 0, from: [f.x, f.y, f.z], fromVel: [0, 0, 0], heading: f.heading, started: false };
    if (this.claim === i) this.claim = -1;
  }
}

const TMP_M = [0, 0, 0];
const TMP_F = [0, 0, 0];
const TMP_S = [0, 0, 0];
const POS = [0, 0, 0];
const VEL = [0, 0, 0];
const POS2 = [0, 0, 0];
const VEL2 = [0, 0, 0];
const ZERO3 = [0, 0, 0];
const G_POSE = {};
const ZERO_F = {
  x: 0, y: 0, z: 0, heading: 0, pitch: 0, bank: 0, flap: 0, power: 0, tuck: 0, brake: 0, turn: 0, arch: 0,
  lookYaw: 0, lookPitch: 0, jaw: 0, legs: 0, reach: 0, crouch: 0, hipPitch: 0, fold: 0, neckRaise: 0, set: 0,
};
const SOLVE_F = Object.assign({}, ZERO_F);

/** The path along a move is eased at the end for moves that stop (they come to rest gently). */
function smoothU(u, m) {
  void m;
  return u;
}
