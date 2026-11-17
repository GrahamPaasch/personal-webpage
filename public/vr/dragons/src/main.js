/**
 * main.js: wiring. Builds the valley, flies the dragons, and starts sound and VR from a tap.
 *
 * Things in the address that change how it runs (all optional):
 *   ?seed=7          the same flight every time (otherwise each visit flies differently)
 *   ?scale=0.8       VR picture size relative to the headset's own (smaller is faster)
 *   ?foveation=0.5   how much the edges of the VR picture are coarsened, 0..1
 *   ?layers=off      draw VR through a plain XRWebGLLayer
 *   ?aa=0            no anti-aliasing (cheaper; edges are rougher)
 *   ?trees=0.6       draw only this fraction of the forest
 *   ?hrtf=0          place the dragons' sound with plain left/right panning (cheaper)
 *   ?reverb=0        no echo off the hills (cheaper)
 *   ?sound=lite      both of those at once: about a fifth off what the sound costs
 *   ?governor=off    never thin the picture, whatever the frame rate (the tools use this: a
 *                    software renderer is slow, and they must count the whole picture)
 *   ?shots=1         for the tools: no card, no controls
 *
 * A VR session that could not hold its frame rate is remembered (in this browser only, for two
 * weeks), and the next one starts with a smaller picture or without anti-aliasing: see
 * governor.js, nextSession(). ?scale= and ?aa= in the address overrule what is remembered.
 */
import { Stage, THREE, WORLD_SEED, HINT } from './scene.js';
import { VIGNETTE, worldMaterial } from './shaders.js';
import { FlatView } from './view.js';
import { DragonView } from './dragons.js';
import { DRAGONS } from './dragonGeometry.js';
import { Director, ROAR_SECONDS, NEAR_RANGE, floorGrid } from './flight.js';
import { Soundscape } from './audio.js';
import { XRControl } from './xr.js';
import { Governor, QUALITY, QUALITY_WORDS, nextSession } from './governor.js';
import { SUN_DIR } from './world.js';
import { Fetch, REST_SPOT } from './fetch.js';
import { BallView, buildHand } from './ballView.js';

/** How many of the sparks in the air are alight when no dragon has breathed fire for a while (0..1). */
const EMBER_REST = 0.35;
/** How far off the wake of a dragon is first felt on the ledge, and how near it is felt in full (metres). */
const WAKE_FAR = 34;
const WAKE_NEAR = 17;

const params = new URLSearchParams(location.search);
const number = (name) => {
  const v = params.get(name);
  return v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
};
const TOOLS = params.has('shots');

const $ = (id) => document.getElementById(id);
const dom = {
  veil: $('veil'), enterVR: $('enterVR'), watch: $('watch'), note: $('note'), hud: $('hud'),
  sound: $('soundChip'), call: $('callChip'), vrChip: $('vrChip'), hint: $('hint'),
  throwChip: $('throwChip'), modeChip: $('modeChip'),
};

const state = {
  time: 0, // seconds the picture has been running (wind, leaves)
  begun: false, // the card is gone: the piece has started
  paused: false,
  sound: true,
  wind: 0.5, // how hard the wind is blowing, 0..1, as the trees show it
  wake: 0, // how hard the wake of a dragon going by is felt on the ledge, 0..1
  cover: 0, // how much of the sun a dragon is covering, seen from the ledge, 0..1
  ember: EMBER_REST, // how many of the sparks in the air are alight, 0..1
  nearest: Infinity, // how far the nearer dragon is from the viewer's head (metres)
  calls: 0,
  answered: 0,
  quality: 0,
  // What is remembered from one VR session to the next (see nextSession in governor.js).
  pace: { scale: 1, aa: true },
  antialias: true, // whether this page's picture was set up with anti-aliasing
  // The line in the headset about the trigger: when it is next due, and whether it is still wanted.
  hint: { due: Infinity, wanted: true },
  failed: {}, // parts of the frame that threw and have been switched off: name -> true
  vr: { checking: true, supported: false, reason: '', presenting: false, starting: false, error: '', last: '' },
};

/** Where what is remembered between sessions is kept, in this browser, and for how many days. */
const PACE_KEY = 'two-dragons.pace';
const PACE_DAYS = 14;

let stage;
let view;
let director;
let dragons;
let audio;
let xr;
let governor;
let game; // fetch.js: the ball and what the dragons do with it
let ballView;
const jaws = [0, 0, 0]; // where a ball in a dragon's jaws is drawn
let jawsShown = false;
const throwKey = { down: 0, held: false }; // a throw from a flat screen: held longer, thrown harder
const target = { x: 0, y: 0, z: -150 };
const listener = { position: [0, 1.62, 0], forward: [0, 0, -1], up: [0, 1, 0] };
const movers = [
  { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0, beating: 0, cupped: 0 },
  { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0, beating: 0, cupped: 0 },
];
const tmpHead = new THREE.Vector3();
const head = [0, 1.62, 0]; // where the viewer's head is, in the world
const gust = [0, 0, 0]; // how fast the wake of the dragons is carrying the leaves (m/s)
let soundFailed = false;
let lastWhistle = -10;

