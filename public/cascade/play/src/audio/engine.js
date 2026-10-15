// The music engine: lookahead scheduler, stage players with intensity layering, tension filter,
// stage crossfades, and the player-as-instrument (quantized, in-key action sounds).
import { LOOKAHEAD, TICK_MS, stepDuration, quantizeTime, slotOf } from './clock.js';
import { buildArrangement, partLevel } from './generators.js';
import { PADS, VOICES, DRUMS, IMPACTS, play, cymbalSwell, riser, reverseSwell, tick, shimmer, blip } from './instruments.js';
import { moveNote, rotateNote, lockNote, stabNotes, flourish } from './playerNotes.js';
import { StageFx, getImpulse } from './fx.js';
import { chordTonesInRange } from './theory.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// One stage's arrangement running on its own tempo grid.
class StagePlayer {
  constructor(engine, music, seed, startTime) {
    this.engine = engine;
    const ac = engine.ac;
    this.music = music;
    this.arr = buildArrangement(music, seed);
    this.M = this.arr.M;
    this.stepDur = stepDuration(music.bpm);
    this.gridTime = startTime;
    this.nextStep = 0;
    this.stopStep = Infinity;
    this.fx = new StageFx(ac, engine.musicBus, { reverb: music.reverb, delay: music.delay, bpm: music.bpm, seed });
    this.sfxFx = new StageFx(ac, engine.sfxBus, { reverb: { ...music.reverb, wet: music.reverb.wet * 0.8 }, delay: { ...music.delay, wet: music.delay.wet * 0.8 }, bpm: music.bpm, seed: seed + 1 });
    this.parts = this.arr.parts.map(p => {
      const g = ac.createGain();
      g.gain.value = partLevel(p.threshold, engine.intensity) * p.gain;
      g.connect(this.fx.input);
      return { ...p, out: g, level: g.gain.value };
    });
    this.barCache = new Map();
    this.drumIntensity = engine.intensity;
  }
  get bpm() { return this.music.bpm; }
  stepTime(step) {
    let t = this.gridTime + step * this.stepDur;
    if (this.music.swing && step % 2 === 1) t += this.stepDur * this.music.swing;
    return t;
  }
  chordAtTime(t) {
    const step = Math.max(0, Math.floor((t - this.gridTime) / this.stepDur + 1e-6));
    const bar = Math.floor(step / 16);
    return this.M.chords[bar % this.M.chords.length];
  }
  setIntensity(x, t) {
    for (const p of this.parts) {
      const target = partLevel(p.threshold, x) * p.gain;
      if (Math.abs(target - p.level) > 0.002) { p.out.gain.setTargetAtTime(target, t, 0.9); p.level = target; }
    }
    this.drumIntensity = x;
  }
  schedule(until) {
    const ac = this.engine.ac;
    while (this.stepTime(this.nextStep) < until && this.nextStep < this.stopStep) {
      const step = this.nextStep++;
      const t = this.stepTime(step);
      if (t < ac.currentTime - 0.05) continue; // skipped (tab was asleep)
      const bar = Math.floor(step / 16), s = step % 16;
      if (s === 0) this.engine.queueVisual({ time: t, kind: 'bar', bar });
      if (s % 4 === 0) this.engine.queueVisual({ time: t, kind: 'beat', beat: step / 4 });
      for (const p of this.parts) {
        if (p.level < 0.001 && p.threshold > 0) continue; // silent layer: skip synthesis entirely
        const evs = this.barEvents(p, bar);
        for (const e of evs) {
          if (Math.floor(e.step) !== s) continue;
          const et = t + (e.step - s) * this.stepDur;
          const dur = e.dur * this.stepDur;
          if (p.role === 'pad') PADS[p.inst](ac, p.out, et, e.notes, dur, e.vel);
          else if (p.role === 'drums') {
            const fn = DRUMS[e.voice] ?? DRUMS.hat;
            fn(ac, p.out, et, e.vel);
            if (e.voice === 'kick' || e.voice === 'doum') {
              this.engine.queueVisual({ time: et, kind: 'kick' });
              if (this.music.duck) this.duck(et);
            }
            if (e.voice === 'snare' || e.voice === 'clap' || e.voice === 'tek') this.engine.queueVisual({ time: et, kind: 'snare' });
          } else {
            play(p.inst, ac, p.out, et, e.midi, dur, e.vel);
            if (p.role === 'lead' || p.role === 'arp') this.engine.queueVisual({ time: et, kind: p.role, midi: e.midi });
          }
        }
      }
    }
  }
  barEvents(p, bar) {
    const key = `${p.role}|${bar}`;
    let ev = this.barCache.get(key);
    if (!ev) {
      ev = p.gen.bar(bar, this.drumIntensity);
      this.barCache.set(key, ev);
      if (this.barCache.size > 64) this.barCache.delete(this.barCache.keys().next().value);
    }
    return ev;
  }
  duck(t) {
    const pad = this.parts.find(p => p.role === 'pad');
    if (!pad) return;
    const g = pad.out.gain;
    g.setValueAtTime(pad.level * 0.45, t);
    g.setTargetAtTime(pad.level, t + 0.02, 0.09);
  }
  // Stop scheduling at the bar boundary at/after time t and fade out.
  release(t, fade) {
    this.stopStep = Math.ceil((t - this.gridTime) / this.stepDur / 16) * 16 + 32;
    this.fx.fadeOut(t, fade);
    this.sfxFx.fadeOut(t, fade);
    setTimeout(() => { this.fx.dispose(); this.sfxFx.dispose(); }, (fade + 8) * 1000);
  }
  nextBoundary(after, steps = 16) {
    const step = Math.ceil((after - this.gridTime) / this.stepDur / steps - 1e-6) * steps;
    return this.gridTime + step * this.stepDur;
  }
}

