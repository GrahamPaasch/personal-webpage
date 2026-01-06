import Phaser from 'phaser';

const EMPTY_STATE = {
  moveX: 0,
  moveY: 0,
  attackPressed: false,
  attackJustPressed: false,
  jumpPressed: false,
  jumpJustPressed: false
};

export default class VirtualDPad {
  constructor(scene, options = {}) {
    this.scene = scene;
    const detectedTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
    this.enabled = typeof options.enabled === 'boolean' ? options.enabled : detectedTouch;
    this.state = { ...EMPTY_STATE };

    this.activePointerId = null;
    this.attackPointerId = null;
    this.jumpPointerId = null;
    this.dpadSize = 0;
    this.attackSize = 0;
    this.jumpSize = 0;
    this.deadZone = 0;

    this.octantDirections = [
      new Phaser.Math.Vector2(1, 0),
      new Phaser.Math.Vector2(1, 1),
      new Phaser.Math.Vector2(0, 1),
      new Phaser.Math.Vector2(-1, 1),
      new Phaser.Math.Vector2(-1, 0),
      new Phaser.Math.Vector2(-1, -1),
      new Phaser.Math.Vector2(0, -1),
      new Phaser.Math.Vector2(1, -1)
    ];

    if (!this.enabled) {
      return;
    }

    this.scene.input.addPointer(2);
    this.createVisuals();
    this.registerInput();

    this.scene.scale.on('resize', this.handleResize, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  createVisuals() {
    this.dpadContainer = this.scene.add.container(0, 0);
    this.dpadGraphics = this.scene.add.graphics();
    this.dpadContainer.add(this.dpadGraphics);
    this.dpadContainer.setScrollFactor(0).setDepth(1500);

    this.attackContainer = this.scene.add.container(0, 0);
    this.attackBase = this.scene.add.circle(0, 0, 10, 0x1a1a1a, 0.55);
    this.attackBase.setStrokeStyle(3, 0xf25f5c, 0.85);
    this.attackInner = this.scene.add.circle(0, 0, 5, 0x2a2a2a, 0.8);
    this.attackInner.setStrokeStyle(2, 0xffe066, 0.75);
    this.attackContainer.add([this.attackBase, this.attackInner]);
    this.attackContainer.setScrollFactor(0).setDepth(1500);

    this.jumpContainer = this.scene.add.container(0, 0);
    this.jumpBase = this.scene.add.circle(0, 0, 10, 0x1a1a1a, 0.5);
    this.jumpBase.setStrokeStyle(3, 0x4dd6a6, 0.85);
    this.jumpInner = this.scene.add.circle(0, 0, 5, 0x2a2a2a, 0.78);
    this.jumpInner.setStrokeStyle(2, 0x3b82f6, 0.75);
    this.jumpContainer.add([this.jumpBase, this.jumpInner]);
    this.jumpContainer.setScrollFactor(0).setDepth(1500);

    this.dpadZone = this.scene.add.zone(0, 0, 10, 10).setInteractive();
    this.attackZone = this.scene.add.zone(0, 0, 10, 10).setInteractive();
    this.jumpZone = this.scene.add.zone(0, 0, 10, 10).setInteractive();
    this.dpadZone.setScrollFactor(0).setDepth(1501);
    this.attackZone.setScrollFactor(0).setDepth(1501);
    this.jumpZone.setScrollFactor(0).setDepth(1501);

    this.layout();
  }

  registerInput() {
    this.dpadZone.on('pointerdown', (pointer) => {
      if (this.activePointerId !== null) {
        return;
      }
      this.activePointerId = pointer.id;
      this.updateDirection(pointer);
      this.dpadContainer.setScale(0.97);
    });

    this.attackZone.on('pointerdown', (pointer) => {
      if (this.attackPointerId !== null) {
        return;
      }
      this.attackPointerId = pointer.id;
      this.state.attackPressed = true;
      this.state.attackJustPressed = true;
      this.attackContainer.setScale(0.94);
    });

    this.jumpZone.on('pointerdown', (pointer) => {
      if (this.jumpPointerId !== null) {
        return;
      }
      this.jumpPointerId = pointer.id;
      this.state.jumpPressed = true;
      this.state.jumpJustPressed = true;
      this.jumpContainer.setScale(0.94);
    });

    this.scene.input.on('pointermove', this.handlePointerMove, this);
    this.scene.input.on('pointerup', this.handlePointerUp, this);
    this.scene.input.on('pointerupoutside', this.handlePointerUp, this);
    this.scene.input.on('gameout', this.handlePointerUp, this);
  }

  handlePointerMove(pointer) {
    if (pointer.id !== this.activePointerId) {
      return;
    }
    this.updateDirection(pointer);
  }

  handlePointerUp(pointer) {
    if (pointer.id === this.activePointerId) {
      this.activePointerId = null;
      this.resetDirection();
      this.dpadContainer.setScale(1);
    }

    if (pointer.id === this.attackPointerId) {
      this.attackPointerId = null;
      this.state.attackPressed = false;
      this.attackContainer.setScale(1);
    }

    if (pointer.id === this.jumpPointerId) {
      this.jumpPointerId = null;
      this.state.jumpPressed = false;
      this.jumpContainer.setScale(1);
    }
  }

  updateDirection(pointer) {
    const dx = pointer.x - this.dpadContainer.x;
    const dy = pointer.y - this.dpadContainer.y;
    const distance = Math.hypot(dx, dy);
    if (distance < this.deadZone) {
      this.state.moveX = 0;
      this.state.moveY = 0;
      return;
    }

    const angle = Phaser.Math.Angle.Between(0, 0, dx, dy);
    const wrapped = angle < 0 ? angle + Math.PI * 2 : angle;
    const octant = Math.round(wrapped / (Math.PI / 4)) % 8;
    const dir = this.octantDirections[octant];
    this.state.moveX = dir.x;
    this.state.moveY = dir.y;
  }

  resetDirection() {
    this.state.moveX = 0;
    this.state.moveY = 0;
  }

  layout(width = this.scene.scale.width, height = this.scene.scale.height) {
    const base = Math.min(width, height);
    this.dpadSize = Phaser.Math.Clamp(base * 0.28, 84, 170);
    this.attackSize = Phaser.Math.Clamp(base * 0.22, 70, 150);
    this.jumpSize = Phaser.Math.Clamp(base * 0.2, 64, 140);
    const margin = base * 0.06;
    const buttonGap = Phaser.Math.Clamp(base * 0.035, 10, 22);

    const dpadX = margin + this.dpadSize / 2;
    const dpadY = height - margin - this.dpadSize / 2;
    const attackX = width - margin - this.attackSize / 2;
    const attackY = height - margin - this.attackSize / 2;
    const jumpX = width - margin - this.jumpSize / 2;
    const jumpY = attackY - (this.attackSize / 2 + this.jumpSize / 2 + buttonGap);

    this.dpadContainer.setPosition(dpadX, dpadY);
    this.attackContainer.setPosition(attackX, attackY);
    this.jumpContainer.setPosition(jumpX, jumpY);
    this.dpadZone.setPosition(dpadX, dpadY);
    this.attackZone.setPosition(attackX, attackY);
    this.jumpZone.setPosition(jumpX, jumpY);

    this.dpadZone.setSize(this.dpadSize * 1.15, this.dpadSize * 1.15);
    this.attackZone.setSize(this.attackSize * 1.1, this.attackSize * 1.1);
    this.jumpZone.setSize(this.jumpSize * 1.1, this.jumpSize * 1.1);

    this.deadZone = this.dpadSize * 0.18;

    this.redrawDPad();
    this.redrawAttack();
    this.redrawJump();
  }

  redrawDPad() {
    const g = this.dpadGraphics;
    const size = this.dpadSize;
    const half = size / 2;
    const thickness = size * 0.36;
    const halfThickness = thickness / 2;

    g.clear();
    g.fillStyle(0x141414, 0.55);
    g.fillRect(-halfThickness, -half, thickness, size);
    g.fillRect(-half, -halfThickness, size, thickness);

    const innerScale = 0.78;
    const innerSize = size * innerScale;
    const innerThickness = thickness * innerScale;
    const innerHalf = innerSize / 2;
    const innerHalfThickness = innerThickness / 2;
    g.fillStyle(0x2a2a2a, 0.75);
    g.fillRect(-innerHalfThickness, -innerHalf, innerThickness, innerSize);
    g.fillRect(-innerHalf, -innerHalfThickness, innerSize, innerThickness);

    g.lineStyle(3, 0xf2c94c, 0.85);
    g.strokeRect(-halfThickness, -half, thickness, size);
    g.strokeRect(-half, -halfThickness, size, thickness);
    g.lineStyle(2, 0x4dd6a6, 0.7);
    g.strokeRect(-innerHalfThickness, -innerHalf, innerThickness, innerSize);
    g.strokeRect(-innerHalf, -innerHalfThickness, innerSize, innerThickness);

    const centerSize = thickness * 0.6;
    g.fillStyle(0x101010, 0.85);
    g.fillRect(-centerSize / 2, -centerSize / 2, centerSize, centerSize);
    g.lineStyle(2, 0xf2c94c, 0.8);
    g.strokeRect(-centerSize / 2, -centerSize / 2, centerSize, centerSize);
  }

  redrawAttack() {
    this.attackBase.setRadius(this.attackSize / 2);
    this.attackInner.setRadius(this.attackSize * 0.33);
  }

  redrawJump() {
    this.jumpBase.setRadius(this.jumpSize / 2);
    this.jumpInner.setRadius(this.jumpSize * 0.33);
  }

  getInputState() {
    if (!this.enabled) {
      return { ...EMPTY_STATE };
    }
    const snapshot = { ...this.state };
    this.state.attackJustPressed = false;
    this.state.jumpJustPressed = false;
    return snapshot;
  }

  handleResize(gameSize) {
    if (!this.enabled) {
      return;
    }
    const width = gameSize?.width ?? this.scene.scale.width;
    const height = gameSize?.height ?? this.scene.scale.height;
    this.layout(width, height);
  }

  destroy() {
    if (!this.enabled) {
      return;
    }

    this.scene.scale.off('resize', this.handleResize, this);
    this.scene.input.off('pointermove', this.handlePointerMove, this);
    this.scene.input.off('pointerup', this.handlePointerUp, this);
    this.scene.input.off('pointerupoutside', this.handlePointerUp, this);
    this.scene.input.off('gameout', this.handlePointerUp, this);

    this.dpadZone?.destroy();
    this.attackZone?.destroy();
    this.jumpZone?.destroy();
    this.dpadContainer?.destroy();
    this.attackContainer?.destroy();
    this.jumpContainer?.destroy();
  }
}