// ---------------------------------------------------------------------------------------------

async function build() {
  const canvas = $('stage');
  const t0 = performance.now();
  // What is being made, on the card.
  const note = (text) => {
    dom.note.textContent = text;
  };
  state.pace = recall();
  try {
    // Anti-aliasing is chosen once, when the picture is set up: by the address if it says,
    // otherwise by how the last VR session went.
    state.antialias = params.has('aa') ? params.get('aa') !== '0' : state.pace.aa;
    stage = new Stage(canvas, { antialias: state.antialias });
  } catch (err) {
    showNo3D(err);
    return;
  }
  await stage.build(note);
  view = new FlatView(stage);
  dragons = [new DragonView(stage, 0), new DragonView(stage, 1)];
  note('Waking the dragons\u2026');
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The map of how low a dragon may fly: worked out now, not in the first frame.
  floorGrid();
  // The ball, its glow and trail, the splashes and the hands: made now, so that their shaders
  // are compiled with everything else's.
  ballView = new BallView(stage);
  const handMaterial = worldMaterial(stage.shared, { lit: true });
  const hands = { left: buildHand(stage, handMaterial, 1), right: buildHand(stage, handMaterial, -1) };
  for (const h of [hands.left, hands.right]) {
    h.position.set(0, 0, -0.03);
    h.visible = false;
    stage.scene.add(h); // (until a controller is there to carry it)
  }
  for (const s2 of ballView.splashes) s2.mesh.visible = true;
  ballView.trail.visible = true;
  // Every shader is compiled now, the ones for things not yet in sight too (a mirror image in
  // the lake, fire): otherwise the first roar would cost a dropped frame or ten on a headset.
  try {
    stage.renderer.compile(stage.scene, stage.camera);
  } catch (err) {
    console.warn('Shaders will be compiled as they are first needed.', err);
  }
  const seed = number('seed');
  director = new Director(DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale })), seed === undefined ? WORLD_SEED : seed);
  game = new Fetch(director, DRAGONS);
  for (const s2 of ballView.splashes) s2.mesh.visible = false;
  ballView.trail.visible = false;
  state.hands = hands;
  audio = new Soundscape({ hrtf: params.get('hrtf') !== '0', reverb: params.get('reverb') !== '0', lite: params.get('sound') === 'lite', seed: director.seed });
  governor = new Governor();
  const trees = number('trees');
  if (trees !== undefined) stage.setForestFraction(Math.min(Math.max(trees, 0.05), 1));

  xr = new XRControl(
    stage,
    {
      onSessionStart: () => {
        state.vr.presenting = true;
        state.vr.error = '';
        state.vr.last = '';
        unlockSound();
        governor.reset();
        applyQuality();
        stage.setVignette(VIGNETTE.vr);
        begin(true);
        // How to call a dragon, on the rim of the ledge; again later if nobody has (see frame).
        state.hint.wanted = true;
        state.hint.due = Infinity;
        // First how to pick up and throw the ball; the trigger's line comes later (see hint()).
        stage.showHint(14, HINT.ball);
        state.hint.ballShown = true;
        game.setHands(true);
        showControls();
      },
      onSessionEnd: () => {
        state.vr.presenting = false;
        // No hands any more: a ball in one goes back on the rock.
        game.setHands(false);
        if (game.ball.state === 'held') game.ball.place(REST_SPOT[0], REST_SPOT[1]);
        stage.setVignette(VIGNETTE.flat);
        sound(() => audio.sleep('hidden', document.hidden));
        const report = xr.sessionReport();
        if (report) report.level = state.quality;
        // How it went decides what the next session starts with: one step cheaper than this
        // one really was (which is what is remembered, unless the address said otherwise).
        const ran = { scale: xr.scale, aa: state.antialias };
        const next = params.get('governor') === 'off' ? null : nextSession(ran, report);
        state.vr.last = describeSession(report, next);
        if (next && next.change) {
          state.pace = { scale: next.change === 'scale' ? next.scale : state.pace.scale, aa: next.change === 'aa' ? next.aa : state.pace.aa };
          remember(state.pace);
          xr.setScale(state.pace.scale);
        }
        stage.hideHint();
        layout();
        showControls();
        if (state.vr.last) say(state.vr.last, 40);
      },
      onTrigger: () => call() >= 0,
      // Grip: take the ball (if the hand is at it); let go: throw it.
      onGrip: (c, down) => attempt('fetch', grip, c, down),
      // A (or X): exercise and perch, in turn.
      onButtonA: (c) => attempt('fetch', toggleMode, c),
      // The headset has been taken off (or put back on): quiet while nobody is in it.
      onVisibility: (visible) => sound(() => audio.sleep('hidden', !visible)),
    },
    { plainLayer: params.get('layers') === 'off', scale: number('scale'), foveation: number('foveation') }
  );
  // What the last session asked for, unless the address says what size.
  xr.setScale(state.pace.scale);

  wireControls(canvas);
  window.addEventListener('resize', layout);
  layout();
  pose(1 / 72);

  let last = 0;
  stage.renderer.setAnimationLoop((stamp, xrFrame) => {
    const now = typeof stamp === 'number' ? stamp : performance.now();
    const dt = last ? Math.min(Math.max((now - last) / 1000, 0), 0.1) : 1 / 72;
    last = now;
    frame(dt, xrFrame);
  });

  xr.checkSupport().then(() => {
    state.vr.checking = false;
    state.vr.supported = xr.supported;
    state.vr.reason = xr.reason;
    showControls();
  });

  state.buildMs = performance.now() - t0;
  if (TOOLS) {
    document.body.classList.add('tools');
    dom.veil.hidden = true;
  }
  dom.watch.disabled = false;
  showControls();

  // For the tools and tests, and for poking at it from a console.
  window.__dragons = {
    stage, view, state, THREE, dragons, director, audio, xr, governor, seek, fly, call, begin, applyQuality, frame,
    game, ballView, throwFlat, pose,
    ready: true,
    buildMs: state.buildMs,
    setFlatShot: () => {
      state.paused = true;
      view.follow = false;
    },
  };
}

