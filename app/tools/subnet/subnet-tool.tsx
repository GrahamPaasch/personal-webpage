'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { describeIPv4Cidr, parseIPv4Cidr, splitIPv4Cidr, ipv4ToString } from '@/lib/net/ipv4';

const EXAMPLES = ['10.0.0.0/24', '192.168.1.10/27', '100.64.0.0/10', '172.16.0.0/12'] as const;

function formatCount(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SubnetTool() {
  const [cidrInput, setCidrInput] = useState<string>(EXAMPLES[0]);
  const [splitBase, setSplitBase] = useState<string>('10.0.0.0/20');
  const [splitPrefix, setSplitPrefix] = useState<string>('24');
  const [splitMaxRows, setSplitMaxRows] = useState<string>('256');

  const [copyNote, setCopyNote] = useState<string | null>(null);

  const cidrParsed = useMemo(() => parseIPv4Cidr(cidrInput), [cidrInput]);
  const cidrDetails = useMemo(
    () => (cidrParsed.ok ? describeIPv4Cidr(cidrParsed.value) : null),
    [cidrParsed],
  );

  const splitBaseParsed = useMemo(() => parseIPv4Cidr(splitBase), [splitBase]);
  const splitPrefixParsed = useMemo(() => {
    const raw = splitPrefix.trim();
    if (!raw) return { ok: false as const, error: 'Enter a prefix length.' };
    if (!/^\d+$/.test(raw)) return { ok: false as const, error: 'Prefix must be a number.' };
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0 || n > 32) return { ok: false as const, error: 'Prefix must be 0..32.' };
    return { ok: true as const, value: n };
  }, [splitPrefix]);

  const maxRows = useMemo(() => {
    const raw = splitMaxRows.trim();
    if (!raw) return 256;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return 256;
    return Math.min(8192, Math.max(1, n));
  }, [splitMaxRows]);

  const splitResult = useMemo(() => {
    if (splitBaseParsed.ok === false) return { ok: false as const, error: splitBaseParsed.error };
    if (!splitPrefixParsed.ok) return { ok: false as const, error: splitPrefixParsed.error };
    return splitIPv4Cidr(splitBaseParsed.value, splitPrefixParsed.value);
  }, [splitBaseParsed, splitPrefixParsed]);

  const splitList = useMemo(() => {
    if (!splitResult.ok) return null;
    return splitResult.value.map((cidr) => `${ipv4ToString(cidr.ip)}/${cidr.prefix}`);
  }, [splitResult]);

  const splitPreview = useMemo(() => {
    if (!splitList) return '';
    const slice = splitList.slice(0, maxRows);
    const body = slice.join('\n');
    if (splitList.length > slice.length) {
      return `${body}\n\n... (${formatCount(splitList.length - slice.length)} more not shown)`;
    }
    return body;
  }, [maxRows, splitList]);

  const setCopied = (message: string) => {
    setCopyNote(message);
    window.setTimeout(() => setCopyNote(null), 2200);
  };

  const handleCopySplit = async () => {
    if (!splitList) return;
    const ok = await tryCopy(splitList.join('\n'));
    setCopied(ok ? 'Copied subnet list.' : 'Copy failed.');
  };

  const handleCopyDetails = async () => {
    if (!cidrDetails) return;
    const lines = [
      `input_ip=${cidrDetails.inputIp}`,
      `prefix=/${cidrDetails.prefix}`,
      `mask=${cidrDetails.mask}`,
      `wildcard=${cidrDetails.wildcardMask}`,
      `network=${cidrDetails.network}`,
      `broadcast=${cidrDetails.broadcast}`,
      `first_host=${cidrDetails.firstHost}`,
      `last_host=${cidrDetails.lastHost}`,
      `total=${cidrDetails.totalAddresses}`,
      `usable=${cidrDetails.usableAddresses}`,
    ];
    const ok = await tryCopy(lines.join('\n'));
    setCopied(ok ? 'Copied CIDR details.' : 'Copy failed.');
  };

  return (
    <>
      <div className="card">
        <div className="prompt-header" style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0 }}>IPv4 Subnet Planner</h1>
          <span className="prompt-header-badge">CIDR</span>
        </div>
        <p className="muted">
          Quick CIDR math for planning, troubleshooting, and documentation. For IPv6, I usually reach for a dedicated
          calculator, but this one is intentionally fast for the daily IPv4 stuff.
        </p>

        <div className="toolbox-row">
          <label className="toolbox-field">
            CIDR
            <input
              value={cidrInput}
              onChange={(e) => setCidrInput(e.target.value)}
              placeholder="10.0.0.0/24"
              inputMode="text"
              spellCheck={false}
              aria-invalid={cidrParsed.ok ? undefined : true}
            />
          </label>
          <div className="toolbox-actions">
            <button className="button" type="button" onClick={handleCopyDetails} disabled={!cidrDetails}>
              Copy details
            </button>
            <Link className="button" href="/tools">
              Back to toolbox
            </Link>
          </div>
        </div>

        {cidrParsed.ok === false ? (
          <p className="toolbox-error" role="alert">
            {cidrParsed.error}
          </p>
        ) : null}

        <div className="toolbox-examples">
          <span className="muted small">Examples:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              className="toolbox-chip"
              type="button"
              onClick={() => setCidrInput(example)}
            >
              {example}
            </button>
          ))}
        </div>

        {copyNote ? <p className="muted small">{copyNote}</p> : null}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>CIDR Details</h2>
        {cidrDetails ? (
          <dl className="toolbox-kv">
            <div>
              <dt>Netmask</dt>
              <dd>{cidrDetails.mask}</dd>
            </div>
            <div>
              <dt>Wildcard</dt>
              <dd>{cidrDetails.wildcardMask}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{cidrDetails.network}</dd>
            </div>
            <div>
              <dt>Broadcast</dt>
              <dd>{cidrDetails.broadcast}</dd>
            </div>
            <div>
              <dt>Host range</dt>
              <dd>
                {cidrDetails.firstHost} – {cidrDetails.lastHost}
              </dd>
            </div>
            <div>
              <dt>Addresses</dt>
              <dd>
                {formatCount(cidrDetails.totalAddresses)} total, {formatCount(cidrDetails.usableAddresses)} usable
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Enter a CIDR above to see details.</p>
        )}
      </div>

      <div className="card half">
        <h2 style={{ marginTop: 0 }}>Split A Network</h2>
        <p className="muted small">
          Provide a base CIDR and a longer prefix to enumerate child subnets. Output is capped to avoid accidental huge
          renders.
        </p>

        <div className="toolbox-row">
          <label className="toolbox-field">
            Base CIDR
            <input
              value={splitBase}
              onChange={(e) => setSplitBase(e.target.value)}
              placeholder="10.0.0.0/20"
              spellCheck={false}
              aria-invalid={splitBaseParsed.ok ? undefined : true}
            />
          </label>
          <label className="toolbox-field">
            New prefix
            <input
              value={splitPrefix}
              onChange={(e) => setSplitPrefix(e.target.value)}
              placeholder="24"
              inputMode="numeric"
              aria-invalid={splitPrefixParsed.ok ? undefined : true}
            />
          </label>
          <label className="toolbox-field">
            Show first
            <input
              value={splitMaxRows}
              onChange={(e) => setSplitMaxRows(e.target.value)}
              placeholder="256"
              inputMode="numeric"
            />
          </label>
        </div>

        {splitResult.ok === false ? (
          <p className="toolbox-error" role="alert">
            {splitResult.error}
          </p>
        ) : (
          <p className="muted small">
            Generated {formatCount(splitResult.value.length)} subnets.
          </p>
        )}

        <div className="toolbox-actions" style={{ marginBottom: 10 }}>
          <button className="button primary" type="button" onClick={handleCopySplit} disabled={!splitList}>
            Copy subnet list
          </button>
        </div>

        <pre className="toolbox-pre" aria-label="Subnet list output">
          {splitPreview || 'Enter a base CIDR and prefix to generate.'}
        </pre>
      </div>
    </>
  );
}
