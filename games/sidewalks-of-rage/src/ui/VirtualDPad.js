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
      ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
    this.enabled = typeof options.enabled === 'boolean' ? options.enabled : detectedTouch;
    this.state = { ...EMPTY_STATE };

    this.activePointerId = null;
    this.attackPointerId = null;
    this.jumpPointerId = null;
    this.deadZone = 0;
    this.dpadBounds = null;

    this.octantDirections = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 }
    ];

    if (!this.enabled) {
      return;
    }

    this.leftContainer = document.getElementById('left-controls');
    this.rightContainer = document.getElementById('right-controls');

    if (!this.leftContainer || !this.rightContainer) {
      this.enabled = false;
      return;
    }

    this.handleDpadPointerDown = this.handleDpadPointerDown.bind(this);
    this.handleDpadPointerMove = this.handleDpadPointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleAttackPointerDown = this.handleAttackPointerDown.bind(this);
    this.handleJumpPointerDown = this.handleJumpPointerDown.bind(this);
    this.handleResize = this.handleResize.bind(this);

    this.createDom();
    this.registerInput();
    this.layout();

    window.addEventListener('resize', this.handleResize);
    this.scene.events.once('shutdown', () => {
      this.destroy();
    });
  }

  createDom() {
    this.dpadWrapper = document.createElement('div');
    this.dpadWrapper.className = 'virtual-dpad-wrapper';

    this.dpad = document.createElement('div');
    this.dpad.className = 'virtual-dpad';

    this.dpadCenter = document.createElement('div');
    this.dpadCenter.className = 'virtual-dpad-center';
    this.dpad.appendChild(this.dpadCenter);

    this.dpadWrapper.appendChild(this.dpad);
    this.leftContainer.appendChild(this.dpadWrapper);

    this.buttonStack = document.createElement('div');
    this.buttonStack.className = 'virtual-buttons';

    this.jumpButton = this.createButton('jump', 'Jump');
    this.attackButton = this.createButton('attack', 'Attack');
    this.buttonStack.append(this.jumpButton, this.attackButton);
    this.rightContainer.appendChild(this.buttonStack);
  }

  createButton(type, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `virtual-button ${type}`;
    button.textContent = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  registerInput() {
    this.dpad.addEventListener('pointerdown', this.handleDpadPointerDown);
    this.dpad.addEventListener('pointermove', this.handleDpadPointerMove);
    this.attackButton.addEventListener('pointerdown', this.handleAttackPointerDown);
    this.jumpButton.addEventListener('pointerdown', this.handleJumpPointerDown);

    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
  }

  handleDpadPointerDown(event) {
    if (this.activePointerId !== null) {
      return;
    }
    this.activePointerId = event.pointerId;
    this.dpad.setPointerCapture?.(event.pointerId);
    this.layout();
    this.updateDirectionFromEvent(event);
    this.dpad.classList.add('is-pressed');
    event.preventDefault();
  }

  handleDpadPointerMove(event) {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.updateDirectionFromEvent(event);
    event.preventDefault();
  }

  handleAttackPointerDown(event) {
    if (this.attackPointerId !== null) {
      return;
    }
    this.attackPointerId = event.pointerId;
    this.state.attackPressed = true;
    this.state.attackJustPressed = true;
    this.attackButton.classList.add('is-pressed');
    this.attackButton.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  handleJumpPointerDown(event) {
    if (this.jumpPointerId !== null) {
      return;
    }
    this.jumpPointerId = event.pointerId;
    this.state.jumpPressed = true;
    this.state.jumpJustPressed = true;
    this.jumpButton.classList.add('is-pressed');
    this.jumpButton.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  handlePointerUp(event) {
    if (event.pointerId === this.activePointerId) {
      this.activePointerId = null;
      this.resetDirection();
      this.dpad.classList.remove('is-pressed');
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

  updateDirectionFromEvent(event) {
    if (!this.dpadBounds) {
      this.layout();
    }

    const centerX = this.dpadBounds.left + this.dpadBounds.width / 2;
    const centerY = this.dpadBounds.top + this.dpadBounds.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance < this.deadZone) {
      this.state.moveX = 0;
      this.state.moveY = 0;
      return;
    }

    const angle = Math.atan2(dy, dx);
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

  layout() {
    if (!this.dpad) {
      return;
    }
    this.dpadBounds = this.dpad.getBoundingClientRect();
    this.deadZone = this.dpadBounds.width * 0.18;
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

  destroy() {
    if (!this.enabled) {
      return;
    }

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);

    this.dpad?.removeEventListener('pointerdown', this.handleDpadPointerDown);
    this.dpad?.removeEventListener('pointermove', this.handleDpadPointerMove);
    this.attackButton?.removeEventListener('pointerdown', this.handleAttackPointerDown);
    this.jumpButton?.removeEventListener('pointerdown', this.handleJumpPointerDown);

    this.dpadWrapper?.remove();
    this.buttonStack?.remove();
  }
}
