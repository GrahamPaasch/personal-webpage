/**
 * Drives ClickEngine against a fake AudioContext so the scheduling maths can
 * be checked without a browser: every click must land exactly 60/bpm/sub
 * seconds after the previous one (sample accuracy means the times are exact
 * floating-point sums on the audio clock, not timer callbacks).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClickEngine } from '@/lib/music/clickEngine';
import { DEFAULT_SETTINGS, normalizeSettings, type PracticeSettings } from '@/lib/music/practiceParams';

class FakeParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = 'sine';
  buffer: unknown = null;
  connect() {
    return this;
  }
  disconnect() {}
  start() {}
  stop() {}
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  createGain() {
    return new FakeNode();
  }
  createOscillator() {
    return new FakeNode();
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  createBufferSource() {
    return new FakeNode();
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(4800) };
  }
}

function makeEngine(partial: Partial<PracticeSettings>, onBar?: (bar: number) => void) {
  const ctx = new FakeAudioContext();
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...partial });
  const engine = new ClickEngine(ctx as unknown as AudioContext, {
    getSettings: () => settings,
    isMuted: () => false,
    onBar,
  });
  return { ctx, engine, settings };
}

/** Advances the fake clock and pumps the engine's interval timer. */
function run(ctx: FakeAudioContext, seconds: number) {
  const stepSec = 0.025;
  for (let t = 0; t < seconds; t += stepSec) {
    ctx.currentTime += stepSec;
    vi.advanceTimersByTime(25);
  }
}

describe('ClickEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // No Worker in node: the engine falls back to setInterval, which fake timers drive.
  });

  it('schedules clicks at exact multiples of the beat length', () => {
    const { ctx, engine } = makeEngine({ bpm: 120, grouping: [4], subdivision: 1 });
    engine.start();
    run(ctx, 4);
    engine.stop();
    const times = engine.recent.map((e) => e.time);
    expect(times.length).toBeGreaterThan(6);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i] - times[i - 1]).toBeCloseTo(0.5, 9);
    }
    expect(engine.recent.map((e) => e.beat).slice(0, 6)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(engine.recent.map((e) => e.role).slice(0, 4)).toEqual(['accent', 'beat', 'beat', 'beat']);
  });

  it('applies swing to eighth notes and keeps the beat length', () => {
    const { ctx, engine } = makeEngine({ bpm: 60, subdivision: 2, swing: 0.2 });
    engine.start();
    run(ctx, 3);
    engine.stop();
    const t = engine.recent.map((e) => e.time);
    expect(t[1] - t[0]).toBeCloseTo(0.6, 9);
    expect(t[2] - t[1]).toBeCloseTo(0.4, 9);
    expect(t[2] - t[0]).toBeCloseTo(1.0, 9);
  });

  it('accents the start of each group and runs the count-in first', () => {
    const { ctx, engine } = makeEngine({ bpm: 240, grouping: [3, 2, 2], countInBars: 1 });
    engine.start();
    run(ctx, 4);
    engine.stop();
    const countIn = engine.recent.filter((e) => e.bar < 0);
    expect(countIn).toHaveLength(7);
    expect(countIn.every((e) => e.role === 'countin')).toBe(true);
    const bar0 = engine.recent.filter((e) => e.bar === 0).map((e) => e.role);
    expect(bar0).toEqual(['accent', 'beat', 'beat', 'accent', 'beat', 'accent', 'beat']);
  });

  it('silences the gap bars and marks them silent for the display', () => {
    const { ctx, engine } = makeEngine({ bpm: 240, grouping: [2], gapEnabled: true, gapPlayBars: 2, gapMuteBars: 1 });
    engine.start();
    run(ctx, 4);
    engine.stop();
    const byBar = new Map<number, boolean>();
    for (const e of engine.recent) byBar.set(e.bar, e.silent);
    expect(byBar.get(0)).toBe(false);
    expect(byBar.get(1)).toBe(false);
    expect(byBar.get(2)).toBe(true);
    expect(byBar.get(3)).toBe(false);
    expect(byBar.get(5)).toBe(true);
  });

  it('calls onBar once per bar and stops at stopAtBar', () => {
    const bars: number[] = [];
    const { ctx, engine } = makeEngine({ bpm: 240, grouping: [2] }, (bar) => bars.push(bar));
    engine.start();
    engine.stopAtBar = 3;
    run(ctx, 5);
    expect(bars).toEqual([0, 1, 2]);
    expect(engine.running).toBe(false);
    expect(Math.max(...engine.recent.map((e) => e.bar))).toBe(2);
  });

  it('cycles the subdivision drill every N bars', () => {
    const { ctx, engine } = makeEngine({ bpm: 240, grouping: [1], drillEnabled: true, drillBars: 1 });
    engine.start();
    run(ctx, 3);
    engine.stop();
    const subsByBar = [0, 1, 2, 3, 4].map((b) => engine.recent.find((e) => e.bar === b)?.subdivision);
    expect(subsByBar).toEqual([1, 2, 3, 4, 1]);
  });
});
