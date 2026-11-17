/**
 * legs.js: a throwaway page to choose between the dragons' old legs and new ones.
 *
 * The same dragon twice, in the real valley at the real hour, facing each other over the lake on
 * two rock pillars: the old legs on the left, the new on the right. Both loop through what legs
 * are for: flying with them tucked up, coming down with the feet reaching, standing with the
 * wings folded (and putting the head down to the rock, as when picking up a ball), and off
 * again. Trigger: swap the red dragon for the teal one. Grip: nearer or further.
 *
 * It runs on its own copy of the scene's code (legs/src, legs/vendor), so that it can be put up
 * while the main page is still the version before.
 */
import { Stage, THREE, toGeometry } from './src/scene.js';
import { worldMaterial, VIGNETTE } from './src/shaders.js';
import { FlatView } from './src/view.js';
import { DragonView } from './src/dragons.js';
import { XRControl } from './src/xr.js';
import { MeshBuilder } from './src/meshbuilder.js';
import { buildSpire } from './src/ledge.js';
import { ground } from './src/world.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const CYCLE = 18;
const smooth = (a, b, v) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Where the pair is: [x of the left pillar, z], far and near. */
const PLACES = [
  { x: 11, z: -24, top: -4 },
  { x: 8.5, z: -15, top: -3.2 },
];

let stage;
let view;
let xr;
let species = 0; // 0 the red one, 1 the teal one
let place = 0;
let time = 0;
let begun = false;
const views = [];
const flyers = [0, 1].map(() => ({
  x: 0, y: 0, z: 0, heading: 0, pitch: 0, bank: 0, gamma: 0, speed: 0, size: 1,
  flap: 0, power: 0, tuck: 0, brake: 0, turn: 0, arch: 0, lookYaw: 0, lookPitch: 0, jaw: 0, roar: 0, set: 0,
  legs: 0, reach: 0, crouch: 0, hipPitch: 0, fold: 0, neckRaise: 0,
}));
let pillars;
let labels = [];
let cam = null;

async function build() {
  stage = new Stage($('stage'), { antialias: true });
  await stage.build((t) => ($('note').textContent = t));
  view = new FlatView(stage);
  for (const index of [0, 1]) {
    views.push([new DragonView(stage, index, { legs: 'old' }), new DragonView(stage, index, { legs: 'new' })]);
  }
  makePillars();
  labels = [makeLabel('OLD legs'), makeLabel('NEW legs')];
  try {
    stage.renderer.compile(stage.scene, stage.camera);
  } catch (err) {
    /* compiled as needed */
  }
  xr = new XRControl(
    stage,
    {
      onSessionStart: () => {
        stage.setVignette(VIGNETTE.vr);
        begun = true;
        $('card').classList.add('gone');
      },
      onSessionEnd: () => {
        stage.setVignette(VIGNETTE.flat);
        $('card').classList.remove('gone');
      },
      onTrigger: () => {
        swap();
        return true;
      },
    },
    {}
  );
  for (const c of xr.controllers) c.ray.addEventListener('squeezestart', closer);
  window.addEventListener('resize', layout);
  layout();
  let last = 0;
  stage.renderer.setAnimationLoop((stamp, frame) => {
    const dt = last ? Math.min((stamp - last) / 1000, 0.1) : 1 / 72;
    last = stamp;
    tick(dt, frame);
  });
  await xr.checkSupport();
  $('enterVR').disabled = !xr.supported;
  $('watch').disabled = false;
  $('note').textContent = xr.supported ? 'In the headset: trigger swaps red and teal, grip brings them nearer or takes them back.' : 'No headset here: watch on this screen, drag to look round.';
  $('enterVR').addEventListener('click', () => xr.enter().catch((e) => ($('note').textContent = 'Could not start VR: ' + e.message)));
  $('watch').addEventListener('click', () => {
    begun = true;
    $('card').classList.add('gone');
    $('bar').style.display = 'flex';
  });
  $('swap').addEventListener('click', swap);
  $('closer').addEventListener('click', closer);
  window.__legs = { stage, views, flyers, setTime: (t) => (time = t), swap, closer, setCam: (c) => (cam = c), ready: true };
}

function swap() {
  species = 1 - species;
}
function closer() {
  place = 1 - place;
  makePillars();
}

function layout() {
  stage.camera.fov = innerWidth < innerHeight ? 88 : 70;
  stage.setSize(innerWidth, innerHeight);
}

/** Two pillars of the bluff's rock under the two dragons. */
function makePillars() {
  if (pillars) {
    stage.scene.remove(pillars);
    pillars.geometry.dispose();
  }
  const m = new MeshBuilder();
  const P = PLACES[place];
  for (const side of [-1, 1]) {
    const x = side * P.x;
    buildSpire(m, x, P.z, P.top, 2.3, ground(x, P.z), 40 + side);
  }
  pillars = new THREE.Mesh(toGeometry(m.arrays()), worldMaterial(stage.shared, { lit: true }));
  pillars.renderOrder = 8;
  stage.scene.add(pillars);
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 64px -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowBlur = 12;
  g.fillStyle = '#fbf3e4';
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.renderOrder = 80;
  stage.scene.add(mesh);
  return mesh;
}

