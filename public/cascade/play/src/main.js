// CASCADE — wiring: game rules ⇄ music engine ⇄ renderer ⇄ UI, input (keyboard + gamepad), debug params.
import { Game } from './game/game.js';
import { Journey } from './game/journey.js';
import { Bot } from './game/bot.js';
import { STAGES } from './stages/index.js';
import { TITLE_MUSIC } from './stages/music.js';
import { AudioEngine } from './audio/engine.js';
import { Renderer } from './visual/renderer.js';
import { UI } from './ui/ui.js';
import { loadSettings, saveSettings, keyMap, rebind, defaults } from './ui/settings.js';
import { loadScores, saveScores, insertScore, qualifies } from './ui/scores.js';
import { clamp, ease } from './visual/sceneKit.js';

const params = new URLSearchParams(location.search);
const P = {
  stage: params.has('stage') ? clamp(Number(params.get('stage')) - 1, 0, STAGES.length - 1) : null,
  autoplay: params.get('autoplay') === '1',
  bloom: params.has('bloom') ? Number(params.get('bloom')) : null,
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
  skipTitle: params.get('skiptitle') === '1' || params.has('stage'),
  mute: params.get('mute') === '1',
  fps: params.get('fps') === '1',
  mode: params.get('mode') === 'endless' ? 'endless' : 'journey',
  hq: params.get('hq') === '1',
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let settings = loadSettings(reducedMotion);
let keys = keyMap(settings.keys);
let scores = loadScores();

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, { reduced: settings.reduced, pinQuality: P.hq });
renderer.ghostOn = settings.ghost; renderer.shakeOn = settings.shake;
const engine = new AudioEngine();
engine.settings = { music: settings.music, sfx: settings.sfx, muted: settings.muted || P.mute };

let state = 'title'; // title | playing | paused | over | finale
let game = null, bot = null, mode = 'journey';
let stageIdx = 0, bloom = 0, intensity = 0, danger = 0, hot = 0;
let stageStart = 0, stageTimes = [];
let runSeed = 1;
let lastName = localStorage.getItem('cascade.name') ?? '';
let audioStarted = false;
let hardFlag = false; // a hard drop's impact already covers the lock sound

const ui = new UI({
  onAction: (act, screen) => handleAction(act, screen),
  onSettings: patch => applySettings(patch),
  onNav: i => engine.playerEvent('menu', { i: ((i % 5) + 5) % 5 + 2 }),
});

// ------------------------------------------------------------------------------------------------
// audio unlock + title
function startAudio() {
  if (audioStarted) { engine.resume(); return; }
  audioStarted = true;
  engine.init();
  engine.applySettings(engine.settings);
  if (state === 'title') engine.setStage(TITLE_MUSIC, 7, { immediate: true });
  else if (game) engine.setStage(STAGES[stageIdx].music, runSeed + stageIdx, { immediate: true });
  document.getElementById('sound-hint').style.display = 'none';
}
const gesture = () => startAudio();
addEventListener('pointerdown', gesture);
addEventListener('keydown', gesture, { capture: true });

function toTitle() {
  state = 'title';
  game = null; bot = null;
  renderer.setStage(STAGES[0], { fade: 1.5, seed: 3 });
  ui.setAccent(STAGES[0].theme.accent, STAGES[0].theme.accent2);
  ui.show('title');
  if (audioStarted) engine.setStage(TITLE_MUSIC, 7, {});
  engine.setDanger(0); engine.setIntensity(0.3);
}

// ------------------------------------------------------------------------------------------------
// game lifecycle
let prepPending = false, prepFor = '';
let booting = true; // a ?stage= deep link starts without a crossfade from the title scene
function startGame(m = 'journey', startStage = 0) {
  mode = m;
  runSeed = P.seed ?? ((Math.random() * 2 ** 31) >>> 0);
  const journey = new Journey(STAGES, { mode, startStage });
  game = new Game({ seed: runSeed, journey, das: settings.das, arr: settings.arr, sdf: settings.sdf });
  game.on(onGameEvent);
  bot = P.autoplay ? new Bot(game, { pace: 55 }) : null;
  stageIdx = journey.stageIndex;
  bloom = 0; intensity = 0.1; danger = 0; hot = 0;
  stageStart = 0; stageTimes = [];
  enterStage(stageIdx, true);
  booting = false;
  state = 'playing';
  ui.hide();
  startAudio();
}

