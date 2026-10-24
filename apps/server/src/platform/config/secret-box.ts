import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const FORMAT = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Ties the derived key to this use: the instance's key itself signs sessions. */
const KEY_PURPOSE = 'toppo/secret-box/v1';

/**
 * Seals the few secrets Toppo keeps in the database (the mail server's password) with a key
 * derived from the instance's key, so that a copy of the database alone does not reveal them.
 */
export interface SecretBox {
  seal(plaintext: string): string;
  /** The secret, or `null` when it was sealed with another key: the instance's key changed. */
  open(sealed: string): string | null;
}

/** AES-256-GCM: what is sealed can be neither read nor changed without the key. */
export function createSecretBox(instanceSecret: string): SecretBox {
  const key = Buffer.from(hkdfSync('sha256', instanceSecret, '', KEY_PURPOSE, KEY_BYTES));
  return {
    seal(plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
      const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [
        FORMAT,
        ...[iv, cipher.getAuthTag(), sealed].map((part) => part.toString('base64url')),
      ].join('.');
    },
    open(sealed) {
      const [format, iv, tag, data] = sealed.split('.');
      if (format !== FORMAT || iv === undefined || tag === undefined || data === undefined) {
        return null;
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      try {
        return Buffer.concat([
          decipher.update(Buffer.from(data, 'base64url')),
          decipher.final(),
        ]).toString('utf8');
      } catch (error) {
        // The tag does not match: another key sealed it, or someone changed it.
        if (error instanceof Error && error.message.includes('authenticate')) {
          return null;
        }
        throw error;
      }
    },
  };
}
