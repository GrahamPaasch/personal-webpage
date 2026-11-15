/**
 * dragons.js: draws the two dragons. The flight (flight.js) says where each one is and what it
 * is doing; the rig (rig.js) turns that into bones; this hands both to three.js.
 *
 * Two draw calls per dragon at most: the dragon, and its image in the lake while it is low over
 * the water.
 */

import { THREE, dragonMaterial, flameMaterial } from './shaders.js';
import { buildDragon, buildFlame, DRAGONS } from './dragonGeometry.js';
import { BONE, BONE_COUNT, restPose, poseSkeleton, heave } from './rig.js';
import { ROAR_SECONDS } from './flight.js';
import * as W from './world.js';

const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpUp = new THREE.Vector3();
const tmpBone = new THREE.Matrix4();

/**
 * How hard a dragon is breathing fire, 0..1, from how much of its roar is left (seconds): the
 * mouth opens first, the fire comes a moment later and stops before the mouth shuts.
 */
export function firePower(roarLeft) {
  if (!(roarLeft > 0)) return 0;
  const t = ROAR_SECONDS - roarLeft;
  const rise = Math.min(Math.max((t - 0.22) / 0.3, 0), 1);
  const fall = Math.min(Math.max((ROAR_SECONDS - 0.12 - t) / 0.4, 0), 1);
  return rise * rise * (3 - 2 * rise) * fall;
}

export class DragonView {
  constructor(stage, index) {
    const spec = DRAGONS[index];
    this.spec = spec;
    this.stage = stage;
    const colors = {};
    for (const k of Object.keys(spec.colors)) colors[k] = W.srgb(spec.colors[k][0], spec.colors[k][1], spec.colors[k][2]);
    const built = buildDragon(spec.build, colors);
    this.skeleton = built.skeleton;
    this.scale = built.skeleton.build.scale;
    this.world = new Float32Array(BONE_COUNT * 12);
    this.skin = new Float32Array(BONE_COUNT * 12);
    this.pose = restPose();
    poseSkeleton(this.skeleton, this.pose, this.world, this.skin);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(built.arrays.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(built.arrays.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(built.arrays.color, 3));
    g.setAttribute('aux', new THREE.BufferAttribute(built.arrays.aux, 4));
    // The wings move far from where the rest pose has them: one generous sphere covers it all.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -1.5 * this.scale), 10.5 * this.scale);
    this.triangles = built.arrays.triangles;

    this.material = dragonMaterial(stage.shared, this.skin);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 5;
    stage.scene.add(this.mesh);

    this.mirrorMaterial = dragonMaterial(stage.shared, this.skin, { mirror: true });
    this.mirror = new THREE.Mesh(g, this.mirrorMaterial);
    this.mirror.matrixAutoUpdate = false;
    this.mirror.renderOrder = 60;
    this.mirror.visible = false;
    stage.scene.add(this.mirror);
    this.mirrorOn = true;
    this.flip = new THREE.Matrix4().set(1, 0, 0, 0, 0, -1, 0, 2 * W.LAKE_LEVEL, 0, 0, 1, 0, 0, 0, 0, 1);
    this.sunlit = 1;

    // Its fire: one more draw call, and only while it is breathing.
    const fire = buildFlame(spec.build);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fire.position, 3));
    fg.setAttribute('dir', new THREE.BufferAttribute(fire.dir, 3));
    fg.setAttribute('flame', new THREE.BufferAttribute(fire.flame, 3));
    fg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 4 * this.scale), 16 * this.scale);
    this.flameMaterial = flameMaterial(stage.shared, fire.length);
    this.flame = new THREE.Mesh(fg, this.flameMaterial);
    this.flame.matrixAutoUpdate = false;
    this.flame.renderOrder = 70; // after everything solid and the lake
    this.flame.visible = false;
    stage.scene.add(this.flame);
    this.fire = 0;
  }

  /**
   * f: a flyer's state from flight.js { x, y, z, heading, pitch, bank, flap, power, tuck, brake,
   * turn, arch, lookYaw, lookPitch, jaw }. time: seconds.
   */
  update(f, time, dt) {
    const pose = this.pose;
    pose.flap = f.flap;
    pose.power = f.power;
    pose.tuck = f.tuck;
    pose.brake = f.brake;
    pose.turn = f.turn;
    pose.arch = f.arch;
    pose.lookYaw = f.lookYaw;
    pose.lookPitch = f.lookPitch;
    pose.jaw = f.jaw;
    pose.time = time + this.scale * 10;
    poseSkeleton(this.skeleton, pose, this.world, this.skin);

    const mesh = this.mesh;
    // Heading turns about y, pitch lifts the nose, a bank to the left drops the left wing.
    tmpEuler.set(-f.pitch, f.heading, -f.bank, 'YXZ');
    mesh.quaternion.setFromEuler(tmpEuler);
    // The body rides up on each downstroke, along its own "up".
    tmpUp.set(0, 1, 0).applyQuaternion(mesh.quaternion).multiplyScalar(heave(pose) * this.scale);
    mesh.position.set(f.x + tmpUp.x, f.y + tmpUp.y, f.z + tmpUp.z);
    mesh.updateMatrix();

    // In sun or in the shadow of the hills.
    const lit = W.sunlitAt(this.stage.sunHeight, f.x, f.y, f.z, 5);
    this.sunlit += (lit - this.sunlit) * Math.min(1, (dt || 0.016) * 4);
    this.material.uniforms.uSunlit.value = this.sunlit;
    this.mirrorMaterial.uniforms.uSunlit.value = this.sunlit;

    // Its image in the lake: only worth drawing when it is low and over the water.
    const height = f.y - W.LAKE_LEVEL;
    const show = this.mirrorOn && height < 42 && W.lakeDistance(f.x, f.z) < 25;
    this.mirror.visible = show;
    if (show) {
      this.mirror.matrix.multiplyMatrices(this.flip, mesh.matrix);
      this.mirror.matrixWorldNeedsUpdate = true;
      // Fainter the higher it flies.
      this.mirrorMaterial.uniforms.uAlpha.value = 0.62 * (1 - Math.min(height / 42, 1) * 0.7);
    }

    // Fire, while it roars: carried by the head.
    this.fire = firePower(f.roar);
    this.flame.visible = this.fire > 0.01;
    if (this.flame.visible) {
      const s = this.skin;
      const o = BONE.head * 12;
      tmpBone.set(s[o], s[o + 1], s[o + 2], s[o + 3], s[o + 4], s[o + 5], s[o + 6], s[o + 7], s[o + 8], s[o + 9], s[o + 10], s[o + 11], 0, 0, 0, 1);
      this.flame.matrix.multiplyMatrices(mesh.matrix, tmpBone);
      this.flame.matrixWorldNeedsUpdate = true;
      this.flameMaterial.uniforms.uPower.value = this.fire;
    }
  }
}
