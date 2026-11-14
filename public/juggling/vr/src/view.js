/**
 * view.js: the camera for flat screens (laptop, phone). Two modes:
 *
 *   'eye'    the juggler's own view: the camera sits at the juggler's eyes; drag to look around.
 *   'orbit'  stepped out: drag to walk around the pattern, wheel or pinch to move in and out.
 *
 * In VR none of this runs: the headset is the camera and the person really walks around.
 */

import { THREE } from './scene.js';

const DEG = Math.PI / 180;
const ORBIT_FOV = 50;

export class FlatView {
  constructor(stage) {
    this.stage = stage;
    this.mode = 'eye';
    this.anchor = null;
    this.patternHeight = 1;

    this.eye = { yaw: 0, pitch: 0, fov: 78 };
    this.orbit = { azimuth: 160 * DEG, elevation: 6 * DEG, radius: 3 };

    this.pointers = new Map();
    this.pinchStart = 0;
    this.onChange = null;
    this.bind(stage.canvas);
  }

  /** Call when the pattern or the calibration changes. `resetLook` re-aims both modes. */
  setTarget(anchor, patternHeight, resetLook) {
    this.anchor = anchor;
    this.patternHeight = patternHeight;
    if (resetLook) this.resetLook();
  }

  setMode(mode) {
    this.mode = mode === 'orbit' ? 'orbit' : 'eye';
    this.resetLook();
  }

  /** Start again from the default viewpoint of the current mode. */
  resetLook() {
    if (!this.anchor) return;
    this.eye.fov = 78;
    this.orbit.azimuth = 160 * DEG;
    this.orbit.elevation = 6 * DEG;
    this.retarget();
  }

  /**
   * Re-aim after the pattern or the calibration changed, keeping the angle the person chose
   * when stepped out. The juggler's-eye view looks where a juggler watches: the upper part of
   * the arcs.
   */
  retarget() {
    const a = this.anchor;
    if (!a) return;
    const focusAboveHands = Math.max(0.12, 0.62 * this.patternHeight);
    const dy = a.handHeight + focusAboveHands - a.eyeHeight;
    this.eye.yaw = a.yaw;
    this.eye.pitch = Math.atan2(dy, a.distance);
    // Stepped out: far enough back to see the juggler from the floor to the top of the pattern.
    const span = this.sceneTop() + 0.35;
    this.orbit.radius = Math.min(Math.max((span / 2 / Math.tan((ORBIT_FOV / 2) * DEG)) * 1.08, 2.0), 12);
  }

  /** The highest thing worth keeping in view: the top of the pattern or the juggler's head. */
  sceneTop() {
    const a = this.anchor;
    return Math.max(a.handHeight + this.patternHeight + 0.05, a.eyeHeight + 0.15);
  }

  /** Apply the current mode to the stage camera (flat mode only). */
  apply() {
    const a = this.anchor;
    const stage = this.stage;
    if (!a || stage.renderer.xr.isPresenting) return;
    const cam = stage.camera;
    stage.rig.position.set(0, 0, 0);
    stage.rig.rotation.set(0, 0, 0);

    const portrait = cam.aspect < 1;
    if (this.mode === 'eye') {
      cam.position.set(a.spotX, a.eyeHeight, a.spotZ);
      cam.rotation.set(this.eye.pitch, this.eye.yaw, 0, 'YXZ');
      cam.fov = Math.min(this.eye.fov + (portrait ? 14 : 0), 105);
      stage.ghostHead.visible = false;
    } else {
      const fx = -Math.sin(a.yaw);
      const fz = -Math.cos(a.yaw);
      const target = new THREE.Vector3(a.spotX + fx * a.distance, this.sceneTop() / 2, a.spotZ + fz * a.distance);
      // Azimuth 0 = directly behind the juggler, 180 degrees = facing the juggler.
      const az = this.orbit.azimuth + a.yaw;
      const el = this.orbit.elevation;
      const r = this.orbit.radius * (portrait ? 1.35 : 1);
      cam.position.set(
        target.x + r * Math.sin(az) * Math.cos(el),
        Math.max(target.y + r * Math.sin(el), 0.15),
        target.z + r * Math.cos(az) * Math.cos(el)
      );
      cam.lookAt(target);
      cam.fov = ORBIT_FOV;
      stage.ghostHead.visible = true;
    }
    cam.updateProjectionMatrix();
  }

  bind(canvas) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinchStart = this.pinchDistance();
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.drag(dx, dy);
      } else if (this.pointers.size === 2) {
        const d = this.pinchDistance();
        if (this.pinchStart > 0 && d > 0) this.zoom(this.pinchStart / d);
        this.pinchStart = d;
      }
    });
    const release = (e) => {
      this.pointers.delete(e.pointerId);
      this.pinchStart = 0;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false }
    );
  }

  pinchDistance() {
    const pts = Array.from(this.pointers.values());
    return pts.length < 2 ? 0 : Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  drag(dx, dy) {
    const k = 0.0045;
    if (this.mode === 'eye') {
      // Like dragging a panorama: the scene follows the pointer.
      this.eye.yaw += dx * k;
      this.eye.pitch = clamp(this.eye.pitch + dy * k, -89 * DEG, 89 * DEG);
    } else {
      this.orbit.azimuth -= dx * k * 1.3;
      this.orbit.elevation = clamp(this.orbit.elevation + dy * k, -20 * DEG, 85 * DEG);
    }
    if (this.onChange) this.onChange();
  }

  zoom(factor) {
    if (this.mode === 'eye') {
      this.eye.fov = clamp(this.eye.fov * factor, 35, 100);
    } else {
      this.orbit.radius = clamp(this.orbit.radius * factor, 0.8, 14);
    }
    if (this.onChange) this.onChange();
  }
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
