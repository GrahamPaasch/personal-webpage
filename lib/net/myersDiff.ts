export type DiffOp =
  | { type: 'equal'; aIndex: number; bIndex: number }
  | { type: 'delete'; aIndex: number }
  | { type: 'insert'; bIndex: number };

// Myers O((N+M)D) diff for arrays of strings.
// Returns a minimal edit script as a sequence of operations.
export function myersDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;

  // v[k] = farthest x along diagonal k, for the current edit distance d.
  let v = new Int32Array(2 * max + 1);
  v.fill(-1);
  v[offset + 1] = 0;

  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d += 1) {
    const vPrev = v;
    const vNext = new Int32Array(2 * max + 1);
    vNext.fill(-1);

    for (let k = -d; k <= d; k += 2) {
      const kIdx = offset + k;
      const down =
        k === -d || (k !== d && vPrev[kIdx - 1] < vPrev[kIdx + 1]);
      let x = down ? vPrev[kIdx + 1] : vPrev[kIdx - 1] + 1;
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }

      vNext[kIdx] = x;

      if (x >= n && y >= m) {
        trace.push(vNext);
        return backtrack(trace, a, b, offset);
      }
    }

    trace.push(vNext);
    v = vNext;
  }

  // Fallback (should be unreachable).
  const fallback: DiffOp[] = [];
  for (let i = 0; i < a.length; i += 1) fallback.push({ type: 'delete', aIndex: i });
  for (let i = 0; i < b.length; i += 1) fallback.push({ type: 'insert', bIndex: i });
  return fallback;
}

function backtrack(trace: Int32Array[], a: string[], b: string[], offset: number): DiffOp[] {
  let x = a.length;
  let y = b.length;
  const ops: DiffOp[] = [];

  for (let d = trace.length - 1; d > 0; d -= 1) {
    const vPrev = trace[d - 1];
    const k = x - y;
    const kIdx = offset + k;

    const prevK =
      k === -d || (k !== d && vPrev[kIdx - 1] < vPrev[kIdx + 1])
        ? k + 1
        : k - 1;

    const prevX = vPrev[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', aIndex: x - 1, bIndex: y - 1 });
      x -= 1;
      y -= 1;
    }

    if (x === prevX) {
      ops.push({ type: 'insert', bIndex: y - 1 });
      y -= 1;
    } else {
      ops.push({ type: 'delete', aIndex: x - 1 });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    ops.push({ type: 'equal', aIndex: x - 1, bIndex: y - 1 });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    ops.push({ type: 'delete', aIndex: x - 1 });
    x -= 1;
  }
  while (y > 0) {
    ops.push({ type: 'insert', bIndex: y - 1 });
    y -= 1;
  }

  ops.reverse();
  return ops;
}