export class AudioEngine {
  constructor() {
    this.ac = null;
    this.intensity = 0;
    this.danger = 0;
    this.visualQueue = [];
    this.player = null;
    this.old = [];
    this.settings = { music: 0.8, sfx: 0.8, muted: false };
    this.lastSlot = new Map();
    this.paused = false;
  }
  get ready() { return !!this.ac; }

  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return this.ac; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ac = this.ac = new AC({ latencyHint: 'interactive' });
    // master chain: (music → tension LP → music vol) + (sfx → sfx vol) → glue comp → limiter → out
    this.master = ac.createGain(); this.master.gain.value = this.settings.muted ? 0 : 0.9;
    const glue = ac.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 12; glue.ratio.value = 2.5; glue.attack.value = 0.02; glue.release.value = 0.25;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;
    this.master.connect(glue); glue.connect(limiter); limiter.connect(ac.destination);
    this.analyser = ac.createAnalyser(); this.analyser.fftSize = 2048;
    limiter.connect(this.analyser);
    this.limiter = limiter;
    this.musicVol = ac.createGain(); this.musicVol.gain.value = this.settings.music;
    this.tension = ac.createBiquadFilter(); this.tension.type = 'lowpass'; this.tension.frequency.value = 18000; this.tension.Q.value = 1.2;
    this.musicBus = ac.createGain();
    this.musicBus.connect(this.tension); this.tension.connect(this.musicVol); this.musicVol.connect(this.master);
    this.sfxVol = ac.createGain(); this.sfxVol.gain.value = this.settings.sfx;
    this.sfxBus = ac.createGain(); this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.sfxVol); this.sfxVol.connect(this.master);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    document.addEventListener('visibilitychange', () => this.tick());
    return ac;
  }
  resume() { if (this.ac && this.ac.state !== 'running') this.ac.resume(); }

  applySettings({ music, sfx, muted }) {
    if (music !== undefined) this.settings.music = music;
    if (sfx !== undefined) this.settings.sfx = sfx;
    if (muted !== undefined) this.settings.muted = muted;
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.musicVol.gain.setTargetAtTime(this.paused ? this.settings.music * 0.35 : this.settings.music, t, 0.05);
    this.sfxVol.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 0.9, t, 0.05);
  }

  // Begin (or crossfade to) a stage's music. First call starts immediately; later calls switch on the
  // next downbeat with a riser + the old stage fading over `fade` seconds.
  setStage(music, seed, { fade = 2.5, immediate = false } = {}) {
    if (!this.ac) return;
    const ac = this.ac;
    const now = ac.currentTime;
    let start = now + 0.12;
    if (this.player && !immediate) {
      start = this.player.nextBoundary(now + 0.35, 16);
      if (start - now > 2.6) start = this.player.nextBoundary(now + 0.35, 8); // slow tempi: half-bar is fine
      riser(ac, this.musicBus, now, Math.max(0.3, start - now), 0.18);
      cymbalSwell(ac, this.musicBus, start, 2.2, 0.5, false);
      this.player.release(start, fade);
      this.old.push(this.player);
    } else if (this.player) {
      this.player.release(now, 0.4);
      this.old.push(this.player);
    }
    const p = new StagePlayer(this, music, seed, start);
    p.fx.out.gain.setValueAtTime(0, now);
    p.fx.fadeIn(start, immediate ? 1.2 : 1.0);
    p.sfxFx.fadeIn(now, 0.05);
    this.player = p;
    this.lastSlot.clear();
    this.tick();
    return start;
  }

  tick() {
    if (!this.ac) return;
    const until = this.ac.currentTime + LOOKAHEAD;
    if (this.player) this.player.schedule(until);
    for (const o of this.old) o.schedule(until);
    this.old = this.old.filter(o => o.stepTime(o.nextStep) < o.stepTime(o.stopStep) && this.ac.currentTime < o.stepTime(o.stopStep) + 1);
  }

  // Warm caches for an upcoming stage (reverb IR) so the switch itself is cheap.
  prepare(music) { if (this.ac) getImpulse(this.ac, music.reverb.seconds, music.reverb.decay); }

  setIntensity(x) {
    x = clamp(x, 0, 1);
    if (this.danger > 0.3) x = Math.min(x, 0.45); // the arrangement thins out near top-out
    if (Math.abs(x - this.intensity) < 0.01) return;
    this.intensity = x;
    if (this.player && this.ac) this.player.setIntensity(x, this.ac.currentTime);
  }
  setDanger(d) {
    d = clamp(d, 0, 1);
    if (Math.abs(d - this.danger) < 0.02) return;
    this.danger = d;
    if (!this.ac) return;
    const f = d <= 0 ? 18000 : 700 * Math.pow(18000 / 700, 1 - d);
    this.tension.frequency.setTargetAtTime(f, this.ac.currentTime, 0.4);
    this.tension.Q.setTargetAtTime(1.2 + d * 5, this.ac.currentTime, 0.4);
  }
  setPaused(p) {
    this.paused = p;
    if (!this.ac) return;
    const t = this.ac.currentTime;
    this.musicVol.gain.setTargetAtTime(p ? this.settings.music * 0.35 : this.settings.music, t, 0.15);
    this.tension.frequency.setTargetAtTime(p ? 900 : (this.danger ? 700 * Math.pow(18000 / 700, 1 - this.danger) : 18000), t, 0.2);
  }

  // Output level of the last ~43 ms (for tests and the debug overlay): { rms, peak } in linear units.
  meter() {
    if (!this.analyser) return { rms: 0, peak: 0 };
    const buf = this.meterBuf ??= new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0, peak = 0, bad = 0;
    for (const x of buf) { if (!Number.isFinite(x)) { bad++; continue; } sum += x * x; peak = Math.max(peak, Math.abs(x)); }
    return { rms: Math.sqrt(sum / buf.length), peak, bad };
  }

  queueVisual(e) { this.visualQueue.push(e); }
  // Visual events whose time has arrived (beat, kick, bar, lead notes, player notes).
  drainVisual() {
    if (!this.ac) return [];
    const now = this.ac.currentTime;
    const out = [];
    let keep = 0;
    for (const e of this.visualQueue) { if (e.time <= now) out.push(e); else this.visualQueue[keep++] = e; }
    this.visualQueue.length = keep;
    return out;
  }
  // Beat position for visuals (float beats since the stage grid started).
  beatNow() {
    if (!this.ac || !this.player) return 0;
    return Math.max(0, (this.ac.currentTime - this.player.gridTime) / (this.player.stepDur * 4));
  }

  // ---- player as instrument ----
  q(type, collapse = true) {
    const p = this.player;
    const now = this.ac.currentTime + 0.005;
    const t = quantizeTime(now, p.gridTime, p.stepDur);
    if (collapse) {
      const slot = slotOf(t, p.gridTime, p.stepDur);
      if (this.lastSlot.get(type) === slot) return null; // same type within one 16th collapses
      this.lastSlot.set(type, slot);
    }
    return t;
  }
  player_(name) { return this.player.music.sfx[name]; }

  playerEvent(type, d = {}) {
    if (!this.ac || !this.player || this.ac.state !== 'running') return;
    const ac = this.ac, p = this.player, out = p.sfxFx.input;
    const sfx = p.music.sfx;
    const t = this.q(type, !['clear', 'hold', 'gameover', 'levelup', 'stage'].includes(type));
    if (t === null) return;
    const chord = p.chordAtTime(t);
    const panX = d.x !== undefined ? (d.x - 4.5) / 6 : 0;
    switch (type) {
      case 'move': {
        const m = moveNote(clamp(d.x ?? 4, 0, 9) + 2, chord, [60, 84]);
        play(sfx.note, ac, out, t, m, 0.18, 0.32, { panv: panX });
        this.queueVisual({ time: t, kind: 'pnote', midi: m });
        break;
      }
      case 'rotate': {
        const m = rotateNote(d.rot ?? 0, d.x ?? 4, chord, [64, 84]);
        play(sfx.chord, ac, out, t, m, 0.25, 0.4, { panv: panX });
        if (d.tspinCandidate) shimmer(ac, out, t, chordTonesInRange(chord.melodyPcs, 84, 100).slice(0, 4), 0.35);
        this.queueVisual({ time: t, kind: 'pnote', midi: m });
        break;
      }
      case 'soft': tick(ac, out, t, 0.35, 4200 + (d.y ?? 0) * 60); break;
      case 'hard': {
        const root = lockNote(chord, 31);
        IMPACTS[sfx.impact](ac, out, t, root, 0.9);
        const stab = stabNotes(chord, 60);
        stab.forEach((m, i) => play(sfx.chord, ac, out, t + i * 0.008, m, 0.3, 0.32, { panv: (i - 1.5) * 0.25 }));
        this.queueVisual({ time: t, kind: 'impact' });
        break;
      }
      case 'lock': {
        const root = lockNote(chord, 36);
        IMPACTS[sfx.impact](ac, out, t, root, d.soft ? 0.35 : 0.5);
        this.queueVisual({ time: t, kind: 'lock' });
        break;
      }
      case 'hold': {
        const notes = chordTonesInRange(chord.melodyPcs, 60, 76).slice(0, 3);
        reverseSwell(ac, out, ac.currentTime, notes, 0.32, 0.55);
        break;
      }
      case 'holdfail': blip(ac, out, t, 50, 0.4); break;
      case 'bump': tick(ac, out, t, 0.15, 1800); break;
      case 'clear': {
        const lines = d.lines ?? 0;
        const notes = flourish(lines || 1, Math.max(0, d.combo ?? 0), chord, [64, 84], !!d.tspin);
        const step = p.stepDur;
        notes.forEach(n => play(sfx.flourish, ac, out, t + n.at * step, n.midi, 0.6, n.vel * 0.55, { panv: Math.sin(n.at) * 0.5 }));
        // bass anchor + chord bloom
        play(sfx.chord, ac, out, t, lockNote(chord, 43), 1.2, 0.5);
        if (lines >= 3) cymbalSwell(ac, out, t, 1.6, 0.5, false);
        if (lines >= 4) {
          cymbalSwell(ac, out, t - 0.9 > ac.currentTime ? t - 0.9 : ac.currentTime, 0.9, 0.6, true);
          const pad = PADS[p.parts.find(x => x.role === 'pad')?.inst ?? 'glassPad'];
          pad(ac, out, t, chordTonesInRange(chord.pcs, 60, 79).slice(0, 5), step * 16, 0.6);
        }
        if (d.tspin) shimmer(ac, out, t, chordTonesInRange(chord.melodyPcs, 79, 100).slice(0, 6), 0.6);
        if (d.perfect) notes.forEach(n => play('celesta', ac, out, t + step * 8 + n.at * step, n.midi + 12, 0.5, 0.4));
        this.queueVisual({ time: t, kind: 'clearHit', lines });
        break;
      }
      case 'levelup': play(sfx.flourish, ac, out, t, chordTonesInRange(chord.melodyPcs, 84, 96)[0], 0.8, 0.3); break;
      case 'gameover': {
        // descending, darkening fall through the scale
        const tones = chordTonesInRange(chord.pcs, 48, 76).reverse();
        tones.forEach((m, i) => play(sfx.chord, ac, out, ac.currentTime + 0.05 + i * 0.14, m, 0.9, 0.4 * (1 - i / tones.length)));
        IMPACTS[sfx.impact](ac, out, ac.currentTime + 0.05 + tones.length * 0.14, lockNote(chord, 28), 0.8);
        break;
      }
      case 'menu': play(sfx.note, ac, out, t, moveNote(d.i ?? 3, chord, [64, 84]), 0.2, 0.3); break;
      case 'select': play(sfx.chord, ac, out, t, rotateNote(1, 4, chord, [64, 84]), 0.4, 0.45); break;
    }
  }
}