/** The browser cannot draw 3D at all: say so, and offer nothing that would not work. */
function showNo3D(err) {
  dom.note.textContent =
    'This browser could not start WebGL, which the picture needs. Try another browser, or switch hardware acceleration on in this one.' +
    (err && err.message ? ' (' + err.message + ')' : '');
  dom.enterVR.disabled = true;
  dom.watch.disabled = true;
  window.__dragons = { ready: false, failed: true, state };
}

// ---------------------------------------------------------------------------------------------
// One frame
// ---------------------------------------------------------------------------------------------

/**
 * Whatever goes wrong in one part of a frame, the picture must still be drawn: three.js asks
 * for the next frame only after this one returns, so one exception anywhere would leave a
 * headset showing a frozen image that no longer follows the head. Each part is tried on its
 * own; a part that throws is reported once and not called again, and the rest goes on.
 */
function attempt(part, fn, a, b) {
  if (state.failed[part]) return;
  try {
    fn(a, b);
  } catch (err) {
    state.failed[part] = true;
    console.error('The ' + part + ' failed and has been switched off; the picture goes on.', err);
  }
}

function frame(dt, xrFrame) {
  if (!state.paused) {
    attempt('flight', advance, dt);
    attempt('dragons', pose, dt);
  }
  if (xr.presenting) {
    attempt('headset', headset, dt, xrFrame);
    attempt('governor', govern, dt, xr.nominal);
    attempt('hint', hint, dt);
  } else {
    attempt('view', flatView, dt);
    // A flat screen has no set rate; step down only if it is plainly struggling.
    if (state.begun) attempt('governor', govern, dt, 1 / 45);
  }
  attempt('surroundings', surroundings, dt);
  attempt('ball', drawBall, dt);
  hear(dt);
  // This one is not switched off if it throws: there is nothing to fall back on, and the
  // next frame may be drawn.
  try {
    stage.render();
  } catch (err) {
    if (!state.failed.render) console.error('The picture could not be drawn.', err);
    state.failed.render = true;
  }
}

// (The parts of a frame are plain functions, not closures made in frame(): nothing is made per frame.)
function headset(dt, xrFrame) {
  xr.update(dt, xrFrame);
  // A hand holding the ball carries it (and may be winding up a throw).
  for (const c of xr.controllers) {
    const hand = state.hands[c.handedness === 'left' ? 'left' : 'right'];
    if (c.tracked && hand.parent !== c.grip) c.grip.add(hand);
    hand.visible = c.tracked;
    if (!c.tracked) continue;
    if (game.ball.state === 'held' && game.ball.hand === handName(c)) {
      game.hold(handName(c), c.position.x, c.position.y, c.position.z, c.velocity.x, c.velocity.y, c.velocity.z);
    }
  }
}

function handName(c) {
  return c.handedness === 'left' ? 'left' : c.handedness === 'right' ? 'right' : 'hand' + c.index;
}

