/**
 * main.js: wires the pieces together.
 *
 *   physics.js   the math (pure)                 hands.js       ghost hand paths (pure)
 *   schedule.js  the clock, sound timing (pure)  calibration.js calibration rules (pure)
 *   scene.js     three.js drawing                view.js        flat-screen camera
 *   xr.js        WebXR, controllers              vrpanel.js     the control board inside VR
 *   audio.js     the three sounds                ui.js          the on-page controls
 *   accuracy.js  the colour of a thrown ball (pure)
 *
 * There is exactly one clock: simulation time advances by (real time x speed). Slow motion is
 * that and nothing else, so arcs, heights and gravity are identical at every speed.
 */

import { buildPattern, findCollisions } from './physics.js';
import { buildHandTimeline } from './hands.js';
import { advanceClock, clampSpeed, SoundSchedule } from './schedule.js';
import { ThrowScorer } from './accuracy.js';
import {
  DEFAULT_PLACEMENT,
  clampHandHeight,
  clampDistance,
  clampNudge,
  fitsPosture,
  provisionalPlacement,
  measure,
  nudgeShift,
  restoreCalibration,
} from './calibration.js';
import { Stage, THREE } from './scene.js';
import { FlatView } from './view.js';
import { SoundBoard, SOUND_TYPES } from './audio.js';
import { XRControl } from './xr.js';
import { FlatUI } from './ui.js';
import { guideLines } from './guides.js';
import { NO_PLACEMENT, applyPlacement, centreOf, cleanPlacement, dragTo, placementFrom, spotFor } from './placement.js';

const STORAGE_KEY = 'vr-juggling-visualizer.v1';
const AUDIO_LOOKAHEAD = 0.2; // seconds of real time scheduled ahead on the audio clock
const AUDIO_MARGIN = 0.05; // of which this much is never spent on compensating output latency

const state = {
  pattern: null,
  timeline: null,
  collisions: null,
  description: null,
  speed: 1, // never saved: the page always opens at real speed
  simTime: 0,
  view: 'eye',
  // `guides`: the guidelines (crossing height, edges, centre). Off by default, remembered.
  show: { ghost: true, arcs: true, mine: true, guides: false },
  // The colorblind palette for the throw colours (palette.js). Never saved: every launch starts
  // off, so a headset lent to someone never comes back in their mode.
  colorblind: false,

  /**
   * What is remembered between visits. Only three things change it: a trigger calibration, the
   * fine-tune controls, and Reset. `done` says a person calibrated in VR, at eye height
   * `eyeHeight`; `frames` is how they held their hands then (see calibration.js).
   */
  calibration: { done: false, handHeight: DEFAULT_PLACEMENT.handHeight, distance: DEFAULT_PLACEMENT.distance, eyeHeight: DEFAULT_PLACEMENT.eyeHeight, frames: null, palmChecked: false },

  /**
   * Where the pattern is drawn right now. On the flat page this is the calibration with the
   * juggler at the origin. In VR the spot and heading are where the person stands, and the hand
   * height and distance are either the calibration or, while `provisional`, a first guess for a
   * posture nobody has calibrated in. A guess is shown but never saved.
   */
  anchor: { spotX: 0, spotZ: 0, yaw: 0, handHeight: DEFAULT_PLACEMENT.handHeight, distance: DEFAULT_PLACEMENT.distance, eyeHeight: DEFAULT_PLACEMENT.eyeHeight },
  provisional: false,

  /**
   * Where the person put the pattern by grabbing it (placement.js), relative to `base`: the head
   * pose it was placed from in this session (entering VR, calibrating, or "recenter"). Saved, so
   * the next entry puts the pattern in the same place relative to the person.
   */
  placement: { ...NO_PLACEMENT },
  base: { x: 0, z: 0, yaw: 0 },
  drag: null, // while a hand holds the pattern: what was true when it took hold

  nudge: { palm: 0, wrist: 0, thumb: 0 },
  handTracking: false,
  palmBall: false,
  typed: '',
  vrMessage: '',
  vrMessageUntil: 0,
  vr: { checking: true, supported: false, starting: false, presenting: false, reason: '', error: '', last: '', calibrating: false, palmStep: false, hands: false },
  displayLead: 0, // seconds from now until the current frame is shown (VR only), for diagnostics
};

let stage;
let view;
let audio;
let xr;
let ui;
const schedule = new SoundSchedule(AUDIO_LOOKAHEAD);
const scorer = new ThrowScorer();
// The person's palm points in the pattern frame, [right, left], filled in again each frame.
const palms = [
  { tracked: false, x: 0, y: 0, z: 0 },
  { tracked: false, x: 0, y: 0, z: 0 },
];

