import { describe, expect, it } from 'vitest';

import { myersDiff, type DiffOp } from '@/lib/net/myersDiff';

/**
 * Replays an edit script against `a` and returns what it produces. If the diff
 * is correct this must equal `b` — this is the property that actually matters
 * for the config-diff tool, independent of which minimal script was chosen.
 */
function applyOps(a: string[], b: string[], ops: DiffOp[]): string[] {
  const out: string[] = [];
  for (const op of ops) {
    if (op.type === 'equal') out.push(a[op.aIndex]);
    else if (op.type === 'insert') out.push(b[op.bIndex]);
    // deletes contribute nothing to the output
  }
  return out;
}

/** Indices consumed from each side must be strictly increasing and complete. */
function assertWellFormed(a: string[], b: string[], ops: DiffOp[]) {
  let ai = 0;
  let bi = 0;
  for (const op of ops) {
    if (op.type === 'equal') {
      expect(op.aIndex).toBe(ai++);
      expect(op.bIndex).toBe(bi++);
      expect(a[op.aIndex]).toBe(b[op.bIndex]);
    } else if (op.type === 'delete') {
      expect(op.aIndex).toBe(ai++);
    } else {
      expect(op.bIndex).toBe(bi++);
    }
  }
  expect(ai).toBe(a.length);
  expect(bi).toBe(b.length);
}

function check(a: string[], b: string[]) {
  const ops = myersDiff(a, b);
  assertWellFormed(a, b, ops);
  expect(applyOps(a, b, ops)).toEqual(b);
  return ops;
}

describe('myersDiff', () => {
  it('reports every line equal for identical input', () => {
    const lines = ['interface Gi0/1', ' description uplink', ' no shutdown'];
    const ops = check(lines, lines);
    expect(ops.every((op) => op.type === 'equal')).toBe(true);
    expect(ops).toHaveLength(3);
  });

  it('handles two empty inputs', () => {
    expect(myersDiff([], [])).toEqual([]);
  });

  it('reports pure insertion when the old side is empty', () => {
    const ops = check([], ['a', 'b']);
    expect(ops.map((o) => o.type)).toEqual(['insert', 'insert']);
  });

  it('reports pure deletion when the new side is empty', () => {
    const ops = check(['a', 'b'], []);
    expect(ops.map((o) => o.type)).toEqual(['delete', 'delete']);
  });

  it('finds a single changed line in the middle', () => {
    const ops = check(['a', 'b', 'c'], ['a', 'x', 'c']);
    // Minimal script is one delete + one insert, keeping the two shared lines.
    expect(ops.filter((o) => o.type === 'equal')).toHaveLength(2);
    expect(ops.filter((o) => o.type === 'delete')).toHaveLength(1);
    expect(ops.filter((o) => o.type === 'insert')).toHaveLength(1);
  });

  it('produces a minimal script for a pure append', () => {
    const ops = check(['a', 'b'], ['a', 'b', 'c', 'd']);
    expect(ops.filter((o) => o.type === 'equal')).toHaveLength(2);
    expect(ops.filter((o) => o.type === 'insert')).toHaveLength(2);
    expect(ops.filter((o) => o.type === 'delete')).toHaveLength(0);
  });

  it('handles a prepend without rewriting the whole file', () => {
    const ops = check(['b', 'c'], ['a', 'b', 'c']);
    expect(ops.filter((o) => o.type === 'equal')).toHaveLength(2);
    expect(ops.filter((o) => o.type === 'insert')).toHaveLength(1);
  });

  it('handles completely disjoint inputs', () => {
    const ops = check(['a', 'b'], ['c', 'd']);
    expect(ops.filter((o) => o.type === 'equal')).toHaveLength(0);
  });

  it('handles repeated lines, which are common in device configs', () => {
    check(['!', 'a', '!', 'b', '!'], ['!', 'b', '!', 'a', '!']);
  });

  it('stays correct on a larger realistic edit', () => {
    const a = Array.from({ length: 200 }, (_, i) => `line ${i}`);
    const b = a.slice(0, 50).concat(['inserted'], a.slice(60, 200));
    const ops = check(a, b);
    // 10 lines removed, 1 added.
    expect(ops.filter((o) => o.type === 'delete')).toHaveLength(10);
    expect(ops.filter((o) => o.type === 'insert')).toHaveLength(1);
  });
});