/** The grip closed or opened on controller c. */
function grip(c, down) {
  const name = handName(c);
  if (down) {
    if (game.grab(name, c.position.x, c.position.y, c.position.z)) {
      xr.buzz(c, 0.45, 40);
      unlockSound();
    }
  } else if (game.ball.state === 'held' && game.ball.hand === name) {
    game.release(name, c.velocity.x, c.velocity.y, c.velocity.z);
    xr.buzz(c, 0.25, 25);
  }
}

function toggleMode(c) {
  const mode = game.toggleMode();
  if (c) xr.buzz(c, 0.35, 30);
  if (xr.presenting) stage.showHint(5, mode === 'perch' ? HINT.perch : HINT.exercise, true);
  else say(mode === 'perch' ? 'Perch: they bring it to the rock beside you.' : 'Exercise: they drop it at your feet.', 4);
  showControls();
}

/** The ball, its glow and trail, and the splashes: where the game says (in the jaws, where the picture has the head). */
function drawBall(dt) {
  const cam = xr.presenting ? stage.renderer.xr.getCamera() : stage.camera;
  tmpHead.setFromMatrixPosition(cam.matrixWorld);
  const b = game.ball;
  // In flat view the ball in hand is not drawn (it would fill the screen): it is thrown with T.
  ballView.orb.visible = !(b.state === 'held' && !xr.presenting);
  ballView.halo.visible = ballView.orb.visible;
  ballView.update(b, tmpHead, dt, state.time, jawsShown ? jaws : null);
}

/** Throw from a flat screen, as hard as `hand` (m/s at the hand), the way the view faces. */
function throwFlat(hand) {
  if (!game) return false;
  unlockSound();
  const yaw = view ? view.yaw : 0;
  return game.throwFlat(yaw, hand);
}

function govern(dt, nominal) {
  if (governor.frame(dt, nominal)) applyQuality();
}

function flatView(dt) {
  if (!state.paused) {
    // Left alone for a while, the view goes back to following the dragons.
    if (!view.follow && !view.dragging && view.idle > 25) view.follow = true;
    view.update(dt, target, state.nearest);
  }
  view.apply();
}

/**
 * What the dragons do to the place as they go by: their wake bends the trees by the ledge and
 * carries the leaves in the air, their shadow crosses the ledge when they pass in front of the
 * low sun, and the glare round the sun dims behind them.
 */
function surroundings(dt) {
  const cam = xr.presenting ? stage.renderer.xr.getCamera() : stage.camera;
  tmpHead.setFromMatrixPosition(cam.matrixWorld);
  head[0] = tmpHead.x;
  head[1] = tmpHead.y;
  head[2] = tmpHead.z;
  // (Before the session has placed the person on the ledge, the head is wherever the room had it.)
  if (!xr.presenting || xr.placed) game.setHead(head[0], head[1], head[2]);
  const flyers = director.flyers;
  let wake = 0;
  let cover = 0;
  let fire = 0;
  let nearest = Infinity;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  for (let i = 0; i < flyers.length; i++) {
    const f = flyers[i];
    const dx = f.x - head[0];
    const dy = f.y - head[1];
    const dz = f.z - head[2];
    const d = Math.hypot(dx, dy, dz) || 1;
    if (d < nearest) nearest = d;
    // The wake: felt inside 34 m, hard inside 17 (an animal of twenty metres moves a lot of
    // air), and more of it from the bigger one. It goes the way the dragon goes, and down.
    const w = Math.min(Math.max((WAKE_FAR - d) / (WAKE_FAR - WAKE_NEAR), 0), 1) * f.size;
    if (w > wake) wake = w;
    const flat = Math.cos(f.gamma);
    gx += w * (5.5 * flat * Math.sin(f.heading));
    gy += w * -1.6;
    gz += w * (5.5 * flat * Math.cos(f.heading));
    // Fire puts sparks in the air: all of them alight after a breath close by, fewer after
    // one far off.
    if (dragons[i].fire > 0.2) fire = Math.max(fire, Math.min(Math.max(1.25 - d / 200, 0.45), 1));
    // Covering the sun: how near the line from the head to the sun its body is, against how
    // wide it looks from here. (Wings and all, a dragon of size 1 is about 9 m across in the mean.)
    const along = (dx * SUN_DIR[0] + dy * SUN_DIR[1] + dz * SUN_DIR[2]) / d;
    if (along > 0.9) {
      const off = Math.acos(Math.min(along, 1));
      const wide = Math.atan((4.5 * f.size) / d);
      const c = Math.min(Math.max((1.25 * wide - off) / (0.75 * wide), 0), 1);
      if (c > cover) cover = c;
    }
  }
  state.nearest = nearest;
  // Quick to come, slow to go: a gust dies away, a shadow passes.
  state.wake += (wake - state.wake) * (1 - Math.exp(-dt / (wake > state.wake ? 0.25 : 1.4)));
  state.cover += (cover - state.cover) * (1 - Math.exp(-dt / 0.09));
  const ease = 1 - Math.exp(-dt / (wake > 0.02 ? 0.3 : 1.1));
  gust[0] += (gx - gust[0]) * ease;
  gust[1] += (gy - gust[1]) * ease;
  gust[2] += (gz - gust[2]) * ease;
  if (!state.paused) stage.blowLeaves(gust[0] * dt, gust[1] * dt, gust[2] * dt);
  stage.setCover(state.cover);
  // Quick to catch, slow to die down.
  const sparks = Math.max(fire, EMBER_REST);
  state.ember += (sparks - state.ember) * (1 - Math.exp(-dt / (sparks > state.ember ? 0.7 : 20)));
  stage.setEmber(state.ember);
  // The trees sway with the wind that is heard (without sound the gusts come and go by the
  // clock), and with the wake of a dragon going by close.
  const blowing = audio.running && !soundFailed ? audio.gust : 0.5 + 0.3 * Math.sin(state.time * 0.23) + 0.2 * Math.sin(state.time * 0.61 + 1.3);
  state.wind += (blowing - state.wind) * (1 - Math.exp(-dt / 1.6));
  stage.setWind(Math.min(Math.max(state.wind, state.wake * 1.15), 1.25));
  stage.update(state.time);
}

