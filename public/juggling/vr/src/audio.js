/**
 * audio.js: the three practice sounds, synthesised with the Web Audio API (no audio files).
 *
 *   catch    a ball landing in a palm: a soft, low thud.
 *   release  the ball leaving the hand: a short, light brush. A little quieter than the catch by
 *            default.
 *   peak     a short tone at the exact top of each arc. Its pitch follows the height above the
 *            hands, so a 5 sounds higher than a 3 and 531 has a melody.
 *
 * Each sound has its own volume, on/off and solo. Events are scheduled on the audio clock a
 * little ahead of time, so the rhythm is as even as the math, not as even as the frame rate.
 *
 * Each sound type plays through its own gain node (its "bus"). Volume, mute and solo only set
 * that gain, so a change is heard at once, also on sounds that are already scheduled, and nothing
 * ever has to be scheduled a second time.
 *
 * Slow motion never changes the sounds themselves, only how far apart they are.
 */

export const SOUND_TYPES = ['catch', 'release', 'peak'];

export const DEFAULT_SOUND = {
  catch: { on: true, volume: 0.8, solo: false },
  release: { on: true, volume: 0.65, solo: false }, // "a little quieter than catch": about 4 dB
  peak: { on: true, volume: 0.45, solo: false },
};

/**
 * Loudness of each sound with its slider at 100%. Sound design, not physics.
 *
 * Catch and release are matched: at equal slider positions they measure equally loud, A-weighted
 * (the release level was set from offline renders, see README "Sound levels"). So the sliders
 * mean the same thing, and the default 65% against 80% puts the release about 4 dB under the
 * catch as the ear and a small speaker hear it. A plain peak or RMS meter reads it 9 to 16 dB
 * under, because most of the catch's energy is a thump below 200 Hz.
 */
export const BASE_LEVEL = { catch: 0.9, release: 0.78, peak: 0.32 };

/** A sound whose start is nearer than this (seconds) can no longer be taken back. */
const CANCEL_MARGIN = 0.005;

/**
 * How long after its start a sound stays on the list of pending sounds (seconds). Longer than any
 * output latency sounds are advanced by (main.js allows 0.15 s).
 */
const KEEP_AFTER_START = 0.3;

/**
 * Pitch of the peak tone for a throw that rises `height` metres above the hands.
 * A sound-design choice, not physics: 220 Hz plus 440 Hz per square-root metre. Flight time
 * goes with the square root of height, so equal steps in throw value are roughly equal steps
 * in pitch. Examples: 0.19 m -> 412 Hz, 0.95 m -> 650 Hz, 1.70 m -> 793 Hz.
 */
export function peakFrequency(height) {
  return 220 + 440 * Math.sqrt(Math.max(height, 0));
}

/** The slider position that counts for one sound type, given mute and solo (0 = silent). */
export function effectiveVolume(settings, type) {
  const anySolo = SOUND_TYPES.some((t) => settings[t].solo);
  const s = settings[type];
  if (anySolo) return s.solo ? s.volume : 0;
  return s.on ? s.volume : 0;
}

/** Slider position to gain. Squared, so that the slider feels even to the ear. */
export function busGain(settings, type) {
  const v = effectiveVolume(settings, type);
  return v * v;
}

/**
 * Follows a value that is constant apart from slow drift, through noisy samples: quickly for the
 * first second and a half, then with a 1.5 s time constant. A sample further than `jump` from the
 * estimate is ignored unless it persists for three frames, when it is adopted at once (the device
 * really changed, or audio was suspended).
 */
export class SlowFollower {
  constructor() {
    this.value = null;
    this.since = 0;
    this.stamp = 0;
    this.misses = 0;
  }

