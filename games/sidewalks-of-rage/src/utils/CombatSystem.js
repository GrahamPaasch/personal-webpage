// Combat constants based on classic brawler research
export const COMBAT = {
  // Depth/lane tolerance (in pixels) - how close in Y you need to be to hit
  DEPTH_TOLERANCE: 24,  // Slightly forgiving for our scale
  
  // Hitbox extends in front of attacker
  ATTACK_REACH_X: 50,   // Horizontal reach
  ATTACK_REACH_Y: 20,   // Vertical tolerance for attack hitbox
  
  // Hitstop frames (at 60fps, 1 frame ~ 16.7ms)
  HITSTOP_LIGHT: 50,    // ~3 frames
  HITSTOP_MEDIUM: 83,   // ~5 frames  
  HITSTOP_HEAVY: 117,   // ~7 frames
  
  // Hitstun (enemy can't act)
  HITSTUN_LIGHT: 200,   // ~12 frames
  HITSTUN_MEDIUM: 300,  // ~18 frames
  HITSTUN_HEAVY: 400,   // ~24 frames
  
  // Knockback
  KNOCKBACK_LIGHT: { distance: 15, duration: 100 },
  KNOCKBACK_MEDIUM: { distance: 25, duration: 120 },
  KNOCKBACK_HEAVY: { distance: 40, duration: 150 },
  
  // Screen shake
  SHAKE_LIGHT: { duration: 60, intensity: 0.004 },
  SHAKE_MEDIUM: { duration: 90, intensity: 0.008 },
  SHAKE_HEAVY: { duration: 120, intensity: 0.012 },
};

/**
 * Check if attacker can hit target based on 2.5D brawler rules:
 * 1. Target must be in front of attacker (based on facing direction)
 * 2. Target must be within depth tolerance (Y axis = "lane")
 * 3. Target must be within horizontal reach
 */
export function canHitTarget(attacker, target, facing) {
  // Depth check (Y axis acts as depth in 2.5D)
  const depthDiff = Math.abs(attacker.y - target.y);
  if (depthDiff > COMBAT.DEPTH_TOLERANCE) {
    return false;
  }
  
  // Horizontal distance
  const dx = target.x - attacker.x;
  const horizontalDist = Math.abs(dx);
  
  if (horizontalDist > COMBAT.ATTACK_REACH_X) {
    return false;
  }
  
  // Direction check - must be in front of attacker
  // facing: 1 = right, -1 = left
  if (facing > 0 && dx < -10) {
    // Facing right but target is behind (left)
    return false;
  }
  if (facing < 0 && dx > 10) {
    // Facing left but target is behind (right)
    return false;
  }
  
  return true;
}

/**
 * Apply hitstop to both attacker and target
 * This creates the "freeze frame" impact feel
 */
export function applyHitstop(scene, attacker, target, duration = COMBAT.HITSTOP_LIGHT) {
  // Freeze physics bodies (if any).
  if (attacker.body) {
    attacker.body.velocity.set(0, 0);
  }
  if (target.body) {
    target.body.velocity.set(0, 0);
  }
  
  // Store hitstop state
  attacker.inHitstop = true;
  target.inHitstop = true;

  // Pause any tweens affecting the participants so tweens/manual movement "feel" the hitstop too.
  const pausedTweens = new Set();
  if (scene.tweens?.getTweensOf) {
    for (const tween of scene.tweens.getTweensOf(attacker)) {
      pausedTweens.add(tween);
    }
    for (const tween of scene.tweens.getTweensOf(target)) {
      pausedTweens.add(tween);
    }
    for (const tween of pausedTweens) {
      if (typeof tween?.pause === 'function') {
        tween.pause();
      }
    }
  }
  
  // Resume after duration
  scene.time.delayedCall(duration, () => {
    attacker.inHitstop = false;
    target.inHitstop = false;
    // Don't restore velocity - let normal movement take over
    for (const tween of pausedTweens) {
      if (typeof tween?.resume === 'function') {
        tween.resume();
      }
    }
  });
}

/**
 * Apply knockback to target away from attacker
 */
export function applyKnockback(scene, attacker, target, config = COMBAT.KNOCKBACK_LIGHT) {
  const direction = new Phaser.Math.Vector2(target.x - attacker.x, 0).normalize();
  if (direction.lengthSq() < 0.001) {
    direction.set(1, 0); // Default to right if overlapping
  }
  
  scene.tweens.add({
    targets: target,
    x: target.x + direction.x * config.distance,
    duration: config.duration,
    ease: 'Power2'
  });
}
