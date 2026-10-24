/** What the server may refuse about the mail settings or a test email, as the reader is told it. */
export const MAIL_ERRORS = {
  MAIL_PASSWORD_REQUIRED: 'mail.errors.passwordRequired',
  MAIL_NOT_CONFIGURED: 'mail.errors.notConfigured',
  MAIL_PASSWORD_UNREADABLE: 'mail.errors.passwordUnreadable',
  MAIL_AUTHENTICATION_FAILED: 'mail.errors.authenticationFailed',
  MAIL_CONNECTION_FAILED: 'mail.errors.connectionFailed',
  MAIL_TLS_FAILED: 'mail.errors.tlsFailed',
  MAIL_REJECTED: 'mail.errors.rejected',
} as const;
