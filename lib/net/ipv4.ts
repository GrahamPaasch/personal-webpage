export type IPv4Cidr = {
  ip: number; // uint32
  prefix: number; // 0..32
};

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

function isIntegerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function ipv4FromString(input: string): Ok<number> | Err {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'IPv4 address is required.' };
  const parts = raw.split('.');
  if (parts.length !== 4) return { ok: false, error: 'IPv4 address must have 4 octets.' };

  const octets = parts.map((part) => {
    if (part.trim() === '') return NaN;
    // Disallow leading +/-, hex, and whitespace.
    if (!/^\d+$/.test(part)) return NaN;
    return Number.parseInt(part, 10);
  });

  if (octets.some((octet) => !isIntegerInRange(octet, 0, 255))) {
    return { ok: false, error: 'IPv4 octets must be integers from 0 to 255.' };
  }

  const value =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  return { ok: true, value };
}

export function ipv4ToString(value: number): string {
  const v = value >>> 0;
  return [
    (v >>> 24) & 255,
    (v >>> 16) & 255,
    (v >>> 8) & 255,
    v & 255,
  ].join('.');
}

export function maskFromPrefix(prefix: number): Ok<number> | Err {
  if (!isIntegerInRange(prefix, 0, 32)) {
    return { ok: false, error: 'Prefix length must be an integer from 0 to 32.' };
  }
  if (prefix === 0) return { ok: true, value: 0 };
  // JS bit shifts are 32-bit; ensure unsigned.
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return { ok: true, value: mask };
}

export function parseIPv4Cidr(input: string): Ok<IPv4Cidr> | Err {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter an IPv4 CIDR like 10.0.0.0/24.' };

  const slashIdx = raw.indexOf('/');
  if (slashIdx < 0) return { ok: false, error: 'CIDR must include a prefix length (e.g., /24).' };

  const ipPart = raw.slice(0, slashIdx).trim();
  const prefixPart = raw.slice(slashIdx + 1).trim();
  const ipRes = ipv4FromString(ipPart);
  if (ipRes.ok === false) return ipRes;

  if (!/^\d+$/.test(prefixPart)) {
    return { ok: false, error: 'Prefix length must be a number from 0 to 32.' };
  }
  const prefix = Number.parseInt(prefixPart, 10);
  if (!isIntegerInRange(prefix, 0, 32)) {
    return { ok: false, error: 'Prefix length must be an integer from 0 to 32.' };
  }

  return { ok: true, value: { ip: ipRes.value, prefix } };
}

export type IPv4CidrDetails = {
  inputIp: string;
  prefix: number;
  mask: string;
  wildcardMask: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: number;
  usableAddresses: number;
};

export function describeIPv4Cidr(cidr: IPv4Cidr): IPv4CidrDetails {
  const mask = maskFromPrefix(cidr.prefix);
  if (mask.ok === false) {
    // Should be unreachable because prefix already validated.
    throw new Error(mask.error);
  }

  const netmask = mask.value >>> 0;
  const wildcard = (~netmask) >>> 0;
  const network = (cidr.ip & netmask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;

  const total = Math.pow(2, 32 - cidr.prefix);
  const usable =
    cidr.prefix === 32 ? 1 :
    cidr.prefix === 31 ? 2 :
    Math.max(0, total - 2);

  const firstHost =
    cidr.prefix >= 31 ? network : (network + 1) >>> 0;
  const lastHost =
    cidr.prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;

  return {
    inputIp: ipv4ToString(cidr.ip),
    prefix: cidr.prefix,
    mask: ipv4ToString(netmask),
    wildcardMask: ipv4ToString(wildcard),
    network: ipv4ToString(network),
    broadcast: ipv4ToString(broadcast),
    firstHost: ipv4ToString(firstHost),
    lastHost: ipv4ToString(lastHost),
    totalAddresses: total,
    usableAddresses: usable,
  };
}

export function splitIPv4Cidr(base: IPv4Cidr, newPrefix: number): Ok<IPv4Cidr[]> | Err {
  if (!isIntegerInRange(newPrefix, 0, 32)) {
    return { ok: false, error: 'New prefix must be an integer from 0 to 32.' };
  }
  if (newPrefix < base.prefix) {
    return { ok: false, error: `New prefix must be >= base prefix (/${base.prefix}).` };
  }
  const delta = newPrefix - base.prefix;
  const subnetCount = Math.pow(2, delta);
  // Hard cap to prevent accidental mega-renders.
  if (subnetCount > 8192) {
    return { ok: false, error: `That would generate ${subnetCount.toLocaleString()} subnets. Reduce the prefix delta.` };
  }

  const baseNet = describeIPv4Cidr(base).network;
  const baseNetRes = ipv4FromString(baseNet);
  if (baseNetRes.ok === false) return baseNetRes;
  const baseNetworkInt = baseNetRes.value;

  const step = Math.pow(2, 32 - newPrefix);
  const out: IPv4Cidr[] = [];
  for (let i = 0; i < subnetCount; i += 1) {
    const ip = (baseNetworkInt + i * step) >>> 0;
    out.push({ ip, prefix: newPrefix });
  }
  return { ok: true, value: out };
}