/**
 * The line in the headset about the trigger. It is shown as the session starts; if nobody has
 * called a dragon and both are far off three quarters of a minute later, it is shown again
 * (that is when a call is wanted), and so on until one call has been answered.
 */
function hint(dt) {
  stage.updateHint(dt);
  const h = state.hint;
  if (!h.wanted || stage.hint.showing) {
    h.due = Infinity;
    return;
  }
  if (h.due === Infinity) h.due = state.time + HINT_EVERY;
  if (state.time >= h.due && state.nearest > NEAR_RANGE) stage.showHint(12, HINT.call);
}
const HINT_EVERY = 45;

/** Fly. Long frames are flown in several short steps, so the flight does not depend on the frame rate. */
function advance(dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 45)));
  for (let i = 0; i < n; i++) director.step(dt / n);
  state.time += dt;
  const events = director.drain();
  if (events.length && audio.running && !soundFailed) {
    try {
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.type === 'beat') audio.beat(e.dragon, e.strength);
        else if (e.type === 'roar') audio.roar(e.dragon, e.kind, ROAR_SECONDS);
        else if (e.type === 'call') audio.cry(e.dragon, 'answer');
        else if (e.type === 'busy') audio.cry(e.dragon, 'busy');
      }
    } catch (err) {
      soundBroke(err);
    }
  }
  playEvents();
}

/** What has happened in the game since the last frame: heard, seen, felt. */
function playEvents() {
  const list = game.events;
  if (!list.length) return;
  const hearing = audio.running && !soundFailed;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    try {
      if (e.type === 'splash') {
        ballView.splash(e.x, e.y, e.z, e.size);
        if (hearing) audio.thing(e.thrash ? 'thrash' : 'splash', e.x, e.y, e.z, e.size);
      } else if (e.type === 'bounce') {
        if (hearing) audio.thing(e.rock ? 'rock' : 'thud', e.x, e.y, e.z, e.size);
      } else if (e.type === 'rustle') {
        if (hearing) audio.thing('rustle', e.x, e.y, e.z, 1);
      } else if (e.type === 'catch') {
        const f = director.flyers[e.dragon];
        if (hearing) audio.thing('snap', f.x, f.y, f.z, 1);
      } else if (e.type === 'land') {
        if (hearing) audio.thing('land', e.x, e.y, e.z, DRAGONS[e.dragon].build.scale / 1.45);
      } else if (e.type === 'roar') {
        if (hearing) audio.roar(e.dragon, 'call', ROAR_SECONDS);
      } else if (e.type === 'betrayed') {
        if (hearing) audio.cry(e.dragon, 'busy');
      } else if (e.type === 'pleased' || e.type === 'eager') {
        // They answer: the one nearer, a short call.
        if (hearing) audio.cry(e.dragon !== undefined ? e.dragon : nearer(), 'answer');
      } else if (e.type === 'throw') {
        if (hearing) audio.thing('swish', head[0] + 0.3, head[1], head[2] - 0.4, Math.min(e.speed / 25, 1));
        state.hint.wanted = state.hint.wanted && game.throws < 1;
      } else if (e.type === 'fresh') {
        if (xr.presenting) for (const c of xr.controllers) if (handName(c) === game.ball.hand) xr.buzz(c, 0.6, 60);
      } else if (e.type === 'offer') {
        // Held out to be taken: a buzz in both hands, so it is noticed.
        if (xr.presenting) for (const c of xr.controllers) xr.buzz(c, 0.3, 40);
      }
    } catch (err) {
      soundBroke(err);
    }
  }
  list.length = 0;
}

