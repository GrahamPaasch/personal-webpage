/**
 * xr.js: WebXR. Entering and leaving immersive VR, the person's own hands, pointing at the
 * control board, thumbstick movement, and the measurements calibration needs.
 *
 * Proprioception guard (spec): a ball lands at the palm, never at the controller tip or the
 * pointing ray. Each hand has a "palm frame":
 *
 *   controllers    the WebXR *grip* pose, which is the pose "used to render virtual objects such
 *                  that they appear to be held in the user's hand", at the centre of the curled
 *                  fingers;
 *   tracked hands  (the optional toggle) the middle of the palm, built from the hand joints:
 *                  halfway along the middle metacarpal bone, raised out of the palm by the bone's
 *                  own radius plus one ball radius, so a ball there rests on the skin. (three.js
 *                  gives a tracked hand no grip pose, so it has to be built here.)
 *
 * The palm point is the origin of that frame plus a small offset the person can nudge until a
 * virtual ball resting there feels like it sits in the real palm. If neither a grip pose nor a
 * tracked hand is there, there is no palm point: nothing falls back to the pointing ray.
 *
 * Palm frame axes (those of the WebXR grip space): the back of the right hand faces +X and the
 * back of the left hand faces -X, so "out of the palm" is -X on the right and +X on the left. -Z
 * points toward the thumb, and +Y points back toward the wrist. A hand joint has -Y out of the
 * palm and -Z along its bone away from the wrist (WebXR Hand Input); HAND_TO_GRIP turns one into
 * the other.
 */

import { THREE, makeHandCup, OWN_HAND_COLOR, TextLabel } from './scene.js';
import { RIGHT, LEFT, BALL_DIAMETER } from './physics.js';
import { VRPanel } from './vrpanel.js';
import { formatSpeed } from './describe.js';

const STICK_DEADZONE = 0.5; // high on purpose: a thumb resting on the stick must not move you
const MOVE_SPEED = 1.4; // m/s, a slow walk
const SNAP_ANGLE = Math.PI / 6;
const BUTTON_AX = 4; // xr-standard gamepad: A on the right controller, X on the left
const BUTTON_BY = 5;

// The palm lies along the middle metacarpal bone. A joint sits at the wrist end of the bone it is
// named after, so that bone runs from the first of these joints to the second.
const PALM_JOINT = 'middle-finger-metacarpal';
const KNUCKLE_JOINT = 'middle-finger-phalanx-proximal';
const JOINT_DOTS = 50; // 25 joints a hand
const UP = new THREE.Vector3(0, 1, 0);

