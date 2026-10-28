/**
 * Synthesized click voices for the practice tool. Every voice is a short
 * envelope on oscillators or filtered noise, scheduled at an exact
 * AudioContext time, so no sample files are needed.
 */

import type { ClickVoice } from '@/lib/music/practiceParams';

const noiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 0.1);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

function envelope(ctx: AudioContext, time: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  return g;
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  time: number,
  opts: { type: OscillatorType; freq: number; endFreq?: number; gain: number; decay: number },
) {
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, time);
  if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, time + opts.decay * 0.6);
  const g = envelope(ctx, time, opts.gain, opts.decay);
  osc.connect(g);
  g.connect(dest);
  osc.start(time);
  osc.stop(time + opts.decay + 0.01);
}

export type ClickRole = 'accent' | 'beat' | 'sub' | 'pattern' | 'poly' | 'checkpoint';

/**
 * Plays one click. `gain` is the final linear gain (0..1); the role picks the
 * pitch so accents, cross-rhythms and checkpoints are told apart by ear.
 */
export function playClick(ctx: AudioContext, dest: AudioNode, voice: ClickVoice, role: ClickRole, time: number, gain: number) {
  if (gain <= 0.0005) return;
  const pitchMul = role === 'accent' ? 1.5 : role === 'sub' ? 0.72 : role === 'pattern' ? 1.2 : role === 'poly' ? 0.6 : 1;

  if (role === 'checkpoint') {
    tone(ctx, dest, time, { type: 'sine', freq: 1760, gain, decay: 0.25 });
    tone(ctx, dest, time, { type: 'sine', freq: 2640, gain: gain * 0.4, decay: 0.18 });
    return;
  }

  switch (voice) {
    case 'click':
      tone(ctx, dest, time, { type: 'square', freq: 1000 * pitchMul, gain, decay: 0.045 });
      return;
    case 'wood':
      tone(ctx, dest, time, { type: 'sine', freq: 900 * pitchMul, endFreq: 380 * pitchMul, gain: gain * 1.3, decay: 0.06 });
      return;
    case 'beep':
      tone(ctx, dest, time, { type: 'sine', freq: 880 * pitchMul, gain: gain * 1.2, decay: 0.07 });
      return;
    case 'bell':
      tone(ctx, dest, time, { type: 'sine', freq: 1200 * pitchMul, gain, decay: 0.28 });
      tone(ctx, dest, time, { type: 'sine', freq: 2400 * pitchMul, gain: gain * 0.35, decay: 0.16 });
      return;
    case 'tick': {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3200 * pitchMul, time);
      filter.Q.setValueAtTime(2.5, time);
      const g = envelope(ctx, time, gain * 1.6, 0.03);
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      src.start(time);
      src.stop(time + 0.05);
      return;
    }
    default:
      return;
  }
}

/** Short rising three-note figure for "target reached" and plan transitions. */
export function playFanfare(ctx: AudioContext, dest: AudioNode, time: number, gain: number) {
  const notes = [880, 1108.73, 1318.51];
  notes.forEach((freq, i) => tone(ctx, dest, time + i * 0.11, { type: 'triangle', freq, gain, decay: 0.22 }));
}