function nearer() {
  const f = director.flyers;
  return Math.hypot(f[0].x, f[0].z) < Math.hypot(f[1].x, f[1].z) ? 0 : 1;
}

function pose(dt) {
  const f = director.flyers;
  for (let i = 0; i < dragons.length; i++) dragons[i].update(f[i], state.time, dt);
  // A ball in a dragon's jaws is drawn where the picture has its head (to the centimetre).
  jawsShown = false;
  if (game) {
    const b = game.ball;
    if ((b.state === 'carried' || b.state === 'offered') && b.owner >= 0) {
      dragons[b.owner].pointOnHead(game.bodies[b.owner].held, jaws);
      jawsShown = true;
    }
  }
  // The flat view looks at the nearer dragon, mostly.
  const d0 = Math.hypot(f[0].x, f[0].y, f[0].z);
  const d1 = Math.hypot(f[1].x, f[1].y, f[1].z);
  const w = 1 / (d0 * d0) / (1 / (d0 * d0) + 1 / (d1 * d1));
  target.x = f[0].x * w + f[1].x * (1 - w);
  target.y = f[0].y * w + f[1].y * (1 - w);
  target.z = f[0].z * w + f[1].z * (1 - w);
}

/** Tell the sound where the viewer's head and the dragons are. (Every frame: it makes no garbage.) */
function hear(dt) {
  if (!audio.running || soundFailed) return;
  try {
    const cam = xr.presenting ? stage.renderer.xr.getCamera() : stage.camera;
    const e = cam.matrixWorld.elements;
    tmpHead.setFromMatrixPosition(cam.matrixWorld);
    listener.position[0] = tmpHead.x;
    listener.position[1] = tmpHead.y;
    listener.position[2] = tmpHead.z;
    listener.forward[0] = -e[8];
    listener.forward[1] = -e[9];
    listener.forward[2] = -e[10];
    listener.up[0] = e[4];
    listener.up[1] = e[5];
    listener.up[2] = e[6];
    const flyers = director.flyers;
    for (let i = 0; i < flyers.length; i++) {
      const f = flyers[i];
      const m = movers[i];
      const flat = Math.cos(f.gamma) * f.speed;
      m.x = f.x;
      m.y = f.y;
      m.z = f.z;
      m.vx = flat * Math.sin(f.heading);
      m.vy = Math.sin(f.gamma) * f.speed;
      m.vz = flat * Math.cos(f.heading);
      m.speed = f.speed;
      m.beating = f.power;
      m.cupped = f.brake;
    }
    audio.setWash(state.wake);
    audio.update(dt, listener, movers);
  } catch (err) {
    soundBroke(err);
  }
}

/** Sound must never stop the picture: whatever it throws is reported once and then left alone. */
function sound(fn) {
  if (soundFailed) return;
  try {
    fn();
  } catch (err) {
    soundBroke(err);
  }
}

function soundBroke(err) {
  soundFailed = true;
  console.warn('Sound stopped after an error; the picture goes on.', err);
}

function unlockSound() {
  sound(() => {
    // (How big each one sounds, not how big it is drawn: see `voice` in dragonGeometry.js.)
    if (audio.unlock(DRAGONS.map((d) => d.voice))) audio.setMuted(!state.sound);
  });
}

function applyQuality() {
  if (params.get('governor') === 'off') governor.reset();
  const q = QUALITY[governor.level];
  state.quality = governor.level;
  const trees = number('trees');
  stage.setForestFraction(q.forest * (trees === undefined ? 1 : Math.min(Math.max(trees, 0.05), 1)));
  stage.setLeafFraction(q.leaves);
  stage.setAirFraction(q.air);
  for (const d of dragons) d.mirrorOn = q.mirror;
  sound(() => audio.setLite(q.sound === 'lite' || params.get('sound') === 'lite'));
}

/**
 * What is remembered from the last VR session, if anything, and if it is not too old: nothing
 * is ever put back by a session that went well (it would only go wrong again the time after),
 * so what is remembered lapses by itself, and a headset that had one bad day gets its full
 * picture back.
 */
function recall() {
  try {
    const kept = JSON.parse(window.localStorage.getItem(PACE_KEY) || 'null');
    const lapsed = kept && typeof kept.at === 'number' && Date.now() - kept.at > PACE_DAYS * 86400000;
    if (kept && !lapsed && kept.scale > 0.3 && kept.scale <= 1) return { scale: kept.scale, aa: kept.aa !== false };
  } catch (err) {
    /* nothing kept, or keeping is not allowed here */
  }
  return { scale: 1, aa: true };
}

