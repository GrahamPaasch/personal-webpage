import Phaser from 'phaser';

// Combat constants based on classic brawler research
export const COMBAT = {
  // Depth/lane tolerance (in pixels) - how close in Y you need to be to hit
  DEPTH_TOLERANCE: 24,

  // Hitbox extends in front of attacker
  ATTACK_REACH_X: 50,
  ATTACK_REACH_Y: 20,

  // Hitstop frames (at 60fps, 1 frame ~ 16.7ms)
  HITSTOP_LIGHT: 50,
  HITSTOP_MEDIUM: 83,
  HITSTOP_HEAVY: 117,

  // Hitstun (enemy can't act)
  HITSTUN_LIGHT: 200,
  HITSTUN_MEDIUM: 300,
  HITSTUN_HEAVY: 400,

  // Knockback
  KNOCKBACK_LIGHT: { distance: 15, duration: 100 },
  KNOCKBACK_MEDIUM: { distance: 25, duration: 120 },
  KNOCKBACK_HEAVY: { distance: 40, duration: 150 },

  // Screen shake
  SHAKE_LIGHT: { duration: 60, intensity: 0.004 },
  SHAKE_MEDIUM: { duration: 90, intensity: 0.008 },
  SHAKE_HEAVY: { duration: 120, intensity: 0.012 },

  // Combo timing
  COMBO_WINDOW_MS: 2000,
};

/**
 * Check if attacker can hit target based on 2.5D brawler rules.
 */
export function canHitTarget(attacker, target, facing) {
  const depthDiff = Math.abs(attacker.y - target.y);
  if (depthDiff > COMBAT.DEPTH_TOLERANCE) {
    return false;
  }

  const dx = target.x - attacker.x;
  const horizontalDist = Math.abs(dx);

  if (horizontalDist > COMBAT.ATTACK_REACH_X) {
    return false;
  }

  if (facing > 0 && dx < -10) {
    return false;
  }
  if (facing < 0 && dx > 10) {
    return false;
  }

  return true;
}

/**
 * Apply hitstop to both attacker and target.
 */
export function applyHitstop(scene, attacker, target, duration = COMBAT.HITSTOP_LIGHT) {
  if (attacker.body) {
    attacker.body.velocity.set(0, 0);
  }
  if (target.body) {
    target.body.velocity.set(0, 0);
  }

  attacker.inHitstop = true;
  target.inHitstop = true;

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

  scene.time.delayedCall(duration, () => {
    attacker.inHitstop = false;
    target.inHitstop = false;
    for (const tween of pausedTweens) {
      if (typeof tween?.resume === 'function') {
        tween.resume();
      }
    }
  });
}

/**
 * Apply knockback to target away from attacker.
 */
export function applyKnockback(scene, attacker, target, config = COMBAT.KNOCKBACK_LIGHT) {
  const direction = new Phaser.Math.Vector2(target.x - attacker.x, 0).normalize();
  if (direction.lengthSq() < 0.001) {
    direction.set(1, 0);
  }

  scene.tweens.add({
    targets: target,
    x: target.x + direction.x * config.distance,
    duration: config.duration,
    ease: 'Power2'
  });
}

/**
 * Spawn a floating damage number above the target.
 */
export function spawnDamageNumber(scene, x, y, amount, isCritical = false) {
  const text = scene.add.text(x + Phaser.Math.Between(-8, 8), y - 10, `${amount}`, {
    fontFamily: 'Verdana',
    fontSize: isCritical ? '22px' : '16px',
    fontStyle: 'bold',
    color: isCritical ? '#ff4444' : '#ffff00',
    stroke: '#000000',
    strokeThickness: isCritical ? 4 : 3
  });
  text.setOrigin(0.5, 1);
  text.setDepth(2000);

  if (isCritical) {
    text.setScale(1.4);
  }

  scene.tweens.add({
    targets: text,
    y: text.y - (isCritical ? 55 : 40),
    alpha: 0,
    scale: isCritical ? 0.8 : 0.6,
    duration: isCritical ? 1200 : 900,
    ease: 'Quad.out',
    onComplete: () => {
      text.destroy();
    }
  });
}

/**
 * Spawn hit particles at the impact point.
 */
export function spawnHitParticles(scene, x, y, color = 0xffffff, count = 6) {
  for (let i = 0; i < count; i++) {
    const size = Phaser.Math.Between(2, 5);
    const particle = scene.add.rectangle(
      x + Phaser.Math.Between(-6, 6),
      y + Phaser.Math.Between(-6, 6),
      size, size, color
    );
    particle.setDepth(1999);

    const angle = Phaser.Math.Between(0, 360);
    const speed = Phaser.Math.Between(40, 120);
    const rad = Phaser.Math.DegToRad(angle);
    const vx = Math.cos(rad) * speed;
    const vy = Math.sin(rad) * speed;

    scene.tweens.add({
      targets: particle,
      x: particle.x + vx * 0.4,
      y: particle.y + vy * 0.4,
      alpha: 0,
      scale: 0,
      duration: Phaser.Math.Between(300, 600),
      ease: 'Quad.out',
      onComplete: () => {
        particle.destroy();
      }
    });
  }
}