  follow(sample, nowMs, jump) {
    if (this.value === null) {
      this.value = sample;
      this.since = nowMs;
      this.stamp = nowMs;
      return this.value;
    }
    if (nowMs === this.stamp) return this.value; // one update per frame
    const dt = Math.min(Math.max((nowMs - this.stamp) / 1000, 0), 0.25);
    this.stamp = nowMs;
    if (Math.abs(sample - this.value) > jump) {
      if (++this.misses >= 3) {
        this.value = sample;
        this.since = nowMs;
        this.misses = 0;
      }
      return this.value;
    }
    this.misses = 0;
    const tau = nowMs - this.since < 1500 ? 0.08 : 1.5;
    this.value += (sample - this.value) * (1 - Math.exp(-dt / tau));
    return this.value;
  }
}

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bus = null; // one gain node per sound type: its volume, mute and solo
    this.noise = null;
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SOUND));
    this.pending = [];
    this.played = { catch: 0, release: 0, peak: 0 }; // counters, handy for tests
    this.lastPeakHz = 0;
    this.renderClock = new SlowFollower();
    this.speakerClock = new SlowFollower();
    this.latency = null; // seconds, as last estimated by timeFor()
    this.clock = ''; // which latency source timeFor() last used, for diagnostics
  }

  /**
   * Browsers only start audio after a tap, click or key press: call this from one. Before the
   * page has had a real gesture it does nothing (making the audio context then would only earn a
   * console warning and a context that stays suspended).
   */
  unlock() {
    try {
      const activation = typeof navigator !== 'undefined' ? navigator.userActivation : null;
      if (activation && !activation.hasBeenActive) return false;
      if (!this.ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return false;
        this.attach(new Ctor({ latencyHint: 'interactive' }), { compressor: true });
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch (err) {
      console.warn('Audio is not available:', err);
      return false;
    }
  }

  /**
   * Build the fixed part of the graph on an audio context: one bus per sound type into a master
   * gain, and (for live playback) a gentle limiter. unlock() calls this; tests pass their own
   * context.
   */
  attach(ctx, options) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    if (options && options.compressor) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.12;
      this.master.connect(comp);
      comp.connect(ctx.destination);
    } else {
      this.master.connect(ctx.destination);
    }
    this.bus = {};
    for (const type of SOUND_TYPES) {
      const g = ctx.createGain();
      g.gain.value = busGain(this.settings, type);
      g.connect(this.master);
      this.bus[type] = g;
    }
    this.noise = this.makeNoise();
    this.pending = [];
  }

  /**
   * Call after changing this.settings (volume, mute, solo). Sets the three bus gains; sounds that
   * are already scheduled follow, because they play through the same bus. Nothing is rescheduled.
   */
  applySettings() {
    if (!this.ctx || !this.bus) return;
    const now = this.ctx.currentTime;
    for (const type of SOUND_TYPES) {
      const gain = this.bus[type].gain;
      const target = busGain(this.settings, type);
      if (gain.setTargetAtTime) {
        if (gain.cancelScheduledValues) gain.cancelScheduledValues(now);
        gain.setTargetAtTime(target, now, 0.008); // a few milliseconds of glide: no click
      } else {
        gain.value = target;
      }
    }
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /**
   * The audio-clock time at which to schedule a sound so that it is heard at page time `perfMs`
   * (a performance.now() value). `nowMs` is the page time of the current frame.
   *
   * Evenness comes first. ctx.currentTime only advances in blocks (3 to 20 ms depending on the
   * device), so "currentTime + delay" would put that much jitter on every catch. Instead the
   * offset between the page clock and the audio clock is followed slowly: the two clocks tick at
   * almost the same rate, so the offset is all but constant and a slow follower is steady.
   *
   * Then sync. Sound leaves the speaker later than it is rendered. That latency is measured from
   * getOutputTimestamp() where the browser provides a believable one (it pairs an audio-clock
   * time with the page time at which that sample reaches the speaker), and otherwise taken from
   * outputLatency + baseLatency. Sounds are scheduled earlier by that much, up to `maxAdvance`
   * seconds: a sound cannot be scheduled in the past, so latency beyond the caller's look-ahead
   * is heard as a constant delay, never as unevenness.
   */
  timeFor(perfMs, nowMs, maxAdvance) {
    const ctx = this.ctx;
    const room = Math.max(maxAdvance || 0, 0);
    const now = nowMs / 1000;

    // Offset to the render clock (currentTime), smoothed.
    const render = this.renderClock.follow(ctx.currentTime - now, nowMs, 0.1);

    // Offset to the speaker clock, when the browser's output timestamp is usable.
    let latency = Math.max((ctx.outputLatency || 0) + (ctx.baseLatency || 0), 0);
    this.clock = 'currentTime';
    const stamp = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (stamp && stamp.performanceTime > 0 && nowMs - stamp.performanceTime < 250) {
      const pair = stamp.contextTime - stamp.performanceTime / 1000;
      const implied = render - pair; // the latency this stamp implies
      // Just after start-up browsers return stale or zero stamps: ignore anything implausible.
      if (implied > -0.02 && implied < 0.5) {
        latency = Math.max(render - this.speakerClock.follow(pair, nowMs, 0.03), 0);
        this.clock = 'output timestamp';
      }
    }
    this.latency = latency;
    return perfMs / 1000 + render - Math.min(latency, room);
  }

  makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /**
   * Schedule one sound. `when` is on the audio clock (seconds); `pan` is -1 (left) to 1 (right);
   * `height` is the peak height in metres (peak tone only); `simTime` is the simulation time of
   * the event, which cancelPending() reports back for sounds it can no longer take back.
   * Returns true if a sound was scheduled (false when audio is off or this type is silent now).
   */
  play(type, when, pan, height, simTime) {
    if (!this.running || !Number.isFinite(when)) return false;
    if (effectiveVolume(this.settings, type) <= 0) return false;
    const ctx = this.ctx;
    const t = Math.max(when, ctx.currentTime + 0.001);
    const level = BASE_LEVEL[type]; // the bus applies the volume

    const out = ctx.createGain();
    out.gain.value = 1;
    let tail = out;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.min(Math.max(pan || 0, -1), 1);
      out.connect(p);
      tail = p;
    }
    tail.connect(this.bus[type]);

    const sources = [];
    let end = t + 0.3;

    if (type === 'catch') {
      // Skin and beanbag: low-passed noise for the slap, a falling sine for the weight.
      const slap = this.noiseBurst(t, 0.085);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 950;
      lp.Q.value = 0.7;
      const g = this.envelope(t, level, 0.002, 0.08);
      slap.connect(lp);
      lp.connect(g);
      g.connect(out);

      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(150, t);
      thump.frequency.exponentialRampToValueAtTime(70, t + 0.07);
      const tg = this.envelope(t, level * 0.8, 0.002, 0.1);
      thump.connect(tg);
      tg.connect(out);
      thump.start(t);
      thump.stop(t + 0.14);
      sources.push(slap, thump);
      end = t + 0.16;
    } else if (type === 'release') {
      // The ball leaving the fingers: a short, airy band of noise.
      const brush = this.noiseBurst(t, 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 1.1;
      const g = this.envelope(t, level, 0.004, 0.04);
      brush.connect(bp);
      bp.connect(g);
      g.connect(out);
      sources.push(brush);
      end = t + 0.08;
    } else {
      const hz = peakFrequency(height || 0);
      this.lastPeakHz = hz;
      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = hz;
      const over = ctx.createOscillator(); // a quiet octave so small speakers carry low notes
      over.type = 'sine';
      over.frequency.value = hz * 2;
      const og = ctx.createGain();
      og.gain.value = 0.22;
      const g = this.envelope(t, level, 0.004, 0.2);
      tone.connect(g);
      over.connect(og);
      og.connect(g);
      g.connect(out);
      tone.start(t);
      over.start(t);
      tone.stop(t + 0.26);
      over.stop(t + 0.26);
      sources.push(tone, over);
      end = t + 0.28;
    }

    this.played[type]++;
    this.pending.push({ type, when: t, end, sim: Number.isFinite(simTime) ? simTime : -Infinity, sources, out, cancelled: false });
    // Forget old sounds so the list stays short. A sound is kept for a while after it has ended:
    // scheduled early by the output latency, its moment in the simulation can still be ahead,
    // and cancelPending() has to know about it until then.
    if (this.pending.length > 64) {
      const now = ctx.currentTime;
      this.pending = this.pending.filter((p) => Math.max(p.end, p.when + KEEP_AFTER_START) > now);
    }
    return true;
  }

  noiseBurst(t, duration) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const offset = Math.random() * (this.noise.duration - duration - 0.01);
    src.start(t, offset, duration + 0.02);
    return src;
  }

  /** A gain node that jumps up at t and dies away: attack then exponential decay. */
  envelope(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /**
   * Drop sounds that were scheduled but have not started (the pattern or the speed just changed).
   *
   * Sounds are handed to the audio clock early, by the output latency, so some of them have
   * already started (or are about to) although their moment in the simulation is still ahead.
   * Those cannot be taken back. Returns the simulation time of the latest such sound (or
   * -Infinity): the caller must not schedule anything at or before that time again, or it would
   * be heard twice.
   */
  cancelPending() {
    let kept = -Infinity;
    if (!this.ctx) return kept;
    const now = this.ctx.currentTime;
    for (const p of this.pending) {
      if (p.when > now + CANCEL_MARGIN) {
        p.cancelled = true;
        try {
          p.out.disconnect();
          for (const s of p.sources) s.stop();
        } catch (err) {
          // already stopped
        }
      } else if (p.sim > kept) {
        kept = p.sim; // started (or as good as): it may even have ended, with its moment still ahead
      }
    }
    this.pending = [];
    return kept;
  }
}
