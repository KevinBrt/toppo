import { describe, expect, it } from 'vitest';
import { emailSchema, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordSchema } from './auth.ts';
import { setupRequestSchema } from './instance/setup.ts';

describe('emailSchema', () => {
  it('normalizes case and surrounding spaces so one person has one account', () => {
    expect(emailSchema.parse('  Ada.Lovelace@Example.COM ')).toBe('ada.lovelace@example.com');
  });

  it.each(['', 'ada', 'ada@', '@example.com', `${'a'.repeat(250)}@example.com`])(
    'rejects %j',
    (email) => {
      expect(emailSchema.safeParse(email).success).toBe(false);
    },
  );
});

describe('passwordSchema', () => {
  it('accepts a passphrase of the minimum length, without composition rules', () => {
    expect(passwordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH)).success).toBe(true);
  });

  it('rejects passwords outside the allowed length', () => {
    expect(passwordSchema.safeParse('a'.repeat(PASSWORD_MIN_LENGTH - 1)).success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(PASSWORD_MAX_LENGTH + 1)).success).toBe(false);
  });

  it('does not trim passwords: spaces are significant', () => {
    expect(passwordSchema.parse('  correct horse  ')).toBe('  correct horse  ');
  });
});

describe('setupRequestSchema', () => {
  const valid = {
    setupCode: ' ABCD-EFGH-JKLM ',
    admin: { name: ' Ada ', email: 'ADA@example.com', password: 'correct horse battery' },
  };

  it('normalizes the request, in English unless told otherwise', () => {
    expect(setupRequestSchema.parse(valid)).toStrictEqual({
      setupCode: 'ABCD-EFGH-JKLM',
      admin: { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery' },
      locale: 'en',
    });
  });

  it('accepts supported languages only', () => {
    expect(setupRequestSchema.parse({ ...valid, locale: 'fr' }).locale).toBe('fr');
    expect(setupRequestSchema.safeParse({ ...valid, locale: 'xx' }).success).toBe(false);
  });

  it('requires every field', () => {
    const result = setupRequestSchema.safeParse({ admin: {} });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.')).sort()).toStrictEqual([
      'admin.email',
      'admin.name',
      'admin.password',
      'setupCode',
    ]);
  });
});
