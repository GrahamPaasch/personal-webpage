/**
 * Sample-accurate scheduler for the practice tool.
 *
 * Every click is scheduled at an absolute AudioContext time ("A Tale of Two
 * Clocks" pattern): a polling timer, running in a Worker so background tabs do
 * not throttle it, wakes up every 25 ms and schedules everything that falls in
 * the next lookahead window. The UI never drives the audio; it reads the
 * scheduled events back and draws them when their time arrives.
 *
 * The engine reads the current settings through `getSettings()` on every
 * step, so tempo and volume changes take effect on the next click without a
 * restart. Bar-level choices (beats, subdivision, gap silence) are snapshotted
 * at the start of each bar so a bar is always internally consistent.
 */

import { playClick, playFanfare, type ClickRole } from '@/lib/music/clickSounds';
import { frequencyFromMidi } from '@/lib/music/notes';
import { accentedBeats, beatsPerBar, parseDroneSequence, type PracticeSettings } from '@/lib/music/practiceParams';
import { findPattern, type RhythmPattern } from '@/lib/music/rhythmPatterns';

export type EngineEvent = {
  /** AudioContext time the click sounds (or would have, if silent). */
  time: number;
  /** Bar index since start; count-in bars are negative. */
  bar: number;
  beat: number;
  sub: number;
  beats: number;
  subdivision: number;
  role: ClickRole | 'countin';
  /** True when the gap drill or dropout muted this click. */
  silent: boolean;
  bpm: number;
  secondsPerBeat: number;
};

export type EngineHooks = {
  getSettings: () => PracticeSettings;
  /** Click muted by the user (drone and visuals continue). */
  isMuted: () => boolean;
  /** Called once per bar as the bar is scheduled (bar >= 0 only). */
  onBar?: (bar: number, time: number) => void;
  onStop?: () => void;
};

type BarSnapshot = {
  beats: number;
  subdivision: number;
  accents: Set<number>;
  silent: boolean;
  checkpoint: boolean;
  pattern: RhythmPattern | null;
};

const TICK_MS = 25;
const LOOKAHEAD_VISIBLE = 0.1;
const LOOKAHEAD_HIDDEN = 1.5;
const RECENT_LIMIT = 256;

/** Interval timer that keeps ticking in a background tab (Worker), with a setInterval fallback. */
function createTicker(ms: number, onTick: () => void): () => void {
  if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    try {
      const source = `let id=null;onmessage=(e)=>{if(e.data==='start'){id=setInterval(()=>postMessage(0),${ms});}else if(id!==null){clearInterval(id);id=null;}};`;
      const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = onTick;
      worker.postMessage('start');
      return () => {
        worker.postMessage('stop');
        worker.terminate();
        URL.revokeObjectURL(url);
      };
    } catch {
      // Fall through to the main-thread timer.
    }
  }
  const id = setInterval(onTick, ms);
  return () => clearInterval(id);
}

export class ClickEngine {
  readonly ctx: AudioContext;
  private readonly hooks: EngineHooks;
  private readonly master: GainNode;
  private readonly droneGain: GainNode;
  private droneOsc: OscillatorNode | null = null;
  private droneMidi: number | null = null;

  private stopTicker: (() => void) | null = null;
  private nextTime = 0;
  private bar = 0;
  private beat = 0;
  private sub = 0;
  private snap: BarSnapshot | null = null;
  private prevBarSilent = false;
  /** When set, the engine stops instead of scheduling this bar. */
  stopAtBar: number | null = null;

  /** Events scheduled but not yet consumed by the UI. */
  readonly pending: EngineEvent[] = [];
  /** Ring buffer of the latest scheduled events (debugging and tests). */
  readonly recent: EngineEvent[] = [];

  constructor(ctx: AudioContext, hooks: EngineHooks) {
    this.ctx = ctx;
    this.hooks = hooks;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneGain.connect(ctx.destination);
  }

  get running(): boolean {
    return this.stopTicker !== null;
  }

  /** Bar/beat the engine is about to schedule (for the UI's bar counter when idle). */
  get position(): { bar: number; beat: number } {
    return { bar: this.bar, beat: this.beat };
  }

