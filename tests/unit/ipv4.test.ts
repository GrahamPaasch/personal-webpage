import { describe, expect, it } from 'vitest';

import {
  describeIPv4Cidr,
  ipv4FromString,
  ipv4ToString,
  maskFromPrefix,
  parseIPv4Cidr,
  splitIPv4Cidr,
} from '@/lib/net/ipv4';

/** Unwraps an Ok result, failing the test if it was an Err. */
function unwrap<T>(res: { ok: true; value: T } | { ok: false; error: string }): T {
  // `res.ok === false` (rather than `!res.ok`) matches how lib/net narrows.
  if (res.ok === false) throw new Error(`expected ok, got error: ${res.error}`);
  return res.value;
}

describe('ipv4FromString', () => {
  it('parses a dotted quad to an unsigned 32-bit value', () => {
    expect(unwrap(ipv4FromString('0.0.0.0'))).toBe(0);
    expect(unwrap(ipv4FromString('10.0.0.1'))).toBe(0x0a000001);
  });

  it('keeps the high bit unsigned rather than going negative', () => {
    // 255.255.255.255 is where a signed 32-bit shift would wrap to -1.
    expect(unwrap(ipv4FromString('255.255.255.255'))).toBe(4294967295);
    expect(unwrap(ipv4FromString('192.168.1.1'))).toBe(3232235777);
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '1.2.3', '1.2.3.4.5', '1.2.3.256', '1.2.3.-1', 'a.b.c.d', '1.2.3.0x4', '1.2.3.']) {
      expect(ipv4FromString(bad).ok, `expected ${JSON.stringify(bad)} to be rejected`).toBe(false);
    }
  });
});

describe('ipv4ToString', () => {
  it('round-trips through ipv4FromString', () => {
    for (const ip of ['0.0.0.0', '10.0.0.1', '192.168.1.1', '255.255.255.255']) {
      expect(ipv4ToString(unwrap(ipv4FromString(ip)))).toBe(ip);
    }
  });
});

describe('maskFromPrefix', () => {
  it('produces the expected masks at the boundaries', () => {
    expect(ipv4ToString(unwrap(maskFromPrefix(0)))).toBe('0.0.0.0');
    expect(ipv4ToString(unwrap(maskFromPrefix(8)))).toBe('255.0.0.0');
    expect(ipv4ToString(unwrap(maskFromPrefix(24)))).toBe('255.255.255.0');
    expect(ipv4ToString(unwrap(maskFromPrefix(32)))).toBe('255.255.255.255');
  });

  it('rejects out-of-range prefixes', () => {
    expect(maskFromPrefix(-1).ok).toBe(false);
    expect(maskFromPrefix(33).ok).toBe(false);
    expect(maskFromPrefix(24.5).ok).toBe(false);
  });
});

describe('parseIPv4Cidr', () => {
  it('splits address and prefix', () => {
    expect(unwrap(parseIPv4Cidr('10.0.0.0/24'))).toEqual({ ip: 0x0a000000, prefix: 24 });
  });

  it('requires a prefix', () => {
    expect(parseIPv4Cidr('10.0.0.0').ok).toBe(false);
  });

  it('rejects a non-numeric or out-of-range prefix', () => {
    expect(parseIPv4Cidr('10.0.0.0/abc').ok).toBe(false);
    expect(parseIPv4Cidr('10.0.0.0/33').ok).toBe(false);
  });
});

describe('describeIPv4Cidr', () => {
  it('describes a /24', () => {
    const d = describeIPv4Cidr(unwrap(parseIPv4Cidr('192.168.1.10/24')));
    expect(d).toMatchObject({
      mask: '255.255.255.0',
      wildcardMask: '0.0.0.255',
      network: '192.168.1.0',
      broadcast: '192.168.1.255',
      firstHost: '192.168.1.1',
      lastHost: '192.168.1.254',
      totalAddresses: 256,
      usableAddresses: 254,
    });
  });

  it('treats /31 as a two-address point-to-point link', () => {
    const d = describeIPv4Cidr(unwrap(parseIPv4Cidr('10.0.0.0/31')));
    expect(d.usableAddresses).toBe(2);
    expect(d.firstHost).toBe('10.0.0.0');
    expect(d.lastHost).toBe('10.0.0.1');
  });

  it('treats /32 as a single host', () => {
    const d = describeIPv4Cidr(unwrap(parseIPv4Cidr('10.0.0.7/32')));
    expect(d.usableAddresses).toBe(1);
    expect(d.network).toBe('10.0.0.7');
    expect(d.broadcast).toBe('10.0.0.7');
  });

  it('handles /0 without overflowing', () => {
    const d = describeIPv4Cidr(unwrap(parseIPv4Cidr('0.0.0.0/0')));
    expect(d.mask).toBe('0.0.0.0');
    expect(d.broadcast).toBe('255.255.255.255');
    expect(d.totalAddresses).toBe(4294967296);
  });
});

describe('splitIPv4Cidr', () => {
  it('splits a /24 into four /26s in order', () => {
    const subnets = unwrap(splitIPv4Cidr(unwrap(parseIPv4Cidr('192.168.1.0/24')), 26));
    expect(subnets.map((s) => `${ipv4ToString(s.ip)}/${s.prefix}`)).toEqual([
      '192.168.1.0/26',
      '192.168.1.64/26',
      '192.168.1.128/26',
      '192.168.1.192/26',
    ]);
  });

  it('normalises to the base network before splitting', () => {
    // .10 is inside the /24, so the split must still start at .0
    const subnets = unwrap(splitIPv4Cidr(unwrap(parseIPv4Cidr('192.168.1.10/24')), 25));
    expect(ipv4ToString(subnets[0].ip)).toBe('192.168.1.0');
  });

  it('returns the base itself when the prefix is unchanged', () => {
    const subnets = unwrap(splitIPv4Cidr(unwrap(parseIPv4Cidr('10.0.0.0/8')), 8));
    expect(subnets).toHaveLength(1);
  });

  it('rejects a prefix shorter than the base', () => {
    expect(splitIPv4Cidr({ ip: 0, prefix: 24 }, 16).ok).toBe(false);
  });

  it('refuses to generate an unbounded number of subnets', () => {
    // /8 -> /24 would be 65536 subnets, past the 8192 guard.
    expect(splitIPv4Cidr({ ip: 0x0a000000, prefix: 8 }, 24).ok).toBe(false);
  });
});
