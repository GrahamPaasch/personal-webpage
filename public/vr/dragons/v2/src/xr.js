/**
 * xr.js: WebXR. Entering and leaving immersive VR, the trigger, and how the session ran.
 *
 * The viewer stands still on the ledge: there is no thumbstick movement and no teleport, on
 * purpose. They can look anywhere and lean or step within their own floor space, and that is
 * all; the dragons do the moving.
 *
 * Where the ledge is. A headset's floor-level space has its origin and its "forward" wherever
 * the headset last put them (often where the person last recentred, which may be across the
 * room and facing the wall). So the ledge is not hung on that origin: on the first frame that
 * carries a head pose, the valley is turned and shifted once so that the person's head is over
 * the middle of the ledge and the lake is in front of them, wherever in their room they stand
 * and whichever way they face. After that it stays put, and they walk about on it. If the
 * headset moves its origin (the person recentres), it is done again.
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
   * handlers: { onSessionStart(), onSessionEnd(), onTrigger(hand) -> false if the call could
   *             not be answered, onVisibility(visible), onPlaced() }
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
    this.posed = false; // the headset has reported a head pose in this session
    this.placed = false; // the valley has been put under the person's feet
    this.scale = 1; // size of the VR picture, as a fraction of the headset's own
    this.scaleFixed = false; // the address said what size: then nothing else changes it
    this.onReset = () => {
      // The headset has moved its origin: stand the person on the ledge again.
      this.placed = false;
    };

    const xr = stage.renderer.xr;
    if (o.scale && o.scale > 0.3 && o.scale <= 1.5) {
      this.scaleFixed = true;
      this.setScale(o.scale, true);
    }
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
        // One buzz in the hand: a dragon is coming. Two short ones: none can just now.
        const answered = this.handlers.onTrigger(c.handedness);
        this.pulse(c, answered !== false);
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
      // 'hidden' is the headset off the head (or the system in front): nobody is looking.
      session.addEventListener('visibilitychange', () => {
        if (this.handlers.onVisibility) this.handlers.onVisibility(session.visibilityState !== 'hidden');
      });
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
    // Told when the headset moves the origin of its space (the person recentres).
    const space = manager.getReferenceSpace();
    if (space && space.addEventListener) space.addEventListener('reset', this.onReset);
  }

  exit() {
    if (this.session) this.session.end();
  }

  /**
   * The size of the VR picture for the NEXT session, as a fraction of the headset's own (it
   * cannot be changed while one runs). `fixed`: the address asked for this size; otherwise a
   * size the address fixed is left alone. Returns the size that will be used.
   */
  setScale(scale, fixed) {
    if (this.scaleFixed && !fixed) return this.scale;
    if (!(scale > 0.3 && scale <= 1.5) || this.presenting) return this.scale;
    this.scale = scale;
    this.stage.renderer.xr.setFramebufferScaleFactor(scale);
    return this.scale;
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
    // Where the person really is comes with the first head pose: see place().
    this.posed = false;
    this.placed = false;
    this.handlers.onSessionStart();
  }

  /** Note the first frame of this session that carries a head pose. */
  watchForPose(xrFrame) {
    if (this.posed || !xrFrame || !xrFrame.getViewerPose) return;
    const space = this.stage.renderer.xr.getReferenceSpace();
    if (space && xrFrame.getViewerPose(space)) this.posed = true;
  }

  /**
   * Turn and shift the valley (by moving the rig that carries the headset's space) so that
   * the person's head is over the middle of the ledge and they face the lake. Done once, from
   * where the headset says the head is in its own space; never while they are looking.
   * Returns true if it was done.
   */
  place() {
    const eyes = this.stage.renderer.xr.getCamera().cameras;
    if (!eyes.length) return false;
    // The head in the headset's own space: three.js keeps each eye's pose there, apart from
    // the rig. Midway between the eyes, and the way the first eye faces.
    let hx = 0;
    let hz = 0;
    for (const eye of eyes) {
      hx += eye.matrix.elements[12] / eyes.length;
      hz += eye.matrix.elements[14] / eyes.length;
    }
    const e = eyes[0].matrix.elements;
    // Forward is -z of the eye. Looking straight up or down there is no heading to take: wait.
    const fx = -e[8];
    const fz = -e[10];
    if (Math.hypot(fx, fz) < 0.2) return false;
    const yaw = Math.atan2(-fx, -fz); // 0: along -z; positive: turned left
    const rig = this.stage.rig;
    rig.rotation.set(0, -yaw, 0);
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    // The head ends up over x = 0, z = 0: rig.position = -R(rig turn) * head.
    rig.position.x = -(c * hx + s * hz);
    rig.position.z = -(-s * hx + c * hz);
    this.syncCamera();
    return true;
  }

  /** Bring the cameras up to date with the rig for this frame (three.js would do it while drawing). */
  syncCamera() {
    this.stage.rig.updateMatrixWorld(true);
    this.stage.renderer.xr.updateCamera(this.stage.camera);
  }

  onSessionEnd() {
    this.presenting = false;
    this.session = null;
    this.posed = false;
    const stage = this.stage;
    stage.rig.position.set(0, 0, 0);
    stage.rig.rotation.set(0, 0, 0);
    stage.camera.position.set(0, 1.62, 0);
    this.handlers.onSessionEnd();
  }

  /**
   * Once per XR frame, before the scene is drawn. `dt` is the time since the last frame in
   * seconds; `xrFrame` is the frame three.js was handed. Returns true when the frame came late
   * (more than half a frame over what the headset asked for).
   */
  update(dt, xrFrame) {
    if (!this.presenting) return false;
    this.watchForPose(xrFrame);
    if (this.posed && !this.placed && this.place()) {
      this.placed = true;
      if (this.handlers.onPlaced) this.handlers.onPlaced();
    }
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

  /**
   * A buzz in the hand that pulled the trigger, where the controller can: one for a call that
   * is answered, two short ones for a call that cannot be.
   */
  pulse(c, answered) {
    try {
      const pad = c.source && c.source.gamepad;
      const motor = pad && pad.hapticActuators && pad.hapticActuators[0];
      if (!motor || !motor.pulse) return;
      if (answered) {
        motor.pulse(0.5, 70);
      } else {
        motor.pulse(0.3, 28);
        setTimeout(() => {
          try {
            motor.pulse(0.3, 28);
          } catch (err) {
            /* the controller has gone */
          }
        }, 120);
      }
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
      scale: this.scale,
    };
  }
}