function enterStage(i, first = false) {
  stageIdx = i;
  const st = STAGES[i];
  renderer.setStage(st, { fade: first && booting ? 0 : first ? 1.2 : 2.5, seed: runSeed + i });
  renderer.showCard(st, i);
  ui.setAccent(st.theme.accent, st.theme.accent2);
  if (audioStarted) engine.setStage(st.music, runSeed + i, { immediate: false });
}

function onGameEvent(e, g) {
  renderer.onGame(e, g);
  switch (e.type) {
    case 'move': engine.playerEvent('move', { x: g.active?.x + 1 }); break;
    case 'rotate': engine.playerEvent('rotate', { rot: e.rot, x: g.active?.x + 1, tspinCandidate: e.tspinCandidate }); break;
    case 'softdrop': engine.playerEvent('soft', { y: e.y }); break;
    case 'harddrop': hardFlag = true; engine.playerEvent('hard', { x: e.x + 1, cells: e.cells }); break;
    case 'hold': engine.playerEvent('hold'); break;
    case 'holdfail': engine.playerEvent('holdfail'); break;
    case 'bump': if (!bot) engine.playerEvent('bump'); break;
    case 'lock': if (!hardFlag) engine.playerEvent('lock', { soft: true }); hardFlag = false; break;
    case 'clear':
      engine.playerEvent('clear', e);
      hot = Math.min(1, hot + (e.lines >= 4 || e.tspin ? 0.9 : e.lines === 3 ? 0.5 : e.lines * 0.15));
      break;
    case 'levelup': engine.playerEvent('levelup'); break;
    case 'stage': {
      stageTimes.push({ stage: STAGES[e.from].name, time: g.time - stageStart });
      stageStart = g.time;
      bloom = Math.min(bloom, 0.3);
      enterStage(e.to);
      break;
    }
    case 'complete': {
      stageTimes.push({ stage: STAGES[stageIdx].name, time: g.time - stageStart });
      // the last line rises into the sky as a final cascade of light
      engine.playerEvent('clear', { lines: 4, combo: 6, perfect: true });
      for (let i = 0; i < 40; i++) renderer.seekParticle(renderer.field.x + Math.random() * renderer.field.w, renderer.field.y + renderer.field.h * (0.4 + Math.random() * 0.6), ['#ffffff', renderer.theme.accent, renderer.theme.accent2 ?? '#ffd27f'][i % 3]);
      state = 'finale';
      showFinale();
      break;
    }
    case 'gameover':
      engine.playerEvent('gameover');
      state = 'over';
      setTimeout(showGameOver, 900);
      break;
  }
}

const fmtTime = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function resultStats(g) {
  return [
    ['Lines', g.lines], ['Level', g.level], ['Reached', `${STAGES[stageIdx].numeral} · ${STAGES[stageIdx].name}`],
    ['Time', fmtTime(g.time)], ['Best combo', Math.max(0, g.stats.maxCombo)], ['Cascades (4 lines)', g.stats.quads], ['T-spins', g.stats.tspins],
  ];
}
function recordScore(prefix, g, onDone) {
  const entry = { name: lastName || 'PLAYER', score: g.score, lines: g.lines, stage: STAGES[stageIdx].name, mode: mode === 'endless' ? 'Endless' : (g.journey.mode === 'space' ? 'Journey+' : 'Journey'), date: Date.now() };
  if (!qualifies(scores, g.score) || bot) { ui.select(ui.buttons()[0]); onDone?.(-1); return; }
  ui.askName(prefix, lastName, name => {
    entry.name = name; lastName = name; localStorage.setItem('cascade.name', name);
    const r = insertScore(scores, entry);
    scores = r.list; saveScores(scores);
    ui.toast(`Saved — #${r.rank + 1} on the high-score list`);
    onDone?.(r.rank);
  });
}
function showGameOver() {
  if (state !== 'over' || !game) return;
  document.getElementById('over-title').textContent = 'Game over';
  ui.fillResult('over', { score: game.score, stats: resultStats(game) });
  ui.show('over');
  recordScore('over', game);
  if (bot) setTimeout(() => { if (state === 'over' && bot) startGame(mode, P.stage ?? 0); }, 4000);
}
function showFinale() {
  const g = game;
  ui.fillResult('fin', { score: g.score, stats: [...stageTimes.map(s => [s.stage, fmtTime(s.time)]), ['Total', fmtTime(g.time)], ['Lines', g.lines], ['Best combo', Math.max(0, g.stats.maxCombo)]] });
  ui.show('finale');
  recordScore('fin', g);
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  game.releaseAll();
  engine.setPaused(true);
  ui.show('pause');
}
function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  engine.setPaused(false);
  ui.hide();
}

