// DOM overlay screens: title, pause, game over, finale, settings, high scores, how to play.
// Keyboard navigable (↑/↓ to choose, Enter to activate, Esc to go back) and mouse friendly.
import { ACTION_LABELS, DEFAULT_KEYS } from './settings.js';

const $ = id => document.getElementById(id);
const prettyKey = code => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Left', ' L').replace('Right', ' R')
  .replace(/^ L$/, '←').replace(/^ R$/, '→').replace(/^Up$/, '↑').replace(/^Down$/, '↓').replace('Control', 'Ctrl').replace('Escape', 'Esc');

export class UI {
  constructor({ onAction, onSettings, onNav }) {
    this.onAction = onAction; this.onSettings = onSettings; this.onNav = onNav ?? (() => {});
    this.current = null; this.stack = [];
    this.waitingKey = null;
    for (const btn of document.querySelectorAll('#ui button[data-act]')) {
      btn.addEventListener('click', () => this.onAction(btn.dataset.act, this.current));
      btn.addEventListener('mouseenter', () => { this.select(btn); });
    }
  }
  show(id, { push = false } = {}) {
    if (push && this.current) this.stack.push(this.current);
    else if (!push) this.stack = [];
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === `s-${id}`);
    this.current = id;
    const first = this.buttons()[0];
    if (first && id !== 'over' && id !== 'finale') this.select(first);
  }
  back() {
    const prev = this.stack.pop();
    if (prev) this.show(prev, { push: false, keepStack: true });
    return prev;
  }
  hide() { for (const s of document.querySelectorAll('.screen')) s.classList.remove('on'); this.current = null; this.stack = []; }
  buttons() {
    if (!this.current) return [];
    return [...document.querySelectorAll(`#s-${this.current} button`)].filter(b => b.offsetParent !== null && !b.closest('.keys'));
  }
  select(btn) {
    for (const b of document.querySelectorAll('#ui button.sel')) b.classList.remove('sel');
    if (btn) { btn.classList.add('sel'); btn.focus({ preventScroll: true }); }
  }
  // Returns true if the key was consumed by the UI.
  key(e) {
    if (this.waitingKey) {
      e.preventDefault();
      const { action, done } = this.waitingKey;
      this.waitingKey = null;
      if (e.code !== 'Escape') done(action, e.code); else done(null);
      return true;
    }
    if (!this.current) return false;
    if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox') return false;
    const bs = this.buttons();
    const i = bs.indexOf(document.querySelector('#ui button.sel'));
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight' && this.current === 'over') { e.preventDefault(); this.select(bs[(i + 1) % bs.length]); this.onNav(i + 1); return true; }
    if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' && this.current === 'over') { e.preventDefault(); this.select(bs[(i - 1 + bs.length) % bs.length]); this.onNav(i - 1); return true; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || (e.code === 'Space' && this.current !== 'settings')) {
      e.preventDefault();
      const b = bs[i] ?? bs[0];
      if (b) b.click();
      return true;
    }
    if (e.code === 'Escape') { e.preventDefault(); this.onAction('escape', this.current); return true; }
    return false;
  }

  // ---- settings ----
  renderSettings(s) {
    const g = $('settings-grid');
    const rows = [
      ['music', 'Music volume', 'range', 0, 1, 0.05, v => `${Math.round(v * 100)}%`],
      ['sfx', 'Effects volume', 'range', 0, 1, 0.05, v => `${Math.round(v * 100)}%`],
      ['muted', 'Mute all', 'check'],
      ['das', 'DAS (auto-shift delay)', 'range', 50, 300, 1, v => `${v} ms`],
      ['arr', 'ARR (auto-repeat rate)', 'range', 0, 100, 1, v => `${v} ms`],
      ['sdf', 'Soft drop speed', 'range', 5, 40, 1, v => `${v}×`],
      ['ghost', 'Ghost piece', 'check'],
      ['reduced', 'Reduced effects', 'check'],
      ['shake', 'Screen shake', 'check'],
    ];
    g.innerHTML = '';
    for (const [k, label, type, lo, hi, step, fmt] of rows) {
      const l = document.createElement('label'); l.textContent = label; l.htmlFor = `set-${k}`;
      const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center';
      const inp = document.createElement('input'); inp.id = `set-${k}`;
      if (type === 'range') {
        inp.type = 'range'; inp.min = lo; inp.max = hi; inp.step = step; inp.value = s[k];
        const val = document.createElement('span'); val.className = 'val'; val.textContent = fmt(s[k]);
        inp.addEventListener('input', () => { val.textContent = fmt(Number(inp.value)); this.onSettings({ [k]: Number(inp.value) }); });
        wrap.append(inp, val);
      } else {
        inp.type = 'checkbox'; inp.checked = !!s[k];
        inp.addEventListener('change', () => this.onSettings({ [k]: inp.checked }));
        wrap.append(inp);
      }
      g.append(l, wrap);
    }
    const kd = $('keys');
    kd.innerHTML = '';
    for (const action of Object.keys(DEFAULT_KEYS)) {
      const l = document.createElement('div'); l.textContent = ACTION_LABELS[action];
      const b = document.createElement('button');
      b.textContent = (s.keys[action] ?? []).map(prettyKey).join('  /  ') || '—';
      b.addEventListener('click', () => {
        b.classList.add('wait'); b.textContent = 'press a key…';
        this.waitingKey = { action, done: (a, code) => { b.classList.remove('wait'); if (a) this.onSettings({ rebind: [a, code] }); else this.renderSettings(s); } };
      });
      kd.append(l, b);
    }
  }

  renderScores(list, highlight = -1) {
    const t = $('scores-table');
    if (!list.length) { t.innerHTML = '<tr><td style="text-align:center;opacity:.6;padding:24px">No scores yet — the journey awaits.</td></tr>'; return; }
    t.innerHTML = '<tr><th>#</th><th>Name</th><th class="n">Score</th><th class="n">Lines</th><th>Reached</th><th>Mode</th></tr>' +
      list.map((e, i) => `<tr class="${i === highlight ? 'me' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td class="n">${e.score.toLocaleString('en-US')}</td><td class="n">${e.lines}</td><td>${esc(e.stage)}</td><td>${esc(e.mode)}</td></tr>`).join('');
  }

  fillResult(prefix, { score, stats }) {
    $(`${prefix}-score`).textContent = score.toLocaleString('en-US');
    $(`${prefix}-stats`).innerHTML = stats.map(([k, v]) => `<div>${esc(k)}</div><div>${esc(String(v))}</div>`).join('');
  }
  askName(prefix, defaultName, onDone) {
    const box = $(prefix === 'over' ? 'name-entry' : 'fin-name-entry');
    const input = $(prefix === 'over' ? 'name-input' : 'fin-name-input');
    box.classList.add('on');
    input.value = defaultName;
    setTimeout(() => { input.focus(); input.select(); }, 350);
    const finish = () => {
      input.removeEventListener('keydown', onKey); input.removeEventListener('blur', finish);
      box.classList.remove('on');
      onDone((input.value || defaultName || 'PLAYER').trim().toUpperCase().slice(0, 12));
      const first = this.buttons()[0]; if (first) this.select(first);
    };
    const onKey = ev => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } };
    input.addEventListener('keydown', onKey);
    input.addEventListener('blur', finish, { once: true });
  }
  toast(text, ms = 1800) {
    const t = $('toast'); t.textContent = text; t.classList.add('on');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }
  setAccent(a, b) { document.documentElement.style.setProperty('--accent', a); document.documentElement.style.setProperty('--accent2', b ?? a); }
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
