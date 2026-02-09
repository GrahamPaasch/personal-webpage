'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ParsedCommunity } from '@/lib/net/bgpCommunities';
import { parseCommunities } from '@/lib/net/bgpCommunities';

const EXAMPLE = `no-export
65535:65282
65000:100
65000:1:999
rt:65000:42
65535:666
not-a-community`;

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function severity(entry: ParsedCommunity): 'error' | 'warning' | 'ok' {
  if (entry.error) return 'error';
  if (entry.warning) return 'warning';
  return 'ok';
}

export default function BgpCommunityTool() {
  const [raw, setRaw] = useState(EXAMPLE);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const parsed = useMemo(() => parseCommunities(raw), [raw]);
  const stats = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const entry of parsed) {
      if (entry.error) errors += 1;
      else if (entry.warning) warnings += 1;
    }
    return { total: parsed.length, errors, warnings };
  }, [parsed]);

  const normalizedList = useMemo(
    () => parsed.filter((entry) => !entry.error).map((entry) => entry.normalized),
    [parsed],
  );

  const setCopied = (message: string) => {
    setCopyNote(message);
    window.setTimeout(() => setCopyNote(null), 2200);
  };

  const handleCopyJson = async () => {
    const ok = await tryCopy(JSON.stringify(parsed, null, 2));
    setCopied(ok ? 'Copied JSON.' : 'Copy failed.');
  };

  const handleCopyNormalized = async () => {
    const ok = await tryCopy(normalizedList.join('\n'));
    setCopied(ok ? 'Copied normalized list.' : 'Copy failed.');
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>BGP Community Decoder</h1>
          <span className="prompt-header-badge">BGP</span>
        </div>
        <p className="muted">
          Paste communities separated by whitespace or commas. This tool recognizes standard communities (A:B), large
          communities (A:B:C), and common extended forms like <code>rt:65000:42</code>.
        </p>

        <div className="toolbox-row">
          <label className="toolbox-field" style={{ flex: 1 }}>
            Communities
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="no-export&#10;65535:65282&#10;65000:100"
            />
          </label>
          <div className="toolbox-actions">
            <button className="button" type="button" onClick={handleCopyNormalized} disabled={normalizedList.length === 0}>
              Copy normalized
            </button>
            <button className="button" type="button" onClick={handleCopyJson} disabled={parsed.length === 0}>
              Copy JSON
            </button>
            <Link className="button" href="/tools">
              Back to toolbox
            </Link>
          </div>
        </div>

        <p className="muted small">
          Parsed {stats.total} tokens: {stats.errors} errors, {stats.warnings} warnings.
        </p>
        {copyNote ? <p className="muted small">{copyNote}</p> : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Decoded Output</h2>
        {parsed.length === 0 ? (
          <p className="muted">Paste some communities above.</p>
        ) : (
          <div className="toolbox-table-wrap" role="region" aria-label="BGP community decode table" tabIndex={0}>
            <table className="toolbox-table">
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Kind</th>
                  <th>Normalized</th>
                  <th>Meaning</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((entry, idx) => {
                  const sev = severity(entry);
                  const rowClass =
                    sev === 'error'
                      ? 'toolbox-row-error'
                      : sev === 'warning'
                        ? 'toolbox-row-warning'
                        : undefined;
                  return (
                    <tr key={`${entry.input}:${idx}`} className={rowClass}>
                      <td className="toolbox-mono">{entry.input}</td>
                      <td>{entry.kind}</td>
                      <td className="toolbox-mono">{entry.normalized}</td>
                      <td>{entry.meaning || ''}</td>
                      <td>{entry.error || entry.warning || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

