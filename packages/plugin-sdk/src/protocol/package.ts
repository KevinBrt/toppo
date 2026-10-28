/** The zip `toppo plugin build` writes and an administrator uploads: these files, nothing else. */
export const PLUGIN_PACKAGE_FILES = {
  /** The server bundle: a classic script that defines `__toppo`. */
  server: 'server.js',
  /** `{ "version": "1.2.0" }`, from the plugin's `package.json`. */
  metadata: 'plugin.json',
} as const;

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
} as const;
