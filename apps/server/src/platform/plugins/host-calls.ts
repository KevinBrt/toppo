import { HOST_CALLS, type HostCallMethod } from '@toppo-tracker/plugin-sdk/protocol';
import type { z } from 'zod';
import type { ExecutionContext } from '../cqrs/cqrs.ts';
import { HttpError } from '../http/http-error.ts';
import type { CallHandler } from './runtime/plugin-runtime.ts';
import { HostCallError } from './sandbox/plugin-sandbox.ts';

type Call<M extends HostCallMethod> = (typeof HOST_CALLS)[M];

/** How Toppo answers each call a plugin may make: by the features that own each thing. */
export type HostCalls = {
  [M in HostCallMethod]: (
    context: ExecutionContext,
    args: z.output<Call<M>['args']>,
  ) => Promise<z.input<Call<M>['result']>>;
};

function isHostCallMethod(method: string): method is HostCallMethod {
  return Object.hasOwn(HOST_CALLS, method);
}

function argumentsOf<Args extends z.ZodType>(
  method: HostCallMethod,
  schema: Args,
  args: unknown,
): z.output<Args> {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new HostCallError('INVALID_ARGUMENTS', `Toppo refuses the arguments of ${method}`);
  }
  return parsed.data;
}

async function dispatch(
  calls: HostCalls,
  context: ExecutionContext,
  method: HostCallMethod,
  args: unknown,
): Promise<unknown> {
  switch (method) {
    case 'issues.get':
      return HOST_CALLS[method].result.parse(
        await calls[method](context, argumentsOf(method, HOST_CALLS[method].args, args)),
      );
    case 'issues.comment':
      return HOST_CALLS[method].result.parse(
        await calls[method](context, argumentsOf(method, HOST_CALLS[method].args, args)),
      );
  }
}

/**
 * Answers the calls of a plugin's run: only those it may make (its `needs` hold the permission
 * each takes), their arguments checked, run in `context`, as the plugin itself. A refusal of
 * Toppo's reaches the plugin by its code (`ISSUE_NOT_FOUND`, `FORBIDDEN`…).
 */
export function answerCalls(
  calls: HostCalls,
  context: ExecutionContext,
  needs: readonly string[],
): CallHandler {
  return async (method, args) => {
    if (!isHostCallMethod(method)) {
      throw new HostCallError('UNKNOWN_CALL', `Toppo answers no call named ${method}`);
    }
    const takes = HOST_CALLS[method].needs;
    if (!needs.includes(takes)) {
      throw new HostCallError(
        'FORBIDDEN',
        `${method} takes ${takes}, which the plugin does not need`,
      );
    }
    try {
      return await dispatch(calls, context, method, args);
    } catch (error) {
      if (error instanceof HttpError && error.statusCode < 500) {
        throw new HostCallError(error.code, error.message);
      }
      throw error;
    }
  };
}

/** `null` instead of a refusal saying it is not there, for a call that answers `null` so. */
export async function orNullIfNotFound<T>(answer: Promise<T>): Promise<T | null> {
  try {
    return await answer;
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}
