import { describe, expect, it } from 'vitest';

import {
  NOTE_OPTIONS,
  clamp,
  frequencyFromMidi,
  isFiniteNumber,
  midiFromFrequency,
  midiFromNoteIndex,
  midiToNoteName,
  pitchToNote,
} from '@/lib/music/notes';

describe('clamp', () => {
  it('bounds a value to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('isFiniteNumber', () => {
  it('accepts only finite numbers', () => {
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber('440')).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
  });
});

describe('midiToNoteName', () => {
  it('names the standard reference pitches', () => {
    expect(midiToNoteName(69)).toBe('A4'); // A440
    expect(midiToNoteName(60)).toBe('C4'); // middle C
    expect(midiToNoteName(0)).toBe('C-1'); // bottom of the MIDI range
    expect(midiToNoteName(127)).toBe('G9');
  });

  it('respects the requested spelling', () => {
    expect(midiToNoteName(61, 'sharp')).toBe('C#4');
    expect(midiToNoteName(61, 'flat')).toBe('Db4');
  });
});

describe('frequencyFromMidi', () => {
  it('anchors on A440', () => {
    expect(frequencyFromMidi(69)).toBeCloseTo(440, 10);
  });

  it('doubles across an octave', () => {
    expect(frequencyFromMidi(81)).toBeCloseTo(880, 10);
    expect(frequencyFromMidi(57)).toBeCloseTo(220, 10);
  });

  it('follows a shifted concert pitch', () => {
    expect(frequencyFromMidi(69, 442)).toBeCloseTo(442, 10);
  });
});

describe('midiFromFrequency', () => {
  it('inverts frequencyFromMidi', () => {
    for (const midi of [40, 60, 69, 88]) {
      expect(midiFromFrequency(frequencyFromMidi(midi))).toBeCloseTo(midi, 10);
    }
  });
});

describe('pitchToNote', () => {
  it('reports zero cents when exactly in tune', () => {
    const p = pitchToNote(440);
    expect(p.midi).toBe(69);
    expect(p.note).toBe('A4');
    expect(p.cents).toBeCloseTo(0, 10);
  });

  it('reports positive cents when sharp and negative when flat', () => {
    // A quarter tone (50 cents) either side of A440.
    expect(pitchToNote(440 * Math.pow(2, 25 / 1200)).cents).toBeCloseTo(25, 6);
    expect(pitchToNote(440 * Math.pow(2, -25 / 1200)).cents).toBeCloseTo(-25, 6);
  });

  it('snaps to the nearest semitone', () => {
    // 10 cents sharp of A4 is still A4, not A#4.
    expect(pitchToNote(440 * Math.pow(2, 10 / 1200)).note).toBe('A4');
  });

  it('honours a non-440 reference', () => {
    const p = pitchToNote(442, { a4: 442 });
    expect(p.midi).toBe(69);
    expect(p.cents).toBeCloseTo(0, 10);
  });
});

describe('midiFromNoteIndex', () => {
  it('maps note index and octave to MIDI', () => {
    expect(midiFromNoteIndex(0, 4)).toBe(60); // C4
    expect(midiFromNoteIndex(9, 4)).toBe(69); // A4
    expect(midiFromNoteIndex(0, -1)).toBe(0); // C-1
  });

  it('wraps an out-of-range note index', () => {
    expect(midiFromNoteIndex(12, 4)).toBe(60);
    expect(midiFromNoteIndex(-1, 4)).toBe(71);
  });
});

describe('NOTE_OPTIONS', () => {
  it('covers all twelve pitch classes with matching indices', () => {
    expect(NOTE_OPTIONS).toHaveLength(12);
    NOTE_OPTIONS.forEach((opt, i) => expect(opt.index).toBe(i));
  });

  it('shows one label for naturals and both spellings for accidentals', () => {
    expect(NOTE_OPTIONS[0].label).toBe('C');
    expect(NOTE_OPTIONS[1].label).toBe('C# / Db');
  });
});
