import Phaser from 'phaser';

const ENEMY_TEXTURE_RIGHT = 'enemy-sprite-left';
const ENEMY_TEXTURE_LEFT = 'enemy-sprite';
const ENEMY_WIDTH = 24;
const ENEMY_HEIGHT = 48;

// Frame layout for enemy1.png (4x4 grid, 240x240 per frame):
// Row 0 (0-3):  Walk / idle cycle
// Row 1 (4-7):  Attack / punch cycle
// Row 2 (8-11): Getting hit / knockdown
// Row 3 (12-15): On ground / getting up

const ENEMY_ARCHETYPES = [
  { name: 'Truther',      speed: 55,  maxHealth: 3, attackDamage: 8,  tint: null,     scale: 0.25 },
  { name: 'Blogger',      speed: 70,  maxHealth: 2, attackDamage: 6,  tint: 0xaaddff, scale: 0.22 },
  { name: 'Influencer',   speed: 45,  maxHealth: 5, attackDamage: 12, tint: 0xffaacc, scale: 0.28 },
  { name: 'Podcaster',    speed: 60,  maxHealth: 4, attackDamage: 10, tint: 0xffdd88, scale: 0.26 },
  { name: 'Karen',        speed: 80,  maxHealth: 2, attackDamage: 15, tint: 0xff8888, scale: 0.23 },
];

