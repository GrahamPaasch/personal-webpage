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
   * Turn gently toward a point of interest (the dragons), unless the person is steering.
   * target: { x, y, z } in the world, or null.
   */
  update(dt, target) {
    if (!this.follow) {
      this.idle += dt;
      return;
    }
    if (!target) return;
    const cam = this.stage.camera.position;
    const dx = target.x - cam.x;
    const dy = target.y - cam.y;
    const dz = target.z - cam.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    let dYaw = wantYaw - this.yaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    // Ease toward it; a little slack in the middle keeps the horizon still for small moves.
    const k = 1 - Math.exp(-dt * 1.1);
    const slack = 6 * DEG;
    if (Math.abs(dYaw) > slack) this.yaw += (dYaw - Math.sign(dYaw) * slack) * k;
    const dPitch = wantPitch * 0.75 - 2 * DEG - this.pitch;
    if (Math.abs(dPitch) > 3 * DEG) this.pitch += (dPitch - Math.sign(dPitch) * 3 * DEG) * k;
    this.pitch = Math.min(Math.max(this.pitch, -60 * DEG), 70 * DEG);
  }

  apply() {
    const cam = this.stage.camera;
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
