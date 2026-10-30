import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isInternalAddress } from './internal-addresses.ts';

/** An IPv4 address within `network`/`prefix`, its host part drawn at random. */
function ipv4Within(network: string, prefix: number): fc.Arbitrary<string> {
  const base = network.split('.').reduce((value, part) => value * 256 + Number(part), 0);
  return fc.nat({ max: 2 ** (32 - prefix) - 1 }).map((host) => {
    const value = base + host;
    return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join('.');
  });
}

/** The two IPv6 groups that carry an IPv4 address. */
function groupsOf(ipv4: string): string {
  const [a = 0, b = 0, c = 0, d = 0] = ipv4.split('.').map(Number);
  return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
}

const INTERNAL_IPV4 = fc.oneof(
  ipv4Within('10.0.0.0', 8),
  ipv4Within('127.0.0.0', 8),
  ipv4Within('169.254.0.0', 16),
  ipv4Within('172.16.0.0', 12),
  ipv4Within('192.168.0.0', 16),
  ipv4Within('100.64.0.0', 10),
  ipv4Within('0.0.0.0', 8),
);

describe('internal addresses', () => {
  it.each([
    ['the loopback', '127.0.0.1'],
    ['a cloud’s metadata', '169.254.169.254'],
    ['a private network', '192.168.1.10'],
    ['an address of no one', '0.0.0.0'],
    ['the broadcast', '255.255.255.255'],
    ['a multicast group', '239.1.2.3'],
    ['the IPv6 loopback', '::1'],
    ['the IPv6 unspecified address', '::'],
    ['a unique local address', 'fd12:3456:789a::1'],
    ['a link-local address with its zone', 'fe80::1%eth0'],
    ['the loopback mapped to IPv6', '::ffff:127.0.0.1'],
    ['a private address mapped in hex', '::ffff:a00:1'],
    ['a private address through NAT64', '64:ff9b::c0a8:101'],
    ['a private address through 6to4', '2002:a00:1::1'],
    ['a Teredo tunnel', '2001:0:4136:e378:8000:63bf:3fff:fdd2'],
    ['what is no address', 'localhost'],
  ])('are refused: %s', (_, address) => {
    expect(isInternalAddress(address)).toBe(true);
  });

  it.each([
    ['a public IPv4 address', '93.184.215.14'],
    ['a public IPv6 address', '2606:4700:4700::1111'],
    ['a public address mapped to IPv6', '::ffff:8.8.8.8'],
    ['a public address through NAT64', '64:ff9b::808:808'],
    ['a public address through 6to4', '2002:808:808::1'],
  ])('are not: %s', (_, address) => {
    expect(isInternalAddress(address)).toBe(false);
  });

  it('cover every address of the internal ranges, however IPv6 writes them', () => {
    fc.assert(
      fc.property(INTERNAL_IPV4, (ipv4) => {
        expect(isInternalAddress(ipv4)).toBe(true);
        expect(isInternalAddress(`::ffff:${ipv4}`)).toBe(true);
        expect(isInternalAddress(`::ffff:${groupsOf(ipv4)}`)).toBe(true);
        expect(isInternalAddress(`64:ff9b::${groupsOf(ipv4)}`)).toBe(true);
        expect(isInternalAddress(`2002:${groupsOf(ipv4)}::`)).toBe(true);
      }),
    );
  });
});
