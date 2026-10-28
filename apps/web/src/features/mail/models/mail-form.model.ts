import {
  MAIL_DEFAULT_PORTS,
  type MailSecurity,
  type MailSettings,
  type MailSettingsRequest,
} from '@toppo-tracker/shared';

/** The mail settings as the form edits them: every field as typed. */
export interface MailForm {
  host: string;
  port: string;
  security: MailSecurity;
  username: string;
  /** Empty keeps the password saved. */
  password: string;
  fromAddress: string;
  fromName: string;
}

/** The form, filled with the settings saved, or with the usual values for a new server. */
export function mailForm(settings: MailSettings | null): MailForm {
  return {
    host: settings?.host ?? '',
    port: String(settings?.port ?? MAIL_DEFAULT_PORTS.starttls),
    security: settings?.security ?? 'starttls',
    username: settings?.username ?? '',
    password: '',
    fromAddress: settings?.fromAddress ?? '',
    fromName: settings?.fromName ?? 'Toppo',
  };
}

/** What the server is sent: a password left empty keeps the one saved. */
export function mailRequest(form: MailForm): MailSettingsRequest {
  const { port, password, ...fields } = form;
  return {
    ...fields,
    port: Number(port),
    ...(password === '' ? {} : { password }),
  };
}

/**
 * The form once another security is chosen: the port follows, unless someone typed their own.
 */
export function withSecurity(form: MailForm, security: MailSecurity): MailForm {
  const usual = form.port === String(MAIL_DEFAULT_PORTS[form.security]);
  return { ...form, security, port: usual ? String(MAIL_DEFAULT_PORTS[security]) : form.port };
}