const SPEECH_PHRASES = [
  'DO YOUR OWN RESEARCH!',
  'WAKE UP SHEEPLE!',
  'FOLLOW THE MONEY!',
  "THEY DON'T WANT YOU TO KNOW!",
  'OPEN YOUR EYES!',
  'THINK FOR YOURSELF!',
  '5G GAVE ME SUPERPOWERS!',
  'BIG PHARMA HATES HIM!',
  'THE EARTH IS FLAT!',
  'BIRDS AREN\'T REAL!',
  'CHEMTRAILS!',
  "IT'S JUST THE FLU!",
  'I HAVE AN IMMUNE SYSTEM!',
  'YOUTUBE TOLD ME SO!',
  'CHECK MY SUBSTACK!',
  'MY CHIROPRACTOR SAID SO!',
  'I SAW IT ON FACEBOOK!',
  'ESSENTIAL OILS CURE ALL!',
  'MERCURY RETROGRADE!',
  'THE CRYSTALS TOLD ME!',
  'MAINSTREAM MEDIA LIES!',
  'GOOGLE IT!',
  'JET FUEL CAN\'T MELT STEEL!',
  'IVERMECTIN!',
  'JUST ASKING QUESTIONS!',
  'SOURCES? I AM THE SOURCE!',
  'MY COUSIN IS A NURSE!',
  'JUST TAKE THE HORSE PASTE!',
  'RAW MILK AND SUNSHINE!',
  'THE VAX MADE ME MAGNETIC!',
  'CORRELATION IS CAUSATION!',
  'I READ THE COMMENTS!',
  'TURN OFF YOUR TV!',
  'CONNECT THE DOTS!',
  "I'M NOT A SHEEP!",
];

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, target, archetypeIndex = -1, difficultyMod = 1.0) {
    Enemy.ensureTexture(scene);
    super(scene, x, y, ENEMY_TEXTURE_RIGHT);

    this.scene = scene;
    this.target = target;

    // Pick archetype
    const idx = archetypeIndex >= 0 && archetypeIndex < ENEMY_ARCHETYPES.length
      ? archetypeIndex
      : Phaser.Math.Between(0, ENEMY_ARCHETYPES.length - 1);
    const archetype = ENEMY_ARCHETYPES[idx];

    // Apply invisible rubber-banding difficulty modifier to enemy stats.
    // difficultyMod > 1 means harder enemies (winning team), < 1 means easier (losing team).
    const mod = Number.isFinite(difficultyMod) ? difficultyMod : 1.0;

    this.archetypeName = archetype.name;
    this.speed = archetype.speed * mod;
    this.maxHealth = Math.max(1, Math.round(archetype.maxHealth * mod));
    this.health = this.maxHealth;
    this.attackDamage = Math.max(1, Math.round(archetype.attackDamage * mod));
    this.baseTint = archetype.tint;
    this.baseScale = archetype.scale;

    this.attackCooldownMs = Math.max(300, Math.round(850 / mod));
    this.lastAttackTime = -this.attackCooldownMs;
    this.hitCooldownMs = 200;
    this.lastHitTime = -this.hitCooldownMs;
    this.knockbackUntil = 0;
    this.inHitstop = false;
    this.isDying = false;
    this.facing = 'left'; // enemies typically face left toward player

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1);
    this.setScale(this.baseScale);
    this.body.setAllowGravity(false);
    this.body.setSize(ENEMY_WIDTH, ENEMY_HEIGHT, true);

    if (this.baseTint) {
      this.setTint(this.baseTint);
    }

    // Create animations if they don't exist yet
    Enemy.createAnimations(scene);

    // Start facing toward the player
    if (target && target.x < x) {
      this.facing = 'left';
    } else {
      this.facing = 'right';
    }
    this.play(`enemy-walk-${this.facing}`);

    // Spawn the archetype label
    this.nameLabel = scene.add.text(x, y - this.displayHeight - 4, this.archetypeName, {
      fontFamily: 'Verdana',
      fontSize: '10px',
      color: '#ff6666',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.nameLabel.setOrigin(0.5, 1);
    this.nameLabel.setDepth(this.depth + 1);

    this.scheduleSpeech();
  }

  static ensureTexture(scene) {
    if (!scene.textures.exists(ENEMY_TEXTURE_RIGHT)) {
      throw new Error(`Missing texture "${ENEMY_TEXTURE_RIGHT}". Preload enemy sprite sheets before creating enemies.`);
    }
  }

  static createAnimations(scene) {
    if (scene.anims.exists('enemy-walk-right')) {
      return;
    }

    // Right-facing animations
    scene.anims.create({
      key: 'enemy-walk-right',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_RIGHT, { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1
    });
    scene.anims.create({
      key: 'enemy-attack-right',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_RIGHT, { start: 4, end: 7 }),
      frameRate: 10,
      repeat: 0
    });
    scene.anims.create({
      key: 'enemy-hit-right',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_RIGHT, { start: 8, end: 11 }),
      frameRate: 10,
      repeat: 0
    });
    scene.anims.create({
      key: 'enemy-down-right',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_RIGHT, { start: 12, end: 15 }),
      frameRate: 8,
      repeat: 0
    });

    // Left-facing animations
    scene.anims.create({
      key: 'enemy-walk-left',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_LEFT, { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1
    });
    scene.anims.create({
      key: 'enemy-attack-left',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_LEFT, { start: 4, end: 7 }),
      frameRate: 10,
      repeat: 0
    });
    scene.anims.create({
      key: 'enemy-hit-left',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_LEFT, { start: 8, end: 11 }),
      frameRate: 10,
      repeat: 0
    });
    scene.anims.create({
      key: 'enemy-down-left',
      frames: scene.anims.generateFrameNumbers(ENEMY_TEXTURE_LEFT, { start: 12, end: 15 }),
      frameRate: 8,
      repeat: 0
    });
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

    if (this.inHitstop) {
      this.setVelocity(0, 0);
      return;
    }

    if (time < this.knockbackUntil) {
      // During knockback, play hit animation
      const hitAnim = `enemy-hit-${this.facing}`;
      if (this.anims.currentAnim?.key !== hitAnim) {
        this.play(hitAnim, true);
      }
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

    // Update facing based on target direction
    const newFacing = dx < 0 ? 'left' : 'right';
    this.facing = newFacing;

    // Use the correct texture for facing direction
    const walkAnim = `enemy-walk-${this.facing}`;
    const currentKey = this.anims.currentAnim?.key;
    // Only switch to walk if not playing a hit/attack anim
    if (currentKey !== walkAnim && !currentKey?.startsWith('enemy-hit-') && !currentKey?.startsWith('enemy-attack-')) {
      this.play(walkAnim, true);
    } else if (currentKey?.startsWith('enemy-hit-') && !this.anims.isPlaying) {
      // Hit anim finished, go back to walk
      this.play(walkAnim, true);
    }

    const length = Math.hypot(dx, dy);
    this.setVelocity((dx / length) * this.speed, (dy / length) * this.speed);
    this.setDepth(this.y);

    // Update name label position
    if (this.nameLabel) {
      this.nameLabel.setPosition(this.x, this.y - this.displayHeight - 4);
      this.nameLabel.setDepth(this.depth + 1);
    }
  }

  playAttackAnim() {
    const attackAnim = `enemy-attack-${this.facing}`;
    this.play(attackAnim, true);
    this.once('animationcomplete', () => {
      if (this.active && !this.isDying) {
        this.play(`enemy-walk-${this.facing}`, true);
      }
    });
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

    // Flash white on hit
    this.setTint(0xffffff);
    this.scene.time.delayedCall(120, () => {
      if (this.active) {
        if (this.baseTint) {
          this.setTint(this.baseTint);
        } else {
          this.clearTint();
        }
      }
    });

    // Play hit animation
    const hitAnim = `enemy-hit-${this.facing}`;
    this.play(hitAnim, true);

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

    // Play knockdown animation then fade
    const downAnim = `enemy-down-${this.facing}`;
    this.play(downAnim, true);

    this.once('animationcomplete', () => {
      // After knockdown anim, fade out
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 400,
        ease: 'Quad.out',
        onComplete: () => {
          if (this.nameLabel) {
            this.nameLabel.destroy();
            this.nameLabel = null;
          }
          this.destroy();
        }
      });
    });

    // Also fade the name label
    if (this.nameLabel) {
      this.scene.tweens.add({
        targets: this.nameLabel,
        alpha: 0,
        duration: 300,
        ease: 'Quad.out'
      });
    }
  }

  scheduleSpeech() {
    this.scene.time.delayedCall(Phaser.Math.Between(3000, 6000), () => {
      if (!this.active || this.isDying) {
        return;
      }

      this.spawnSpeechBubble();
      this.scheduleSpeech();
    });
  }

  spawnSpeechBubble() {
    const phrase = Phaser.Utils.Array.GetRandom(SPEECH_PHRASES);
    const text = this.scene.add.text(this.x, this.y - ENEMY_HEIGHT - 10, phrase, {
      fontFamily: 'Verdana',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      backgroundColor: '#333333aa',
      padding: { x: 4, y: 2 }
    });
    text.setOrigin(0.5, 1);
    text.setDepth(this.depth + 1);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 45,
      alpha: 0,
      duration: 2500,
      ease: 'Quad.in',
      onComplete: () => {
        text.destroy();
      }
    });
  }

  destroy(fromScene) {
    if (this.nameLabel) {
      this.nameLabel.destroy();
      this.nameLabel = null;
    }
    super.destroy(fromScene);
  }
}

export { ENEMY_WIDTH, ENEMY_HEIGHT, ENEMY_ARCHETYPES };