function remember(pace) {
  try {
    window.localStorage.setItem(PACE_KEY, JSON.stringify({ scale: pace.scale, aa: pace.aa, at: Date.now() }));
  } catch (err) {
    /* not allowed here: then every session starts as the first */
  }
}

// ---------------------------------------------------------------------------------------------
// Starting, calling, and the controls on the page
// ---------------------------------------------------------------------------------------------

/**
 * The piece begins (again): the dragons start from the far end of the lake and fly their
 * opening. From the card this happens behind a closed curtain, so nothing is seen to jump.
 */
function begin(fresh) {
  if (fresh || !state.begun) {
    if (number('seed') === undefined) director.seed = (Date.now() % 100000) + 1;
    director.reset();
    pose(1 / 72);
    view.follow = true;
  }
  state.begun = true;
  dom.veil.classList.add('gone'); // the curtain, if it was closed, fades with the rest
}

/** "Watch here": close the curtain, start, open it. */
function watchHere() {
  if (state.begun || state.starting) return; // a second press while the curtain closes changes nothing
  state.starting = true;
  unlockSound();
  dom.veil.classList.add('curtain');
  setTimeout(() => {
    state.starting = false;
    begin(true);
    showControls();
    say('Hold T (or the Throw button) to throw the ball. Drag to look around; tap, or Space, to call a dragon.', 10);
  }, 320);
}

/** Whistle for a dragon. One comes if one is free. */
function call() {
  if (!director) return -1;
  unlockSound();
  const now = performance.now() / 1000;
  if (now - lastWhistle > 1.2) {
    lastWhistle = now;
    if (audio.running) sound(() => audio.whistle());
  }
  state.calls++;
  const who = director.call();
  if (who >= 0) {
    state.answered++;
    // Whoever has called one and seen it come needs no more telling how.
    state.hint.wanted = false;
  } else if (!xr.presenting) {
    say('One is on its way already.', 4);
  }
  return who;
}

async function toggleVR() {
  if (state.vr.presenting) {
    xr.exit();
    return;
  }
  if (xr.starting) return; // one request at a time: a second press changes nothing
  unlockSound();
  state.vr.error = '';
  state.vr.starting = true;
  showControls();
  try {
    await xr.enter();
  } catch (err) {
    console.warn('Could not start VR', err);
    state.vr.error = 'Could not start VR: ' + (err && err.message ? err.message : err);
  }
  state.vr.starting = false;
  showControls();
}

/**
 * A line or two about the session that just ended, to read out or send back: how it ran, how
 * far the governor had to step down, and what the next session will start with instead.
 */
function describeSession(report, next) {
  if (!report) return '';
  const size = report.scale < 0.999 ? ', at ' + report.scale + ' of full size' : '';
  return (
    'Last VR session: ' + report.fps.toFixed(0) + ' frames a second on average (the headset asks for ' + report.target.toFixed(0) + '), ' +
    (report.late * 100).toFixed(report.late < 0.1 ? 1 : 0) + '% of frames late, slowest ' + report.slowestMs.toFixed(0) + ' ms, detail step ' + state.quality + ' of ' + (QUALITY.length - 1) +
    ' (' + QUALITY_WORDS[state.quality] + '), drawn through ' + report.renderPath + size + '.' + (next && next.words ? ' ' + next.words : '')
  );
}

let sayTimer = 0;
/** A line at the top of the page that fades after a while. */
function say(text, seconds) {
  if (TOOLS) return;
  dom.hint.textContent = text;
  dom.hint.hidden = false;
  // Next frame, so that the fade-in runs.
  requestAnimationFrame(() => dom.hint.classList.remove('gone'));
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => dom.hint.classList.add('gone'), (seconds || 8) * 1000);
}

/** Bring every button and note in line with the state. */
function showControls() {
  const vr = state.vr;
  const label = vr.presenting ? 'Leave VR' : vr.starting ? 'Starting VR…' : 'Enter VR';
  dom.enterVR.textContent = label;
  dom.enterVR.disabled = !vr.supported || vr.starting;
  dom.vrChip.textContent = label;
  dom.vrChip.disabled = vr.starting;
  dom.vrChip.hidden = !vr.supported;
  // Without a headset the flat view is the main thing: it gets the bright button.
  dom.enterVR.classList.toggle('primary', vr.supported || vr.checking);
  dom.watch.classList.toggle('primary', !vr.supported && !vr.checking);
  if (vr.error) dom.note.textContent = vr.error;
  else if (vr.checking) dom.note.textContent = 'Looking for a headset…';
  else if (vr.supported) dom.note.textContent = 'In the headset: grip to pick up the ball, let go to throw. A switches how they bring it back; the trigger calls a dragon. Sound on.';
  else dom.note.textContent = vr.reason + ' Here you can watch: drag to look around, hold T (or the Throw button) to throw the ball, A to switch how they bring it back.';
  dom.hud.hidden = TOOLS || !state.begun || vr.presenting;
  dom.sound.setAttribute('aria-pressed', String(state.sound));
  if (game) dom.modeChip.textContent = game.mode === 'perch' ? 'Perch' : 'Exercise';
}