/** One dragon's state at time t of the loop, standing on (or rising from) a pillar top. */
function loop(f, v, t, x, z, heading, top) {
  const s = v.scale;
  f.heading = heading;
  // The ball of the foot over the middle of the pillar.
  f.x = x - Math.sin(heading) * -0.7 * s;
  f.z = z - Math.cos(heading) * -0.7 * s;
  f.bank = 0;
  f.turn = 0;
  f.arch = 0;
  f.flap = (f.flap + 0.75 * 2 * Math.PI * (1 / 72) * (0.8 + 0.4 * f.power)) % (2 * Math.PI);
  let hover = 0; // 1: in the air, 7 m up
  let stand = 0; // 1: feet on the rock
  if (t < 5) {
    // Flying: beating to hold its place, legs tucked.
    hover = 1;
    f.power = 0.75;
    f.brake = 0.25;
    f.legs = 0;
    f.reach = 0;
    f.crouch = 0;
    f.fold = 0;
    f.pitch = 10 * DEG;
    f.neckRaise = 0;
  } else if (t < 8.5) {
    // Coming down: wings up and cupped, beating back, the feet let down and thrust forward.
    const u = (t - 5) / 3.5;
    hover = 1 - smooth(0, 1, u);
    f.power = lerp(0.95, 0.3, smooth(0.6, 1, u)) * (u < 0.97 ? 1 : 0);
    f.brake = smooth(0, 0.3, u);
    f.legs = smooth(0, 0.45, u);
    f.reach = Math.sin(Math.min(u / 0.92, 1) * Math.PI) * 0.9;
    f.crouch = smooth(0.85, 1, u) * 0.5;
    f.fold = 0;
    f.pitch = lerp(10, 34, smooth(0, 0.6, u)) * DEG - smooth(0.75, 1, u) * 22 * DEG;
    stand = smooth(0.92, 1, u);
  } else if (t < 15) {
    // Standing. The wings fold; it looks at you; at 12.5 s it puts its head down to the rock.
    const u = t - 8.5;
    stand = 1;
    f.power = 0;
    f.brake = 1 - smooth(0, 1.2, u);
    f.legs = 1;
    f.reach = 0;
    f.fold = smooth(0.2, 1.5, u);
    const down = smooth(4, 4.8, u) * (1 - smooth(5.6, 6.3, u));
    f.crouch = lerp(0.5, 0.12, smooth(0, 1, u)) + 0.5 * down;
    f.pitch = lerp(12, 4, down) * DEG;
    f.neckRaise = lerp(0.12, -0.25, down) * smooth(0, 1, u);
  } else {
    // Off again: down on its haunches, wings open, a spring and a beat, the legs tucked up.
    const u = (t - 15) / 3;
    f.fold = 1 - smooth(0, 0.3, u);
    f.brake = smooth(0, 0.25, u) * (1 - smooth(0.6, 1, u));
    f.crouch = smooth(0, 0.25, u) * 0.9 * (1 - smooth(0.3, 0.45, u));
    f.legs = 1 - smooth(0.45, 1, u);
    f.reach = 0;
    f.power = u < 0.3 ? 0 : 1;
    f.pitch = lerp(8, 24, smooth(0.25, 0.5, u)) * DEG - smooth(0.6, 1, u) * 14 * DEG;
    f.neckRaise = 0.3 * (1 - u);
    hover = smooth(0.3, 1, u);
    stand = 1 - smooth(0.3, 0.45, u);
  }
  f.hipPitch = f.pitch;
  f.lookPitch = -0.22;
  // The head turns to the viewer when it stands, and down to the rock.
  const toViewer = Math.atan2(-f.x, -f.z) - heading;
  const want = stand > 0.5 ? Math.max(Math.min(Math.atan2(Math.sin(toViewer), Math.cos(toViewer)), 1.1), -1.1) * 0.8 : 0;
  f.lookYaw += (want - f.lookYaw) * 0.04;
  if (t > 12.5 && t < 14.8) f.lookPitch = -0.55 * smooth(12.5, 13.3, t) * (1 - smooth(14, 14.8, t));
  const drop = v.footDrop(f, time);
  const ground = top + drop;
  f.y = lerp(ground, top + 7 + 0.35 * Math.sin(time * 1.3), hover);
  if (stand > 0) f.y = lerp(f.y, ground, stand);
}

function tick(dt, frame) {
  if (begun) time += dt;
  const t = time % CYCLE;
  const P = PLACES[place];
  for (let k = 0; k < 2; k++) {
    for (let side = 0; side < 2; side++) {
      const v = views[k][side];
      v.mesh.visible = k === species;
      v.flame.visible = false;
      if (k !== species) {
        v.mirror.visible = false;
        continue;
      }
      // Left (old) faces right, right (new) faces left: the two face each other.
      const sx = side === 0 ? -P.x : P.x;
      const f = flyers[side];
      loop(f, v, t, sx, P.z, side === 0 ? Math.PI / 2 : -Math.PI / 2, P.top);
      v.update(f, time, dt);
      const label = labels[side];
      label.position.set(sx, P.top + 11.5 * (v.scale / 1.45), P.z);
      label.lookAt(0, 1.6, 0);
    }
  }
  if (xr.presenting) {
    xr.update(dt, frame);
  } else {
    if (view.follow) view.update(dt, { x: 0, y: P.top + 2, z: P.z }, 30);
    view.apply();
    if (cam) {
      // (For the picture tool: a camera put anywhere.)
      stage.camera.position.set(cam[0], cam[1], cam[2]);
      stage.camera.lookAt(cam[3], cam[4], cam[5]);
      stage.camera.updateMatrixWorld();
    }
  }
  stage.update(time);
  stage.render();
}

build().catch((err) => {
  console.error(err);
  $('note').textContent = 'Could not build the page: ' + err.message;
});
