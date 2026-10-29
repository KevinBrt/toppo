import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyReply } from 'fastify';
import { screensOf } from '../packages/open-package.ts';
import type { PackageStore } from '../packages/package-store.ts';

/**
 * What a screen's frame allows: scripts and styles from Toppo only, Toppo's fonts and images
 * carried inline, and nothing to reach: no request, no form, no other frame, no address of its
 * own (`sandbox` without `allow-same-origin`). Its only way out is the bridge to the page.
 */
export const FRAME_CSP = [
  // Forms submit to the screen's own code only: `form-action 'none'` sends them nowhere.
  'sandbox allow-scripts allow-forms',
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  'font-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

/** A screen someone may open, as its frame loads it. */
export interface ScreenFrame {
  slug: string;
  /** Of its plugin's package: its bundle's address changes with it. */
  sha256: string;
  screen: string;
  locale: 'en' | 'fr';
}

/** The runtime of every screen: one script and its stylesheet, served as built. */
export interface ScreenRuntime {
  /** Changes with what it serves: the frames' addresses for it, kept by browsers meanwhile. */
  version: string;
  file(name: string): { body: Buffer; type: string } | undefined;
}

const RUNTIME_FILES = {
  'runtime.js': 'text/javascript; charset=utf-8',
  'runtime.css': 'text/css; charset=utf-8',
} as const;

/**
 * Reads the screens' runtime as built (`packages/plugin-runtime/dist`), once at startup: nothing
 * of a request ever reaches the file system. `undefined` when it is not built (some tests).
 */
export function loadScreenRuntime(root: string): ScreenRuntime | undefined {
  const files = new Map<string, { body: Buffer; type: string }>();
  for (const [name, type] of Object.entries(RUNTIME_FILES)) {
    const path = join(root, name);
    if (!existsSync(path)) {
      return undefined;
    }
    files.set(name, { body: readFileSync(path), type });
  }
  const hash = createHash('sha256');
  for (const { body } of files.values()) {
    hash.update(body);
  }
  return { version: hash.digest('hex').slice(0, 16), file: (name) => files.get(name) };
}

/** A screen bundle, its address changing with its package: kept by browsers while it holds. */
export function sendScreenScript(
  reply: FastifyReply,
  body: Buffer | string,
  type: string,
): FastifyReply {
  return (
    reply
      .header('content-type', type)
      .header('cache-control', 'public, max-age=31536000, immutable')
      // Loaded by frames without an origin: the browser would refuse it to them otherwise.
      .header('cross-origin-resource-policy', 'cross-origin')
      .send(body)
  );
}

/** Screen bundles read from the packages kept, the last ones asked for kept in memory. */
export interface ScreenBundles {
  read(kept: { slug: string; sha256: string }): Promise<string | undefined>;
}

/** Bundles kept in memory at once: a few plugins' screens, each read from its zip once. */
const BUNDLES_KEPT = 16;

export function createScreenBundles(store: Pick<PackageStore, 'read'>): ScreenBundles {
  const kept = new Map<string, string | undefined>();
  return {
    async read(wanted) {
      const key = `${wanted.slug}@${wanted.sha256}`;
      if (kept.has(key)) {
        return kept.get(key);
      }
      const bundle = screensOf(await store.read(wanted));
      if (kept.size >= BUNDLES_KEPT) {
        const [oldest] = kept.keys();
        if (oldest !== undefined) {
          kept.delete(oldest);
        }
      }
      kept.set(key, bundle);
      return bundle;
    },
  };
}

const escaped = (text: string) =>
  text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/**
 * The document of a screen's frame: Toppo's runtime, then the plugin's bundle, which draws the
 * screen named on the document. No inline script: the CSP would refuse it.
 */
export function framePage({
  slug,
  sha256,
  screen,
  runtimeVersion,
  locale,
}: ScreenFrame & { runtimeVersion: string }): string {
  const bundle = `/plugin-screens/${encodeURIComponent(slug)}/web.js?v=${sha256.slice(0, 16)}`;
  return `<!doctype html>
<html lang="${escaped(locale)}" data-screen="${escaped(screen)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/plugin-runtime/runtime.css?v=${runtimeVersion}">
<script defer src="/plugin-runtime/runtime.js?v=${runtimeVersion}"></script>
<script defer src="${escaped(bundle)}"></script>
</head>
<body><div id="root"></div></body>
</html>
`;
}
