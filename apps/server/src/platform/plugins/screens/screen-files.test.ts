import { describe, expect, it, vi } from 'vitest';
import { testPackage } from '../packages/test-package.ts';
import { createScreenBundles } from './screen-files.ts';

const ZIP = testPackage({ screens: '/* screens */' });
const SHA256 = 'a'.repeat(64);

/** A store whose reads the test counts. */
function countedStore() {
  const read = vi.fn((_kept: { slug: string; sha256: string }) => Promise.resolve(ZIP));
  return { read };
}

describe('the screens’ bundles kept in memory', () => {
  it('reads a package once, however many ask for its bundle at the same time', async () => {
    const store = countedStore();
    const bundles = createScreenBundles(store);

    const read = await Promise.all(
      Array.from({ length: 10 }, () => bundles.read({ slug: 'time-tracking', sha256: SHA256 })),
    );

    expect(read).toStrictEqual(Array(10).fill('/* screens */'));
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it('forgets the bundle asked for the longest ago, not the first one read', async () => {
    const store = countedStore();
    const bundles = createScreenBundles(store);
    const plugin = (n: number) => ({ slug: `plugin-${n}`, sha256: SHA256 });

    for (let n = 0; n < 16; n += 1) {
      await bundles.read(plugin(n));
    }
    await bundles.read(plugin(0));
    await bundles.read(plugin(16));
    await bundles.read(plugin(0));
    await bundles.read(plugin(1));

    expect(store.read.mock.calls.map(([kept]) => kept.slug)).toStrictEqual([
      ...Array.from({ length: 17 }, (_, n) => `plugin-${n}`),
      'plugin-1',
    ]);
  });

  it('reads a package again once a read failed', async () => {
    const store = countedStore();
    store.read.mockRejectedValueOnce(new Error('Disk unplugged'));
    const bundles = createScreenBundles(store);
    const kept = { slug: 'time-tracking', sha256: SHA256 };

    await expect(bundles.read(kept)).rejects.toThrow('Disk unplugged');
    expect(await bundles.read(kept)).toBe('/* screens */');
    expect(store.read).toHaveBeenCalledTimes(2);
  });
});
