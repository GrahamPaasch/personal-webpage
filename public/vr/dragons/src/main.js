/**
 * main.js: wiring. Builds the valley, flies the dragons, and starts sound and VR from a tap.
 *
 * Things in the address that change how it runs (all optional):
 *   ?seed=7          the same flight every time (otherwise each visit flies differently)
 *   ?scale=0.8       VR picture size relative to the headset's own (smaller is faster)
 *   ?foveation=0.5   how much the edges of the VR picture are coarsened, 0..1
 *   ?layers=off      draw VR through a plain XRWebGLLayer
 *   ?trees=0.6       draw only this fraction of the forest
 *   ?hrtf=0          place the dragons' sound with plain left/right panning (cheaper)
 *   ?reverb=0        no echo off the hills (cheaper)
 *   ?governor=off    never thin the picture, whatever the frame rate (the tools use this: a
 *                    software renderer is slow, and they must count the whole picture)
 *   ?shots=1         for the tools: no card, no controls
 */
import { Stage, THREE, WORLD_SEED } from './scene.js';
import { FlatView } from './view.js';
import { DragonView } from './dragons.js';
import { DRAGONS } from './dragonGeometry.js';
import { Director, ROAR_SECONDS, floorGrid } from './flight.js';
import { Soundscape } from './audio.js';
import { XRControl } from './xr.js';
import { Governor, QUALITY } from './governor.js';

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
};

const state = {
  time: 0, // seconds the picture has been running (wind, leaves)
  begun: false, // the card is gone: the piece has started
  paused: false,
  sound: true,
  calls: 0,
  answered: 0,
  quality: 0,
  vr: { checking: true, supported: false, reason: '', presenting: false, starting: false, error: '', last: '' },
};

let stage;
let view;
let director;
let dragons;
let audio;
let xr;
let governor;
const target = { x: 0, y: 0, z: -150 };
const listener = { position: [0, 1.62, 0], forward: [0, 0, -1], up: [0, 1, 0] };
const movers = [
  { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0 },
  { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0 },
];
const tmpHead = new THREE.Vector3();
let soundFailed = false;
let lastWhistle = -10;

// ---------------------------------------------------------------------------------------------

async function build() {
  const canvas = $('stage');
  const t0 = performance.now();
  const say = (text) => {
    dom.note.textContent = text;
  };
  try {
    stage = new Stage(canvas, {});
  } catch (err) {
    showNo3D(err);
    return;
  }
  await stage.build(say);
  view = new FlatView(stage);
  dragons = [new DragonView(stage, 0), new DragonView(stage, 1)];
  say('Waking the dragons\u2026');
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The map of how low a dragon may fly: worked out now, not in the first frame.
  floorGrid();
  const seed = number('seed');
  director = new Director(DRAGONS.map((d) => ({ beat: d.beat, size: d.build.scale })), seed === undefined ? WORLD_SEED : seed);
  audio = new Soundscape({ hrtf: params.get('hrtf') !== '0', reverb: params.get('reverb') !== '0', seed: director.seed });
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
        begin(true);
        stage.showHint('Pull the trigger to call a dragon', 16);
        showControls();
      },
      onSessionEnd: () => {
        state.vr.presenting = false;
        if (audio.ctx && !document.hidden) sound(() => audio.ctx.resume());
        state.vr.last = describeSession(xr.sessionReport());
        stage.hideHint();
        layout();
        showControls();
        if (state.vr.last) say(state.vr.last, 30);
      },
      onTrigger: () => call(),
      // The headset has been taken off (or put back on): quiet while nobody is in it.
      onVisibility: (visible) => {
        if (!audio.ctx) return;
        sound(() => {
          if (visible) audio.ctx.resume();
          else audio.ctx.suspend();
        });
      },
    },
    { plainLayer: params.get('layers') === 'off', scale: number('scale'), foveation: number('foveation') }
  );

  wireControls(canvas);
  window.addEventListener('resize', layout);
  layout();
  pose(1 / 72);

  let last = 0;
  stage.renderer.setAnimationLoop((stamp) => {
    const now = typeof stamp === 'number' ? stamp : performance.now();
    const dt = last ? Math.min(Math.max((now - last) / 1000, 0), 0.1) : 1 / 72;
    last = now;
    frame(dt);
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
    stage, view, state, THREE, dragons, director, audio, xr, governor, seek, fly, call, begin, applyQuality,
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

function frame(dt) {
  if (!state.paused) {
    advance(dt);
    pose(dt);
  }
  if (xr.presenting) {
    xr.update(dt);
    if (governor.frame(dt, xr.nominal)) applyQuality();
    stage.updateHint(dt);
  } else {
    if (!state.paused) {
      // Left alone for a while, the view goes back to following the dragons.
      if (!view.follow && !view.dragging && view.idle > 25) view.follow = true;
      view.update(dt, target);
    }
    view.apply();
    // A flat screen has no set rate; step down only if it is plainly struggling.
    if (state.begun && governor.frame(dt, 1 / 45)) applyQuality();
  }
  hear(dt);
  stage.update(state.time);
  stage.render();
}

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
      }
    } catch (err) {
      soundBroke(err);
    }
  }
}

