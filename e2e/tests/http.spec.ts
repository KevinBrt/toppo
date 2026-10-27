import { expect, test } from './fixtures.ts';

// HTTP behavior does not depend on the device: run once.
// biome-ignore lint/correctness/usePlaywrightValidDescribeCallback: Playwright takes the details (tags) before the callback.
test.describe('HTTP contract', { tag: '@desktop-only' }, () => {
  test('/health reports a healthy instance', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toStrictEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  test('pages are served with strict security headers', async ({ request }) => {
    const response = await request.get('/issues');
    const headers = response.headers();

    expect(response.status()).toBe(200);
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toBe('no-cache');
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('compiled assets are cached for a year', async ({ page, request }) => {
    await page.goto('/issues');
    const script = await page.locator('script[type="module"]').first().getAttribute('src');
    expect(script).toMatch(/^\/assets\//);

    const response = await request.get(script ?? '');
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('unknown API routes answer JSON, not the app', async ({ request }) => {
    const response = await request.get('/api/v1/nothing');

    expect(response.status()).toBe(404);
    expect(await response.json()).toStrictEqual({
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  test('search engines are asked not to index the instance', async ({ request }) => {
    const response = await request.get('/robots.txt');

    expect(await response.text()).toContain('Disallow: /');
  });
});
