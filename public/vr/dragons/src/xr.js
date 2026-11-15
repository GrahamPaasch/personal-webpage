/**
 * xr.js: WebXR. Entering and leaving immersive VR, the trigger, and how the session ran.
 *
 * The viewer stands still on the ledge: there is no thumbstick movement and no teleport, on
 * purpose. They can look anywhere and lean or step within their own floor space, and that is
 * all; the dragons do the moving.
 *
 * The session set-up (a floor-level reference space, and falling back from a WebXR projection
 * layer to a plain XRWebGLLayer) is the one proven on the Quest 1 in the juggling visualizer.
 */

import { THREE } from './scene.js';

const NO_LAYERS = { layers: undefined };

/**
 * three.js r160 draws through an XRProjectionLayer whenever the browser has WebXR Layers
 * (session.renderState.layers exists), and through a plain XRWebGLLayer otherwise. This starts
 * the session on the plain path: three.js reads that one property while it sets the session up,
 * and for exactly that long it is made to read as absent.
 */
async function setSessionPlain(manager, session) {
  Object.defineProperty(session, 'renderState', { configurable: true, get: () => NO_LAYERS });
  try {
    await manager.setSession(session);
  } finally {
    delete session.renderState;
  }
}

export class XRControl {
  /**
   * handlers: { onSessionStart(), onSessionEnd(), onTrigger(hand) }
   * options: { plainLayer: draw through a plain XRWebGLLayer, scale: framebuffer scale,
   *            foveation: 0..1 }
   */
  constructor(stage, handlers, options) {
    const o = options || {};
    this.stage = stage;
    this.handlers = handlers;
    this.supported = false;
    this.reason = '';
    this.session = null;
    this.starting = false; // a session has been asked for and is not there yet
    this.presenting = false;
    this.referenceSpaceType = 'local-floor';
    this.plainLayer = !!o.plainLayer;
    this.renderPath = ''; // which kind of layer the running session draws through
    this.frames = 0;
    this.nominal = 1 / 72; // seconds a frame should take in this session
    this.timing = { last: 0, frames: 0, seconds: 0, slowest: 0, late: 0 };
    this.head = new THREE.Vector3(0, 1.62, 0);

    const xr = stage.renderer.xr;
    if (o.scale && o.scale > 0.3 && o.scale <= 1.5) xr.setFramebufferScaleFactor(o.scale);
    if (o.foveation !== undefined && o.foveation >= 0 && o.foveation <= 1) xr.setFoveation(o.foveation);

    // Both controllers (or tracked hands, whose pinch arrives as the same event).
    this.controllers = [0, 1].map((index) => {
      const ray = xr.getController(index);
      stage.rig.add(ray);
      const c = { index, ray, source: null, handedness: '' };
      ray.addEventListener('connected', (e) => {
        c.source = e.data;
        c.handedness = e.data.handedness || '';
      });
      ray.addEventListener('disconnected', () => {
        c.source = null;
        c.handedness = '';
      });
      ray.addEventListener('selectstart', () => {
        this.pulse(c);
        this.handlers.onTrigger(c.handedness);
      });
      return c;
    });

    xr.addEventListener('sessionstart', () => this.onSessionStart());
    xr.addEventListener('sessionend', () => this.onSessionEnd());
  }

