import Phaser from 'phaser';
import Enemy, { ENEMY_HEIGHT, ENEMY_WIDTH } from '../entities/Enemy.js';
// import createCityBackground from '../background/CityBackground.js'; // Replaced with background.png
import Client from '../network/Client.js';
import { MESSAGE_TYPES } from '../network/protocol.js';
import VirtualDPad from '../ui/VirtualDPad.js';
import { COMBAT, canHitTarget, applyHitstop, applyKnockback } from '../utils/CombatSystem.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    const baseUrl = import.meta.env.BASE_URL;
    this.load.image('background', `${baseUrl}assets/background.png`);
    this.load.spritesheet('enemy-sprite', `${baseUrl}assets/enemy1.png`, { frameWidth: 240, frameHeight: 240 });
    this.load.spritesheet('fauci-right', `${baseUrl}assets/fauci-sheet-fixed.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('fauci-left', `${baseUrl}assets/fauci-sheet-fixed-left.png`, { frameWidth: 64, frameHeight: 64 });
  }

  create() {
    // Add background image scaled to fit
    const { width, height } = this.scale;
    const bg = this.add.image(width / 2, height / 2, 'background');
    bg.setDisplaySize(width, height);
    bg.setDepth(-100);


    const playerBodyWidth = 28;
    const playerBodyHeight = 48;
    this.player = this.physics.add.sprite(width / 2, height * 0.75, 'fauci-right', 0);
    this.player.setOrigin(0.5, 1);
    this.player.body.setAllowGravity(false);
    this.player.body.setSize(playerBodyWidth, playerBodyHeight);
    this.player.body.setOffset(
      (this.player.displayWidth - playerBodyWidth) / 2,
      this.player.displayHeight - playerBodyHeight
    );

    if (!this.anims.exists('fauci-idle-right')) {
      this.anims.create({
        key: 'fauci-idle-right',
        frames: [{ key: 'fauci-right', frame: 0 }]
      });
      this.anims.create({
        key: 'fauci-idle-left',
        frames: [{ key: 'fauci-left', frame: 0 }]
      });
      this.anims.create({
        key: 'fauci-walk-right',
        frames: this.anims.generateFrameNumbers('fauci-right', { start: 0, end: 2 }),
        frameRate: 8,
        repeat: -1
      });
      this.anims.create({
        key: 'fauci-walk-left',
        frames: this.anims.generateFrameNumbers('fauci-left', { start: 0, end: 2 }),
        frameRate: 8,
        repeat: -1
      });
      this.anims.create({
        key: 'fauci-attack-right',
        frames: this.anims.generateFrameNumbers('fauci-right', { start: 3, end: 5 }),
        frameRate: 12,
        repeat: 0
      });
      this.anims.create({
        key: 'fauci-attack-left',
        frames: this.anims.generateFrameNumbers('fauci-left', { start: 3, end: 5 }),
        frameRate: 12,
        repeat: 0
      });
    }

    this.facing = 'right';
    this.playerFaction = null;
    this.playerBaseTint = null;
    this.player.play('fauci-idle-right');

    this.playerLabel = this.add.text(this.player.x, this.player.y - this.player.displayHeight - 6, 'PLAYER', {
      fontFamily: 'Verdana',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    this.playerLabel.setOrigin(0.5, 1);

    this.playerMaxHealth = 100;
    this.playerHealth = this.playerMaxHealth;
    this.playerHitCooldownMs = 500;
    this.lastPlayerHitTime = -this.playerHitCooldownMs;
    this.isPlayerDead = false;

    this.killMessages = [
      "You've been educated!",
      'Trust the science!',
      'Peer reviewed!',
      'Citation needed!',
      'Read the study!'
    ];
    this.deathMessages = [
      "You've done your own research!",
      "You've questioned everything!",
      'The internet was right all along!',
      "Should've taken the horse paste!",
      'Facebook University wins again!'
    ];

    this.healthBarConfig = { x: 48, y: 44, width: 170, height: 12 };
    this.healthLabel = this.add.text(16, 34, 'HP', {
      fontFamily: 'Verdana',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    this.healthLabel.setDepth(1000);
    this.healthValueText = this.add.text(
      this.healthBarConfig.x + this.healthBarConfig.width + 8,
      34,
      `${this.playerHealth}/${this.playerMaxHealth}`,
      {
        fontFamily: 'Verdana',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      }
    );
    this.healthValueText.setDepth(1000);
    this.healthBar = this.add.graphics();
    this.healthBar.setDepth(999);
    this.updateHealthBar();

    this.playerSpeed = 200;
    this.playerDirection = new Phaser.Math.Vector2(0, 1);
    this.isAttacking = false;
    this.isMoving = false;
    this.attackLungeDistance = 18;
    this.attackDuration = 140;
    this.isJumping = false;
    this.jumpHeight = 28;
    this.jumpDuration = 240;
    this.jumpTween = null;

    this.keys = this.input.keyboard.addKeys({
      up: 'W',
      down: 'S',
      left: 'A',
      right: 'D',
      attack: Phaser.Input.Keyboard.KeyCodes.SPACE
    });
    this.cursors = this.input.keyboard.createCursorKeys();
    const hasTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
    this.virtualDPad = hasTouch ? new VirtualDPad(this, { enabled: hasTouch }) : null;

    this.enemies = this.physics.add.group();
    this.maxEnemies = 8;
    this.scheduleNextEnemySpawn();

    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handlePlayerEnemyOverlap,
      this.canPlayerHitEnemy,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handleEnemyPlayerOverlap,
      this.canEnemyHitPlayer,
      this
    );

    this.score = 0;
    this.scoreText = this.add.text(16, 16, 'Score: 0', {
      fontFamily: 'Verdana',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    this.scoreText.setDepth(1000);

    this.globalScore = { fauci: 0, rogan: 0 };
    this.globalScoreText = this.add.text(width - 16, 16, '', {
      fontFamily: 'Verdana',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    this.globalScoreText.setOrigin(1, 0);
    this.globalScoreText.setDepth(1000);
    this.updateGlobalScoreText();

    this.factionCounts = { fauci: 0, rogan: 0 };
    this.battleLinePosition = 50;
    this.battleLineGraphics = this.add.graphics();
    this.battleLineGraphics.setDepth(1000);
    const battleLineTextStyle = {
      fontFamily: 'Verdana',
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    };
    this.battleLinePercentText = this.add.text(0, 0, '', battleLineTextStyle);
    this.battleLinePercentText.setOrigin(0, 0);
    this.battleLinePercentText.setDepth(1001);
    this.battleLineCountText = this.add.text(0, 0, '', battleLineTextStyle);
    this.battleLineCountText.setOrigin(1, 0);
    this.battleLineCountText.setDepth(1001);
    this.scale.on('resize', this.updateBattleLineUI, this);
    this.updateBattleLineUI();

    const roundEndTextStyle = {
      fontFamily: 'Verdana',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
      wordWrap: { width: Math.min(width * 0.7, 420) }
    };
    this.roundEndBanner = this.add.container(width / 2, height / 2);
    this.roundEndBannerBg = this.add.rectangle(0, 0, 0, 0, 0x111827, 0.85);
    this.roundEndBannerText = this.add.text(0, 0, '', roundEndTextStyle);
    this.roundEndBannerBg.setOrigin(0.5);
    this.roundEndBannerText.setOrigin(0.5);
    this.roundEndBanner.add([this.roundEndBannerBg, this.roundEndBannerText]);
    this.roundEndBanner.setDepth(1600);
    this.roundEndBanner.setVisible(false);
    this.roundEndBanner.setAlpha(0);
    this.roundEndBannerTween = null;
    this.scale.on('resize', this.updateRoundEndBannerLayout, this);
    this.updateRoundEndBannerLayout();

    this.killMessageText = this.add.text(width / 2, 90, '', {
      fontFamily: 'Verdana',
      fontSize: '20px',
      color: '#ffff00',
      stroke: '#000000',
      strokeThickness: 4
    });
    this.killMessageText.setOrigin(0.5, 0.5);
    this.killMessageText.setDepth(1000);
    this.killMessageText.setAlpha(0);
    this.killMessageTween = null;

    this.deathOverlay = this.add.container(width / 2, height / 2);
    const deathBg = this.add.rectangle(0, 0, width, height, 0x000000, 0.65);
    this.deathMessageText = this.add.text(0, -20, '', {
      fontFamily: 'Verdana',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
      wordWrap: { width: width * 0.8 }
    });
    const respawnText = this.add.text(0, 40, 'Respawning...', {
      fontFamily: 'Verdana',
      fontSize: '18px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    deathBg.setOrigin(0.5);
    this.deathMessageText.setOrigin(0.5, 0.5);
    respawnText.setOrigin(0.5, 0.5);
    this.deathOverlay.add([deathBg, this.deathMessageText, respawnText]);
    this.deathOverlay.setDepth(2000);
    this.deathOverlay.setVisible(false);

    this.clampPlayerToBounds();
    this.player.setDepth(this.player.y + this.player.displayHeight * (1 - this.player.originY));
    this.updatePlayerLabel();

    this.playerId = null;
    this.remotePlayers = new Map();
    this.networkSendInterval = 1000 / 15;
    this.lastNetworkSend = 0;

    this.client = new Client({
      onOpen: () => {
        this.client.send(MESSAGE_TYPES.PLAYER_JOIN, {
          x: this.player.x,
          y: this.player.y,
          facing: this.facing,
          isAttacking: this.isAttacking
        });
      }
    });
    this.registerNetworkHandlers();
    this.client.connect();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.client?.disconnect();
      this.scale?.off('resize', this.updateBattleLineUI, this);
      this.scale?.off('resize', this.updateRoundEndBannerLayout, this);
      this.roundEndBannerTween?.stop();
    });
  }

  clampPlayerToBounds() {
    const { width, height } = this.scale;
    const pad = 8;
    const originX = this.player.originX;
    const originY = this.player.originY;
    const left = this.player.displayWidth * originX;
    const right = this.player.displayWidth * (1 - originX);
    const top = this.player.displayHeight * originY;
    const bottom = this.player.displayHeight * (1 - originY);
    const minX = left + pad;
    const maxX = width - right - pad;
    const minY = Math.max(top + pad, height * 0.85); // Keep player on street (bottom ~15% of screen)
    const maxY = height - bottom - pad;

    this.player.x = Phaser.Math.Clamp(this.player.x, minX, maxX);
    this.player.y = Phaser.Math.Clamp(this.player.y, minY, maxY);
  }

  startJump() {
    if (this.isJumping || !this.player) {
      return;
    }

    this.isJumping = true;
    const startY = this.player.y;
    const jumpHeight = this.jumpHeight ?? 28;
    const jumpDuration = this.jumpDuration ?? 240;
    this.jumpTween?.stop();
    this.jumpTween = this.tweens.add({
      targets: this.player,
      y: startY - jumpHeight,
      duration: jumpDuration / 2,
      yoyo: true,
      ease: 'Quad.out',
      onComplete: () => {
        this.isJumping = false;
        this.jumpTween = null;
        if (this.player) {
          this.player.y = startY;
        }
      }
    });
  }

  scheduleNextEnemySpawn() {
    this.time.delayedCall(Phaser.Math.Between(2000, 4000), () => {
      this.spawnEnemy();
      this.scheduleNextEnemySpawn();
    });
  }

  spawnEnemy() {
    if (this.enemies.countActive(true) >= this.maxEnemies) {
      return;
    }

    const { width, height } = this.scale;
    const pad = 8;
    const halfWidth = ENEMY_WIDTH / 2;
    const minX = pad + halfWidth;
    const maxX = width - pad - halfWidth;
    const minY = Math.max(pad + ENEMY_HEIGHT, height * 0.85); // Keep enemies on street
    const maxY = height - pad;

    const edge = Phaser.Math.Between(0, 3);
    let x = width / 2;
    let y = height / 2;

    if (edge === 0) {
      x = Phaser.Math.Between(minX, maxX);
      y = minY;
    } else if (edge === 1) {
      x = Phaser.Math.Between(minX, maxX);
      y = maxY;
    } else if (edge === 2) {
      x = minX;
      y = Phaser.Math.Between(minY, maxY);
    } else {
      x = maxX;
      y = Phaser.Math.Between(minY, maxY);
    }

    const enemy = new Enemy(this, x, y, this.isPlayerDead ? null : this.player);
    this.enemies.add(enemy);
  }

  canPlayerHitEnemy(player, enemy) {
    if (!this.isAttacking || this.isPlayerDead || !enemy.active || enemy.isDying) {
      return false;
    }

    const facing = this.facing === 'left' ? -1 : 1;
    return canHitTarget(player, enemy, facing);
  }

  handlePlayerEnemyOverlap(player, enemy) {
    if (this.isPlayerDead) {
      return;
    }

    const previousHitTime = enemy.lastHitTime;
    const defeated = enemy.takeHit(player);
    const hitLanded = enemy.lastHitTime !== previousHitTime;
    if (!hitLanded) {
      return;
    }

    applyHitstop(this, player, enemy);
    applyKnockback(this, player, enemy);
    this.cameras.main.shake(60, 0.003);

    if (defeated) {
      this.score += 1;
      this.scoreText.setText(`Score: ${this.score}`);
      // this.cameras.main.flash(90, 255, 255, 255); // disabled - too flashy
      this.showKillMessage();
      this.reportKill();
    }
  }

  canEnemyHitPlayer(player, enemy) {
    return !this.isPlayerDead && enemy.active && !enemy.isDying;
  }

  handleEnemyPlayerOverlap(player, enemy) {
    if (this.isPlayerDead || !enemy.active || enemy.isDying) {
      return;
    }

    const now = this.time.now;
    if (now - enemy.lastAttackTime < enemy.attackCooldownMs) {
      return;
    }
    if (now - this.lastPlayerHitTime < this.playerHitCooldownMs) {
      return;
    }

    enemy.lastAttackTime = now;
    this.lastPlayerHitTime = now;
    this.damagePlayer(enemy.attackDamage ?? 10, enemy);
  }

  damagePlayer(amount, source) {
    if (this.isPlayerDead) {
      return;
    }

    this.playerHealth = Phaser.Math.Clamp(this.playerHealth - amount, 0, this.playerMaxHealth);
    this.updateHealthBar();

    this.player.setTint(0xffb3b3);
    this.time.delayedCall(120, () => {
      if (this.player.active) {
        if (this.playerBaseTint) {
          this.player.setTint(this.playerBaseTint);
        } else {
          this.player.clearTint();
        }
      }
    });

    this.cameras.main.shake(120, 0.006);
    // this.cameras.main.flash(120, 255, 80, 80); // disabled - too flashy

    if (source) {
      const knockback = new Phaser.Math.Vector2(this.player.x - source.x, this.player.y - source.y);
      if (knockback.lengthSq() < 0.001) {
        knockback.set(0, 1);
      } else {
        knockback.normalize();
      }
      this.tweens.add({
        targets: this.player,
        x: this.player.x + knockback.x * 18,
        y: this.player.y + knockback.y * 14,
        duration: 80,
        yoyo: true,
        ease: 'Quad.out'
      });
    }

    if (this.playerHealth <= 0) {
      this.triggerPlayerDeath();
    }
  }

  triggerPlayerDeath() {
    if (this.isPlayerDead) {
      return;
    }

    this.isPlayerDead = true;
    this.playerHealth = 0;
    this.updateHealthBar();
    this.tweens.killTweensOf(this.player);
    this.isAttacking = false;
    this.isMoving = false;
    this.isJumping = false;
    this.jumpTween = null;

    this.player.setVisible(false);
    this.player.body.enable = false;
    this.playerLabel.setVisible(false);

    this.cameras.main.shake(180, 0.01);
    // this.cameras.main.flash(180, 255, 120, 120); // disabled - too flashy
    this.showDeathOverlay();
    this.setEnemyTargets(null);

    const respawnDelay = Phaser.Math.Between(2000, 3000);
    this.time.delayedCall(respawnDelay, () => {
      this.respawnPlayer();
    });
  }

  respawnPlayer() {
    const { width, height } = this.scale;

    this.isPlayerDead = false;
    this.playerHealth = this.playerMaxHealth;
    this.lastPlayerHitTime = this.time.now;
    this.updateHealthBar();
    this.isJumping = false;
    this.jumpTween = null;

    this.player.setPosition(width / 2, height * 0.75);
    this.player.setVisible(true);
    this.player.body.enable = true;
    this.applyPlayerFactionTint();
    this.facing = 'right';
    this.playerDirection.set(0, 1);
    this.player.play('fauci-idle-right', true);
    this.player.setDepth(this.player.y + this.player.displayHeight * (1 - this.player.originY));
    this.playerLabel.setVisible(true);
    this.updatePlayerLabel();
    this.clampPlayerToBounds();
    this.hideDeathOverlay();
    this.setEnemyTargets(this.player);
  }

  showKillMessage() {
    if (!this.killMessageText) {
      return;
    }

    const message = Phaser.Utils.Array.GetRandom(this.killMessages);
    this.killMessageText.setText(message);
    // Position above player head
    this.killMessageText.setPosition(this.player.x, this.player.y - this.player.displayHeight - 20);
    this.killMessageText.setAlpha(1);
    this.killMessageText.setScale(1);
    this.killMessageTween?.stop();
    this.killMessageTween = this.tweens.add({
      targets: this.killMessageText,
      alpha: 0,
      scale: 1.06,
      duration: 2500,
      ease: 'Quad.out'
    });
  }

  showDeathOverlay() {
    if (!this.deathOverlay || !this.deathMessageText) {
      return;
    }

    const message = Phaser.Utils.Array.GetRandom(this.deathMessages);
    this.deathMessageText.setText(message);
    this.deathOverlay.setAlpha(0);
    this.deathOverlay.setVisible(true);
    this.tweens.add({
      targets: this.deathOverlay,
      alpha: 1,
      duration: 180,
      ease: 'Quad.out'
    });
  }

  hideDeathOverlay() {
    if (!this.deathOverlay) {
      return;
    }
    this.deathOverlay.setVisible(false);
  }

  showRoundEndBanner(winner) {
    if (!this.roundEndBanner || !this.roundEndBannerBg || !this.roundEndBannerText) {
      return;
    }

    const faction = winner === 'fauci' || winner === 'rogan' ? winner : null;
    const label = faction ? `${faction.toUpperCase()} WINS THE ROUND` : 'ROUND COMPLETE';
    const tint = this.getFactionTint(faction) ?? 0x111827;
    this.roundEndBannerText.setText(label);
    this.roundEndBannerBg.setFillStyle(tint, 0.85);

    if (this.roundEndBannerTween) {
      this.roundEndBannerTween.stop();
      this.roundEndBannerTween = null;
    }

    this.roundEndBanner.setVisible(true);
    this.roundEndBanner.setAlpha(0);
    this.roundEndBanner.setScale(0.98);

    this.roundEndBannerTween = this.tweens.timeline({
      targets: this.roundEndBanner,
      tweens: [
        { alpha: 1, scale: 1, duration: 200, ease: 'Quad.out' },
        { alpha: 1, scale: 1, duration: 1600 },
        { alpha: 0, scale: 1.02, duration: 300, ease: 'Quad.in' }
      ],
      onComplete: () => {
        if (!this.roundEndBanner) {
          return;
        }
        this.roundEndBanner.setVisible(false);
        this.roundEndBanner.setAlpha(0);
        this.roundEndBanner.setScale(1);
      }
    });
  }

  updateHealthBar() {
    if (!this.healthBar) {
      return;
    }

    const { x, y, width, height } = this.healthBarConfig;
    const ratio = Phaser.Math.Clamp(this.playerHealth / this.playerMaxHealth, 0, 1);
    this.healthBar.clear();
    this.healthBar.fillStyle(0x000000, 0.6);
    this.healthBar.fillRect(x - 2, y - 2, width + 4, height + 4);
    this.healthBar.fillStyle(0x3a3a3a, 1);
    this.healthBar.fillRect(x, y, width, height);
    const barColor = ratio > 0.35 ? 0x3bd16f : 0xd63b3b;
    this.healthBar.fillStyle(barColor, 1);
    this.healthBar.fillRect(x, y, width * ratio, height);
    if (this.healthValueText) {
      this.healthValueText.setText(`${Math.ceil(this.playerHealth)}/${this.playerMaxHealth}`);
    }
  }

  updateBattleLineUI() {
    if (!this.battleLineGraphics) {
      return;
    }

    const { width } = this.scale;
    const barPadding = 16;
    const barHeight = 8;
    const barWidth = Math.max(0, width - barPadding * 2);
    const barX = barPadding;
    const barY = 4;

    const position = Phaser.Math.Clamp(this.battleLinePosition ?? 50, 0, 100);
    const markerX = barX + (position / 100) * barWidth;

    const fauciColor = this.getFactionTint('fauci') ?? 0x3b82f6;
    const roganColor = this.getFactionTint('rogan') ?? 0xef4444;

    this.battleLineGraphics.clear();
    this.battleLineGraphics.fillStyle(0x000000, 0.55);
    this.battleLineGraphics.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    this.battleLineGraphics.fillStyle(fauciColor, 1);
    this.battleLineGraphics.fillRect(barX, barY, Math.max(0, markerX - barX), barHeight);
    this.battleLineGraphics.fillStyle(roganColor, 1);
    this.battleLineGraphics.fillRect(markerX, barY, Math.max(0, barX + barWidth - markerX), barHeight);
    this.battleLineGraphics.lineStyle(2, 0xffffff, 1);
    this.battleLineGraphics.lineBetween(markerX, barY - 2, markerX, barY + barHeight + 2);

    if (this.battleLinePercentText && this.battleLineCountText) {
      const textY = barY + barHeight + 4;
      this.battleLinePercentText.setPosition(barX, textY);
      this.battleLineCountText.setPosition(barX + barWidth, textY);
      const percentValue = Math.round(position);
      const fauciCount = Number.isFinite(this.factionCounts?.fauci) ? this.factionCounts.fauci : 0;
      const roganCount = Number.isFinite(this.factionCounts?.rogan) ? this.factionCounts.rogan : 0;
      this.battleLinePercentText.setText(`LINE ${percentValue}%`);
      this.battleLineCountText.setText(`FAUCI ${fauciCount} | ROGAN ${roganCount}`);
    }
  }

  updateRoundEndBannerLayout() {
    if (!this.roundEndBanner || !this.roundEndBannerBg || !this.roundEndBannerText) {
      return;
    }

    const { width, height } = this.scale;
    const bannerWidth = Math.min(width * 0.8, 480);
    const bannerHeight = Math.max(48, Math.min(72, height * 0.18));
    this.roundEndBanner.setPosition(width / 2, height / 2);
    this.roundEndBannerBg.setSize(bannerWidth, bannerHeight);
    this.roundEndBannerText.setWordWrapWidth(bannerWidth - 32);
  }

  updateGlobalScoreText() {
    if (!this.globalScoreText) {
      return;
    }
    const fauci = this.globalScore?.fauci ?? 0;
    const rogan = this.globalScore?.rogan ?? 0;
    this.globalScoreText.setText(`FAUCI ${fauci} | ROGAN ${rogan}`);
  }

  reportKill() {
    if (!this.client || !this.playerId) {
      return;
    }
    this.client.sendKill();
  }

  setEnemyTargets(target) {
    this.enemies.getChildren().forEach((enemy) => {
      if (enemy) {
        enemy.target = target;
      }
    });
  }

  registerNetworkHandlers() {
    this.client.on(MESSAGE_TYPES.PLAYER_ID, ({ payload }) => {
      this.playerId = payload?.id || null;
      if (this.playerId && this.remotePlayers.has(this.playerId)) {
        this.removeRemotePlayer(this.playerId);
      }
    });

    this.client.on(MESSAGE_TYPES.FACTION_ASSIGNED, ({ payload }) => {
      const faction = payload?.faction;
      this.setPlayerFaction(faction);
    });

    this.client.on(MESSAGE_TYPES.ROUND_STATE, ({ payload }) => {
      if (!payload) {
        return;
      }
      const battleLine = Number(payload.battleLine);
      if (Number.isFinite(battleLine)) {
        this.battleLinePosition = Phaser.Math.Clamp(battleLine, 0, 100);
      }
      this.factionCounts = {
        fauci: Number.isFinite(payload.fauciPlayers) ? payload.fauciPlayers : 0,
        rogan: Number.isFinite(payload.roganPlayers) ? payload.roganPlayers : 0
      };
      this.updateBattleLineUI();
    });

    this.client.on(MESSAGE_TYPES.ROUND_END, ({ payload }) => {
      const winner = payload?.winner;
      this.showRoundEndBanner(winner);
    });

    this.client.on(MESSAGE_TYPES.GLOBAL_SCORE, ({ payload }) => {
      if (!payload) {
        return;
      }
      const fauci = Number.isFinite(payload.fauci) ? payload.fauci : this.globalScore?.fauci ?? 0;
      const rogan = Number.isFinite(payload.rogan) ? payload.rogan : this.globalScore?.rogan ?? 0;
      this.globalScore = { fauci, rogan };
      this.updateGlobalScoreText();
    });

    this.client.on(MESSAGE_TYPES.GAME_STATE, ({ payload }) => {
      const players = Array.isArray(payload?.players) ? payload.players : [];
      for (const player of players) {
        this.upsertRemotePlayer(player);
      }
    });

    this.client.on(MESSAGE_TYPES.PLAYER_JOINED, ({ payload }) => {
      if (payload) {
        this.upsertRemotePlayer(payload);
      }
    });

    this.client.on(MESSAGE_TYPES.PLAYER_MOVE, ({ payload }) => {
      if (!payload || !payload.id || payload.id === this.playerId) {
        return;
      }
      this.upsertRemotePlayer(payload);
    });

    this.client.on(MESSAGE_TYPES.PLAYER_ATTACK, ({ payload }) => {
      if (!payload || !payload.id || payload.id === this.playerId) {
        return;
      }
      this.playRemoteAttack(payload);
    });

    this.client.on(MESSAGE_TYPES.PLAYER_LEFT, ({ payload }) => {
      const id = payload?.id;
      if (id) {
        this.removeRemotePlayer(id);
      }
    });
  }

  normalizeFacing(facing) {
    return facing === 'left' ? 'left' : 'right';
  }

  setSpriteDepth(sprite) {
    sprite.setDepth(sprite.y + sprite.displayHeight * (1 - sprite.originY));
  }

  getFactionTint(faction) {
    if (faction === 'fauci') {
      return 0x3b82f6;
    }
    if (faction === 'rogan') {
      return 0xef4444;
    }
    return null;
  }

  applyFactionTint(sprite, faction) {
    const tint = this.getFactionTint(faction);
    if (tint) {
      sprite.setTint(tint);
    } else {
      sprite.clearTint();
    }
  }

  applyPlayerFactionTint() {
    if (!this.player) {
      return;
    }
    const tint = this.getFactionTint(this.playerFaction);
    this.playerBaseTint = tint;
    if (tint) {
      this.player.setTint(tint);
    } else {
      this.player.clearTint();
    }
  }

  setPlayerFaction(faction) {
    if (faction !== 'fauci' && faction !== 'rogan') {
      return;
    }
    if (this.playerFaction === faction) {
      return;
    }
    this.playerFaction = faction;
    if (this.playerLabel) {
      this.playerLabel.setText(faction.toUpperCase());
    }
    this.applyPlayerFactionTint();
  }

  getRemoteLabelText(archetype, faction) {
    if (archetype) {
      return archetype;
    }
    if (faction) {
      return faction.toUpperCase();
    }
    return 'PLAYER';
  }

  setRemoteLabelTint(label, faction) {
    if (!label) {
      return;
    }
    const tint = this.getFactionTint(faction);
    if (tint) {
      label.setTint(tint);
    } else {
      label.clearTint();
    }
  }

  positionRemoteLabel(label, sprite) {
    if (!label || !sprite) {
      return;
    }
    const offset = 6;
    label.setPosition(sprite.x, sprite.y - sprite.displayHeight - offset);
    label.setDepth(sprite.depth + 1);
  }

  syncRemoteLabel(entry, playerState) {
    if (!entry || !entry.label || !entry.sprite) {
      return;
    }
    const faction = playerState?.faction || entry.faction;
    const archetype = playerState?.archetype || entry.archetype;
    const text = this.getRemoteLabelText(archetype, faction);
    if (text !== entry.label.text) {
      entry.label.setText(text);
    }
    this.setRemoteLabelTint(entry.label, faction);
    this.positionRemoteLabel(entry.label, entry.sprite);
  }

  upsertRemotePlayer(playerState) {
    const id = playerState?.id;
    if (!id || id === this.playerId) {
      return;
    }

    if (this.remotePlayers.has(id)) {
      this.updateRemotePlayer(playerState);
      if (playerState.isAttacking) {
        this.playRemoteAttack(playerState);
      }
      return;
    }

    this.createRemotePlayer(playerState);
    if (playerState.isAttacking) {
      this.playRemoteAttack(playerState);
    }
  }

  createRemotePlayer(playerState) {
    const id = playerState.id;
    if (!id || id === this.playerId) {
      return;
    }

    const x = typeof playerState.x === 'number' ? playerState.x : this.player.x;
    const y = typeof playerState.y === 'number' ? playerState.y : this.player.y;
    const facing = this.normalizeFacing(playerState.facing);
    const faction = playerState.faction;
    const archetype = playerState.archetype;
    const sprite = this.add.sprite(x, y, 'fauci-right', 0);
    sprite.setOrigin(0.5, 1);
    this.applyFactionTint(sprite, faction);
    sprite.play(`fauci-idle-${facing}`, true);
    this.setSpriteDepth(sprite);

    const labelText = this.getRemoteLabelText(archetype, faction);
    const label = this.add.text(x, y - sprite.displayHeight - 6, labelText, {
      fontFamily: 'Verdana',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    });
    label.setOrigin(0.5, 1);
    this.setRemoteLabelTint(label, faction);
    this.positionRemoteLabel(label, sprite);

    this.remotePlayers.set(id, { sprite, facing, faction, archetype, label });
  }

  updateRemotePlayer(playerState) {
    const id = playerState.id;
    const entry = this.remotePlayers.get(id);
    if (!entry) {
      this.createRemotePlayer(playerState);
      return;
    }

    const sprite = entry.sprite;
    const previousX = sprite.x;
    const previousY = sprite.y;
    const x = typeof playerState.x === 'number' ? playerState.x : sprite.x;
    const y = typeof playerState.y === 'number' ? playerState.y : sprite.y;
    sprite.setPosition(x, y);
    this.setSpriteDepth(sprite);

    const faction = playerState.faction || entry.faction;
    if (faction !== entry.faction) {
      entry.faction = faction;
      this.applyFactionTint(sprite, faction);
    }

    const facing = this.normalizeFacing(playerState.facing || entry.facing);
    entry.facing = facing;
    const archetype = playerState.archetype || entry.archetype;
    if (archetype !== entry.archetype) {
      entry.archetype = archetype;
    }
    this.syncRemoteLabel(entry, playerState);

    const moved = Math.hypot(x - previousX, y - previousY) > 0.5;
    const attackAnim = sprite.anims.currentAnim?.key?.startsWith('fauci-attack-') && sprite.anims.isPlaying;
    if (!attackAnim) {
      const animKey = moved ? `fauci-walk-${facing}` : `fauci-idle-${facing}`;
      if (sprite.anims.currentAnim?.key !== animKey) {
        sprite.play(animKey, true);
      }
    }
  }

  playRemoteAttack(playerState) {
    const id = playerState.id;
    let entry = this.remotePlayers.get(id);
    if (!entry) {
      this.createRemotePlayer(playerState);
      entry = this.remotePlayers.get(id);
    }

    if (!entry) {
      return;
    }

    const sprite = entry.sprite;
    const x = typeof playerState.x === 'number' ? playerState.x : sprite.x;
    const y = typeof playerState.y === 'number' ? playerState.y : sprite.y;
    sprite.setPosition(x, y);
    this.setSpriteDepth(sprite);

    const faction = playerState.faction || entry.faction;
    if (faction !== entry.faction) {
      entry.faction = faction;
      this.applyFactionTint(sprite, faction);
    }

    const facing = this.normalizeFacing(playerState.facing || entry.facing);
    entry.facing = facing;
    const archetype = playerState.archetype || entry.archetype;
    if (archetype !== entry.archetype) {
      entry.archetype = archetype;
    }
    this.syncRemoteLabel(entry, playerState);

    const attackAnim = `fauci-attack-${facing}`;
    sprite.play(attackAnim, true);
    sprite.once('animationcomplete', () => {
      if (!sprite.active) {
        return;
      }
      sprite.play(`fauci-idle-${facing}`, true);
    });
  }

  removeRemotePlayer(id) {
    const entry = this.remotePlayers.get(id);
    if (!entry) {
      return;
    }

    entry.sprite.destroy();
    if (entry.label) {
      entry.label.destroy();
    }
    this.remotePlayers.delete(id);
  }

  update(_, delta) {
    const dpadState = this.virtualDPad ? this.virtualDPad.getInputState() : null;
    if (this.isPlayerDead) {
      return;
    }

    const jumpPressed = dpadState?.jumpJustPressed;
    if (jumpPressed && !this.isJumping && !this.isAttacking) {
      this.startJump();
    }

    const dt = delta / 1000;
    let moveX = 0;
    let moveY = 0;

    if (!this.isAttacking && !this.isJumping) {
      if (this.keys.left.isDown || this.cursors.left.isDown) moveX -= 1;
      if (this.keys.right.isDown || this.cursors.right.isDown) moveX += 1;
      if (this.keys.up.isDown || this.cursors.up.isDown) moveY -= 1;
      if (this.keys.down.isDown || this.cursors.down.isDown) moveY += 1;
      if (dpadState) {
        moveX += dpadState.moveX;
        moveY += dpadState.moveY;
      }
    }

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      moveX /= len;
      moveY /= len;
      this.playerDirection.set(moveX, moveY);
    }

    this.isMoving = moveX !== 0 || moveY !== 0;

    if (moveX < 0) {
      this.facing = 'left';
    } else if (moveX > 0) {
      this.facing = 'right';
    }

    const facingKey = this.facing === 'left' ? 'left' : 'right';
    const attackAnim = `fauci-attack-${facingKey}`;
    const walkAnim = `fauci-walk-${facingKey}`;
    const idleAnim = `fauci-idle-${facingKey}`;

    if (!this.isAttacking && !this.isJumping) {
      const speedX = this.playerSpeed;
      const speedY = this.playerSpeed * 0.75;
      this.player.x += moveX * speedX * dt;
      this.player.y += moveY * speedY * dt;
    }

    const attackPressed = Phaser.Input.Keyboard.JustDown(this.keys.attack) || dpadState?.attackJustPressed;
    if (attackPressed && !this.isAttacking && !this.isJumping) {
      this.isAttacking = true;
      this.player.play(attackAnim, true);
      this.client?.send(MESSAGE_TYPES.PLAYER_ATTACK, {
        x: this.player.x,
        y: this.player.y,
        facing: this.facing
      });
      const lungeDir = this.playerDirection.clone();
      if (lungeDir.lengthSq() === 0) {
        lungeDir.set(0, 1);
      } else {
        lungeDir.normalize();
      }

      this.tweens.add({
        targets: this.player,
        x: this.player.x + lungeDir.x * this.attackLungeDistance,
        y: this.player.y + lungeDir.y * this.attackLungeDistance * 0.85,
        duration: this.attackDuration / 2,
        yoyo: true,
        ease: 'Quad.out',
        onComplete: () => {
          this.isAttacking = false;
        }
      });
    }

    if (this.isAttacking) {
      if (this.player.anims.currentAnim?.key !== attackAnim) {
        this.player.play(attackAnim, true);
      }
    } else if (this.isMoving) {
      if (this.player.anims.currentAnim?.key !== walkAnim) {
        this.player.play(walkAnim, true);
      }
    } else if (this.player.anims.currentAnim?.key !== idleAnim) {
      this.player.play(idleAnim, true);
    }

    if (!this.isJumping) {
      this.clampPlayerToBounds();
    }
    this.player.setDepth(this.player.y + this.player.displayHeight * (1 - this.player.originY));
    this.updatePlayerLabel();

    if (this.client && this.playerId && this.time.now - this.lastNetworkSend >= this.networkSendInterval) {
      const sent = this.client.send(MESSAGE_TYPES.PLAYER_MOVE, {
        x: this.player.x,
        y: this.player.y,
        facing: this.facing
      });
      if (sent) {
        this.lastNetworkSend = this.time.now;
      }
    }
  }

  updatePlayerLabel() {
    if (!this.playerLabel) {
      return;
    }

    const offset = 6;
    this.playerLabel.setPosition(
      this.player.x,
      this.player.y - this.player.displayHeight - offset
    );
    this.playerLabel.setDepth(this.player.depth + 1);
  }
}
