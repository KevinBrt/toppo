import { createHash } from 'node:crypto';
import {
  PLUGIN_PACKAGE_FILES,
  PLUGIN_PACKAGE_LIMITS,
  PLUGIN_VERSION,
} from '@toppo-tracker/plugin-sdk/protocol';
import { Unzip, UnzipInflate } from 'fflate';
import { z } from 'zod';
import { HttpError } from '../../http/http-error.ts';

/** A plugin's zip, opened and checked, before anything of it runs. */
export interface PluginPackage {
  /** Of the zip as uploaded, hex-encoded: where it is kept, and what the administrator compares. */
  sha256: string;
  /** As `plugin.json` says: `1.2.0`. */
  version: string;
  /** The server bundle. */
  code: string;
}

/** Each file a zip may hold, with its size once unpacked, at most. */
const FILE_LIMITS: ReadonlyMap<string, number> = new Map([
  [PLUGIN_PACKAGE_FILES.server, PLUGIN_PACKAGE_LIMITS.serverBytes],
  [PLUGIN_PACKAGE_FILES.metadata, PLUGIN_PACKAGE_LIMITS.metadataBytes],
]);

/**
 * The zip is fed to the unpacker this much at a time, its output counted in between: a file that
 * unpacks past its limit is stopped there, whatever its header claimed.
 */
const CHUNK_BYTES = 64 * 1024;

const metadataSchema = z.strictObject({ version: z.string().regex(PLUGIN_VERSION) });

function invalid(reason: string): HttpError {
  return new HttpError(422, 'PLUGIN_PACKAGE_INVALID', `This is not a plugin's zip: ${reason}`);
}

/**
 * Opens a zip uploaded as a plugin: `server.js` and `plugin.json`, nothing else, none twice,
 * each within its limit once unpacked. Paths are compared whole, so none can lead elsewhere.
 */
export function openPluginPackage(zip: Uint8Array): PluginPackage {
  const files = unpack(zip);
  const server = files.get(PLUGIN_PACKAGE_FILES.server);
  const metadata = files.get(PLUGIN_PACKAGE_FILES.metadata);
  if (!(server && metadata)) {
    throw invalid('it must hold server.js and plugin.json, as `toppo plugin build` writes them');
  }
  return {
    sha256: createHash('sha256').update(zip).digest('hex'),
    version: versionOf(metadata),
    code: textOf(server, PLUGIN_PACKAGE_FILES.server),
  };
}

function unpack(zip: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  let unpacked = 0;
  let refusal: string | undefined;
  const refuse = (reason: string) => {
    refusal ??= reason;
  };

  const unzip = new Unzip((file) => {
    const limit = FILE_LIMITS.get(file.name);
    if (limit === undefined) {
      refuse(`it holds ${JSON.stringify(file.name.slice(0, 100))}`);
      return;
    }
    if (seen.has(file.name)) {
      refuse(`it holds ${file.name} twice`);
      return;
    }
    seen.add(file.name);
    const chunks: Uint8Array[] = [];
    let size = 0;
    file.ondata = (error, data, final) => {
      if (error) {
        refuse(`${file.name} cannot be unpacked`);
        return;
      }
      size += data.length;
      unpacked += data.length;
      if (size > limit || unpacked > PLUGIN_PACKAGE_LIMITS.unpackedBytes) {
        refuse(`${file.name} unpacks to more than ${limit} bytes`);
        file.terminate();
        return;
      }
      chunks.push(data);
      if (final) {
        files.set(file.name, Buffer.concat(chunks, size));
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  try {
    for (let start = 0; start < zip.length && refusal === undefined; start += CHUNK_BYTES) {
      unzip.push(zip.subarray(start, start + CHUNK_BYTES), start + CHUNK_BYTES >= zip.length);
    }
  } catch {
    // fflate refuses what it cannot read: an unknown compression, a broken entry.
    refuse('it cannot be read as a zip');
  }
  if (refusal !== undefined) {
    throw invalid(refusal);
  }
  return files;
}

function textOf(file: Uint8Array, name: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(file);
  } catch {
    throw invalid(`${name} is not UTF-8 text`);
  }
}

function versionOf(metadata: Uint8Array): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textOf(metadata, PLUGIN_PACKAGE_FILES.metadata));
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw invalid('plugin.json is not JSON');
  }
  const read = metadataSchema.safeParse(parsed);
  if (!read.success) {
    throw invalid('plugin.json must give its version alone, such as { "version": "1.2.0" }');
  }
  return read.data.version;
}