/** Grip axes written in hand-joint axes, [right, left] (see the header). */
const HAND_TO_GRIP = [
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
  ),
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0))
  ),
];

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
   * handlers: { onSessionStart(), onSessionEnd(), onFirstPose(sample), onTrigger(), onPanel(id),
   *             onMenu() }
   */
  constructor(stage, handlers) {
    this.stage = stage;
    this.handlers = handlers;
    this.supported = false;
    this.reason = '';
    this.session = null;
    this.starting = false; // a session has been asked for and is not there yet
    this.presenting = false;
    this.referenceSpaceType = 'local-floor';
    this.handTracking = false;
    this.plainLayer = false; // draw through a plain XRWebGLLayer (the address has ?layers=off)
    this.renderPath = ''; // which kind of layer the running session draws through
    this.nudge = { palm: 0, wrist: 0, thumb: 0 };
    this.showMyHands = true;
    this.palmBall = false;
    this.frames = 0;
    this.posed = false; // the headset has reported a head pose in this session
    this.placed = false;
    this.jointDots = null;
    this.timing = { last: 0, frames: 0, seconds: 0, slowest: 0 };

    this.panel = new VRPanel();
    stage.scene.add(this.panel.group);

    // Head-locked labels. They are children of the camera, so they stay in view.
    this.speedLabel = new TextLabel({ pxWidth: 320, pxHeight: 128, height: 0.085, depthTest: false, color: '#ff9f43' });
    this.speedLabel.mesh.position.set(0, -0.32, -1.1);
    this.speedLabel.mesh.visible = false;
    this.promptLabel = new TextLabel({
      pxWidth: 1024,
      pxHeight: 256,
      height: 0.18,
      depthTest: false,
      font: '600 58px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    });
    this.promptLabel.mesh.position.set(0, -0.1, -1.1);
    this.promptLabel.mesh.visible = false;
    stage.camera.add(this.speedLabel.mesh, this.promptLabel.mesh);
    this.promptUntil = 0;

    this.controllers = [0, 1].map((i) => this.makeController(i));

    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpEye = new THREE.Vector3();
    this.tmpDir = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();

    stage.renderer.xr.addEventListener('sessionstart', () => this.onSessionStart());
    stage.renderer.xr.addEventListener('sessionend', () => this.onSessionEnd());
  }

  /** Is immersive VR available here? Resolves to true or false and records why not. */
  async checkSupport() {
    if (!window.isSecureContext) {
      this.reason = 'VR needs a secure page (https).';
      return (this.supported = false);
    }
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      this.reason = 'This browser has no WebXR. Open this page in the headset browser.';
      return (this.supported = false);
    }
    try {
      this.supported = await navigator.xr.isSessionSupported('immersive-vr');
      if (!this.supported) this.reason = 'No VR headset found. Open this page in the headset browser.';
    } catch (err) {
      this.supported = false;
      this.reason = 'VR is blocked on this page: ' + (err && err.message ? err.message : err);
    }
    return this.supported;
  }

  /**
   * Start an immersive session. Resolves to true once it is running, and to false if there is
   * nothing to do: VR is not available, a session is running, or one is already being started (a
   * second press of the button must not ask the browser twice).
   */
  async enter() {
    if (this.session || this.starting || !this.supported) return false;
    this.starting = true;
    try {
      const optionalFeatures = ['local-floor', 'bounded-floor'];
      if (!this.plainLayer) optionalFeatures.push('layers');
      if (this.handTracking) optionalFeatures.push('hand-tracking');
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures });
      this.session = session;
      // Prefer a floor-level origin so heights are real heights. Fall back to 'local' if refused.
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
    this.posed = false;
    this.placed = false;
    this.timing.last = 0;
    this.timing.frames = 0;
    this.timing.seconds = 0;
    this.timing.slowest = 0;
    stage.rig.position.set(0, this.referenceSpaceType === 'local' ? 1.6 : 0, 0);
    stage.rig.rotation.set(0, 0, 0);
    // We update the XR camera ourselves each frame, before anything reads the head pose.
    stage.renderer.xr.cameraAutoUpdate = false;
    stage.ghostHead.visible = false;
    this.handlers.onSessionStart();
  }

  onSessionEnd() {
    this.presenting = false;
    this.session = null;
    this.hidePanel();
    this.speedLabel.mesh.visible = false;
    this.promptLabel.mesh.visible = false;
    if (this.jointDots) this.jointDots.visible = false;
    this.stage.renderer.xr.cameraAutoUpdate = true;
    this.stage.rig.position.set(0, 0, 0);
    this.stage.rig.rotation.set(0, 0, 0);
    this.handlers.onSessionEnd();
  }

  /**
   * How the session that just ran went, for the note on the page: frames a second, the slowest
   * frame, and what it was drawn through. Null if it never drew.
   */
  sessionReport() {
    const t = this.timing;
    if (t.frames < 2 || !(t.seconds > 0)) return null;
    return { fps: t.frames / t.seconds, slowestMs: t.slowest * 1000, seconds: t.seconds, renderPath: this.renderPath };
  }

  makeController(index) {
    const stage = this.stage;
    const xr = stage.renderer.xr;
    const ray = xr.getController(index);
    const grip = xr.getControllerGrip(index);
    const hand = xr.getHand(index);
    stage.rig.add(ray, grip, hand);

    const c = {
      index,
      ray,
      grip,
      hand,
      source: null,
      handedness: null,
      side: index === 0 ? RIGHT : LEFT,
      menuDown: false,
      snapReady: true,
      palmFrom: '', // what the palm frame follows right now: 'grip', 'hand' or '' (not tracked)
      lift: 0,
    };

    // The palm frame, in the same space as the grip and the hand joints. update() keeps it on the
    // grip, or on the palm of a tracked hand.
    c.palm = new THREE.Group();
    c.palm.visible = false;
    stage.rig.add(c.palm);

    // The person's own hand: a solid cup at the palm point, plus the handle of the controller.
    c.holder = new THREE.Group();
    c.palm.add(c.holder);
    c.cup = makeHandCup(OWN_HAND_COLOR, false);
    c.holder.add(c.cup);
    c.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_DIAMETER / 2, 20, 14),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 })
    );
    c.ball.visible = false;
    c.holder.add(c.ball);
    c.handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.11, 12),
      new THREE.MeshBasicMaterial({ color: 0x8894aa, transparent: true, opacity: 0.35, depthWrite: false })
    );
    c.handle.rotation.x = Math.PI / 2; // the handle runs along grip Z
    grip.add(c.handle);

    // Pointing ray, shown only while it is on the control board.
    c.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    c.line.visible = false;
    ray.add(c.line);

    ray.addEventListener('connected', (e) => {
      c.source = e.data;
      c.handedness = e.data.handedness;
      if (c.handedness === 'right') c.side = RIGHT;
      else if (c.handedness === 'left') c.side = LEFT;
      this.applyHandLook(c);
    });
    ray.addEventListener('disconnected', () => {
      c.source = null;
      c.handedness = null;
      c.line.visible = false;
      c.palm.visible = false;
      c.palmFrom = '';
      this.panel.clearPointer(index);
    });
    ray.addEventListener('selectstart', () => this.onSelect(c));

    this.applyHandLook(c);
    return c;
  }

  /** Palm offset, orientation and visibility of one own-hand marker. */
  applyHandLook(c) {
    const toPalm = c.side === RIGHT ? -1 : 1; // out of the palm is -X on the right hand, +X on the left
    // On a tracked hand the frame sits inside the hand, on the bone: lift the ball onto the skin.
    const lift = c.palmFrom === 'hand' ? c.lift : 0;
    c.holder.position.set(toPalm * (this.nudge.palm + lift), this.nudge.wrist, -this.nudge.thumb);
    // The cup opens along its local +Y; turn that to face out of the palm.
    c.holder.rotation.set(0, 0, c.side === RIGHT ? Math.PI / 2 : -Math.PI / 2);
    c.cup.visible = this.showMyHands;
    c.handle.visible = this.showMyHands;
    c.ball.visible = this.palmBall;
  }

  /**
   * Put the palm frame of one hand where the hand is: on the grip pose of a controller, or on the
   * palm of a tracked hand. With neither, there is no palm (and nothing is drawn for it).
   */
  updatePalm(c) {
    let from = '';
    if (c.source && c.grip.visible) {
      from = 'grip';
      c.palm.position.copy(c.grip.position);
      c.palm.quaternion.copy(c.grip.quaternion);
    } else if (c.source && c.hand.visible && c.hand.joints) {
      const base = c.hand.joints[PALM_JOINT];
      const knuckle = c.hand.joints[KNUCKLE_JOINT];
      if (base && knuckle && base.visible && knuckle.visible) {
        from = 'hand';
        c.palm.position.copy(base.position).add(knuckle.position).multiplyScalar(0.5);
        c.palm.quaternion.copy(base.quaternion).multiply(HAND_TO_GRIP[c.side]);
        c.lift = (base.jointRadius || 0) + BALL_DIAMETER / 2;
      }
    }
    c.palm.visible = from !== '';
    if (from !== c.palmFrom || from === 'hand') {
      c.palmFrom = from;
      this.applyHandLook(c);
    }
  }

  setNudge(nudge) {
    this.nudge = { palm: nudge.palm, wrist: nudge.wrist, thumb: nudge.thumb };
    this.controllers.forEach((c) => this.applyHandLook(c));
  }

  setShowMyHands(on) {
    this.showMyHands = on;
    this.controllers.forEach((c) => this.applyHandLook(c));
  }

  setPalmBall(on) {
    this.palmBall = on;
    this.controllers.forEach((c) => this.applyHandLook(c));
  }

  onSelect(c) {
    const button = this.panel.hover[c.index];
    if (button) {
      this.pulse(c, 0.5, 25);
      this.handlers.onPanel(button.id);
      return;
    }
    this.handlers.onTrigger();
  }

  pulse(c, strength, ms) {
    try {
      const gp = c.source && c.source.gamepad;
      const act = gp && gp.hapticActuators && gp.hapticActuators[0];
      const done = act && act.pulse ? act.pulse(strength, ms) : null;
      if (done && done.catch) done.catch(() => {});
    } catch (err) {
      // haptics are a nicety
    }
  }

  /**
   * Show a head-locked message. With `seconds` it is a passing notice, kept low in the view so it
   * does not cover the pattern. Without, it is an instruction that stays near the centre until
   * replaced (the calibration prompt).
   */
  prompt(text, seconds) {
    this.promptLabel.setText(text);
    this.promptLabel.mesh.visible = this.presenting && text !== '';
    this.promptLabel.mesh.position.y = seconds ? -0.5 : -0.1;
    this.promptUntil = seconds ? performance.now() + seconds * 1000 : 0;
  }

  setSpeedLabel(speed) {
    const text = Math.abs(speed - 1) < 1e-6 ? '' : formatSpeed(speed);
    this.speedLabel.setText(text);
    this.speedLabel.mesh.visible = this.presenting && text !== '';
  }

  /**
   * Place the control board relative to where the person is and which way they face.
   *   'side'   well to the left, out of the way of the pattern (which fills the view ahead);
   *   'front'  straight ahead, a little below eye level, for when you want to use it.
   */
  summonPanel(where) {
    const head = this.headPosition(this.tmpA);
    const yaw = this.headYaw();
    const offset = where === 'front' ? this.tmpB.set(0, -0.25, -1.15) : this.tmpB.set(-1.06, -0.15, -0.28);
    offset.applyAxisAngle(UP, yaw);
    this.panel.group.position.copy(head).add(offset);
    this.panel.group.position.y = Math.max(this.panel.group.position.y, 0.45);
    this.panel.group.lookAt(head);
    this.panel.group.visible = true;
    this.panel.group.updateMatrixWorld(true);
  }

  hidePanel() {
    this.panel.group.visible = false;
    this.controllers.forEach((c) => {
      c.line.visible = false;
      this.panel.clearPointer(c.index);
    });
  }

  /** Is the board roughly where the person is looking (within 35 degrees to either side)? */
  panelInView() {
    if (!this.panel.group.visible) return false;
    const head = this.headPosition(this.tmpA);
    const to = this.tmpB.copy(this.panel.group.position).sub(head);
    const bearing = Math.atan2(-to.x, -to.z);
    let off = bearing - this.headYaw();
    off = Math.atan2(Math.sin(off), Math.cos(off));
    return Math.abs(off) < (35 * Math.PI) / 180;
  }

  /** A or X: hide the board if you are looking at it, otherwise bring it in front of you. */
  togglePanel() {
    if (this.panelInView()) this.hidePanel();
    else this.summonPanel('front');
  }

  /**
   * World position of the head: the point midway between the eyes. (three.js parks its combined
   * XR camera a little behind the eyes so one frustum covers both, so that camera's own position
   * is not the head.)
   */
  headPosition(out) {
    const eyes = this.presenting ? this.stage.renderer.xr.getCamera().cameras : null;
    if (eyes && eyes.length === 2) {
      out.setFromMatrixPosition(eyes[0].matrixWorld);
      this.tmpEye.setFromMatrixPosition(eyes[1].matrixWorld);
      return out.add(this.tmpEye).multiplyScalar(0.5);
    }
    return this.stage.camera.getWorldPosition(out);
  }

  /**
   * Has the headset told us where the head is yet, in this session? Until it has, the camera is
   * not where the head is (on the first session it sits at the origin of the room, on the floor;
   * on a later one, wherever the last session left it) and nothing may be placed from it.
   */
  hasPose() {
    return this.presenting && this.posed && this.stage.renderer.xr.getCamera().cameras.length > 0;
  }

  /** Note the first frame of this session that carries a head pose. */
  watchForPose(xrFrame) {
    if (this.posed || !xrFrame || !xrFrame.getViewerPose) return;
    const space = this.stage.renderer.xr.getReferenceSpace();
    if (space && xrFrame.getViewerPose(space)) this.posed = true;
  }

  /** Heading of the head about the vertical axis (0 = looking down -Z, positive = turned left). */
  headYaw() {
    const dir = this.stage.camera.getWorldDirection(this.tmpDir);
    return Math.atan2(-dir.x, -dir.z);
  }

  /** The controller or hand on one side (RIGHT or LEFT) whose palm is tracked right now, or null. */
  tracked(side) {
    for (const c of this.controllers) {
      if (c.source && c.side === side && c.palm.visible) return c;
    }
    return null;
  }

  /**
   * World position of the palm point of one hand (RIGHT or LEFT), or null if it is not tracked.
   * Never the pointing ray: a ball must not be taught to land at the controller tip.
   */
  palmPosition(side, out) {
    const c = this.tracked(side);
    return c ? c.holder.getWorldPosition(out) : null;
  }

  /** Are these controllers, or tracked hands (which have no buttons)? */
  usingHands() {
    for (const c of this.controllers) {
      if (c.source && c.source.hand) return true;
    }
    return false;
  }

  /** What calibration needs: where the head and the two palm points are right now. */
  sample() {
    const head = this.headPosition(new THREE.Vector3());
    const frame = (side) => {
      const c = this.tracked(side);
      return c ? c.palm.getWorldQuaternion(new THREE.Quaternion()).toArray() : null;
    };
    return {
      head,
      headYaw: this.headYaw(),
      palms: [this.palmPosition(RIGHT, new THREE.Vector3()), this.palmPosition(LEFT, new THREE.Vector3())],
      frames: [frame(RIGHT), frame(LEFT)],
      // Could this device ever give a palm? (Not a phone in a cardboard viewer.)
      trackable: this.controllers.some((c) => c.source && (c.source.gripSpace || c.source.hand)),
    };
  }

  /** Move the person so their head is over a floor point (used by "my spot"). */
  moveHeadTo(x, z) {
    const rig = this.stage.rig;
    const head = this.headPosition(this.tmpA);
    rig.position.x += x - head.x;
    rig.position.z += z - head.z;
    this.syncCamera();
  }

  /**
   * Bring the camera up to date with the headset for this frame. three.js would do this while
   * drawing; doing it first means everything that reads the head pose this frame is current.
   */
  syncCamera() {
    this.stage.rig.updateMatrixWorld(true);
    this.stage.renderer.xr.updateCamera(this.stage.camera);
  }

  /** Once per XR frame, before the scene is drawn. `xrFrame` is the frame three.js was handed. */
  update(dt, xrFrame) {
    if (!this.presenting) return;
    const stage = this.stage;
    const rig = stage.rig;
    this.frames++;
    this.watchForPose(xrFrame);

    // Thumbsticks and buttons.
    let moveX = 0;
    let moveY = 0;
    let turn = 0;
    let turnController = null;
    for (const c of this.controllers) {
      const gp = c.source && c.source.gamepad;
      if (!gp) continue;
      // xr-standard: the thumbstick is axes 2 and 3 (0 and 1 are a touchpad, when there is one).
      const first = gp.axes.length >= 4 ? 2 : 0;
      const stickX = gp.axes[first] || 0;
      const stickY = gp.axes[first + 1] || 0;
      if (c.handedness === 'left') {
        moveX = stickX;
        moveY = stickY;
      } else {
        turn = stickX;
        turnController = c;
      }
      const down =
        !!(gp.buttons[BUTTON_AX] && gp.buttons[BUTTON_AX].pressed) ||
        !!(gp.buttons[BUTTON_BY] && gp.buttons[BUTTON_BY].pressed);
      if (down && !c.menuDown) this.handlers.onMenu();
      c.menuDown = down;
    }

    if (Math.hypot(moveX, moveY) > STICK_DEADZONE) {
      const yaw = this.headYaw();
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      // Stick up is -1 on the y axis: walk the way the head is facing.
      const forward = -moveY;
      rig.position.x += (fx * forward + -fz * moveX) * MOVE_SPEED * dt;
      rig.position.z += (fz * forward + fx * moveX) * MOVE_SPEED * dt;
    }
    if (turnController) {
      if (Math.abs(turn) > 0.6 && turnController.snapReady) {
        turnController.snapReady = false;
        this.turnAboutHead(turn > 0 ? -SNAP_ANGLE : SNAP_ANGLE);
      } else if (Math.abs(turn) < 0.3) {
        turnController.snapReady = true;
      }
    }

    this.syncCamera();

    // How the session is running, for the report after it (not physics, and not on screen in VR).
    const stamp = performance.now();
    if (this.timing.last > 0 && this.frames > 30) {
      const took = (stamp - this.timing.last) / 1000;
      this.timing.frames++;
      this.timing.seconds += took;
      if (took > this.timing.slowest) this.timing.slowest = took;
    }
    this.timing.last = stamp;

    for (const c of this.controllers) this.updatePalm(c);

    // Stand the juggler where the person is, on the first frame the headset reports a head pose.
    if (!this.placed && this.hasPose()) {
      this.placed = true;
      this.handlers.onFirstPose(this.sample());
    }

    this.drawJoints();

    // Pointing at the control board.
    for (const c of this.controllers) {
      let hit = null;
      if (c.source && c.ray.visible && this.panel.group.visible) {
        const origin = c.ray.getWorldPosition(this.tmpA);
        const dir = this.tmpB.set(0, 0, -1).applyQuaternion(c.ray.getWorldQuaternion(this.tmpQ));
        hit = this.panel.point(c.index, origin, dir);
      } else {
        this.panel.clearPointer(c.index);
      }
      c.line.visible = !!hit;
      if (hit) c.line.scale.set(1, 1, hit.distance);
    }

    if (this.promptUntil && performance.now() > this.promptUntil) {
      this.promptUntil = 0;
      this.prompt('', 0);
    }
  }

  /**
   * Hand tracking: every joint of both hands as a small dot, all in one instanced mesh (one draw
   * call an eye, where a mesh per joint would be fifty).
   */
  drawJoints() {
    let count = 0;
    for (const c of this.controllers) {
      if (!c.source || !c.source.hand || !c.hand.visible || !c.hand.joints) continue;
      if (!this.jointDots) {
        this.jointDots = new THREE.InstancedMesh(
          new THREE.SphereGeometry(0.007, 8, 6),
          new THREE.MeshBasicMaterial({ color: OWN_HAND_COLOR }),
          JOINT_DOTS
        );
        this.jointDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.jointDots.frustumCulled = false; // the dots follow the hands anywhere
        this.stage.rig.add(this.jointDots);
      }
      for (const name in c.hand.joints) {
        const joint = c.hand.joints[name];
        if (joint.visible && count < JOINT_DOTS) this.jointDots.setMatrixAt(count++, joint.matrix);
      }
    }
    if (!this.jointDots) return;
    this.jointDots.count = count;
    this.jointDots.visible = this.showMyHands && count > 0;
    if (count > 0) this.jointDots.instanceMatrix.needsUpdate = true;
  }

  turnAboutHead(angle) {
    const rig = this.stage.rig;
    const head = this.headPosition(this.tmpA).clone();
    const local = rig.worldToLocal(head.clone()); // the head in tracking space
    rig.rotation.y += angle;
    const c = Math.cos(rig.rotation.y);
    const s = Math.sin(rig.rotation.y);
    // Keep the head where it was: rig.position = head - R(yaw) * local.
    rig.position.x = head.x - (c * local.x + s * local.z);
    rig.position.z = head.z - (-s * local.x + c * local.z);
  }
}
