import { releasedVersionSchema, TOPPO_VERSION } from '@toppo/shared';
import { z } from 'zod';

/** Where Toppo's releases are published; the only address the check calls. */
const LATEST_RELEASE = 'https://api.github.com/repos/KevinBrt/toppo/releases/latest';
const RELEASE_PAGES = 'https://github.com/KevinBrt/toppo/releases/';
/** Long enough for a slow network, short enough not to hold a worker. */
const TIMEOUT_MS = 10_000;

/** What GitHub says of a release, as far as the check reads it. */
const releaseSchema = z.object({ tag_name: z.string(), html_url: z.url() });

/** A version published, and the page of its release notes. */
export interface PublishedRelease {
  version: string;
  url: string;
}

/** The versions of Toppo published, as the instance may learn them. */
export interface ReleaseFeed {
  /** Whether the instance looks at all (`TOPPO_UPDATE_CHECK`). */
  enabled: boolean;
  /**
   * The latest version published, or `null` while none is; throws when no answer can be had,
   * or one that is not a release of Toppo.
   */
  latest(): Promise<PublishedRelease | null>;
}

export function createReleaseFeed({
  enabled,
  fetch = globalThis.fetch,
}: {
  enabled: boolean;
  fetch?: typeof globalThis.fetch;
}): ReleaseFeed {
  return {
    enabled,
    async latest() {
      const response = await fetch(LATEST_RELEASE, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': `Toppo/${TOPPO_VERSION}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // GitHub answers 404 until a first version is released.
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status} for the latest release`);
      }
      const release = releaseSchema.parse(await response.json());
      const version = releasedVersionSchema.parse(release.tag_name.replace(/^v/, ''));
      if (!release.html_url.startsWith(RELEASE_PAGES)) {
        throw new Error(`The latest release is not on ${RELEASE_PAGES}`);
      }
      return { version, url: release.html_url };
    },
  };
}