function pose(dt) {
  const f = director.flyers;
  for (let i = 0; i < dragons.length; i++) dragons[i].update(f[i], state.time, dt);
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
    }
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
    if (audio.unlock(DRAGONS.map((d) => d.build.scale))) audio.setMuted(!state.sound);
  });
}

function applyQuality() {
  if (params.get('governor') === 'off') governor.reset();
  const q = QUALITY[governor.level];
  state.quality = governor.level;
  const trees = number('trees');
  stage.setForestFraction(q.forest * (trees === undefined ? 1 : Math.min(Math.max(trees, 0.05), 1)));
  stage.setLeafFraction(q.leaves);
  for (const d of dragons) d.mirrorOn = q.mirror;
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
  if (state.begun) return;
  unlockSound();
  dom.veil.classList.add('curtain');
  setTimeout(() => {
    begin(true);
    showControls();
    say('Drag to look around. Tap, or press Space, to call a dragon.', 9);
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
  if (who >= 0) state.answered++;
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

/** One line about the session that just ended, to read out or send back. */
function describeSession(report) {
  if (!report) return '';
  return (
    'Last VR session: ' + report.fps.toFixed(0) + ' frames a second on average (the headset asks for ' + report.target.toFixed(0) + '), ' +
    (report.late * 100).toFixed(report.late < 0.1 ? 1 : 0) + '% of frames late, slowest ' + report.slowestMs.toFixed(0) + ' ms, detail step ' + state.quality +
    ', drawn through ' + report.renderPath + '.'
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
  else if (vr.supported) dom.note.textContent = 'In the headset: look around, lean out, and pull the trigger to call a dragon. Sound on.';
  else dom.note.textContent = vr.reason + ' Here you can watch, and drag to look around.';
  dom.hud.hidden = TOOLS || !state.begun || vr.presenting;
  dom.sound.setAttribute('aria-pressed', String(state.sound));
}

function wireControls(canvas) {
  dom.enterVR.addEventListener('click', toggleVR);
  dom.vrChip.addEventListener('click', toggleVR);
  dom.watch.addEventListener('click', watchHere);
  dom.call.addEventListener('click', () => call());
  dom.sound.addEventListener('click', () => {
    state.sound = !state.sound;
    unlockSound();
    sound(() => audio.setMuted(!state.sound));
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
    if (e.target && /^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(e.target.tagName) && e.code !== 'KeyM') return;
    if (e.code === 'Space' || e.code === 'Enter') {
      if (!state.begun) watchHere();
      else call();
      e.preventDefault();
    } else if (e.code === 'KeyM') {
      dom.sound.click();
    }
  });
  // No sound from a tab nobody is looking at. (In the headset it is the VR session that says
  // whether anybody is looking: see onVisibility.)
  document.addEventListener('visibilitychange', () => {
    if (!audio.ctx || xr.presenting) return;
    sound(() => {
      if (document.hidden) audio.ctx.suspend();
      else if (state.begun) audio.ctx.resume();
    });
  });
}

function layout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // A tall phone screen gets a wider lens, so the valley still fits.
  if (!stage.renderer.xr.isPresenting) stage.camera.fov = w < h ? 88 : 70;
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
