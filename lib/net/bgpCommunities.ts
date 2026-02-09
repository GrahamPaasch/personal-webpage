type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

export type CommunityKind = 'standard' | 'large' | 'extended' | 'name' | 'unknown';

export type ParsedCommunity = {
  input: string;
  kind: CommunityKind;
  normalized: string;
  meaning?: string;
  fields?: Record<string, string | number>;
  warning?: string;
  error?: string;
};

const WELL_KNOWN_BY_VALUE: Record<string, { name: string; rfc?: string }> = {
  '0:0': { name: 'internet', rfc: 'RFC 1997' },
  '65535:65281': { name: 'no-export', rfc: 'RFC 1997' },
  '65535:65282': { name: 'no-advertise', rfc: 'RFC 1997' },
  '65535:65283': { name: 'no-export-subconfed', rfc: 'RFC 1997' },
  '65535:65284': { name: 'no-peer', rfc: 'RFC 3765' },
};

const WELL_KNOWN_BY_NAME: Record<string, string> = {
  internet: '0:0',
  'no-export': '65535:65281',
  'no-advertise': '65535:65282',
  'no-export-subconfed': '65535:65283',
  'no-peer': '65535:65284',
};

function isIntegerString(value: string): boolean {
  return /^\d+$/.test(value);
}

function parseUint(value: string, max: number): Ok<number> | Err {
  if (!isIntegerString(value)) return { ok: false, error: 'Expected an integer.' };
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || !Number.isInteger(num)) return { ok: false, error: 'Invalid integer.' };
  if (num < 0 || num > max) return { ok: false, error: `Must be in range 0..${max}.` };
  return { ok: true, value: num };
}

function normalizeToken(raw: string): string {
  return raw.trim().replace(/^[,;]+|[,;]+$/g, '');
}

function describeWellKnown(value: string): string | undefined {
  const entry = WELL_KNOWN_BY_VALUE[value];
  if (!entry) return undefined;
  return entry.rfc ? `${entry.name} (${entry.rfc})` : entry.name;
}

export function tokenizeCommunities(input: string): string[] {
  return input
    .split(/[\s,]+/g)
    .map(normalizeToken)
    .filter(Boolean);
}

export function parseCommunity(token: string): ParsedCommunity {
  const raw = token.trim();
  const normalizedToken = normalizeToken(raw);

  if (!normalizedToken) {
    return { input: raw, kind: 'unknown', normalized: '', error: 'Empty token.' };
  }

  const lower = normalizedToken.toLowerCase();
  if (lower in WELL_KNOWN_BY_NAME) {
    const value = WELL_KNOWN_BY_NAME[lower];
    return {
      input: token,
      kind: 'name',
      normalized: value,
      meaning: describeWellKnown(value) || lower,
      fields: { name: lower, value },
    };
  }

  // Extended community common forms (route target / site-of-origin)
  // Examples: rt:65000:123, soo:65000:42
  const extMatch = /^(rt|soo):(\d+):(\d+)$/i.exec(normalizedToken);
  if (extMatch) {
    const tag = extMatch[1].toLowerCase();
    const asnRes = parseUint(extMatch[2], 4294967295);
    if (asnRes.ok === false) {
      return { input: token, kind: 'extended', normalized: normalizedToken, error: `Bad ASN: ${asnRes.error}` };
    }
    const valRes = parseUint(extMatch[3], 4294967295);
    if (valRes.ok === false) {
      return { input: token, kind: 'extended', normalized: normalizedToken, error: `Bad value: ${valRes.error}` };
    }
    const meaning = tag === 'rt' ? 'route-target (extended)' : 'site-of-origin (extended)';
    return {
      input: token,
      kind: 'extended',
      normalized: `${tag}:${asnRes.value}:${valRes.value}`,
      meaning,
      fields: { type: tag, asn: asnRes.value, value: valRes.value },
    };
  }

  const parts = normalizedToken.split(':');
  if (parts.length === 2) {
    const left = parseUint(parts[0], 65535);
    const right = parseUint(parts[1], 65535);
    if (left.ok === false || right.ok === false) {
      return {
        input: token,
        kind: 'standard',
        normalized: normalizedToken,
        error: `Standard community must be A:B with each in 0..65535.`,
      };
    }
    const value = `${left.value}:${right.value}`;
    return {
      input: token,
      kind: 'standard',
      normalized: value,
      meaning: describeWellKnown(value),
      fields: { a: left.value, b: right.value },
      warning:
        value === '65535:666'
          ? 'Often used as a blackhole signal, but this is provider-specific.'
          : undefined,
    };
  }

  if (parts.length === 3) {
    const p0 = parseUint(parts[0], 4294967295);
    const p1 = parseUint(parts[1], 4294967295);
    const p2 = parseUint(parts[2], 4294967295);
    if (p0.ok === false || p1.ok === false || p2.ok === false) {
      return {
        input: token,
        kind: 'large',
        normalized: normalizedToken,
        error: 'Large community must be A:B:C with each in 0..4294967295.',
      };
    }
    const value = `${p0.value}:${p1.value}:${p2.value}`;
    return {
      input: token,
      kind: 'large',
      normalized: value,
      meaning: 'large community (RFC 8092)',
      fields: { globalAdmin: p0.value, localData1: p1.value, localData2: p2.value },
    };
  }

  return {
    input: token,
    kind: 'unknown',
    normalized: normalizedToken,
    error: 'Unrecognized community format.',
  };
}

export function parseCommunities(input: string): ParsedCommunity[] {
  return tokenizeCommunities(input).map(parseCommunity);
}
