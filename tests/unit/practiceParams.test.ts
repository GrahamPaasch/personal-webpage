import { describe, expect, it } from 'vitest';

import { parseNoteName } from '@/lib/music/notes';
import {
  DEFAULT_SETTINGS,
  accentedBeats,
  normalizeSettings,
  parseDroneSequence,
  parseGrouping,
  parseRamp,
  settingsFromParams,
  settingsToParams,
} from '@/lib/music/practiceParams';
import { RHYTHM_PATTERNS, patternGrid } from '@/lib/music/rhythmPatterns';

describe('parseNoteName', () => {
  it('reads sharps, flats and octaves', () => {
    expect(parseNoteName('A3')).toBe(57);
    expect(parseNoteName('a4')).toBe(69);
    expect(parseNoteName('Bb2')).toBe(46);
    expect(parseNoteName('C#4')).toBe(61);
    expect(parseNoteName('off')).toBeNull();
    expect(parseNoteName('H3')).toBeNull();
  });
});

describe('parseGrouping', () => {
  it('accepts plain counts, groupings and time signatures', () => {
    expect(parseGrouping('4')).toEqual([4]);
    expect(parseGrouping('3+2+2')).toEqual([3, 2, 2]);
    expect(parseGrouping('7/8')).toEqual([7]);
    expect(parseGrouping('0')).toBeNull();
    expect(parseGrouping('13')).toBeNull();
  });
  it('accents the first beat of each group', () => {
    expect([...accentedBeats([3, 2, 2])]).toEqual([0, 3, 5]);
  });
});

describe('parseRamp', () => {
  it('reads start-target with optional step and bars', () => {
    expect(parseRamp('60-120')).toEqual({ start: 60, target: 120 });
    expect(parseRamp('60-120x4@8')).toEqual({ start: 60, target: 120, step: 4, bars: 8 });
    expect(parseRamp('nonsense')).toBeNull();
  });
});

describe('settingsFromParams', () => {
  it('reads the voice-assistant short names', () => {
    const s = settingsFromParams({ bpm: '96', beats: '3+2+2', sub: '2', drone: 'D3', ramp: '60-120x4@4', gap: '4/2', goal: 'Dukas' });
    expect(s.bpm).toBe(96);
    expect(s.grouping).toEqual([3, 2, 2]);
    expect(s.subdivision).toBe(2);
    expect(s.droneOn).toBe(true);
    expect(s.droneMidi).toBe(parseNoteName('D3'));
    expect(s.ladderMode).toBe('rate');
    expect(s.ladderStart).toBe(60);
    expect(s.ladderTarget).toBe(120);
    expect(s.gapEnabled).toBe(true);
    expect(s.gapPlayBars).toBe(4);
    expect(s.gapMuteBars).toBe(2);
    expect(s.goal).toBe('Dukas');
  });

  it('keeps the old setlist links working', () => {
    const s = settingsFromParams({ bpm: '100', beatsPerBar: '3', subdivision: '3', swing: '20', volume: '50', accentDownbeat: '0' });
    expect(s.grouping).toEqual([3]);
    expect(s.subdivision).toBe(3);
    expect(s.swing).toBeCloseTo(0.2);
    expect(s.volume).toBeCloseTo(0.5);
    expect(s.accentDownbeat).toBe(false);
  });

  it('ignores junk and clamps ranges', () => {
    const s = settingsFromParams({ bpm: '9999', sub: 'x', drone: 'H9', gap: 'lots' });
    expect(s.bpm).toBe(300);
    expect(s.subdivision).toBeUndefined();
    expect(s.droneOn).toBeUndefined();
    expect(s.gapEnabled).toBeUndefined();
  });

  it('round-trips through settingsToParams', () => {
    const base = normalizeSettings({
      bpm: 72,
      grouping: [2, 2, 3],
      subdivision: 4,
      droneOn: true,
      droneMidi: 50,
      ladderMode: 'auto',
      ladderStart: 60,
      ladderTarget: 100,
      ladderStep: 3,
      ladderBars: 2,
      gapEnabled: true,
      gapPlayBars: 2,
      gapMuteBars: 1,
      goal: 'Sorcerer',
    });
    const q = settingsToParams(base);
    const back = normalizeSettings(settingsFromParams(Object.fromEntries(q.entries())));
    expect(back.bpm).toBe(72);
    expect(back.grouping).toEqual([2, 2, 3]);
    expect(back.subdivision).toBe(4);
    expect(back.droneMidi).toBe(50);
    expect(back.ladderMode).toBe('auto');
    expect(back.ladderTarget).toBe(100);
    expect(back.ladderStep).toBe(3);
    expect(back.gapMuteBars).toBe(1);
    expect(back.goal).toBe('Sorcerer');
  });
});

describe('normalizeSettings', () => {
  it('fills defaults and repairs bad stored values', () => {
    const s = normalizeSettings({ bpm: Number.NaN, grouping: [99], voice: 'kazoo' as never, droneOn: 'yes' as never });
    expect(s.bpm).toBe(DEFAULT_SETTINGS.bpm);
    expect(s.grouping).toEqual([4]);
    expect(s.voice).toBe('click');
    expect(s.droneOn).toBe(false);
  });
});

describe('parseDroneSequence', () => {
  it('skips bad tokens', () => {
    expect(parseDroneSequence('D3, A3 x G3')).toEqual([50, 57, 55]);
  });
});

describe('rhythm patterns', () => {
  it('keep every onset inside the loop', () => {
    for (const p of RHYTHM_PATTERNS) {
      expect(p.onsets.every((o) => o >= 0 && o < p.beats), p.id).toBe(true);
      expect(patternGrid(p).filter(Boolean).length, p.id).toBe(p.onsets.length);
    }
  });
});