function wireControls(canvas) {
  dom.enterVR.addEventListener('click', toggleVR);
  dom.vrChip.addEventListener('click', toggleVR);
  dom.watch.addEventListener('click', watchHere);
  dom.call.addEventListener('click', () => call());
  dom.sound.addEventListener('click', () => {
    state.sound = !state.sound;
    // (Told before it is woken: switched off, it must not start up only to be stopped again.)
    sound(() => audio.setMuted(!state.sound));
    unlockSound();
    showControls();
  });
  // A tap on the picture (not a drag) calls a dragon.
  let downAt = 0;
  canvas.addEventListener('pointerdown', () => {
    downAt = performance.now();
  });
  canvas.addEventListener('pointerup', () => {
    if (!state.begun || xr.presenting) return;
    unlockSound();
    if (view.wasTap() && performance.now() - downAt < 450) call();
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    // (M, T and A work wherever the focus is; Space and Enter on a button press the button.)
    if (e.target && /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(e.target.tagName) && !/^Key[MTA]$/.test(e.code)) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      if (!state.begun) watchHere();
      else call();
      e.preventDefault();
    } else if (e.code === 'KeyM') {
      dom.sound.click();
    } else if (e.code === 'KeyT' && state.begun) {
      windUp();
    } else if (e.code === 'KeyA' && state.begun) {
      toggleMode(null);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyT') letFly();
  });
  // The throw button: hold it to throw harder.
  dom.throwChip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    windUp();
  });
  dom.throwChip.addEventListener('pointerup', letFly);
  dom.throwChip.addEventListener('pointerleave', letFly);
  dom.modeChip.addEventListener('click', () => toggleMode(null));
  // No sound from a tab nobody is looking at. (In the headset it is the VR session that says
  // whether anybody is looking: see onVisibility.)
  document.addEventListener('visibilitychange', () => {
    if (xr.presenting) return;
    sound(() => audio.sleep('hidden', document.hidden));
  });
}

/** T (or the throw button) pressed: the longer it is held, the harder the throw. */
function windUp() {
  if (throwKey.held) return;
  throwKey.held = true;
  throwKey.down = performance.now();
  game.wake('up');
}

function letFly() {
  if (!throwKey.held) return;
  throwKey.held = false;
  // A tap is a lob; a second and a half is as hard as anybody throws.
  const held = Math.min((performance.now() - throwKey.down) / 1500, 1);
  const hand = 2.5 + 13 * held * held * (3 - 2 * held) * 0.9 + 1.5 * held;
  if (!throwFlat(hand)) say(game.ball.state === 'carried' ? 'A dragon has it. It is bringing it back.' : 'The ball is not here just now.', 3);
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // A tall phone screen gets a wider lens, so the valley still fits.
  if (!stage.renderer.xr.isPresenting) {
    stage.camera.fov = w < h ? 88 : 70;
    if (view) view.baseFov = stage.camera.fov;
  }
  stage.setSize(w, h);
}

/** Jump to a time in the flight (for pictures and tests): the standard flight, from its start. */
function seek(t) {
  director.seed = number('seed') === undefined ? WORLD_SEED : number('seed');
  director.reset();
  director.drain();
  const dt = 1 / 72;
  let at = 0;
  while (at < t) {
    director.step(dt);
    at += dt;
  }
  director.drain();
  state.time = t;
  pose(dt);
  stage.update(state.time);
}

/** Fly on by this many seconds without drawing (for the tools, with the clock paused). */
function fly(seconds) {
  const dt = 1 / 72;
  for (let t = 0; t < seconds - 1e-9; t += dt) director.step(dt);
  director.drain();
  state.time += seconds;
  pose(dt);
  stage.update(state.time);
}

// Let the card paint before the valley is built: that takes a few seconds on a headset.
requestAnimationFrame(() =>
  setTimeout(() => {
    build().catch((err) => {
      console.error('The valley could not be built.', err);
      dom.note.textContent = 'Something went wrong while building the valley: ' + (err && err.message ? err.message : err);
      window.__dragons = { ready: false, failed: true, state };
    });
  }, 0)
);