  /** Is immersive VR available here? Resolves to true or false and records why not. */
  async checkSupport() {
    if (!window.isSecureContext) {
      this.reason = 'VR needs a secure page (https).';
      return (this.supported = false);
    }
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      this.reason = 'To stand on the ledge, open this page in a VR headset’s browser.';
      return (this.supported = false);
    }
    try {
      this.supported = await navigator.xr.isSessionSupported('immersive-vr');
      if (!this.supported) this.reason = 'To stand on the ledge, open this page in a VR headset’s browser.';
    } catch (err) {
      this.supported = false;
      this.reason = 'VR is blocked on this page: ' + (err && err.message ? err.message : err);
    }
    return this.supported;
  }

  /**
   * Start an immersive session. Resolves to true once it is running, and to false if there is
   * nothing to do: VR is not available, a session is running, or one is already being started.
   */
  async enter() {
    if (this.session || this.starting || !this.supported) return false;
    this.starting = true;
    try {
      const optionalFeatures = ['local-floor', 'bounded-floor'];
      if (!this.plainLayer) optionalFeatures.push('layers');
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures });
      this.session = session;
      // A floor-level origin, so that the ledge is underfoot. Fall back to 'local' if refused.
      let type = 'local-floor';
      try {
        await session.requestReferenceSpace('local-floor');
      } catch (err) {
        type = 'local';
      }
      this.referenceSpaceType = type;
      const manager = this.stage.renderer.xr;
      manager.setReferenceSpaceType(type);
      try {
        await this.startDrawing(manager, session);
      } catch (err) {
        // Do not leave a half-started session behind.
        this.session = null;
        session.end().catch(() => {});
        throw err;
      }
      return true;
    } finally {
      this.starting = false;
    }
  }

  /**
   * Hand the session to three.js. If the browser has WebXR Layers but the projection layer cannot
   * be set up, try once more through a plain XRWebGLLayer rather than giving up on VR.
   */
  async startDrawing(manager, session) {
    if (this.plainLayer) {
      await setSessionPlain(manager, session);
    } else {
      try {
        await manager.setSession(session);
      } catch (err) {
        if (session.renderState.layers === undefined) throw err; // that already was the plain path
        console.warn('VR: the projection layer could not be set up; drawing through a plain WebGL layer instead.', err);
        await setSessionPlain(manager, session);
      }
    }
    const layer = manager.getBaseLayer();
    this.renderPath = typeof XRWebGLLayer !== 'undefined' && layer instanceof XRWebGLLayer ? 'XRWebGLLayer' : 'XRProjectionLayer';
  }

  exit() {
    if (this.session) this.session.end();
  }

  onSessionStart() {
    const stage = this.stage;
    this.presenting = true;
    this.frames = 0;
    const t = this.timing;
    t.last = 0;
    t.frames = 0;
    t.seconds = 0;
    t.slowest = 0;
    t.late = 0;
    const rate = this.session && this.session.frameRate;
    this.nominal = rate > 20 && rate < 240 ? 1 / rate : 1 / 72;
    // Without a floor-level space the origin is at the head: lift the viewer to standing height.
    stage.rig.position.set(0, this.referenceSpaceType === 'local' ? 1.62 : 0, 0);
    stage.rig.rotation.set(0, 0, 0);
    stage.camera.position.set(0, 0, 0);
    stage.camera.rotation.set(0, 0, 0);
    this.handlers.onSessionStart();
  }

  onSessionEnd() {
    this.presenting = false;
    this.session = null;
    const stage = this.stage;
    stage.rig.position.set(0, 0, 0);
    stage.rig.rotation.set(0, 0, 0);
    stage.camera.position.set(0, 1.62, 0);
    this.handlers.onSessionEnd();
  }

  /**
   * Once per XR frame. `dt` is the time since the last frame in seconds. Returns true when the
   * frame came late (more than half a frame over what the headset asked for).
   */
  update(dt) {
    if (!this.presenting) return false;
    this.frames++;
    // The first half second is the headset settling: not counted.
    if (this.frames <= 36) return false;
    const t = this.timing;
    t.frames++;
    t.seconds += dt;
    if (dt > t.slowest) t.slowest = dt;
    const late = dt > this.nominal * 1.5;
    if (late) t.late++;
    return late;
  }

  /**
   * Where the viewer's head is in the world (metres): the point between the eyes. (three.js
   * keeps its combined camera a little behind that, so that one frustum covers both eyes.)
   */
  headPosition(out) {
    if (!this.presenting) return out.setFromMatrixPosition(this.stage.camera.matrixWorld);
    const eyes = this.stage.renderer.xr.getCamera().cameras;
    if (eyes.length < 2) return out.setFromMatrixPosition(this.stage.renderer.xr.getCamera().matrixWorld);
    out.setFromMatrixPosition(eyes[0].matrixWorld);
    return out.add(this.head.setFromMatrixPosition(eyes[1].matrixWorld)).multiplyScalar(0.5);
  }

  /** A short buzz in the hand that pulled the trigger, where the controller can. */
  pulse(c) {
    try {
      const pad = c.source && c.source.gamepad;
      const motor = pad && pad.hapticActuators && pad.hapticActuators[0];
      if (motor && motor.pulse) motor.pulse(0.5, 70);
    } catch (err) {
      /* no haptics: nothing to do */
    }
  }

  /**
   * How the session that just ran went: frames a second, the slowest frame, how many frames
   * came late, and what it was drawn through. Null if it never drew.
   */
  sessionReport() {
    const t = this.timing;
    if (t.frames < 2 || !(t.seconds > 0)) return null;
    return {
      fps: t.frames / t.seconds,
      target: 1 / this.nominal,
      slowestMs: t.slowest * 1000,
      late: t.late / t.frames,
      seconds: t.seconds,
      renderPath: this.renderPath,
    };
  }
}
