import { apiErrorSchema } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ZodTypeProvider } from './platform/http/zod.ts';
import { buildTestApp, createWebRoot } from './test-helpers.ts';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('route contracts', () => {
  it('refuses a route that does not declare its access rule', async () => {
    app = await buildTestApp();
    expect(() => app?.get('/api/v1/open', () => ({}))).toThrow(
      'Route GET /api/v1/open must declare config.access',
    );
  });

  it('refuses an API route without a response schema', async () => {
    app = await buildTestApp();
    expect(() => app?.get('/api/v1/leaky', { config: { access: 'public' } }, () => ({}))).toThrow(
      'Route GET /api/v1/leaky must declare a response schema',
    );
  });

  it('refuses a project route whose path does not name the project', async () => {
    app = await buildTestApp();
    const route = {
      config: { access: { project: 'projectKey' as const } },
      schema: { response: { 200: z.object({}) } },
    };

    expect(() => app?.post('/api/v1/examples', route, () => ({}))).toThrow(
      'Route POST /api/v1/examples must name its project in the path (:projectKey)',
    );
    expect(() =>
      app?.post('/api/v1/projects/:projectKey/examples', route, () => ({})),
    ).not.toThrow();
  });
});

describe('security headers', () => {
  it('sends a strict CSP and hardening headers on every response', async () => {
    app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    const csp = response.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'cross-origin-opener-policy': 'same-origin',
    });
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('does not force HTTPS when Toppo is served over plain HTTP', async () => {
    app = await buildTestApp({ publicUrl: 'http://192.168.1.10:3000' });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['strict-transport-security']).toBeUndefined();
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('enables HSTS and request upgrades behind HTTPS', async () => {
    app = await buildTestApp({ publicUrl: 'https://toppo.example.com' });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });
});

describe('request ids', () => {
  it('generates its own id and ignores the one sent by the client', async () => {
    app = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'forged\nid' },
    });

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('validation, serialization and errors', () => {
  async function buildAppWithTestRoutes(): Promise<FastifyInstance> {
    const instance = await buildTestApp();
    const typed = instance.withTypeProvider<ZodTypeProvider>();
    typed.post(
      '/api/test/echo',
      {
        config: { access: 'public' },
        schema: {
          body: z.object({ title: z.string().min(1) }),
          response: { 200: z.object({ title: z.string() }) },
        },
      },
      (request) => ({ title: request.body.title, passwordHash: 'must-not-leak' }),
    );
    typed.get(
      '/api/test/crash',
      { config: { access: 'public' }, schema: { response: { 200: z.object({}) } } },
      () => {
        throw new Error('connection string postgres://user:secret@db leaked');
      },
    );
    return instance;
  }

  it('rejects an invalid body with a 400 and the failing fields', async () => {
    app = await buildAppWithTestRoutes();
    const response = await app.inject({ method: 'POST', url: '/api/test/echo', body: {} });

    expect(response.statusCode).toBe(400);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toStrictEqual([{ path: 'body.title', message: expect.any(String) }]);
  });

  it('strips every field the response schema does not declare', async () => {
    app = await buildAppWithTestRoutes();
    const response = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      body: { title: 'Export CSV' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ title: 'Export CSV' });
  });

  it('answers server errors with a generic message', async () => {
    app = await buildAppWithTestRoutes();
    const response = await app.inject({ method: 'GET', url: '/api/test/crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toStrictEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(response.body).not.toContain('secret');
  });

  it('keeps client errors explicit', async () => {
    app = await buildAppWithTestRoutes();
    const response = await app.inject({
      method: 'POST',
      url: '/api/test/echo',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('FST_ERR_CTP_INVALID_JSON_BODY');
  });
});

describe('without a built web app', () => {
  it.each([
    ['GET', '/'],
    ['GET', '/api/v1/nothing'],
    ['POST', '/api/v1/nothing'],
  ] as const)('%s %s answers a JSON 404', async (method, url) => {
    app = await buildTestApp();
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
});

describe('with a built web app', () => {
  const webRoot = createWebRoot();
  let webApp: FastifyInstance;

  beforeAll(async () => {
    webApp = await buildTestApp({ webRoot: webRoot.root });
  });

  afterAll(async () => {
    await webApp.close();
    webRoot.cleanup();
  });

  it.each(['/', '/issues', '/projects/WEB/issues/WEB-42?tab=activity'])(
    'serves index.html for the client-side route %s',
    async (url) => {
      const response = await webApp.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.body).toContain('<title>Toppo</title>');
    },
  );

  it('gives every page its own CSP nonce, matching the header', async () => {
    const first = await webApp.inject({ method: 'GET', url: '/issues' });
    const second = await webApp.inject({ method: 'GET', url: '/issues' });

    const nonceOf = (body: string) => /nonce="([0-9a-f]{32})"/.exec(body)?.[1];
    const nonce = nonceOf(first.body);
    expect(nonce).toBeDefined();
    expect(first.body).not.toContain('__TOPPO_CSP_NONCE__');
    expect(first.headers['content-security-policy']).toContain(`style-src 'self' 'nonce-${nonce}'`);
    expect(nonceOf(second.body)).not.toBe(nonce);
  });

  it('serves hashed assets with a long immutable cache', async () => {
    const response = await webApp.inject({ method: 'GET', url: '/assets/app-abc123.js' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves root files by exact name', async () => {
    const response = await webApp.inject({ method: 'GET', url: '/favicon.svg?v=2' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
  });

  it.each(['/assets/missing.js', '/api/v1/nothing'])(
    'answers a JSON 404 for %s instead of the app',
    async (url) => {
      const response = await webApp.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
    },
  );

  it.each([
    '/assets/../index.html',
    '/assets/..%2findex.html',
    '/assets/..%2f..%2fpackage.json',
    '/assets/%2e%2e/%2e%2e/package.json',
    '/assets/..\\..\\package.json',
  ])('never serves files outside the assets directory (%s)', async (url) => {
    const response = await webApp.inject({ method: 'GET', url });

    expect(response.body).not.toContain('"name"');
    if (response.statusCode === 200) {
      // Only the SPA fallback may answer 200, never a file from outside assets/.
      expect(response.body).toContain('<title>Toppo</title>');
    }
  });

  it('does not fall back to the app for non-read methods', async () => {
    const response = await webApp.inject({ method: 'POST', url: '/issues' });

    expect(response.statusCode).toBe(404);
  });
});
