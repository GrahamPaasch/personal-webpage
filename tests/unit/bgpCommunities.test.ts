import { describe, expect, it } from 'vitest';

import { parseCommunities, parseCommunity, tokenizeCommunities } from '@/lib/net/bgpCommunities';

describe('tokenizeCommunities', () => {
  it('splits on whitespace and commas and drops empties', () => {
    expect(tokenizeCommunities('65000:100, 65000:200\n65000:300')).toEqual([
      '65000:100',
      '65000:200',
      '65000:300',
    ]);
  });

  it('strips stray separators clinging to a token', () => {
    expect(tokenizeCommunities('65000:100;')).toEqual(['65000:100']);
  });

  it('returns nothing for blank input', () => {
    expect(tokenizeCommunities('   \n  ')).toEqual([]);
  });
});

describe('parseCommunity — standard', () => {
  it('parses A:B and exposes both halves', () => {
    const c = parseCommunity('65000:100');
    expect(c.kind).toBe('standard');
    expect(c.normalized).toBe('65000:100');
    expect(c.fields).toEqual({ a: 65000, b: 100 });
    expect(c.error).toBeUndefined();
  });

  it('recognises the RFC 1997 well-known values', () => {
    expect(parseCommunity('65535:65281').meaning).toContain('no-export');
    expect(parseCommunity('65535:65282').meaning).toContain('no-advertise');
    expect(parseCommunity('65535:65284').meaning).toContain('no-peer');
  });

  it('flags 65535:666 as a provider-specific blackhole convention', () => {
    expect(parseCommunity('65535:666').warning).toMatch(/blackhole/i);
  });

  it('rejects a half outside 0..65535', () => {
    expect(parseCommunity('65536:1').error).toBeTruthy();
    expect(parseCommunity('1:65536').error).toBeTruthy();
  });
});

describe('parseCommunity — names', () => {
  it('resolves a well-known name to its numeric value', () => {
    const c = parseCommunity('no-export');
    expect(c.kind).toBe('name');
    expect(c.normalized).toBe('65535:65281');
  });

  it('is case-insensitive', () => {
    expect(parseCommunity('NO-EXPORT').normalized).toBe('65535:65281');
  });
});

describe('parseCommunity — large', () => {
  it('parses A:B:C as an RFC 8092 large community', () => {
    const c = parseCommunity('65000:1:2');
    expect(c.kind).toBe('large');
    expect(c.meaning).toContain('8092');
    expect(c.fields).toEqual({ globalAdmin: 65000, localData1: 1, localData2: 2 });
  });

  it('accepts full 32-bit fields', () => {
    expect(parseCommunity('4294967295:4294967295:4294967295').error).toBeUndefined();
  });

  it('rejects a field past 32 bits', () => {
    expect(parseCommunity('4294967296:1:2').error).toBeTruthy();
  });
});

describe('parseCommunity — extended', () => {
  it('parses a route target', () => {
    const c = parseCommunity('rt:65000:123');
    expect(c.kind).toBe('extended');
    expect(c.meaning).toContain('route-target');
    expect(c.fields).toMatchObject({ type: 'rt', asn: 65000, value: 123 });
  });

  it('parses a site-of-origin and normalises the tag case', () => {
    const c = parseCommunity('SOO:65000:42');
    expect(c.kind).toBe('extended');
    expect(c.normalized).toBe('soo:65000:42');
    expect(c.meaning).toContain('site-of-origin');
  });
});

describe('parseCommunity — rejections', () => {
  it('reports unrecognised shapes rather than throwing', () => {
    for (const bad of ['65000', 'not-a-community', '1:2:3:4', '::']) {
      expect(parseCommunity(bad).error, `expected ${bad} to error`).toBeTruthy();
    }
  });
});

describe('parseCommunities', () => {
  it('parses a mixed list in order', () => {
    const parsed = parseCommunities('no-export 65000:100 65000:1:2 rt:65000:5');
    expect(parsed.map((c) => c.kind)).toEqual(['name', 'standard', 'large', 'extended']);
  });

  it('keeps going past a bad token instead of failing the whole list', () => {
    const parsed = parseCommunities('65000:100 garbage 65000:200');
    expect(parsed).toHaveLength(3);
    expect(parsed[0].error).toBeUndefined();
    expect(parsed[1].error).toBeTruthy();
    expect(parsed[2].error).toBeUndefined();
  });
});
