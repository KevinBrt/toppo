/** The zip `toppo plugin build` writes and an administrator uploads: these files, nothing else. */
export const PLUGIN_PACKAGE_FILES = {
  /** The server bundle: a classic script that defines `__toppo`. */
  server: 'server.js',
  /** `{ "version": "1.2.0" }`, from the plugin's `package.json`. */
  metadata: 'plugin.json',
} as const;

/**
 * The logos a package may hold, at its root, with their media types: raster images only, since
 * an SVG may carry script.
 */
export const PLUGIN_LOGO_TYPES = { 'logo.png': 'image/png', 'logo.webp': 'image/webp' } as const;

export type PluginLogo = keyof typeof PLUGIN_LOGO_TYPES;

export const PLUGIN_LOGO_FILES = Object.keys(PLUGIN_LOGO_TYPES) as [PluginLogo, ...PluginLogo[]];

const MEBIBYTE = 1024 * 1024;

/** What a plugin's zip may weigh, checked by the CLI as it builds and by Toppo as it receives. */
export const PLUGIN_PACKAGE_LIMITS = {
  /** The zip itself, as uploaded. */
  packageBytes: 50 * MEBIBYTE,
  /** Its files once unpacked, together: a small zip can unpack to gigabytes. */
  unpackedBytes: 100 * MEBIBYTE,
  /** The server bundle, read whole into the plugin's memory in the sandbox. */
  serverBytes: 10 * MEBIBYTE,
  /** `plugin.json`. */
  metadataBytes: 1024,
  /** Its logo, shown small. */
  logoBytes: 256 * 1024,
} as const;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/**
 * What a logo really is, by its first bytes, whatever its name says: PNG, WebP, or something
 * else (`null`), which Toppo refuses.
 */
export function logoTypeOf(bytes: Uint8Array): (typeof PLUGIN_LOGO_TYPES)[PluginLogo] | null {
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return 'image/png';
  }
  return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP' ? 'image/webp' : null;
}
