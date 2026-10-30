/**
 * `scheme://user:password@host:port/path?query#fragment`, absolute only: a scheme, then an
 * authority or not, as RFC 3986 writes an address.
 */
const ADDRESS =
  /^([a-z][a-z\d+.-]*:)(?:\/\/(?:([^:@/?#]*)(?::([^@/?#]*))?@)?(\[[\da-f:.]+\]|[^:/?#[\]@]*)(?::(\d*))?)?([^?#]*)(\?[^#]*)?(#.*)?$/i;

/** Schemes that must name a host, and their default port. */
const DEFAULT_PORTS: Readonly<Record<string, string>> = {
  'http:': '80',
  'https:': '443',
  'ws:': '80',
  'wss:': '443',
  'ftp:': '21',
};

const invalid = () => new TypeError('Invalid URL');

/**
 * A URL as code reads one in Toppo's sandbox, whose JavaScript has none: what Zod's `z.url()`
 * asks of it, and what a plugin reads of an address. It parses absolute addresses as RFC 3986
 * writes them, without the normalizations of a browser (no IDN, no percent-decoding), and is
 * no guard: Toppo parses again, for real, what a plugin sends.
 */
export class SandboxUrl {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;

  constructor(input: string, base?: string) {
    if (base !== undefined) {
      throw invalid();
    }
    // As a browser does: tabs and line breaks dropped, spaces around trimmed.
    const match = ADDRESS.exec(
      String(input)
        .replace(/[\t\n\r]/g, '')
        .trim(),
    );
    const [, scheme = '', username = '', password = '', host, port = '', path = ''] = match ?? [];
    const protocol = scheme.toLowerCase();
    const needsHost = Object.hasOwn(DEFAULT_PORTS, protocol);
    if (!match || (needsHost && !host) || Number(port) > 65_535) {
      throw invalid();
    }
    this.protocol = protocol;
    this.username = username;
    this.password = password;
    this.hostname = (host ?? '').toLowerCase();
    this.port = port === DEFAULT_PORTS[protocol] ? '' : port;
    this.pathname = path === '' && needsHost ? '/' : path;
    this.search = match[7] === '?' ? '' : (match[7] ?? '');
    this.hash = match[8] === '#' ? '' : (match[8] ?? '');
  }

  get host(): string {
    return this.port === '' ? this.hostname : `${this.hostname}:${this.port}`;
  }

  get origin(): string {
    return Object.hasOwn(DEFAULT_PORTS, this.protocol) ? `${this.protocol}//${this.host}` : 'null';
  }

  get href(): string {
    const secret = this.password === '' ? '' : `:${this.password}`;
    const credentials = `${this.username}${secret}`;
    const authority = `//${credentials === '' ? '' : `${credentials}@`}${this.host}`;
    return `${this.protocol}${this.hostname === '' ? '' : authority}${this.pathname}${this.search}${this.hash}`;
  }

  toString(): string {
    return this.href;
  }

  toJSON(): string {
    return this.href;
  }

  static canParse(input: string, base?: string): boolean {
    return SandboxUrl.parse(input, base) !== null;
  }

  static parse(input: string, base?: string): SandboxUrl | null {
    try {
      return new SandboxUrl(input, base);
    } catch {
      return null;
    }
  }
}

/** Gives `global` a `URL` when its JavaScript has none, as Toppo's sandbox. */
export function provideUrl(global: object): void {
  if (Reflect.get(global, 'URL') === undefined) {
    Reflect.set(global, 'URL', SandboxUrl);
  }
}