  start() {
    if (this.running) return;
    const s = this.hooks.getSettings();
    this.bar = s.countInBars > 0 ? -s.countInBars : 0;
    this.beat = 0;
    this.sub = 0;
    this.snap = null;
    this.prevBarSilent = false;
    this.stopAtBar = null;
    this.pending.length = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.master.gain.setValueAtTime(s.volume, this.ctx.currentTime);
    this.schedule();
    this.stopTicker = createTicker(TICK_MS, () => this.schedule());
  }

  stop() {
    if (!this.running) return;
    this.stopTicker?.();
    this.stopTicker = null;
    this.pending.length = 0;
    this.hooks.onStop?.();
  }

  /** Applies master volume immediately (clicks already scheduled keep their gain). */
  setMasterVolume(v: number) {
    this.master.gain.setTargetAtTime(Math.max(0.0001, v), this.ctx.currentTime, 0.02);
  }

  fanfare() {
    const s = this.hooks.getSettings();
    playFanfare(this.ctx, this.master, this.ctx.currentTime + 0.02, s.accentVolume * 0.8);
  }

  /** Short beep used by the session plan at block changes. */
  chime() {
    const s = this.hooks.getSettings();
    playClick(this.ctx, this.master, 'bell', 'checkpoint', this.ctx.currentTime + 0.02, s.accentVolume * 0.7);
  }

  private schedule() {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const lookahead = hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD_VISIBLE;
    while (this.running && this.nextTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep();
    }
  }

  private beginBar(s: PracticeSettings, time: number) {
    const beats = beatsPerBar(s.grouping);
    const drillSub = s.drillEnabled ? [1, 2, 3, 4][Math.floor(Math.max(0, this.bar) / s.drillBars) % 4] : s.subdivision;
    const inGapCycle = s.gapEnabled && this.bar >= 0;
    const cycle = s.gapPlayBars + s.gapMuteBars;
    const silent = inGapCycle && this.bar % cycle >= s.gapPlayBars;
    const checkpoint = inGapCycle && s.gapCheckpoint && this.prevBarSilent && !silent;
    this.snap = {
      beats,
      subdivision: this.bar < 0 ? 1 : drillSub,
      accents: s.accentDownbeat ? accentedBeats(s.grouping) : new Set<number>(),
      silent,
      checkpoint,
      pattern: this.bar < 0 ? null : findPattern(s.patternId),
    };
    this.prevBarSilent = silent;

    if (this.bar >= 0) {
      this.hooks.onBar?.(this.bar, time);
      if (!this.running) return;
      const after = this.hooks.getSettings();
      const secondsPerBeat = 60 / after.bpm;
      if (after.poly >= 2 && !silent && !this.hooks.isMuted()) {
        const barDur = secondsPerBeat * beats;
        for (let i = 0; i < after.poly; i += 1) {
          playClick(this.ctx, this.master, after.voice, 'poly', time + (barDur * i) / after.poly, after.polyVolume);
        }
      }
      if (after.droneOn) {
        const seq = parseDroneSequence(after.droneSequence);
        if (seq.length) this.setDroneNote(seq[this.bar % seq.length], after, time);
      }
    }
  }

