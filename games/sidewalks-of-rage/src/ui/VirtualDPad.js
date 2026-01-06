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
    const detectedTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
    this.enabled = typeof options.enabled === 'boolean' ? options.enabled : detectedTouch;
    this.state = { ...EMPTY_STATE };

    this.activePointerId = null;
    this.attackPointerId = null;
    this.jumpPointerId = null;
    this.dpadSize = 0;
    this.attackSize = 0;
    this.jumpSize = 0;
    this.deadZone = 0;
    this.buttonGap = 0;
    this.controlPadding = 0;
    this.dpadCenter = { x: 0, y: 0 };

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

    this.cacheDom();
    if (!this.enabled) {
      return;
    }

    this.registerInput();
    this.layout();
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        if (this.enabled) {
          this.layout();
        }
      });
    }

    this.scene.scale.on('resize', this.handleResize, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  cacheDom() {
    if (typeof document === 'undefined') {
      this.enabled = false;
      return;
    }

    this.layoutRoot = document.documentElement;
    this.leftControls = document.getElementById('left-controls');
    this.rightControls = document.getElementById('right-controls');
    this.dpadElement = document.getElementById('dpad');
    this.attackButton = document.getElementById('attack-button');
    this.jumpButton = document.getElementById('jump-button');

    if (!this.leftControls || !this.rightControls || !this.dpadElement || !this.attackButton || !this.jumpButton) {
      this.enabled = false;
      return;
    }

    document.body?.classList.add('touch-enabled');
  }

  registerInput() {
    this.onDpadDown = this.handleDpadDown.bind(this);
    this.onAttackDown = this.handleAttackDown.bind(this);
    this.onJumpDown = this.handleJumpDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onWindowResize = this.handleWindowResize.bind(this);

    this.dpadElement.addEventListener('pointerdown', this.onDpadDown);
    this.attackButton.addEventListener('pointerdown', this.onAttackDown);
    this.jumpButton.addEventListener('pointerdown', this.onJumpDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('resize', this.onWindowResize);
  }

  handleDpadDown(event) {
    if (this.activePointerId !== null) {
      return;
    }
    event.preventDefault();
    this.activePointerId = event.pointerId;
    this.updateDpadCenter();
    this.updateDirectionFromPointer(event);
    this.dpadElement.classList.add('is-pressed');
  }

  handleAttackDown(event) {
    if (this.attackPointerId !== null) {
      return;
    }
    event.preventDefault();
    this.attackPointerId = event.pointerId;
    this.state.attackPressed = true;
    this.state.attackJustPressed = true;
    this.attackButton.classList.add('is-pressed');
  }

  handleJumpDown(event) {
    if (this.jumpPointerId !== null) {
      return;
    }
    event.preventDefault();
    this.jumpPointerId = event.pointerId;
    this.state.jumpPressed = true;
    this.state.jumpJustPressed = true;
    this.jumpButton.classList.add('is-pressed');
  }

  handlePointerMove(event) {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.updateDirectionFromPointer(event);
  }

  handlePointerUp(event) {
    if (event.pointerId === this.activePointerId) {
      this.activePointerId = null;
      this.resetDirection();
      this.dpadElement.classList.remove('is-pressed');
    }

    if (event.pointerId === this.attackPointerId) {
      this.attackPointerId = null;
      this.state.attackPressed = false;
      this.attackButton.classList.remove('is-pressed');
    }

    if (event.pointerId === this.jumpPointerId) {
      this.jumpPointerId = null;
      this.state.jumpPressed = false;
      this.jumpButton.classList.remove('is-pressed');
    }
  }

  updateDirectionFromPointer(event) {
    const dx = event.clientX - this.dpadCenter.x;
    const dy = event.clientY - this.dpadCenter.y;
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

  updateDpadCenter() {
    const rect = this.dpadElement.getBoundingClientRect();
    this.dpadCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  layout() {
    if (!this.enabled) {
      return;
    }

    const canvas = this.scene.game?.canvas;
    if (!canvas) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const canvasWidth = canvasRect.width || this.scene.scale.width;
    const canvasHeight = canvasRect.height || this.scene.scale.height;
    const base = Math.min(canvasWidth, canvasHeight);
    const safeBase = base || Math.min(this.scene.scale.width, this.scene.scale.height);

    this.dpadSize = Phaser.Math.Clamp(safeBase * 0.28, 84, 170);
    this.attackSize = Phaser.Math.Clamp(safeBase * 0.22, 70, 150);
    this.jumpSize = Phaser.Math.Clamp(safeBase * 0.2, 64, 140);
    this.controlPadding = Phaser.Math.Clamp(safeBase * 0.06, 10, 24);
    this.buttonGap = Phaser.Math.Clamp(safeBase * 0.035, 10, 22);

    const leftRect = this.leftControls.getBoundingClientRect();
    const rightRect = this.rightControls.getBoundingClientRect();
    const sideWidth = Math.min(leftRect.width, rightRect.width);
    const availableSide = Math.max(sideWidth - this.controlPadding * 2, 0);

    if (availableSide > 0) {
      this.dpadSize = Math.min(this.dpadSize, availableSide);
      this.attackSize = Math.min(this.attackSize, availableSide);
      this.jumpSize = Math.min(this.jumpSize, availableSide);
    }

    this.deadZone = this.dpadSize * 0.18;

    if (this.layoutRoot) {
      this.layoutRoot.style.setProperty('--dpad-size', `${this.dpadSize}px`);
      this.layoutRoot.style.setProperty('--attack-size', `${this.attackSize}px`);
      this.layoutRoot.style.setProperty('--jump-size', `${this.jumpSize}px`);
      this.layoutRoot.style.setProperty('--control-padding', `${this.controlPadding}px`);
      this.layoutRoot.style.setProperty('--action-gap', `${this.buttonGap}px`);
    }

    this.updateDpadCenter();
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

  handleResize() {
    if (!this.enabled) {
      return;
    }
    this.layout();
  }

  handleWindowResize() {
    if (!this.enabled) {
      return;
    }
    this.layout();
  }

  destroy() {
    if (!this.enabled) {
      return;
    }

    this.scene.scale.off('resize', this.handleResize, this);

    this.dpadElement?.removeEventListener('pointerdown', this.onDpadDown);
    this.attackButton?.removeEventListener('pointerdown', this.onAttackDown);
    this.jumpButton?.removeEventListener('pointerdown', this.onJumpDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('resize', this.onWindowResize);

    document.body?.classList.remove('touch-enabled');
  }
}
