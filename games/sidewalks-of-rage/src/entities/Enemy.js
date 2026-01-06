import Phaser from 'phaser';

const ENEMY_TEXTURE_KEY = 'enemy-sprite';
const ENEMY_WIDTH = 24;
const ENEMY_HEIGHT = 48;

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, target) {
    Enemy.ensureTexture(scene);
    super(scene, x, y, ENEMY_TEXTURE_KEY);

    this.scene = scene;
    this.target = target;
    this.speed = 60;
    this.maxHealth = 3;
    this.health = 3;
    this.attackDamage = 10;
    this.attackCooldownMs = 850;
    this.lastAttackTime = -this.attackCooldownMs;
    this.hitCooldownMs = 200;
    this.lastHitTime = -this.hitCooldownMs;
    this.knockbackUntil = 0;
    this.isDying = false;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1);
    this.setScale(0.25);
    this.setFrame(0);
    this.body.setAllowGravity(false);
    this.body.setSize(ENEMY_WIDTH, ENEMY_HEIGHT, true);

    this.scheduleSpeech();
  }

  static ensureTexture(scene) {
    if (scene.textures.exists(ENEMY_TEXTURE_KEY)) {
      return;
    }
    throw new Error(`Missing texture "${ENEMY_TEXTURE_KEY}". Preload assets/enemies.png before creating enemies.`);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (!this.active) {
      return;
    }

    if (this.isDying) {
      this.setVelocity(0, 0);
      return;
    }

    if (time < this.knockbackUntil) {
      return;
    }

    if (!this.target) {
      this.setVelocity(0, 0);
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    if (dx === 0 && dy === 0) {
      this.setVelocity(0, 0);
      return;
    }

    const length = Math.hypot(dx, dy);
    this.setVelocity((dx / length) * this.speed, (dy / length) * this.speed);
    this.setDepth(this.y);
  }

  takeHit(source) {
    if (this.isDying) {
      return false;
    }

    const now = this.scene.time.now;
    if (now - this.lastHitTime < this.hitCooldownMs) {
      return false;
    }

    this.lastHitTime = now;
    this.health -= 1;

    this.setTint(0xffffff);
    this.scene.time.delayedCall(120, () => {
      if (this.active) {
        this.clearTint();
      }
    });

    const knockback = new Phaser.Math.Vector2(this.x - source.x, this.y - source.y);
    if (knockback.lengthSq() < 0.001) {
      knockback.set(Phaser.Math.Between(-1, 1), Phaser.Math.Between(-1, 1));
    }
    knockback.normalize();
    const knockbackSpeed = 220;
    this.setVelocity(knockback.x * knockbackSpeed, knockback.y * knockbackSpeed);
    this.knockbackUntil = now + 160;

    if (this.health <= 0) {
      this.die();
      return true;
    }

    return false;
  }

  die() {
    if (this.isDying) {
      return;
    }

    this.isDying = true;
    this.body.enable = false;
    this.setVelocity(0, 0);

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 250,
      ease: 'Quad.out',
      onComplete: () => {
        this.destroy();
      }
    });
  }

  scheduleSpeech() {
    this.scene.time.delayedCall(Phaser.Math.Between(3000, 5000), () => {
      if (!this.active || this.isDying) {
        return;
      }

      this.spawnSpeechBubble();
      this.scheduleSpeech();
    });
  }

  spawnSpeechBubble() {
    const phrases = [
      'DO YOUR OWN RESEARCH!',
      'WAKE UP SHEEPLE!',
      'FOLLOW THE MONEY!',
      "THEY DON'T WANT YOU TO KNOW!",
      'OPEN YOUR EYES!',
      'THINK FOR YOURSELF!'
    ];
    const phrase = Phaser.Utils.Array.GetRandom(phrases);
    const text = this.scene.add.text(this.x, this.y - ENEMY_HEIGHT, phrase, {
      fontFamily: 'Verdana',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    text.setOrigin(0.5, 1);
    text.setDepth(this.depth + 1);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 2000,
      ease: 'Quad.in',
      onComplete: () => {
        text.destroy();
      }
    });
  }
}

export { ENEMY_WIDTH, ENEMY_HEIGHT };
