import { createHash } from 'node:crypto';
import { PLUGIN_PACKAGE_LIMITS } from '@toppo-tracker/plugin-sdk/protocol';
import { strToU8, Zip, ZipPassThrough, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { HttpError } from '../../http/http-error.ts';
import { openPluginPackage } from './open-package.ts';
import { testBundle, testManifest, testPackage } from './test-package.ts';

const VERSION = strToU8('{"version":"1.2.0"}');
const BUNDLE = strToU8(testBundle(testManifest()));

/** The refusal of a zip, as the administrator reads it. */
function refusalOf(zip: Uint8Array): string {
  try {
    openPluginPackage(zip);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'PLUGIN_PACKAGE_INVALID') {
      return error.message;
    }
    throw error;
  }
  throw new Error('The zip was opened');
}

/** A zip with the same file twice, which `zipSync` cannot write. */
function zipWithTwice(name: string): Uint8Array {
  const parts: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) {
      throw error;
    }
    parts.push(chunk);
  });
  for (const content of [BUNDLE, BUNDLE, VERSION]) {
    const file = new ZipPassThrough(content === VERSION ? 'plugin.json' : name);
    zip.add(file);
    file.push(content, true);
  }
  zip.end();
  return Buffer.concat(parts);
}

describe('a plugin package', () => {
  it('opens to its server bundle and version, named by its hash', () => {
    const zip = testPackage();

    expect(openPluginPackage(zip)).toStrictEqual({
      sha256: createHash('sha256').update(zip).digest('hex'),
      version: '1.2.0',
      code: testBundle(testManifest()),
    });
  });

  it.each([
    ['no server bundle', { 'plugin.json': VERSION }, /must hold server\.js and plugin\.json/],
    ['no version', { 'server.js': BUNDLE }, /must hold server\.js and plugin\.json/],
    [
      'a file of another name',
      { 'server.js': BUNDLE, 'plugin.json': VERSION, 'notes.txt': strToU8('hi') },
      /it holds "notes\.txt"/,
    ],
    [
      'a path leading elsewhere',
      { '../server.js': BUNDLE, 'plugin.json': VERSION },
      /it holds "\.\.\/server\.js"/,
    ],
    [
      'its files in a folder',
      { plugin: { 'server.js': BUNDLE, 'plugin.json': VERSION } },
      /it holds "plugin\/"/,
    ],
    [
      'a version that is not one',
      { 'server.js': BUNDLE, 'plugin.json': strToU8('{"version":"latest"}') },
      /plugin\.json must give its version alone/,
    ],
    [
      'more than a version',
      { 'server.js': BUNDLE, 'plugin.json': strToU8('{"version":"1.2.0","main":"x.js"}') },
      /plugin\.json must give its version alone/,
    ],
    [
      'a version that is not JSON',
      { 'server.js': BUNDLE, 'plugin.json': strToU8('version: 1.2.0') },
      /plugin\.json is not JSON/,
    ],
    [
      'a bundle that is not UTF-8',
      { 'server.js': new Uint8Array([0xff, 0xfe, 0x00]), 'plugin.json': VERSION },
      /server\.js is not UTF-8 text/,
    ],
    [
      'a version too long',
      {
        'server.js': BUNDLE,
        'plugin.json': new Uint8Array(PLUGIN_PACKAGE_LIMITS.metadataBytes + 1),
      },
      /plugin\.json unpacks to more than 1024 bytes/,
    ],
  ])('refuses a zip with %s', (_, files, reason) => {
    expect(refusalOf(zipSync(files))).toMatch(reason);
  });

  it('refuses the same file twice', () => {
    expect(refusalOf(zipWithTwice('server.js'))).toMatch(/it holds server\.js twice/);
  });

  it('refuses what is not a zip, or one it cannot read', () => {
    expect(refusalOf(strToU8('not a zip at all'))).toMatch(/must hold server\.js/);
    const unknownMethod = zipSync({ 'server.js': BUNDLE, 'plugin.json': VERSION }, { level: 0 });
    // The compression method of the first entry, in its local header.
    unknownMethod[8] = 99;
    expect(refusalOf(unknownMethod)).toMatch(/server\.js cannot be unpacked/);
  });

  it('stops unpacking a bundle past its limit, whatever its size compressed', () => {
    const huge = new Uint8Array(PLUGIN_PACKAGE_LIMITS.serverBytes + 1).fill(0x20);
    const zip = zipSync({ 'server.js': huge, 'plugin.json': VERSION }, { level: 9 });

    expect(zip.length).toBeLessThan(100 * 1024);
    expect(refusalOf(zip)).toMatch(/server\.js unpacks to more than 10485760 bytes/);
  });
});