let audioWasRunning = false;
let soundFailed = false;
let vrFailed = false;
let accuracyFailed = false;

const tmpWorld = new THREE.Vector3();
const tmpCam = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpPalm = new THREE.Vector3();

function start() {
  const canvas = document.getElementById('stage');
  try {
    stage = new Stage(canvas);
  } catch (err) {
    console.error(err);
    showNo3D(err);
    return;
  }
  view = new FlatView(stage);
  audio = new SoundBoard();

  const saved = load();
  if (saved) {
    if (saved.show) Object.assign(state.show, saved.show);
    if (saved.sound) {
      for (const type of SOUND_TYPES) {
        const s = saved.sound[type];
        if (!s) continue;
        if (typeof s.volume === 'number') audio.settings[type].volume = Math.min(Math.max(s.volume, 0), 1);
        if (typeof s.on === 'boolean') audio.settings[type].on = s.on;
        // Solo is a training mode for one sitting; like the speed, it is not restored.
      }
    }
    state.calibration = restoreCalibration(saved);
    if (saved.nudge) {
      for (const key of ['palm', 'wrist', 'thumb']) {
        if (typeof saved.nudge[key] === 'number' && Number.isFinite(saved.nudge[key])) state.nudge[key] = clampNudge(saved.nudge[key]);
      }
    }
    state.handTracking = !!saved.handTracking;
    state.placement = cleanPlacement(saved.placement);
  }
  showCalibration();

  ui = new FlatUI({
    onPattern: (text) => setPattern(text),
    onSpeed: (v) => setSpeed(v),
    onView: (mode) => setView(mode),
    onShow: (key, on) => setShow(key, on),
    onColorblind: (on) => setColorblind(on),
    onSound: (type, patch) => setSound(type, patch),
    onCalibration: (key, value) => setCalibrationValue(key, value),
    onNudge: (key, value) => setNudge(key, value),
    onHandTracking: (on) => {
      state.handTracking = on;
      xr.handTracking = on;
      save();
    },
    onResetCalibration: () => resetCalibration(),
    onEnterVR: () => toggleVR(),
    onLayout: () => layout(),
    onGesture: () => {
      audio.unlock();
    },
  });

  xr = new XRControl(stage, {
    onSessionStart: () => {
      state.vr.presenting = true;
      state.vr.error = ''; // whatever went wrong before, this session is running
      state.vr.last = '';
      vrFailed = false;
      audio.unlock();
      ui.setVR(state.vr);
      xr.setSpeedLabel(state.speed);
    },
    onSessionEnd: () => {
      state.vr.presenting = false;
      state.vr.calibrating = false;
      state.vr.palmStep = false;
      state.palmBall = false;
      xr.setPalmBall(false);
      state.vr.last = describeSession(xr.sessionReport());
      // Back on the flat screen the juggler's spot is the origin again, and the pattern sits
      // where the remembered calibration puts it. A guess made for this session is dropped.
      state.anchor.spotX = 0;
      state.anchor.spotZ = 0;
      state.anchor.yaw = 0;
      showCalibration();
      applyAnchor(true);
      ui.setVR(state.vr);
      layout();
    },
    onFirstPose: (sample) => placeInVR(sample),
    onTrigger: () => {
      if (state.vr.calibrating) calibrate(xr.sample());
    },
    onPanel: (id) => panelAction(id),
    canGrab: () => xr.placed && !state.vr.calibrating && !state.vr.palmStep,
    onGrabStart: (pose) => grabStart(pose),
    onGrabMove: (pose) => grabMove(pose),
    onGrabEnd: () => grabEnd(),
    onReset: (how) => {
      // The pattern did not move in the room; the person's hands, as recorded, did. Start the
      // throw being judged again.
      scorer.forget();
      if (how === 'none') xr.prompt('The headset moved its origin.\nPress "recenter" on the board if the pattern is off.', 6);
    },
    onVisibility: (vis) => {
      if (vis !== 'visible') scorer.forget();
    },
    onMenu: () => {
      if (state.vr.calibrating) {
        // Skipped: the pattern stays where it is, and nothing is recorded.
        state.vr.calibrating = false;
        showPalmBall(false);
        xr.prompt('', 0);
        xr.summonPanel('front');
      } else if (state.vr.palmStep) {
        endPalmStep();
      } else {
        xr.togglePanel();
      }
    },
  });
  xr.handTracking = state.handTracking;
  xr.setNudge(state.nudge);
  xr.setShowMyHands(state.show.mine);

  // First pattern: ?s= in the address, else the last one used, else the 3-ball cascade.
  const params = new URLSearchParams(location.search);
  const requested = params.get('s') || params.get('siteswap');
  const first = [requested, saved && saved.text, '3'].filter(Boolean);
  let loaded = false;
  for (const text of first) {
    if (setPattern(text, { silent: text !== requested })) {
      loaded = true;
      break;
    }
  }
  if (!loaded) setPattern('3');
  if (params.get('view') === 'orbit') state.view = 'orbit';
  // ?layers=off: draw VR through a plain WebGL layer (see README, "First time in the headset").
  if (params.get('layers') === 'off') xr.plainLayer = true;
  applyAnchor(true);

  ui.setSpeed(state.speed);
  ui.setShow(state.show);
  ui.setColorblind(state.colorblind);
  ui.setSound(audio.settings, audio.running);
  ui.setCalibration(state.anchor, state.nudge, state.handTracking);
  ui.setVR(state.vr);
  stage.setShowArcs(state.show.arcs);
  stage.setShowGhostHands(state.show.ghost);
  stage.setShowGuides(state.show.guides);
  setView(state.view);

  xr.checkSupport().then(() => {
    state.vr.checking = false;
    state.vr.supported = xr.supported;
    state.vr.reason = xr.reason;
    ui.setVR(state.vr);
  });

  window.addEventListener('resize', layout);
  layout();

  let last = performance.now();
  stage.renderer.setAnimationLoop((time, xrFrame) => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    state.simTime = advanceClock(state.simTime, dt, state.speed);
    // A headset shows this frame a little later, at a time it tells us. Draw the balls where
    // they will be then, so they line up with the tracked hands and with the sound.
    let lead = 0;
    if (xrFrame && typeof xrFrame.predictedDisplayTime === 'number') {
      const ahead = (xrFrame.predictedDisplayTime - now) / 1000;
      if (ahead > 0 && ahead < 0.1) lead = ahead;
    }
    state.displayLead = lead;
    frame(dt, now, lead, xrFrame);
  });

  // For the smoke test and for poking at the app from a console.
  window.__vrj = { state, stage, view, audio, xr, ui, schedule, scorer, setPattern, setSpeed, setView, setColorblind, setShow, calibrate, panelAction, THREE };
}

