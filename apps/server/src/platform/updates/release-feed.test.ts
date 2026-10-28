import { TOPPO_VERSION } from '@toppo-tracker/shared';
import { describe, expect, it, vi } from 'vitest';
import { createReleaseFeed } from './release-feed.ts';

const RELEASE = {
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/KevinBrt/toppo/releases/tag/v0.2.0',
};

/** A feed whose GitHub answers `status` with `body`. */
function feedAnswering(status: number, body: unknown = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  return { feed: createReleaseFeed({ enabled: true, fetch }), fetch };
}

describe('the release feed', () => {
  it('reads the latest release of Toppo from GitHub, as Toppo of this version', async () => {
    const { feed, fetch } = feedAnswering(200, RELEASE);

    expect(await feed.latest()).toStrictEqual({ version: '0.2.0', url: RELEASE.html_url });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.github.com/repos/KevinBrt/toppo/releases/latest');
    expect(init?.headers).toMatchObject({ 'user-agent': `Toppo/${TOPPO_VERSION}` });
  });

  it('knows of no release before the first one', async () => {
    expect(await feedAnswering(404).feed.latest()).toBeNull();
  });

  it('refuses an answer that is not a release of Toppo', async () => {
    await expect(feedAnswering(503).feed.latest()).rejects.toThrow('503');
    await expect(
      feedAnswering(200, { ...RELEASE, tag_name: 'nightly' }).feed.latest(),
    ).rejects.toThrow();
    await expect(
      feedAnswering(200, { ...RELEASE, html_url: 'https://example.com/v0.2.0' }).feed.latest(),
    ).rejects.toThrow('not on');
  });
});
