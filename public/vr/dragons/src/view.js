/**
 * view.js: the flat-screen camera. The viewer stands on the ledge and can only look around:
 * drag with a mouse or a finger. Until the first drag the camera follows the dragons by itself,
 * so the page is worth watching without touching anything.
 */

const DEG = Math.PI / 180;

export class FlatView {
  constructor(stage) {
    this.stage = stage;
    this.yaw = 0; // radians, positive = turned left
    this.pitch = -4 * DEG;
    this.follow = true; // keep the dragons in view
    this.dragging = false;
    this.idle = 0; // seconds since the last drag
    this.baseFov = stage.camera.fov; // the lens the page chose for this screen (main.js, layout)
    this.widen = 0; // how far the lens is opened for a dragon close by, 0..1 (narrow screens only)
    this.widened = false;
    this.lastWant = null; // where the dragons were last frame, as a bearing
    this.rate = 0; // how fast that bearing is turning, radians a second
    const canvas = stage.canvas;
    let lastX = 0;
    let lastY = 0;
    let pointer = null;
    canvas.addEventListener('pointerdown', (e) => {
      pointer = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      this.moved = 0;
      this.dragging = true;
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== pointer) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.moved < 6) return; // a tap, not a drag
      const k = (stage.camera.fov * DEG) / Math.max(canvas.clientHeight, 1);
      this.yaw += dx * k;
      this.pitch = Math.min(Math.max(this.pitch + dy * k, -80 * DEG), 85 * DEG);
      this.follow = false;
      this.idle = 0;
    });
    const release = (e) => {
      if (e.pointerId !== pointer) return;
      this.dragging = false;
      pointer = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  /** Was the last press a tap (not a drag)? */
  wasTap() {
    return (this.moved || 0) < 6;
  }

  set(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  /**
   * Turn toward a point of interest (the dragons), unless the person is steering.
   * target: { x, y, z } in the world, or null. nearest: how far off the nearer dragon is (metres).
   *
   * Far off the dragons cross the picture slowly, and the view drifts after them with some
   * slack, so that the horizon is not for ever on the move. A close pass sweeps by at half a
   * turn in five seconds: for that the view turns as fast as they do and aims a little ahead
   * of them, and on a narrow screen (a phone held upright sees 50 degrees across) the lens
   * opens up as well, or the nearer dragon would be half out of the picture.
   */
  update(dt, target, nearest) {
    const cam = this.stage.camera;
    const narrow = cam.aspect < 1;
    const close = narrow && nearest !== undefined ? Math.min(Math.max((44 - nearest) / 20, 0), 1) : 0;
    this.widen += ((this.follow ? close : 0) - this.widen) * (1 - Math.exp(-dt / 0.6));
    if (!this.follow) {
      this.idle += dt;
      this.lastWant = null;
      return;
    }
    if (!target) return;
    const dx = target.x - cam.position.x;
    const dy = target.y - cam.position.y;
    const dz = target.z - cam.position.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    // How fast the dragons are crossing, smoothed (the point followed moves from one dragon
    // to the other, and must not be mistaken for a pass).
    if (this.lastWant !== null && dt > 0) {
      let turned = wantYaw - this.lastWant;
      turned = Math.atan2(Math.sin(turned), Math.cos(turned));
      const rate = Math.min(Math.max(turned / dt, -1.6), 1.6);
      this.rate += (rate - this.rate) * (1 - Math.exp(-dt / 0.3));
    }
    this.lastWant = wantYaw;
    const quick = Math.min(Math.abs(this.rate) / 0.5, 1);
    // Ease toward it: gently when they are slow, as fast as they go when they are quick.
    const k = 1 - Math.exp(-dt * (1.1 + 3.4 * quick));
    const ahead = Math.min(Math.max(this.rate * 0.35, -0.3), 0.3);
    let dYaw = wantYaw + ahead - this.yaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    // A little slack in the middle keeps the horizon still for small moves; less of it on a
    // narrow screen and in a close pass.
    const slack = (narrow ? 3.5 : 6) * (1 - 0.7 * quick) * DEG;
    if (Math.abs(dYaw) > slack) this.yaw += (dYaw - Math.sign(dYaw) * slack) * k;
    const dPitch = wantPitch * (0.75 + 0.2 * quick) - 2 * DEG - this.pitch;
    const slackUp = 3 * (1 - 0.6 * quick) * DEG;
    if (Math.abs(dPitch) > slackUp) this.pitch += (dPitch - Math.sign(dPitch) * slackUp) * k;
    this.pitch = Math.min(Math.max(this.pitch, -60 * DEG), 70 * DEG);
  }

  apply() {
    const cam = this.stage.camera;
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // The lens, only while this view has it open or is closing it again (the tools set their own).
    if (this.widen > 0.002 || this.widened) {
      this.widened = this.widen > 0.002;
      const fov = this.baseFov + WIDEN * (this.widened ? this.widen : 0);
      if (Math.abs(cam.fov - fov) > 0.02) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
    }
  }
}

/** How much further a narrow screen's lens opens for a dragon close by (degrees, top to bottom). */
const WIDEN = 16;
