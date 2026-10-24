import type { IssuePropertyField, ProjectFields } from '@toppo/shared';

/**
 * The option a field of the form holds: the one chosen, else its default, or none when the
 * project asks whoever reports the issue to choose.
 */
export function choiceOf(
  chosen: string,
  options: readonly { id: string; isDefault: boolean }[] | undefined,
  required: boolean | undefined,
): string {
  if (chosen || required) {
    return chosen;
  }
  return options?.find(({ isDefault }) => isDefault)?.id ?? '';
}

/**
 * The fields a new issue still needs before it is sent, by the key its error is shown under:
 * the properties required at creation, and the priority and the category its project asks for.
 */
export function missingChoices({
  asked,
  values,
  settings,
  priorityId,
  categoryId,
}: {
  asked: readonly Pick<IssuePropertyField, 'id' | 'required'>[];
  values: Readonly<Record<string, string>>;
  settings: ProjectFields | undefined;
  priorityId: string;
  categoryId: string;
}): string[] {
  return [
    ...asked
      .filter(({ id, required }) => required && !values[id])
      .map(({ id }) => `property.${id}`),
    ...(settings?.priority.required && !priorityId ? ['priorityId'] : []),
    ...(settings?.category.required && !categoryId ? ['categoryId'] : []),
  ];
}
