import { describe, expect, it } from 'vitest';
import { composeMail } from './mail-layout.ts';

const content = {
  subject: 'Grace Hopper invited you',
  heading: 'Join <Toppo>',
  paragraphs: ['Grace Hopper & co invited you.', 'The link works for 7 days.'],
  action: {
    label: 'Accept the invitation',
    url: new URL('https://toppo.example.com/invitation#abc'),
  },
  footer: 'You receive this because someone invited you.',
};

describe('an email', () => {
  it('says the same in plain text, the link written out', () => {
    const { subject, text } = composeMail(content);

    expect(subject).toBe('Grace Hopper invited you');
    expect(text).toBe(
      [
        'Join <Toppo>',
        'Grace Hopper & co invited you.',
        'The link works for 7 days.',
        'Accept the invitation: https://toppo.example.com/invitation#abc',
        '-- \nYou receive this because someone invited you.',
      ].join('\n\n'),
    );
  });

  it('keeps its subject on one line, whatever the names in it hold', () => {
    const { subject } = composeMail({
      ...content,
      subject: 'Toppo stopped the webhook CI\r\nBcc: x',
    });

    expect(subject).toBe('Toppo stopped the webhook CI Bcc: x');
  });

  it('escapes in HTML everything it did not write itself', () => {
    const { html } = composeMail({
      ...content,
      paragraphs: ['<script>alert(1)</script>', 'Say "hi"'],
    });

    expect(html).toContain('Join &lt;Toppo&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Say &quot;hi&quot;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="https://toppo.example.com/invitation#abc"');
  });
});
