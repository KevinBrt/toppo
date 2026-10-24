import { describe, expect, it } from 'vitest';
import { mailForm, mailRequest, withSecurity } from './mail-form.model.ts';

describe('the mail form', () => {
  it('starts with STARTTLS on port 587, or with the settings saved', () => {
    expect(mailForm(null)).toMatchObject({ security: 'starttls', port: '587', fromName: 'Toppo' });
    expect(
      mailForm({
        host: 'smtp.example.com',
        port: 465,
        security: 'tls',
        username: 'toppo',
        passwordSet: true,
        fromAddress: 'toppo@example.com',
        fromName: 'Help desk',
      }),
    ).toStrictEqual({
      host: 'smtp.example.com',
      port: '465',
      security: 'tls',
      username: 'toppo',
      password: '',
      fromAddress: 'toppo@example.com',
      fromName: 'Help desk',
    });
  });

  it('sends the port as a number, and no password when none was typed', () => {
    const form = { ...mailForm(null), host: 'smtp.example.com' };

    expect(mailRequest(form)).not.toHaveProperty('password');
    expect(mailRequest({ ...form, password: 'secret' })).toMatchObject({
      port: 587,
      password: 'secret',
    });
  });

  it('moves the port with the security, unless it was typed', () => {
    const form = mailForm(null);

    expect(withSecurity(form, 'tls').port).toBe('465');
    expect(withSecurity({ ...form, port: '2525' }, 'tls').port).toBe('2525');
  });
});