/** The browser cannot draw 3D at all: say so where the picture would be, and offer nothing dead. */
function showNo3D(err) {
  document.body.classList.add('no-3d');
  const message = document.getElementById('stageMessage');
  message.textContent =
    'This browser could not start WebGL, which the 3D view needs. Try another browser, or switch hardware acceleration on in this one.';
  message.hidden = false;
  const button = document.getElementById('enterVR');
  button.disabled = true;
  button.textContent = '3D view not available';
  document.getElementById('vrNote').textContent = 'What the browser said: ' + (err && err.message ? err.message : err);
  document.getElementById('soundChip').hidden = true;
  document.getElementById('soundHint').hidden = true;
}

function frame(dt, now, lead, xrFrame) {
  if (xr.presenting) {
    try {
      xr.update(dt, xrFrame);
      // Show the faint head at the juggler's spot once the person has stepped away from it.
      const head = xr.headPosition(tmpCam);
      stage.ghostHead.visible = xr.placed && Math.hypot(head.x - state.anchor.spotX, head.z - state.anchor.spotZ) > 0.6;
      if (state.vrMessage && performance.now() > state.vrMessageUntil) state.vrMessage = '';
      // Controllers and tracked hands are announced a little after the session starts, and can
      // change during it: keep the standing instruction in the words that fit.
      const hands = xr.usingHands();
      if (hands !== state.vr.hands) {
        state.vr.hands = hands;
        if (state.vr.calibrating) xr.prompt(calibrationPrompt(), 0);
      }
      xr.panel.setModel(panelModel());
    } catch (err) {
      // Whatever went wrong, the view must keep following the head.
      if (!vrFailed) console.error('VR update failed; head tracking continues.', err);
      vrFailed = true;
      xr.syncCamera();
    }
  } else {
    view.apply();
  }
  const shown = state.simTime + lead * state.speed;
  const drawn = stage.update(shown);
  try {
    colourBalls(drawn, shown);
  } catch (err) {
    // Nor may the colours: without them the balls are white, as on the flat page.
    if (!accuracyFailed) console.warn('Throw colours failed; the balls stay white.', err);
    accuracyFailed = true;
    stage.setBallGrades(null);
  }
  try {
    scheduleSounds(now);
  } catch (err) {
    // Sound must never take the picture down with it.
    if (!soundFailed) console.warn('Sound scheduling failed; carrying on without it.', err);
    soundFailed = true;
  }
  stage.render();
  if (audio.running !== audioWasRunning) {
    audioWasRunning = audio.running;
    ui.setSound(audio.settings, audio.running); // hides the "tap to switch sound on" hint
  }
}