/**
 * Spawn death explosion particles.
 */
export function spawnDeathExplosion(scene, x, y, count = 12) {
  const colors = [0xff4444, 0xffaa00, 0xffff00, 0xffffff];

  for (let i = 0; i < count; i++) {
    const size = Phaser.Math.Between(3, 7);
    const color = Phaser.Utils.Array.GetRandom(colors);
    const particle = scene.add.rectangle(
      x + Phaser.Math.Between(-10, 10),
      y + Phaser.Math.Between(-10, 10),
      size, size, color
    );
    particle.setDepth(1999);

    const angle = Phaser.Math.Between(0, 360);
    const speed = Phaser.Math.Between(60, 180);
    const rad = Phaser.Math.DegToRad(angle);
    const vx = Math.cos(rad) * speed;
    const vy = Math.sin(rad) * speed;

    scene.tweens.add({
      targets: particle,
      x: particle.x + vx * 0.5,
      y: particle.y + vy * 0.5 - 20,
      alpha: 0,
      scale: 0,
      duration: Phaser.Math.Between(400, 800),
      ease: 'Quad.out',
      onComplete: () => {
        particle.destroy();
      }
    });
  }
}

/**
 * Combo tracker - manages combo state and announcements.
 */
export class ComboTracker {
  constructor(scene) {
    this.scene = scene;
    this.count = 0;
    this.lastHitTime = 0;
    this.windowMs = COMBAT.COMBO_WINDOW_MS;
    this.bestCombo = 0;

    this.comboText = scene.add.text(scene.scale.width / 2, 70, '', {
      fontFamily: 'Verdana',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ff8800',
      stroke: '#000000',
      strokeThickness: 4
    });
    this.comboText.setOrigin(0.5, 0.5);
    this.comboText.setDepth(1500);
    this.comboText.setAlpha(0);
    this.comboTween = null;

    this.streakText = scene.add.text(scene.scale.width / 2, 100, '', {
      fontFamily: 'Verdana',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    this.streakText.setOrigin(0.5, 0.5);
    this.streakText.setDepth(1500);
    this.streakText.setAlpha(0);
    this.streakTween = null;
  }

  registerHit() {
    const now = this.scene.time.now;

    if (now - this.lastHitTime > this.windowMs) {
      this.count = 0;
    }

    this.count += 1;
    this.lastHitTime = now;

    if (this.count > this.bestCombo) {
      this.bestCombo = this.count;
    }

    if (this.count >= 2) {
      this.showCombo();
    }

    return this.count;
  }

  registerKill() {
    const streakMessages = this.getStreakMessage();
    if (streakMessages) {
      this.showStreak(streakMessages);
    }
  }

  getStreakMessage() {
    if (this.count >= 15) return '☣ PANDEMIC! ☣';
    if (this.count >= 12) return '💉 MASS VACCINATION! 💉';
    if (this.count >= 9) return '🔬 CLINICAL TRIAL!';
    if (this.count >= 6) return '📋 PEER REVIEWED!';
    if (this.count >= 4) return '🧪 LAB RESULTS IN!';
    return null;
  }

  showCombo() {
    this.comboText.setText(`${this.count} HIT COMBO!`);
    this.comboText.setAlpha(1);
    this.comboText.setScale(1.2);
    this.comboTween?.stop();
    this.comboTween = this.scene.tweens.add({
      targets: this.comboText,
      scale: 1,
      duration: 150,
      ease: 'Back.out',
      onComplete: () => {
        this.comboTween = this.scene.tweens.add({
          targets: this.comboText,
          alpha: 0,
          duration: 1500,
          delay: 400,
          ease: 'Quad.in'
        });
      }
    });
  }

  showStreak(message) {
    this.streakText.setText(message);
    this.streakText.setAlpha(1);
    this.streakText.setScale(0.8);
    this.streakTween?.stop();
    this.streakTween = this.scene.tweens.add({
      targets: this.streakText,
      scale: 1.1,
      duration: 200,
      ease: 'Back.out',
      onComplete: () => {
        this.streakTween = this.scene.tweens.add({
          targets: this.streakText,
          alpha: 0,
          scale: 1.3,
          duration: 1800,
          delay: 600,
          ease: 'Quad.in'
        });
      }
    });
  }

  reset() {
    this.count = 0;
    this.lastHitTime = 0;
  }
}
