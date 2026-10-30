import { describe, expect, it } from 'vitest';
import { requestForLog } from './request-log.ts';

describe('a request, as the log says it', () => {
  it('names its path, never its query', () => {
    const logged = requestForLog({
      method: 'POST',
      url: '/api/v1/plugins/commit-links/routes/push.receive?token=s3cret&team=web',
      host: 'toppo.example.com',
      ip: '203.0.113.7',
      socket: { remotePort: 51234 },
    });

    expect(logged).toStrictEqual({
      method: 'POST',
      url: '/api/v1/plugins/commit-links/routes/push.receive',
      host: 'toppo.example.com',
      remoteAddress: '203.0.113.7',
      remotePort: 51234,
    });
    expect(JSON.stringify(logged)).not.toContain('s3cret');
  });
});