/**
 * Throw colours (accuracy.js). Each ball is white; a thrown ball is green, yellow or red through
 * its flight by how well the person's palm followed the ghost hand up to that release. Only in
 * VR with the pattern placed, and not while calibrating (the hands are held still on purpose
 * then). A hand that is not tracked colours nothing, so on the flat page every ball is white.
 */
function colourBalls(drawn, t) {
  if (!drawn || accuracyFailed) return;
  // Not while the pattern is being moved by hand, nor while the headset is off the face.
  if (!(xr.presenting && xr.placed) || state.vr.calibrating || state.vr.palmStep || xr.dragging || xr.visibility !== 'visible') {
    if (scorer.coloured || !Number.isNaN(scorer.lastT)) {
      scorer.clear();
      stage.setBallGrades(null);
    }
    return;
  }
  for (let side = 0; side < 2; side++) {
    const palm = palms[side];
    const at = xr.palmPosition(side, tmpPalm);
    palm.tracked = !!at;
    if (at) {
      stage.anchor.worldToLocal(at);
      palm.x = at.x;
      palm.y = at.y;
      palm.z = at.z;
    }
  }
  scorer.step(drawn, t, palms);
  stage.setBallGrades(scorer.grades);
}

// ---------------------------------------------------------------------------------------------
// Pattern, speed, view
// ---------------------------------------------------------------------------------------------

function setPattern(text, options) {
  const pattern = buildPattern(String(text));
  if (!pattern.ok) {
    if (!(options && options.silent)) {
      ui.showError(pattern.error);
      state.vrMessage = shortError(pattern);
      state.vrMessageUntil = performance.now() + 6000;
    }
    return false;
  }
  state.pattern = pattern;
  state.timeline = buildHandTimeline(pattern);
  state.collisions = findCollisions(pattern);
  state.vrMessage = '';
  stage.setPattern(pattern, state.timeline, state.collisions);
  stage.setGuides(guideLines(pattern));
  scorer.setPattern(pattern, state.timeline);
  state.description = ui.setPattern(pattern, state.collisions);
  view.setTarget(state.anchor, patternHeight(), false);
  view.retarget();
  restartSounds();

  try {
    const url = new URL(location.href);
    url.searchParams.set('s', pattern.text);
    history.replaceState(null, '', url);
  } catch (err) {
    // address bar update is a nicety
  }
  save();
  return true;
}

function shortError(result) {
  if (result.code === 'sync') return 'synchronous patterns come in version 2';
  if (result.code === 'multiplex') return 'multiplex is out of scope';
  if (result.code === 'invalid') return 'not a valid siteswap';
  if (result.code === 'zero') return 'that is zero balls';
  return 'type a siteswap first';
}

function patternHeight() {
  return state.pattern ? state.pattern.heightByValue[state.pattern.maxThrow] : 1;
}

function setSpeed(value) {
  const v = clampSpeed(value);
  if (v !== state.speed) {
    state.speed = v;
    restartSounds();
  }
  ui.setSpeed(v);
  xr.setSpeedLabel(v);
}

function setView(mode) {
  state.view = mode === 'orbit' ? 'orbit' : 'eye';
  view.setTarget(state.anchor, patternHeight(), false);
  view.setMode(state.view);
  ui.setView(state.view);
}

function setShow(key, on) {
  state.show[key] = on;
  stage.setShowArcs(state.show.arcs);
  stage.setShowGhostHands(state.show.ghost);
  stage.setShowGuides(state.show.guides);
  xr.setShowMyHands(state.show.mine);
  ui.setShow(state.show);
  save();
}

/** Colorblind throw colours on or off. Only the drawing changes, and nothing is saved. */
function setColorblind(on) {
  state.colorblind = !!on;
  stage.setColorblind(state.colorblind);
  ui.setColorblind(state.colorblind);
}

