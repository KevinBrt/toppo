import { BlockList, isIP } from 'node:net';

/**
 * Addresses no request leaves Toppo for, unless an administrator names the host: the network
 * Toppo runs in, its machine, and what no public site uses (RFC 6890's special-purpose
 * registries). A request there could read a service never meant to face the Internet, such as a
 * cloud's metadata at 169.254.169.254.
 */
const INTERNAL = new BlockList();

const IPV4_RANGES = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // shared by carriers' NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, where clouds serve their metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relays
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast included
] as const;

const IPV6_RANGES = [
  ['::', 96], // unspecified, loopback, and the IPv4-compatible addresses long deprecated
  ['64:ff9b:1::', 48], // translation, local use
  ['100::', 64], // discard
  ['2001::', 32], // Teredo, which hides the IPv4 it leads to
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local: IPv6's private networks
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local, deprecated
  ['ff00::', 8], // multicast
] as const;

for (const [network, prefix] of IPV4_RANGES) {
  INTERNAL.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of IPV6_RANGES) {
  INTERNAL.addSubnet(network, prefix, 'ipv6');
}

/** The eight groups of an IPv6 address, its zone left out and a trailing IPv4 read as two. */
function groupsOf(address: string): number[] {
  const [head = '', tail] = (address.split('%')[0] ?? address).split('::');
  const partsOf = (side: string | undefined) =>
    side === undefined || side === '' ? [] : side.split(':');
  const expand = (parts: string[]) =>
    parts.flatMap((part) => {
      if (!part.includes('.')) {
        return [Number.parseInt(part, 16)];
      }
      const [a = 0, b = 0, c = 0, d = 0] = part.split('.').map(Number);
      return [a * 256 + b, c * 256 + d];
    });
  const left = expand(partsOf(head));
  const right = expand(partsOf(tail));
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

/** The IPv4 address two groups carry. */
const ipv4Of = (high: number, low: number) =>
  [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');

/**
 * The IPv4 address an IPv6 one leads to: mapped (`::ffff:10.0.0.1`), translated by NAT64
 * (`64:ff9b::a00:1`) or tunnelled by 6to4 (`2002:a00:1::`). `undefined` for any other.
 */
function embeddedIpv4(address: string): string | undefined {
  const groups = groupsOf(address);
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const zeroesTo = (end: number) => groups.slice(0, end).every((group) => group === 0);
  if (zeroesTo(5) && g5 === 0xffff) {
    return ipv4Of(g6, g7);
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return ipv4Of(g6, g7);
  }
  return g0 === 0x2002 ? ipv4Of(g1, g2) : undefined;
}

/**
 * Whether `address` is one requests must not reach: internal, or nothing Toppo can read as an
 * IP address (refused rather than guessed).
 */
export function isInternalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return INTERNAL.check(address, 'ipv4');
  }
  if (family !== 6) {
    return true;
  }
  const bare = address.split('%')[0] ?? address;
  const embedded = embeddedIpv4(bare);
  return INTERNAL.check(bare, 'ipv6') || (embedded !== undefined && isInternalAddress(embedded));
}