  private scheduleStep() {
    const t = this.nextTime;
    if (this.sub === 0 && this.beat === 0) {
      if (this.stopAtBar !== null && this.bar >= this.stopAtBar) {
        this.stop();
        return;
      }
      this.beginBar(this.hooks.getSettings(), t);
      if (!this.running) return;
    }
    const s = this.hooks.getSettings();
    const snap = this.snap as BarSnapshot;
    const countIn = this.bar < 0;
    const onBeat = this.sub === 0;
    const downbeat = onBeat && this.beat === 0;
    const secondsPerBeat = 60 / s.bpm;

    const role: ClickRole | 'countin' = countIn ? 'countin' : !onBeat ? 'sub' : snap.accents.has(this.beat) ? 'accent' : 'beat';
    let silent = false;
    if (!countIn) {
      if (snap.silent) silent = true;
      else if (s.dropout > 0 && !downbeat && Math.random() < s.dropout) silent = true;
    }

    if (!silent && !this.hooks.isMuted()) {
      if (downbeat && snap.checkpoint) {
        playClick(this.ctx, this.master, s.voice, 'checkpoint', t, s.accentVolume);
      } else {
        const gain = role === 'accent' ? s.accentVolume : role === 'sub' ? s.subVolume : s.beatVolume;
        playClick(this.ctx, this.master, s.voice, role === 'countin' ? 'beat' : role, t, gain);
      }
      if (onBeat && snap.pattern) {
        const p = snap.pattern;
        const globalBeat = this.bar * snap.beats + this.beat;
        const pos = ((globalBeat % p.beats) + p.beats) % p.beats;
        for (const onset of p.onsets) {
          if (onset >= pos && onset < pos + 1) {
            playClick(this.ctx, this.master, s.voice, 'pattern', t + (onset - pos) * secondsPerBeat, s.patternVolume);
          }
        }
      }
    }

    const event: EngineEvent = {
      time: t,
      bar: this.bar,
      beat: this.beat,
      sub: this.sub,
      beats: snap.beats,
      subdivision: snap.subdivision,
      role,
      silent,
      bpm: s.bpm,
      secondsPerBeat,
    };
    this.pending.push(event);
    this.recent.push(event);
    if (this.recent.length > RECENT_LIMIT) this.recent.splice(0, this.recent.length - RECENT_LIMIT);

    const base = secondsPerBeat / snap.subdivision;
    const swing = snap.subdivision === 2 ? s.swing : 0;
    const dur = swing > 0 ? (this.sub === 0 ? base * (1 + swing) : base * (1 - swing)) : base;
    this.nextTime = t + dur;

    this.sub += 1;
    if (this.sub >= snap.subdivision) {
      this.sub = 0;
      this.beat += 1;
      if (this.beat >= snap.beats) {
        this.beat = 0;
        this.bar += 1;
      }
    }
  }

  /** Events whose time has passed, removed from the pending queue. */
  drainDue(now: number): EngineEvent[] {
    let n = 0;
    while (n < this.pending.length && this.pending[n].time <= now) n += 1;
    return n ? this.pending.splice(0, n) : [];
  }

  // ---- Drone -------------------------------------------------------------

  private setDroneNote(midi: number, s: PracticeSettings, time: number) {
    if (!this.droneOsc) return;
    if (this.droneMidi === midi) return;
    this.droneMidi = midi;
    this.droneOsc.frequency.setTargetAtTime(frequencyFromMidi(midi, s.a4), Math.max(time, this.ctx.currentTime), 0.02);
  }

  /** Brings the drone in line with the settings; safe to call on every change. */
  syncDrone() {
    const s = this.hooks.getSettings();
    const now = this.ctx.currentTime;
    if (!s.droneOn || s.droneVolume <= 0) {
      if (this.droneOsc) {
        const osc = this.droneOsc;
        this.droneOsc = null;
        this.droneMidi = null;
        this.droneGain.gain.setTargetAtTime(0.0001, now, 0.04);
        try {
          osc.stop(now + 0.3);
        } catch {
          // Already stopped.
        }
      }
      return;
    }
    const seq = parseDroneSequence(s.droneSequence);
    const midi = seq.length ? seq[Math.max(0, this.running ? this.bar : 0) % seq.length] : s.droneMidi;
    if (!this.droneOsc) {
      const osc = this.ctx.createOscillator();
      osc.type = s.droneWave;
      osc.frequency.setValueAtTime(frequencyFromMidi(midi, s.a4), now);
      osc.connect(this.droneGain);
      osc.start(now);
      this.droneOsc = osc;
      this.droneMidi = midi;
      this.droneGain.gain.setValueAtTime(0.0001, now);
    } else {
      this.droneOsc.type = s.droneWave;
      this.droneMidi = midi;
      this.droneOsc.frequency.setTargetAtTime(frequencyFromMidi(midi, s.a4), now, 0.02);
    }
    this.droneGain.gain.setTargetAtTime(s.droneVolume, now, 0.04);
  }

  get droneActive(): boolean {
    return this.droneOsc !== null;
  }

  dispose() {
    this.stop();
    if (this.droneOsc) {
      try {
        this.droneOsc.stop();
      } catch {
        // ignore
      }
      this.droneOsc = null;
    }
    try {
      this.master.disconnect();
      this.droneGain.disconnect();
    } catch {
      // ignore
    }
  }
}