function setSound(type, patch) {
  const s = audio.settings[type];
  if (patch.volume !== undefined) s.volume = Math.min(Math.max(patch.volume, 0), 1);
  if (patch.toggle === 'on') s.on = !s.on;
  if (patch.toggle === 'solo') {
    const next = !s.solo;
    for (const t of SOUND_TYPES) audio.settings[t].solo = false; // one solo at a time
    s.solo = next;
  }
  // Each sound type has its own gain, so the change is heard at once, also on sounds that are
  // already scheduled. Nothing is scheduled again (that is how sounds got doubled).
  audio.applySettings();
  ui.setSound(audio.settings, audio.running);
  save();
}

// ---------------------------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------------------------

function applyAnchor(resetLook) {
  stage.setAnchor(state.anchor);
  scorer.forget(); // the pattern moved: a scoop half recorded against the old place is dropped
  view.setTarget(state.anchor, patternHeight(), false);
  if (resetLook) view.resetLook();
  else view.retarget();
  ui.setCalibration(state.anchor, state.nudge, state.handTracking);
}

/** Draw the pattern where the remembered calibration puts it (the spot and heading stay). */
function showCalibration() {
  state.anchor.handHeight = state.calibration.handHeight;
  state.anchor.distance = state.calibration.distance;
  state.anchor.eyeHeight = state.calibration.eyeHeight;
  state.provisional = false;
}

/** The fine-tune sliders (page) and plus/minus buttons (VR board). */
function setCalibrationValue(key, value) {
  const a = state.anchor;
  if (key === 'handHeight') a.handHeight = clampHandHeight(value);
  if (key === 'distance') a.distance = clampDistance(value);
  // What is on screen is what is remembered. In VR that makes a guessed placement the person
  // has adjusted by hand their calibration for this posture.
  const c = state.calibration;
  c.handHeight = a.handHeight;
  c.distance = a.distance;
  if (xr.presenting && xr.placed) {
    c.eyeHeight = a.eyeHeight;
    c.done = true;
  }
  state.provisional = false;
  applyAnchor(false);
  save();
}

/**
 * Palm nudge. The pattern moves with the palm point, so that a ball still lands in the palm of a
 * hand held where it was at calibration.
 */
function setNudge(key, value) {
  const before = { palm: state.nudge.palm, wrist: state.nudge.wrist, thumb: state.nudge.thumb };
  state.nudge[key] = clampNudge(value);
  xr.setNudge(state.nudge);
  const c = state.calibration;
  if (c.done && c.frames) {
    const shift = nudgeShift(c.frames, before, state.nudge);
    const height = clampHandHeight(c.handHeight + shift.up);
    const distance = clampDistance(c.distance + shift.out);
    if (!state.provisional) {
      state.anchor.handHeight += height - c.handHeight;
      state.anchor.distance += distance - c.distance;
    }
    c.handHeight = height;
    c.distance = distance;
  }
  applyAnchor(false);
  save();
}

function resetCalibration() {
  state.calibration = restoreCalibration(null);
  state.nudge = { palm: 0, wrist: 0, thumb: 0 };
  state.placement = { ...NO_PLACEMENT };
  xr.setNudge(state.nudge);
  showCalibration();
  applyAnchor(false);
  save();
}

/** First head pose of a VR session: stand the juggler where the person is, facing their way. */
function placeInVR(sample) {
  const a = state.anchor;
  // Where the person put the pattern last time, relative to where they stand and face now.
  state.base = { x: sample.head.x, z: sample.head.z, yaw: sample.headYaw };
  Object.assign(a, applyPlacement(state.base, state.placement));
  a.eyeHeight = sample.head.y;
  // A remembered calibration is used again only in the posture it was made in (standing or
  // sitting). Otherwise a first guess is shown, and calibrating is asked for.
  const fits = fitsPosture(state.calibration, sample.head.y);
  if (fits) {
    a.handHeight = state.calibration.handHeight;
    a.distance = state.calibration.distance;
    state.provisional = false;
  } else {
    const guess = provisionalPlacement(sample.head.y);
    a.handHeight = guess.handHeight;
    a.distance = guess.distance;
    state.provisional = true;
  }
  applyAnchor(false);
  if (fits) {
    xr.summonPanel('side');
    xr.prompt(xr.usingHands() ? 'Controls: on your left' : 'Controls: on your left,\nor press A or X to bring them in front', 6);
  } else {
    beginCalibration();
  }
}

/** A white ball resting in each of the person's hands, to judge the palm point by. */
function showPalmBall(on) {
  state.palmBall = on;
  xr.setPalmBall(on);
}

