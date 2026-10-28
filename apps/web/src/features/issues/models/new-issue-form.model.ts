import {
  type IssuePropertyField,
  PROPERTY_VALUE_SCHEMAS,
  type ProjectFields,
  type PropertyType,
  type UserRef,
} from '@toppo-tracker/shared';

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
 * What a field of the form holds for a property: the text typed (a number or a day too), the
 * options chosen, someone, a box ticked. Empty, it gives no value.
 */
export type PropertyDraft = string | readonly string[] | UserRef | boolean | null;

/** The value a draft gives, as a request sends it, or `undefined` when it gives none. */
export function valueOfDraft(type: PropertyType, draft: PropertyDraft | undefined): unknown {
  if (draft === undefined || draft === null || draft === false) {
    return undefined;
  }
  if (draft === true) {
    return true;
  }
  if (typeof draft === 'string') {
    const typed = draft.trim();
    if (typed === '') {
      return undefined;
    }
    return type === 'number' ? Number(typed) : typed;
  }
  if ('id' in draft) {
    return draft.id;
  }
  return draft.length > 0 ? draft : undefined;
}

/** The values the form sends, by property id: those its drafts give. */
export function valuesOfDrafts(
  asked: readonly Pick<IssuePropertyField, 'id' | 'type'>[],
  drafts: Readonly<Record<string, PropertyDraft>>,
): Record<string, unknown> {
  return Object.fromEntries(
    asked.flatMap(({ id, type }) => {
      const value = valueOfDraft(type, drafts[id]);
      return value === undefined ? [] : [[id, value]];
    }),
  );
}

export type FormProblem = 'required' | 'invalid';

/**
 * What the form lacks or gets wrong before it is sent, by the key its error shows under: a
 * property required and not given, one given a value its type cannot take, and the priority and
 * the category its project asks for.
 */
export function formProblems({
  asked,
  drafts,
  settings,
  priorityId,
  categoryId,
}: {
  asked: readonly Pick<IssuePropertyField, 'id' | 'type' | 'required'>[];
  drafts: Readonly<Record<string, PropertyDraft>>;
  settings: ProjectFields | undefined;
  priorityId: string;
  categoryId: string;
}): Record<string, FormProblem> {
  const problems: Record<string, FormProblem> = {};
  for (const { id, type, required } of asked) {
    const value = valueOfDraft(type, drafts[id]);
    if (value === undefined) {
      if (required) {
        problems[`property.${id}`] = 'required';
      }
    } else if (!PROPERTY_VALUE_SCHEMAS[type].safeParse(value).success) {
      problems[`property.${id}`] = 'invalid';
    }
  }
  if (settings?.priority.required && !priorityId) {
    problems['priorityId'] = 'required';
  }
  if (settings?.category.required && !categoryId) {
    problems['categoryId'] = 'required';
  }
  return problems;
}
