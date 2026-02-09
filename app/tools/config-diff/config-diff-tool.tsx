'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { myersDiff } from '@/lib/net/myersDiff';

type DiffRow = {
  type: 'equal' | 'delete' | 'insert';
  aLine?: number;
  bLine?: number;
  text: string;
};

const BEFORE_EXAMPLE = `interface Gi0/1
 description Uplink to CORE
 ip address 10.0.0.2 255.255.255.252
 no shutdown
!
router bgp 65000
 neighbor 10.0.0.1 remote-as 65001
`;

const AFTER_EXAMPLE = `interface Gi0/1
 description Uplink to CORE (primary)
 ip address 10.0.0.2 255.255.255.252
 no shutdown
!
router bgp 65000
 neighbor 10.0.0.1 remote-as 65001
 neighbor 10.0.0.1 description CORE-EDGE
`;

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function splitLines(text: string): string[] {
  // Preserve empty trailing line? For diffs, it's usually more useful to trim the final newline.
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  // Drop final empty line if the input ends with newline.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function normalizeLine(line: string, opts: { ignoreWhitespace: boolean }): string {
  if (!opts.ignoreWhitespace) return line;
  // Collapse any whitespace runs and trim edges.
  return line.replace(/\s+/g, ' ').trim();
}

function buildLines(text: string, opts: { ignoreWhitespace: boolean; ignoreBlankLines: boolean }) {
  const out: { orig: string; norm: string }[] = [];
  for (const orig of splitLines(text)) {
    const norm = normalizeLine(orig, { ignoreWhitespace: opts.ignoreWhitespace });
    const isBlank = norm.trim().length === 0;
    if (opts.ignoreBlankLines && isBlank) continue;
    out.push({ orig, norm });
  }
  return out;
}