function calibrationPrompt() {
  return xr.usingHands()
    ? 'Hold both hands where you catch,\nthen pinch finger and thumb together'
    : 'Hold both controllers where you catch,\nthen pull a trigger   (A or X skips)';
}

function beginCalibration() {
  xr.setMoveArmed(false);
  state.vr.calibrating = true;
  state.vr.palmStep = false;
  xr.hidePanel(); // out of the way of the trigger
  showPalmBall(true); // so the person sees where a ball will land while they hold the pose
  xr.prompt(calibrationPrompt(), 0);
}

/**
 * Trigger press during calibration. Records what the spec asks for: hand height, and how far in
 * front of the body the hands are. The juggler's spot moves to where the person is standing and
 * the pattern faces the way their hands are from their head. Both hands are needed.
 */
function calibrate(sample) {
  if (!xr.hasPose()) return false;
  const m = measure(sample);
  if (!m.ok) {
    if (m.reason === 'untrackable') {
      // Nothing here can be held where the hands catch (a phone in a viewer, say): leave the
      // pattern where it is, record nothing.
      state.vr.calibrating = false;
      showPalmBall(false);
      xr.prompt('No hand controllers here.\nThe pattern stays in a standard place;\nadjust it with the sliders on the page', 8);
      xr.summonPanel('side');
      return false;
    }
    const hands = xr.usingHands();
    const thing = hands ? 'hand' : 'controller';
    const missing = m.reason === 'both' ? 'Neither ' + thing + ' is' : 'The ' + m.reason + ' ' + thing + ' is not';
    xr.prompt(
      missing + ' tracked yet.\nHold both where you catch, then\n' + (hands ? 'pinch finger and thumb together' : 'pull a trigger   (A or X skips)'),
      0
    );
    return false;
  }
  const a = state.anchor;
  a.spotX = m.spotX;
  a.spotZ = m.spotZ;
  a.yaw = m.yaw;
  a.eyeHeight = m.eyeHeight;
  a.handHeight = m.handHeight;
  a.distance = m.distance;
  const c = state.calibration;
  c.done = true;
  c.handHeight = m.handHeight;
  c.distance = m.distance;
  c.eyeHeight = m.eyeHeight;
  c.frames = m.frames;
  // Calibrating places the pattern where the hands are: that is the placement from here on.
  state.base = { x: m.spotX, z: m.spotZ, yaw: m.yaw };
  state.placement = { ...NO_PLACEMENT };
  state.provisional = false;
  state.vr.calibrating = false;
  applyAnchor(false);
  save();
  const measured = 'Calibrated: hands ' + a.handHeight.toFixed(2) + ' m high, ' + a.distance.toFixed(2) + ' m out.';
  if (!c.palmChecked) {
    // The first time, calibration goes on to the palm: is the ball where the hand feels it?
    state.vr.palmStep = true;
    showPalmBall(true);
    xr.summonPanel('front');
    // The words go away after half a minute (they sit low in the view, where the hands are);
    // the balls in the hands and the board in front stay until the step is ended.
    xr.prompt(
      measured + '\nIs the ball in each palm? If not, nudge it\non the board. Then press ' + (xr.usingHands() ? '"palm ball".' : 'A or X.'),
      30
    );
  } else {
    showPalmBall(false);
    xr.prompt(measured + '\nControls: on your left' + (xr.usingHands() ? '' : ', or press A or X'), 6);
    xr.summonPanel('side');
  }
  return true;
}

/** The person is content with where the ball rests in the hand. */
function endPalmStep() {
  state.vr.palmStep = false;
  state.calibration.palmChecked = true;
  showPalmBall(false);
  save();
  xr.summonPanel('side');
  xr.prompt(xr.usingHands() ? 'Controls: on your left' : 'Controls: on your left,\nor press A or X to bring them in front', 6);
}

// ---------------------------------------------------------------------------------------------
// Moving the pattern by hand (spec 35, 2026-11-20)
// ---------------------------------------------------------------------------------------------

/** A hand took hold of the pattern (grip held, or trigger/pinch after "move"). */
function grabStart(pose) {
  const a = state.anchor;
  state.drag = { hand: pose, centre: centreOf(a), yaw: a.yaw };
  xr.prompt('Moving the pattern.\nLet go to put it here.', 0);
}

