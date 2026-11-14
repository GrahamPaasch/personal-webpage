/**
 * vrpanel.js: the control board you point at inside VR. One canvas drawn onto a flat panel;
 * point a controller at a button and pull the trigger.
 *
 * It is a first prototype of "siteswap entry inside VR" (an open question in the spec): presets,
 * a digit keypad for any vanilla siteswap up to 9s, speed, the three sound volumes, calibration
 * and the palm nudge. The canvas is only redrawn when something changes; hovering is shown with a
 * separate highlight quad so pointing costs no texture upload.
 */

import { THREE, roundRect } from './scene.js';

const CW = 1024; // canvas pixels
const CH = 832;
const PANEL_WIDTH = 1.0; // metres
const PANEL_HEIGHT = (PANEL_WIDTH * CH) / CW;

const C = {
  bg: '#141a24',
  edge: '#2a3344',
  ink: '#ecebe6',
  mute: '#9aa3b2',
  button: '#222b3b',
  buttonOn: '#2fd6c3',
  buttonOnInk: '#0d1017',
  accent: '#ff9f43',
  warn: '#ff5c8a',
  field: '#0d1017',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SOUND_ROWS = ['catch', 'release', 'peak'];

export class VRPanel {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.group = new THREE.Group();
    this.group.visible = false;
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true })
    );
    this.group.add(this.plane);

    this.highlights = [0, 1].map(() => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false })
      );
      m.position.z = 0.002;
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.cursors = [0, 1].map(() => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(0.008, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false })
      );
      m.position.z = 0.004;
      m.visible = false;
      this.group.add(m);
      return m;
    });

    this.buttons = [];
    this.model = null;
    this.shown = []; // what the canvas shows now, value by value (see setModel)
    this.next = [];
    this.hover = [null, null];

    this.inverse = new THREE.Matrix4();
    this.localOrigin = new THREE.Vector3();
    this.localDir = new THREE.Vector3();
    this.hits = [0, 1].map(() => ({ distance: 0, button: null, u: 0, v: 0 })); // reused: point() runs every frame
  }

  get width() {
    return PANEL_WIDTH;
  }

  get height() {
    return PANEL_HEIGHT;
  }

  /**
   * Redraw if anything shown has changed. Called every frame with the same object, so the
   * comparison is value by value and makes no garbage.
   */
  setModel(model) {
    const v = this.next;
    let n = 0;
    v[n++] = model.title;
    v[n++] = model.status;
    v[n++] = model.statusKind;
    v[n++] = model.pattern;
    v[n++] = model.typed;
    v[n++] = model.speed;
    for (const type of SOUND_ROWS) {
      const s = model.sound[type];
      v[n++] = s.on;
      v[n++] = s.volume;
      v[n++] = s.solo;
    }
    v[n++] = model.calibrating;
    v[n++] = model.handHeight;
    v[n++] = model.distance;
    v[n++] = model.nudge.palm;
    v[n++] = model.nudge.wrist;
    v[n++] = model.nudge.thumb;
    v[n++] = model.palmBall;
    v[n++] = model.showArcs;
    v[n++] = model.showGhost;
    v[n++] = model.showMyHands;
    v[n++] = model.hands;
    v.length = n;

    const shown = this.shown;
    let same = this.model !== null && shown.length === n;
    for (let i = 0; same && i < n; i++) same = shown[i] === v[i];
    if (same) return;
    this.next = shown;
    this.shown = v;
    this.model = model;
    this.draw();
  }

  /**
   * Where does a pointing ray (world space) hit the panel?
   * Returns null, or { distance, button (or null), u, v } and updates that pointer's highlight.
   * The object returned is that pointer's own and is overwritten by its next call.
   */
  point(pointer, origin, direction) {
    const highlight = this.highlights[pointer];
    const cursor = this.cursors[pointer];
    highlight.visible = false;
    cursor.visible = false;
    this.hover[pointer] = null;
    if (!this.group.visible || !origin) return null;

    this.inverse.copy(this.group.matrixWorld).invert();
    this.localOrigin.copy(origin).applyMatrix4(this.inverse);
    this.localDir.copy(direction).transformDirection(this.inverse);
    if (this.localDir.z >= -1e-4) return null; // pointing away from the front of the panel
    const s = -this.localOrigin.z / this.localDir.z;
    if (s < 0 || s > 6) return null;
    const x = this.localOrigin.x + this.localDir.x * s;
    const y = this.localOrigin.y + this.localDir.y * s;
    if (Math.abs(x) > PANEL_WIDTH / 2 || Math.abs(y) > PANEL_HEIGHT / 2) return null;

    const u = ((x + PANEL_WIDTH / 2) / PANEL_WIDTH) * CW;
    const v = ((PANEL_HEIGHT / 2 - y) / PANEL_HEIGHT) * CH;
    const button = this.buttonAt(u, v);
    cursor.position.set(x, y, 0.004);
    cursor.visible = true;
    if (button) {
      const k = PANEL_WIDTH / CW;
      highlight.scale.set(button.w * k, button.h * k, 1);
      highlight.position.set((button.x + button.w / 2) * k - PANEL_WIDTH / 2, PANEL_HEIGHT / 2 - (button.y + button.h / 2) * k, 0.002);
      highlight.visible = true;
    }
    this.hover[pointer] = button;
    const hit = this.hits[pointer];
    hit.distance = s;
    hit.button = button;
    hit.u = u;
    hit.v = v;
    return hit;
  }

  clearPointer(pointer) {
    this.highlights[pointer].visible = false;
    this.cursors[pointer].visible = false;
    this.hover[pointer] = null;
  }

  buttonAt(u, v) {
    for (const b of this.buttons) {
      if (u >= b.x && u <= b.x + b.w && v >= b.y && v <= b.y + b.h) return b;
    }
    return null;
  }

  /** Centre of a button in panel-local metres (used by the tests to aim a ray at it). */
  buttonCentre(id) {
    const b = this.buttons.find((x) => x.id === id);
    if (!b) return null;
    const k = PANEL_WIDTH / CW;
    return new THREE.Vector3((b.x + b.w / 2) * k - PANEL_WIDTH / 2, PANEL_HEIGHT / 2 - (b.y + b.h / 2) * k, 0);
  }

  // -------------------------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------------------------

  draw() {
    const m = this.model;
    const ctx = this.canvas.getContext('2d');
    this.buttons = [];
    ctx.clearRect(0, 0, CW, CH);
    ctx.fillStyle = C.bg;
    roundRect(ctx, 0, 0, CW, CH, 28);
    ctx.fill();
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 3;
    roundRect(ctx, 1.5, 1.5, CW - 3, CH - 3, 28);
    ctx.stroke();

    const M = 20; // margin
    const G = 8; // gap
    const H = 60; // row height
    const inner = CW - 2 * M;
    let y = 14;

    // Title and status.
    this.text(ctx, m.title, M + 4, y + 30, { size: 38, weight: 700, color: C.ink, maxWidth: 400 });
    this.text(ctx, m.status, CW - M - 4, y + 30, {
      size: 26,
      color: m.statusKind === 'warn' ? C.warn : m.statusKind === 'good' ? C.buttonOn : C.mute,
      align: 'right',
      maxWidth: 560,
    });
    y = 76;

    // Presets and the spec's examples.
    const quick = ['3', '4', '5', '6', '7', '531', '441', '456'];
    this.row(ctx, M, y, inner, H, G, quick.map((s) => ({ id: 'pattern:' + s, label: s, on: m.pattern === s })));
    y += H + G;

    // Keypad entry.
    ctx.fillStyle = C.field;
    roundRect(ctx, M, y, 560, H, 12);
    ctx.fill();
    ctx.strokeStyle = C.edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (m.typed) {
      this.text(ctx, m.typed.split('').join(' '), M + 18, y + H / 2, { size: 36, weight: 700, color: C.accent, maxWidth: 520 });
    } else {
      this.text(ctx, 'type a siteswap', M + 18, y + H / 2, { size: 28, color: C.mute });
    }
    this.button(ctx, { id: 'key:back', label: 'delete', x: M + 568, y, w: 150, h: H });
    this.button(ctx, { id: 'key:go', label: 'juggle it', x: M + 726, y, w: inner - 726, h: H, accent: true });
    y += H + G;
    this.row(
      ctx,
      M,
      y,
      inner,
      H,
      G,
      '0123456789'.split('').map((d) => ({ id: 'key:' + d, label: d }))
    );
    y += H + G;

    // Speed.
    this.text(ctx, 'Speed', M + 4, y + H / 2, { size: 28, color: C.mute });
    const speeds = [1, 0.75, 0.5, 0.25, 0.1];
    this.row(
      ctx,
      M + 130,
      y,
      inner - 130,
      H,
      G,
      speeds.map((s) => ({ id: 'speed:' + s, label: s === 1 ? 'real 1x' : s + 'x', on: Math.abs(m.speed - s) < 1e-6 }))
    );
    y += H + G;

    // Sounds.
    for (const type of SOUND_ROWS) {
      const s = m.sound[type];
      const label = type === 'catch' ? 'Catch' : type === 'release' ? 'Release' : 'Peak tone';
      this.text(ctx, label, M + 4, y + H / 2, { size: 28, color: C.ink });
      let x = M + 170;
      this.button(ctx, { id: 'vol:' + type + ':-', label: '-', x, y, w: 80, h: H });
      x += 80 + G;
      this.text(ctx, Math.round(s.volume * 100) + '%', x + 55, y + H / 2, { size: 28, color: C.ink, align: 'center' });
      x += 110 + G;
      this.button(ctx, { id: 'vol:' + type + ':+', label: '+', x, y, w: 80, h: H });
      x += 80 + G + 12;
      this.button(ctx, { id: 'mute:' + type, label: s.on ? 'on' : 'off', x, y, w: 150, h: H, on: s.on });
      x += 150 + G;
      this.button(ctx, { id: 'solo:' + type, label: 'solo', x, y, w: inner - (x - M), h: H, on: s.solo });
      y += H + G;
    }

    // Calibration.
    this.button(ctx, { id: 'calibrate', label: m.calibrating ? 'pull a trigger' : 'calibrate', x: M, y, w: 230, h: H, on: m.calibrating, accent: !m.calibrating });
    let x = M + 230 + 14;
    this.text(ctx, 'height', x, y + H / 2, { size: 24, color: C.mute });
    x += 78;
    this.button(ctx, { id: 'height:-', label: '-', x, y, w: 64, h: H });
    x += 64 + G;
    this.text(ctx, m.handHeight.toFixed(2) + ' m', x + 56, y + H / 2, { size: 26, color: C.ink, align: 'center' });
    x += 112 + G;
    this.button(ctx, { id: 'height:+', label: '+', x, y, w: 64, h: H });
    x += 64 + 18;
    this.text(ctx, 'out', x, y + H / 2, { size: 24, color: C.mute });
    x += 48;
    this.button(ctx, { id: 'distance:-', label: '-', x, y, w: 64, h: H });
    x += 64 + G;
    this.text(ctx, m.distance.toFixed(2) + ' m', x + 56, y + H / 2, { size: 26, color: C.ink, align: 'center' });
    x += 112 + G;
    this.button(ctx, { id: 'distance:+', label: '+', x, y, w: 64, h: H });
    y += H + G;

    // Palm nudge.
    this.button(ctx, { id: 'palmball', label: 'palm ball', x: M, y, w: 190, h: H, on: m.palmBall });
    x = M + 190 + 12;
    const axes = [
      ['palm', 'palm'],
      ['wrist', 'wrist'],
      ['thumb', 'thumb'],
    ];
    const cell = (inner - 190 - 12 - 2 * 10) / 3;
    for (const [key, label] of axes) {
      const mm = Math.round(m.nudge[key] * 1000);
      this.text(ctx, label + ' ' + (mm > 0 ? '+' : '') + mm, x + 2, y + H / 2, { size: 22, color: C.mute, maxWidth: cell - 132 });
      this.button(ctx, { id: 'nudge:' + key + ':-', label: '-', x: x + cell - 128, y, w: 60, h: H });
      this.button(ctx, { id: 'nudge:' + key + ':+', label: '+', x: x + cell - 62, y, w: 60, h: H });
      x += cell + 10;
    }
    y += H + G;

    // Toggles.
    this.row(ctx, M, y, inner, H, G, [
      { id: 'toggle:arcs', label: 'arcs', on: m.showArcs },
      { id: 'toggle:ghost', label: 'ghost hands', on: m.showGhost },
      { id: 'toggle:mine', label: 'my hands', on: m.showMyHands },
      { id: 'spot', label: 'my spot' },
      { id: 'exit', label: 'exit VR' },
    ]);
    y += H + G;

    const help = m.hands
      ? 'Point with a hand and pinch finger and thumb to press.  This board stays on your left.'
      : 'A or X: bring this board in front of you, or hide it.  Left stick: move.  Right stick: turn.';
    this.text(ctx, help, CW / 2, y + 26, {
      size: 23,
      color: C.mute,
      align: 'center',
      maxWidth: inner,
    });

    this.texture.needsUpdate = true;
  }

  row(ctx, x, y, w, h, gap, items) {
    const bw = (w - gap * (items.length - 1)) / items.length;
    items.forEach((item, i) => {
      this.button(ctx, Object.assign({ x: x + i * (bw + gap), y, w: bw, h }, item));
    });
  }

  button(ctx, b) {
    ctx.fillStyle = b.on ? C.buttonOn : C.button;
    roundRect(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    if (b.accent && !b.on) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      roundRect(ctx, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 11);
      ctx.stroke();
    }
    this.text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, {
      size: 30,
      weight: 600,
      color: b.on ? C.buttonOnInk : C.ink,
      align: 'center',
      maxWidth: b.w - 12,
    });
    this.buttons.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h });
  }

  text(ctx, str, x, y, o) {
    ctx.font = (o.weight || 500) + ' ' + o.size + 'px ' + FONT;
    ctx.fillStyle = o.color;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'middle';
    if (o.maxWidth) ctx.fillText(str, x, y, o.maxWidth);
    else ctx.fillText(str, x, y);
  }
}
