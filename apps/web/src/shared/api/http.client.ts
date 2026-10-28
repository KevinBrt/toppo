import { apiErrorSchema } from '@toppo-tracker/shared';
import { z } from 'zod';

/** A failed API call, with the stable error code the server or Better Auth returned. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  /** What the server refused, field by field, when it says. */
  readonly details: readonly { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    options?: ErrorOptions,
    details: readonly { path: string; message: string }[] = [],
  ) {
    super(message, options);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Better Auth answers errors as `{ code, message }` rather than Toppo's envelope. */
const betterAuthErrorSchema = z.object({ code: z.string(), message: z.string() });

export interface ApiRequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON; a file (`Blob`) is sent as it is, as `application/octet-stream`. */
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  /** Every response is validated: the UI never works on data of an unexpected shape. */
  schema: z.ZodType<T>;
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, headers = {}, schema }: ApiRequestOptions<T>,
): Promise<T> {
  const response = await send(path, {
    method,
    headers: { accept: 'application/json', ...contentTypeOf(body), ...headers },
    ...(body === undefined ? {} : { body: body instanceof Blob ? body : JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiRequestError(response.status, payload);
  }
  return schema.parse(payload);
}

/** The bytes the server answers, such as a file's, for the app to show them itself. */
export async function apiBytes(path: string): Promise<ArrayBuffer> {
  const response = await send(path, {});
  if (!response.ok) {
    throw toApiRequestError(response.status, await response.json().catch(() => null));
  }
  return await response.arrayBuffer();
}

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, credentials: 'same-origin' });
  } catch (error) {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'The server cannot be reached', { cause: error });
  }
}

function contentTypeOf(body: unknown): Record<string, string> {
  if (body === undefined) {
    return {};
  }
  return { 'content-type': body instanceof Blob ? 'application/octet-stream' : 'application/json' };
}

function toApiRequestError(status: number, payload: unknown): ApiRequestError {
  if (status === 429) {
    return new ApiRequestError(status, 'TOO_MANY_REQUESTS', 'Too many requests');
  }
  const toppo = apiErrorSchema.safeParse(payload);
  if (toppo.success) {
    const { code, message, details } = toppo.data.error;
    return new ApiRequestError(status, code, message, undefined, details);
  }
  const betterAuth = betterAuthErrorSchema.safeParse(payload);
  if (betterAuth.success) {
    return new ApiRequestError(status, betterAuth.data.code, betterAuth.data.message);
  }
  return new ApiRequestError(status, 'UNEXPECTED_RESPONSE', `HTTP ${status}`);
}