/** The holding hand moved: the pattern goes with it. Nothing is saved until it is let go. */
function grabMove(pose) {
  if (!state.drag) return;
  const a = state.anchor;
  const to = dragTo(state.drag, pose);
  a.yaw = to.yaw;
  a.handHeight = clampHandHeight(to.y);
  Object.assign(a, spotFor(to.x, to.z, to.yaw, a.distance));
  stage.setAnchor(a);
  scorer.forget();
}

/**
 * Let go: the pattern stays here. The height is the hand height (as the board's height buttons
 * set it, so it is remembered as the calibration for this posture); where it stands and how it
 * is turned is remembered relative to the person.
 */
function grabEnd() {
  if (!state.drag) return;
  state.drag = null;
  const a = state.anchor;
  const c = state.calibration;
  c.handHeight = a.handHeight;
  c.distance = a.distance;
  c.eyeHeight = a.eyeHeight;
  c.done = true;
  state.provisional = false;
  state.placement = cleanPlacement(placementFrom(state.base, a));
  applyAnchor(false);
  save();
  xr.prompt('Placed. Hold a grip button to move it again.', 3);
}

/**
 * "Recenter": the pattern back in front of the person, where they last put it relative to
 * themselves. For when the headset moved its origin without saying so.
 */
function recenterHere() {
  if (!xr.hasPose()) return;
  const s = xr.sample();
  state.base = { x: s.head.x, z: s.head.z, yaw: s.headYaw };
  const a = state.anchor;
  Object.assign(a, applyPlacement(state.base, state.placement));
  a.eyeHeight = s.head.y;
  applyAnchor(false);
  xr.prompt('Recentred in front of you.', 3);
}

// ---------------------------------------------------------------------------------------------
// VR
// ---------------------------------------------------------------------------------------------

async function toggleVR() {
  if (state.vr.presenting) {
    xr.exit();
    return;
  }
  if (xr.starting) return; // one request at a time: a second press changes nothing
  audio.unlock();
  state.vr.error = '';
  state.vr.starting = true;
  ui.setVR(state.vr);
  try {
    await xr.enter();
  } catch (err) {
    console.warn('Could not start VR', err);
    state.vr.error = 'Could not start VR: ' + (err && err.message ? err.message : err);
  }
  state.vr.starting = false;
  ui.setVR(state.vr);
}

/** One line about the session that just ended, for the note under the button. */
function describeSession(report) {
  if (!report) return '';
  return (
    'Last VR session: ' + report.fps.toFixed(0) + ' frames a second on average, slowest frame ' + report.slowestMs.toFixed(0) +
    ' ms, drawn through ' + report.renderPath + '.'
  );
}

const board = {
  title: '',
  status: '',
  statusKind: '',
  pattern: '',
  typed: '',
  speed: 1,
  sound: null,
  calibrating: false,
  handHeight: 0,
  distance: 0,
  nudge: null,
  palmBall: false,
  showArcs: true,
  showGhost: true,
  showMyHands: true,
  colorblind: false,
  showGuides: false,
  moveArmed: false,
  hands: false,
};

/** What the VR board shows. One object, filled in again each frame (no garbage). */
function panelModel() {
  const d = state.description;
  board.title = d.title;
  board.status = state.vrMessage || d.vrStatus;
  board.statusKind = state.vrMessage ? 'warn' : d.vrStatusKind;
  board.pattern = state.pattern.text;
  board.typed = state.typed;
  board.speed = state.speed;
  board.sound = audio.settings;
  board.calibrating = state.vr.calibrating;
  board.handHeight = state.anchor.handHeight;
  board.distance = state.anchor.distance;
  board.nudge = state.nudge;
  board.palmBall = state.palmBall;
  board.showArcs = state.show.arcs;
  board.showGhost = state.show.ghost;
  board.showMyHands = state.show.mine;
  board.colorblind = state.colorblind;
  board.showGuides = state.show.guides;
  board.moveArmed = xr.moveArmed;
  board.hands = state.vr.hands;
  return board;
}

