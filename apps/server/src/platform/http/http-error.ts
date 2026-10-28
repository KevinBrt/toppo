import type { ApiError } from '@toppo-tracker/shared';

/**
 * An expected failure with a stable machine-readable code, answered as-is by the error handler.
 * Use it for 4xx outcomes; unexpected errors stay plain `Error`s and become a generic 500.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** What the answer says beside its code: a plugin's own refusal, field by field. */
  readonly more: Pick<ApiError['error'], 'details' | 'plugin'>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    more: Pick<ApiError['error'], 'details' | 'plugin'> = {},
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.more = more;
  }
}
