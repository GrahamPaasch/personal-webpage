// Per-stage space: generated stereo convolution reverb + tempo-synced feedback delay.

const irCache = new WeakMap();
// Cached per (context, seconds, decay): stage switches and the SFX bus reuse the same buffer.
export function getImpulse(ac, seconds, decay) {
  let m = irCache.get(ac);
  if (!m) { m = new Map(); irCache.set(ac, m); }
  const key = `${seconds}|${decay}`;
  if (!m.has(key)) m.set(key, makeImpulse(ac, seconds, decay, 1));
  return m.get(key);
}

// Exponentially decaying stereo noise IR that darkens over time (air absorption) with a pre-delay.
export function makeImpulse(ac, seconds = 3, decay = 2, seed = 1) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ac.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.018);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = (seed * 9301 + ch * 49297 + 1) % 233280;
    let lp = 0;
    for (let i = pre; i < len; i++) {
      s = (s * 9301 + 49297) % 233280;
      const w = s / 233280 * 2 - 1;
      const x = (i - pre) / (len - pre);
      const k = 0.9 - 0.82 * x; // filter coefficient: bright early, dark late
      lp += (w - lp) * k;
      d[i] = lp * Math.pow(1 - x, decay) * (i - pre < sr * 0.004 ? (i - pre) / (sr * 0.004) : 1);
    }
  }
  return buf;
}

export class StageFx {
  constructor(ac, dest, { reverb = { seconds: 3, decay: 2, wet: 0.3 }, delay = { beats: 0.75, feedback: 0.35, wet: 0.15 }, bpm = 100, seed = 1 }) {
    this.ac = ac;
    this.input = ac.createGain();
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // dry
    this.input.connect(this.out);
    // reverb
    this.verb = ac.createConvolver();
    this.verb.buffer = getImpulse(ac, reverb.seconds, reverb.decay);
    this.verbSend = ac.createGain(); this.verbSend.gain.value = reverb.wet;
    const verbHp = ac.createBiquadFilter(); verbHp.type = 'highpass'; verbHp.frequency.value = 180;
    this.input.connect(this.verbSend); this.verbSend.connect(verbHp); verbHp.connect(this.verb); this.verb.connect(this.out);
    // delay (ping-pong-ish: one side delayed by an extra 16th)
    const beat = 60 / bpm;
    this.delayL = ac.createDelay(4); this.delayL.delayTime.value = beat * delay.beats;
    this.delayR = ac.createDelay(4); this.delayR.delayTime.value = beat * delay.beats + beat / 4;
    this.fb = ac.createGain(); this.fb.gain.value = delay.feedback;
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2800;
    this.delaySend = ac.createGain(); this.delaySend.gain.value = delay.wet;
    const merger = ac.createChannelMerger(2);
    this.input.connect(this.delaySend);
    this.delaySend.connect(this.delayL); this.delaySend.connect(this.delayR);
    this.delayL.connect(dlp); dlp.connect(this.fb); this.fb.connect(this.delayL);
    this.delayL.connect(merger, 0, 0); this.delayR.connect(merger, 0, 1);
    this.delayR.connect(this.verbSend);
    merger.connect(this.out);
  }
  fadeIn(t, secs) { const g = this.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(1, t + secs); }
  fadeOut(t, secs) { const g = this.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(0, t + secs); }
  dispose() { try { this.out.disconnect(); } catch {} }
}