function handleAction(act, screen) {
  engine.playerEvent('select');
  switch (act) {
    case 'journey': startGame('journey', 0); break;
    case 'endless': startGame('endless', 0); break;
    case 'settings': ui.renderSettings(settings); ui.show('settings', { push: true }); break;
    case 'howto': ui.show('howto', { push: true }); break;
    case 'scores': ui.renderScores(scores); ui.show('scores', { push: true }); break;
    case 'back': ui.back(); break;
    case 'resume': resume(); break;
    case 'restart': engine.setPaused(false); startGame(mode, 0); break;
    case 'quit': engine.setPaused(false); toTitle(); break;
    case 'again': startGame(mode, 0); break;
    case 'title': toTitle(); break;
    case 'space': state = 'playing'; ui.hide(); game.continueInSpace(); break;
    case 'reset': settings = { ...defaults(reducedMotion) }; applySettings({}); ui.renderSettings(settings); break;
    case 'escape':
      if (screen === 'pause') resume();
      else if (['settings', 'howto', 'scores'].includes(screen)) ui.back();
      break;
  }
}

function applySettings(patch) {
  if (patch.rebind) { settings.keys = rebind(settings.keys, ...patch.rebind); ui.renderSettings(settings); }
  else Object.assign(settings, patch);
  keys = keyMap(settings.keys);
  saveSettings(settings);
  engine.applySettings({ music: settings.music, sfx: settings.sfx, muted: settings.muted || P.mute });
  renderer.ghostOn = settings.ghost; renderer.shakeOn = settings.shake;
  if (renderer.reduced !== settings.reduced) { renderer.reduced = settings.reduced; }
  if (game) { game.das = settings.das; game.arr = settings.arr; game.sdf = settings.sdf; }
}

// ------------------------------------------------------------------------------------------------
// input
addEventListener('keydown', e => {
  if (ui.key(e)) return;
  if (state !== 'playing' || !game) return;
  const action = keys.get(e.code);
  if (!action) return;
  e.preventDefault();
  if (action === 'pause') { pause(); return; }
  if (e.repeat || bot) return;
  game.press(action);
});
addEventListener('keyup', e => {
  const action = keys.get(e.code);
  if (action && game) game.release(action);
});
addEventListener('blur', () => { if (state === 'playing' && !bot) pause(); });
addEventListener('resize', () => renderer.layout());

// Gamepad (standard mapping), edge-detected each frame.
const PAD = { 14: 'left', 15: 'right', 13: 'soft', 12: 'hard', 0: 'cw', 1: 'ccw', 2: 'hold', 4: 'hold', 3: 'r180', 5: 'hard', 9: 'pause' };
let padPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find(p => p && p.connected);
  if (!gp) return;
  const now = {};
  for (const [i, action] of Object.entries(PAD)) now[i] = !!gp.buttons[i]?.pressed;
  for (const [i, action] of Object.entries(PAD)) {
    if (now[i] && !padPrev[i]) {
      startAudio();
      if (action === 'pause') { if (state === 'playing') pause(); else if (state === 'paused') resume(); continue; }
      if (state === 'playing' && game && !bot) game.press(action);
      else if (ui.current) ui.key({ code: action === 'soft' ? 'ArrowDown' : action === 'hard' ? 'ArrowUp' : action === 'cw' ? 'Enter' : action === 'ccw' ? 'Escape' : '', preventDefault() {} });
    } else if (!now[i] && padPrev[i] && game) game.release(action);
  }
  padPrev = now;
}

