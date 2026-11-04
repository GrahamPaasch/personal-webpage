import { describe, expect, it } from 'vitest';
import { apply, schedule, seedTimeline } from '@/lib/exercise/timeline';

describe('exercise timeline', () => {
  it('seeds 21 daily sessions from Thu 2026-11-05', () => {
    const s = schedule(seedTimeline(), '2026-11-04');
    expect(s).toHaveLength(21);
    expect(s[0].date).toBe('2026-11-05');
    expect(s[20].date).toBe('2026-11-25');
  });

  it('slides misses forward and keeps done dates real', () => {
    const d = seedTimeline();
    apply(d, { action: 'done', date: '2026-11-05' }, '2026-11-05');
    // 11/6 and 11/7 missed; today is 11/8
    const s = schedule(d, '2026-11-08');
    expect(s[0]).toMatchObject({ id: 'cm-warmup-01', date: '2026-11-05' });
    expect(s[1]).toMatchObject({ id: 'cm-warmup-02', date: '2026-11-08', done: null });
  });

  it('skips days that already hold a done session', () => {
    const d = seedTimeline();
    apply(d, { action: 'done', date: '2026-11-08' }, '2026-11-08');
    const s = schedule(d, '2026-11-08');
    expect(s.find((x) => x.id === 'cm-warmup-02')?.date).toBe('2026-11-09');
  });

  it('notes and undo default to the latest done session', () => {
    const d = seedTimeline();
    apply(d, { action: 'done' }, '2026-11-05');
    expect(apply(d, { action: 'note', note: 'too easy' }, '2026-11-05')).toEqual({ ok: true, id: 'cm-warmup-01' });
    expect(d.sessions[0].note).toBe('too easy');
    apply(d, { action: 'undo' }, '2026-11-05');
    expect(d.sessions[0]).toMatchObject({ done: null, note: null });
    expect(apply(d, { action: 'note', id: 'cm-warmup-01', note: 'x' }, '2026-11-05').ok).toBe(false);
  });
});
