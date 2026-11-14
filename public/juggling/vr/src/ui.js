/**
 * ui.js: the on-page controls for laptop and phone (index.html). No physics is decided here; the
 * words that explain a pattern come from describe.js.
 */

import { describePattern, formatSpeed } from './describe.js';
import { SOUND_TYPES } from './audio.js';

const $ = (id) => document.getElementById(id);

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    }
  }
  for (const child of children || []) {
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export class FlatUI {
  constructor(handlers) {
    this.h = handlers;
    this.bind();
  }

  bind() {
    const h = this.h;

    $('siteswapForm').addEventListener('submit', (e) => {
      e.preventDefault();
      h.onPattern($('siteswap').value);
    });
    $('presets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pattern]');
      if (b) h.onPattern(b.dataset.pattern);
    });

    $('speed').addEventListener('input', (e) => h.onSpeed(Number(e.target.value) / 100));
    $('speedChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]');
      if (b) h.onSpeed(Number(b.dataset.speed));
    });

    $('viewButtons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) h.onView(b.dataset.view);
    });

    $('showGhost').addEventListener('change', (e) => h.onShow('ghost', e.target.checked));
    $('showArcs').addEventListener('change', (e) => h.onShow('arcs', e.target.checked));
    $('showMine').addEventListener('change', (e) => h.onShow('mine', e.target.checked));

    document.querySelectorAll('.sound').forEach((row) => {
      const type = row.dataset.sound;
      row.querySelector('input').addEventListener('input', (e) => h.onSound(type, { volume: Number(e.target.value) / 100 }));
      row.querySelector('.mute').addEventListener('click', () => h.onSound(type, { toggle: 'on' }));
      row.querySelector('.solo').addEventListener('click', () => h.onSound(type, { toggle: 'solo' }));
    });

    $('handHeight').addEventListener('input', (e) => h.onCalibration('handHeight', Number(e.target.value) / 100));
    $('distance').addEventListener('input', (e) => h.onCalibration('distance', Number(e.target.value) / 100));
    $('nudgePalm').addEventListener('input', (e) => h.onNudge('palm', Number(e.target.value) / 1000));
    $('nudgeWrist').addEventListener('input', (e) => h.onNudge('wrist', Number(e.target.value) / 1000));
    $('nudgeThumb').addEventListener('input', (e) => h.onNudge('thumb', Number(e.target.value) / 1000));
    $('handTracking').addEventListener('change', (e) => h.onHandTracking(e.target.checked));
    $('resetCalib').addEventListener('click', () => h.onResetCalibration());

    $('enterVR').addEventListener('click', () => h.onEnterVR());

    const setPanel = (open) => {
      document.body.classList.toggle('panel-closed', !open);
      $('panelOpen').hidden = open;
      h.onLayout();
    };
    $('panelClose').addEventListener('click', () => setPanel(false));
    $('panelOpen').addEventListener('click', () => setPanel(true));

    // Any tap, click or key press switches sound on. Browsers only start audio from a real
    // gesture and differ on which event counts, so every candidate is offered; the sound board
    // itself declines until the browser has seen one (Escape, a modifier key or the end of a
    // scroll are not gestures to it).
    const gesture = (e) => {
      // A finger going down is not yet a gesture to the browser; its lifting is.
      if (e.type === 'pointerdown' && e.pointerType !== 'mouse') return;
      h.onGesture();
    };
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, gesture, { capture: true, passive: true });
    }
  }

  /** How much of the window the control panel covers, so the 3D view can be centred beside it. */
  insets() {
    const panel = $('panel');
    if (document.body.classList.contains('panel-closed')) return { left: 0, bottom: 0 };
    const r = panel.getBoundingClientRect();
    if (r.width >= window.innerWidth - 1) return { left: 0, bottom: Math.min(r.height, window.innerHeight * 0.6) };
    return { left: r.width, bottom: 0 };
  }

  showError(message) {
    const node = $('siteswapError');
    node.textContent = message || '';
    node.hidden = !message;
  }

  setPattern(pattern, collisions) {
    this.showError('');
    $('siteswap').value = pattern.text;
    document.querySelectorAll('#presets [data-pattern]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.pattern === pattern.text));
    });

    const d = describePattern(pattern, collisions);
    $('infoTitle').textContent = d.title;
    const tag = $('infoTag');
    tag.textContent = d.tag;
    tag.className = d.tagClass;

    const body = $('infoBody');
    body.textContent = '';
    const table = el('table', d.tableClass ? { class: d.tableClass } : null);
    if (d.header) {
      table.appendChild(el('tr', null, d.header.map((t) => el('th', { text: t }))));
    }
    for (const row of d.rows) {
      table.appendChild(el('tr', null, row.map((t) => el('td', { text: t }))));
    }
    body.appendChild(table);
    if (d.collision) {
      body.appendChild(el('p', { class: d.collision.bad ? 'bad' : 'ok', text: d.collision.text }));
    }
    for (const note of d.notes) body.appendChild(el('p', { text: note }));

    const badge = $('patternBadge');
    badge.textContent = '';
    badge.appendChild(el('b', { text: d.short }));
    badge.appendChild(document.createTextNode(pattern.uniform ? '' : '  ' + pattern.balls + (pattern.balls === 1 ? ' ball' : ' balls')));

    const banner = $('collisionBanner');
    if (d.collision && d.collision.bad) {
      banner.textContent = '';
      banner.appendChild(el('b', { text: 'Collision warning. ' }));
      banner.appendChild(document.createTextNode(d.collision.short + ' The math only finds collision-free spacing for uniform cascades and fountains.'));
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
    return d;
  }

  setSpeed(speed) {
    const real = Math.abs(speed - 1) < 1e-6;
    $('speed').value = String(Math.round(speed * 100));
    $('speedVal').textContent = real ? '1x' : formatSpeed(speed);
    document.querySelectorAll('#speedChips [data-speed]').forEach((b) => {
      b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.speed) - speed) < 1e-6));
    });
    // The permanent label: any speed other than real time is always on screen.
    const badge = $('speedBadge');
    badge.textContent = '';
    if (!real) {
      badge.appendChild(document.createTextNode(formatSpeed(speed)));
      badge.appendChild(el('small', { text: 'slow motion' }));
    }
    badge.hidden = real;
  }

  setView(mode) {
    document.querySelectorAll('#viewButtons [data-view]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.view === mode));
    });
  }

  setShow(show) {
    $('showGhost').checked = show.ghost;
    $('showArcs').checked = show.arcs;
    $('showMine').checked = show.mine;
  }

  setSound(settings, running) {
    for (const type of SOUND_TYPES) {
      const row = document.querySelector('.sound[data-sound="' + type + '"]');
      const s = settings[type];
      row.querySelector('input').value = String(Math.round(s.volume * 100));
      row.querySelector('.val').textContent = Math.round(s.volume * 100) + '%';
      const mute = row.querySelector('.mute');
      mute.textContent = s.on ? 'on' : 'off';
      mute.setAttribute('aria-pressed', String(s.on));
      row.querySelector('.solo').setAttribute('aria-pressed', String(s.solo));
    }
    $('soundHint').hidden = running;
    $('soundChip').hidden = running;
  }

  setCalibration(anchor, nudge, handTracking) {
    $('handHeight').value = String(Math.round(anchor.handHeight * 100));
    $('handHeightVal').textContent = anchor.handHeight.toFixed(2) + ' m';
    $('distance').value = String(Math.round(anchor.distance * 100));
    $('distanceVal').textContent = anchor.distance.toFixed(2) + ' m';
    const mm = (v) => (v > 0 ? '+' : '') + Math.round(v * 1000) + ' mm';
    $('nudgePalm').value = String(Math.round(nudge.palm * 1000));
    $('nudgePalmVal').textContent = mm(nudge.palm);
    $('nudgeWrist').value = String(Math.round(nudge.wrist * 1000));
    $('nudgeWristVal').textContent = mm(nudge.wrist);
    $('nudgeThumb').value = String(Math.round(nudge.thumb * 1000));
    $('nudgeThumbVal').textContent = mm(nudge.thumb);
    $('handTracking').checked = handTracking;
  }

  setVR(state) {
    const b = $('enterVR');
    const note = $('vrNote');
    if (state.presenting) {
      b.disabled = false;
      b.textContent = 'Exit VR';
      note.textContent = 'In VR: the control board is on your left; A or X brings it in front. Point and pull the trigger.';
    } else if (state.starting) {
      b.disabled = true; // one request at a time
      b.textContent = 'Starting VR';
      note.textContent = 'Asking the headset to start. It may show a question of its own first.';
    } else if (state.supported) {
      b.disabled = false;
      b.textContent = 'Enter VR';
      note.textContent = state.error || state.last || 'You start in the juggler’s spot. Walk around the pattern, or use the left stick.';
    } else {
      b.disabled = true;
      b.textContent = state.checking ? 'Checking for a VR headset' : 'VR not available here';
      note.textContent = state.reason || '';
    }
  }
}