// ------------------------------------------------------------------------------------------------
// main loop
let last = performance.now();
let titleTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pollGamepad();
  for (const ev of engine.drainVisual()) renderer.onAudio(ev);

  let view;
  if (game && (state === 'playing' || state === 'paused' || state === 'over' || state === 'finale')) {
    if (state === 'playing') {
      if (bot) bot.update(dt * 1000);
      game.update(dt * 1000);
    }
    const j = game.journey;
    // past mid-stage, quietly build the next stage's scene + reverb during an idle moment
    if (state === 'playing' && j.progress > 0.5 && j.mode !== 'space' && !prepPending && prepFor !== `${runSeed}:${stageIdx}`) {
      prepPending = true;
      const nextIdx = (stageIdx + 1) % STAGES.length;
      const ric = window.requestIdleCallback ?? (f => setTimeout(f, 200));
      ric(() => {
        prepPending = false; prepFor = `${runSeed}:${stageIdx}`;
        if (game && nextIdx !== stageIdx) { renderer.prepare(STAGES[nextIdx], runSeed + nextIdx); engine.prepare(STAGES[nextIdx].music); }
      }, { timeout: 2000 });
    }
    const target = P.bloom ?? j.progress;
    bloom = ease(bloom, target, 1.2, dt);
    const h = game.matrix.stackHeight();
    danger = ease(danger, clamp((h - 14) / 5), 4, dt);
    hot = Math.max(0, hot - dt * 0.05);
    const want = 0.1 + 0.62 * j.progress + 0.07 * Math.min(4, Math.max(0, game.combo)) + 0.25 * hot + Math.min(0.1, game.level * 0.008);
    intensity = ease(intensity, P.bloom !== null ? Math.max(want, P.bloom) : want, 2, dt);
    engine.setIntensity(window.__forceInt ?? intensity);
    engine.setDanger(danger > 0.05 ? danger : 0);
    view = { game, showField: true, bloom, intensity, danger, beat: engine.beatNow(), showFps: P.fps, hideCard: state !== 'playing' };
  } else {
    // title: the Ocean breathes; light rises into it now and then
    bloom = ease(bloom, P.bloom ?? 0.7, 0.5, dt);
    titleTimer += dt;
    if (titleTimer > 1.6) {
      titleTimer = 0;
      for (let i = 0; i < 3; i++) renderer.seekParticle(renderer.W * (0.35 + Math.random() * 0.3), renderer.H * (0.55 + Math.random() * 0.1), ['#bff6ff', '#8fe3ff', '#d6c4ff'][i]);
    }
    view = { game: null, showField: false, bloom, intensity: 0.5, danger: 0, beat: engine.beatNow(), showFps: P.fps };
  }
  renderer.frame(dt, view);
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------------------------------------
// boot
renderer.setStage(STAGES[0], { fade: 0, seed: 3 });
ui.setAccent(STAGES[0].theme.accent, STAGES[0].theme.accent2);
if (P.skipTitle) {
  startGame(P.mode, P.stage ?? 0);
} else {
  ui.show('title');
}
requestAnimationFrame(frame);

// Debug/test hooks (used by tools/shoot.mjs).
window.__cascade = {
  get game() { return game; }, get state() { return state; }, renderer, engine, STAGES,
  prof() { const p = renderer.prof; const r = p ? { scene: +(p.scene / p.n).toFixed(2), field: +(p.field / p.n).toFixed(2), fx: +(p.fx / p.n).toFixed(2), n: p.n } : null; renderer.prof = null; return r; },
  stats() {
    return { state, stage: STAGES[stageIdx]?.id, lines: game?.lines, score: game?.score, fps: renderer.fps, quality: renderer.quality,
      creatures: renderer.cur?.scene?.creatures, particles: renderer.particles.count, audio: engine.ac?.state, intensity: +intensity.toFixed(2), bloom: +bloom.toFixed(2) };
  },
  // Jump close to the end of the current stage so the next clear transitions.
  nearStageEnd() { if (game) { game.journey.stageLines = game.journey.target - 1; } },
};