function panelAction(id) {
  const parts = id.split(':');
  const kind = parts[0];
  if (kind === 'pattern') {
    state.typed = '';
    setPattern(parts[1]);
  } else if (kind === 'key') {
    if (parts[1] === 'back') state.typed = state.typed.slice(0, -1);
    else if (parts[1] === 'go') {
      if (setPattern(state.typed)) state.typed = '';
    } else if (state.typed.length < 14) state.typed += parts[1];
  } else if (kind === 'speed') {
    setSpeed(Number(parts[1]));
  } else if (kind === 'vol') {
    const s = audio.settings[parts[1]];
    // Steps of 10%, on the 5% grid the page's sliders use (the release starts at 65%).
    setSound(parts[1], { volume: Math.round((s.volume + (parts[2] === '+' ? 0.1 : -0.1)) * 20) / 20 });
  } else if (kind === 'mute') {
    setSound(parts[1], { toggle: 'on' });
  } else if (kind === 'solo') {
    setSound(parts[1], { toggle: 'solo' });
  } else if (kind === 'calibrate') {
    beginCalibration();
  } else if (kind === 'height') {
    setCalibrationValue('handHeight', state.anchor.handHeight + (parts[1] === '+' ? 0.01 : -0.01));
  } else if (kind === 'distance') {
    setCalibrationValue('distance', state.anchor.distance + (parts[1] === '+' ? 0.01 : -0.01));
  } else if (kind === 'palmball') {
    if (state.vr.palmStep) endPalmStep();
    else showPalmBall(!state.palmBall);
  } else if (kind === 'nudge') {
    setNudge(parts[1], state.nudge[parts[1]] + (parts[2] === '+' ? 0.005 : -0.005));
  } else if (kind === 'toggle') {
    const key = parts[1];
    if (key === 'colorblind') setColorblind(!state.colorblind);
    else setShow(key, !state.show[key]);
  } else if (kind === 'move') {
    xr.setMoveArmed(!xr.moveArmed);
    if (xr.moveArmed) xr.prompt(xr.usingHands() ? 'Pinch and hold to grab the pattern' : 'Pull and hold a trigger to grab the pattern', 4);
  } else if (kind === 'recenter') {
    recenterHere();
  } else if (kind === 'spot') {
    xr.moveHeadTo(state.anchor.spotX, state.anchor.spotZ);
  } else if (kind === 'exit') {
    xr.exit();
  }
}

// ---------------------------------------------------------------------------------------------
// Sound scheduling
// ---------------------------------------------------------------------------------------------

/**
 * The speed or the pattern changed: take back the sounds that have not started and schedule from
 * here again. Sounds that have already started keep playing and are not scheduled again.
 */
function restartSounds() {
  schedule.restart(state.simTime, audio.cancelPending());
}

/**
 * Hand every sound event in the next AUDIO_LOOKAHEAD of real time to the audio clock. `now` is
 * the page time (performance.now) that state.simTime corresponds to.
 */
function scheduleSounds(now) {
  if (!audio.running || !state.pattern || !(state.speed > 0)) {
    schedule.restart(state.simTime, -Infinity);
    return;
  }
  const events = schedule.due(state.pattern, state.simTime, state.speed);
  if (events.length === 0) return;

  stage.camera.getWorldPosition(tmpCam);
  tmpRight.setFromMatrixColumn(stage.camera.matrixWorld, 0);
  const limit = Math.min(events.length, 48);
  for (let i = 0; i < limit; i++) {
    const e = events[i];
    const when = audio.timeFor(now + ((e.time - state.simTime) / state.speed) * 1000, now, AUDIO_LOOKAHEAD - AUDIO_MARGIN);
    tmpWorld.set(e.x, e.y, 0);
    stage.anchor.localToWorld(tmpWorld);
    const side = tmpWorld.sub(tmpCam).dot(tmpRight);
    audio.play(e.type, when, Math.min(Math.max(side / 0.5, -1), 1) * 0.8, e.height, e.time);
  }
}

// ---------------------------------------------------------------------------------------------
// Layout and storage
// ---------------------------------------------------------------------------------------------

function layout() {
  if (!stage || xr.presenting) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Centre the pattern in the part of the window the control panel does not cover.
  const inset = ui.insets();
  if (inset.left > 0 || inset.bottom > 0) {
    stage.camera.setViewOffset(w, h, -inset.left / 2, inset.bottom / 2, w, h);
  } else {
    stage.camera.clearViewOffset();
  }
  stage.resize(w, h);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

/** Remember the settings. The calibration is saved as calibrated, never as currently drawn. */
function save() {
  try {
    const c = state.calibration;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        text: state.pattern ? state.pattern.text : '3',
        show: state.show,
        sound: audio.settings,
        handHeight: c.handHeight,
        distance: c.distance,
        eyeHeight: c.eyeHeight,
        calibrated: c.done,
        frames: c.frames,
        palmChecked: c.palmChecked,
        nudge: state.nudge,
        handTracking: state.handTracking,
        placement: state.placement,
      })
    );
  } catch (err) {
    // private mode: nothing is saved, the app still works
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