export default function ConfigDiffTool() {
  const [before, setBefore] = useState(BEFORE_EXAMPLE);
  const [after, setAfter] = useState(AFTER_EXAMPLE);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(true);
  const [ignoreBlankLines, setIgnoreBlankLines] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const aLines = useMemo(
    () => buildLines(before, { ignoreWhitespace, ignoreBlankLines }),
    [before, ignoreBlankLines, ignoreWhitespace],
  );
  const bLines = useMemo(
    () => buildLines(after, { ignoreWhitespace, ignoreBlankLines }),
    [after, ignoreBlankLines, ignoreWhitespace],
  );

  const ops = useMemo(() => myersDiff(aLines.map((l) => l.norm), bLines.map((l) => l.norm)), [aLines, bLines]);

  const rows = useMemo(() => {
    const out: DiffRow[] = [];
    for (const op of ops) {
      if (op.type === 'equal') {
        out.push({
          type: 'equal',
          aLine: op.aIndex + 1,
          bLine: op.bIndex + 1,
          text: bLines[op.bIndex]?.orig ?? '',
        });
      } else if (op.type === 'delete') {
        out.push({
          type: 'delete',
          aLine: op.aIndex + 1,
          bLine: undefined,
          text: aLines[op.aIndex]?.orig ?? '',
        });
      } else {
        out.push({
          type: 'insert',
          aLine: undefined,
          bLine: op.bIndex + 1,
          text: bLines[op.bIndex]?.orig ?? '',
        });
      }
    }
    return out;
  }, [aLines, bLines, ops]);

  const stats = useMemo(() => {
    let adds = 0;
    let dels = 0;
    for (const row of rows) {
      if (row.type === 'insert') adds += 1;
      else if (row.type === 'delete') dels += 1;
    }
    return { adds, dels, total: rows.length };
  }, [rows]);

  const unifiedDiff = useMemo(() => {
    const lines: string[] = ['--- before', '+++ after'];
    for (const row of rows) {
      const prefix = row.type === 'insert' ? '+' : row.type === 'delete' ? '-' : ' ';
      lines.push(prefix + row.text);
    }
    return lines.join('\n');
  }, [rows]);

  const setCopied = (message: string) => {
    setCopyNote(message);
    window.setTimeout(() => setCopyNote(null), 2200);
  };

  const handleSwap = () => {
    setBefore(after);
    setAfter(before);
  };

  const handleCopyDiff = async () => {
    const ok = await tryCopy(unifiedDiff);
    setCopied(ok ? 'Copied unified diff.' : 'Copy failed.');
  };

  const handleReset = () => {
    setBefore(BEFORE_EXAMPLE);
    setAfter(AFTER_EXAMPLE);
    setIgnoreWhitespace(true);
    setIgnoreBlankLines(false);
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>Config Diff Viewer</h1>
          <span className="prompt-header-badge">DIFF</span>
        </div>
        <p className="muted">
          Paste a before/after config and get a readable line diff. This is intentionally text-first: it does not try
          to parse vendor syntax, it just helps you see what changed.
        </p>

        <div className="toolbox-row">
          <div className="toolbox-actions" style={{ alignItems: 'flex-start' }}>
            <label className="toolbox-check">
              <input
                type="checkbox"
                checked={ignoreWhitespace}
                onChange={(e) => setIgnoreWhitespace(e.target.checked)}
              />
              <span>Ignore whitespace</span>
            </label>
            <label className="toolbox-check">
              <input
                type="checkbox"
                checked={ignoreBlankLines}
                onChange={(e) => setIgnoreBlankLines(e.target.checked)}
              />
              <span>Ignore blank lines</span>
            </label>
          </div>

          <div className="toolbox-actions">
            <button className="button" type="button" onClick={handleSwap}>
              Swap
            </button>
            <button className="button primary" type="button" onClick={handleCopyDiff} disabled={rows.length === 0}>
              Copy diff
            </button>
            <button className="button" type="button" onClick={handleReset}>
              Reset
            </button>
            <Link className="button" href="/tools">
              Back to toolbox
            </Link>
          </div>
        </div>

        <p className="muted small">
          {stats.adds} additions, {stats.dels} deletions ({stats.total} lines shown).
        </p>
        {copyNote ? <p className="muted small">{copyNote}</p> : null}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Before</h2>
        <textarea
          value={before}
          onChange={(e) => setBefore(e.target.value)}
          rows={14}
          spellCheck={false}
          className="toolbox-textarea-mono"
          aria-label="Before config"
        />
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>After</h2>
        <textarea
          value={after}
          onChange={(e) => setAfter(e.target.value)}
          rows={14}
          spellCheck={false}
          className="toolbox-textarea-mono"
          aria-label="After config"
        />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Diff Output</h2>
        <div className="toolbox-diff" role="region" aria-label="Diff output" tabIndex={0}>
          {rows.length === 0 ? (
            <p className="muted">Paste configs above to generate a diff.</p>
          ) : (
            <div className="toolbox-diff-rows" role="table" aria-label="Line diff table">
              <div className="toolbox-diff-head" role="rowgroup">
                <div className="toolbox-diff-row toolbox-diff-row-head" role="row">
                  <div className="toolbox-diff-cell toolbox-diff-ln" role="columnheader">
                    A
                  </div>
                  <div className="toolbox-diff-cell toolbox-diff-ln" role="columnheader">
                    B
                  </div>
                  <div className="toolbox-diff-cell toolbox-diff-code" role="columnheader">
                    Line
                  </div>
                </div>
              </div>
              <div role="rowgroup">
                {rows.map((row, idx) => (
                  <div
                    key={idx}
                    className={[
                      'toolbox-diff-row',
                      row.type === 'insert'
                        ? 'toolbox-diff-add'
                        : row.type === 'delete'
                          ? 'toolbox-diff-del'
                          : 'toolbox-diff-eq',
                    ].join(' ')}
                    role="row"
                  >
                    <div className="toolbox-diff-cell toolbox-diff-ln" role="cell">
                      {row.aLine ?? ''}
                    </div>
                    <div className="toolbox-diff-cell toolbox-diff-ln" role="cell">
                      {row.bLine ?? ''}
                    </div>
                    <div className="toolbox-diff-cell toolbox-diff-code" role="cell">
                      <span className="toolbox-diff-prefix" aria-hidden="true">
                        {row.type === 'insert' ? '+' : row.type === 'delete' ? '-' : ' '}
                      </span>
                      <span className="toolbox-mono">{row.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

