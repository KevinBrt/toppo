import type { IssueActivityPayload, IssueActivityType } from '@toppo-tracker/shared';

/** An activity's type and payload, the payload checked against its type at compile time. */
export function activity<T extends IssueActivityType>(
  type: T,
  payload: IssueActivityPayload<T>,
): { type: T; payload: IssueActivityPayload<T> } {
  return { type, payload };
}
