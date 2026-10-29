/**
 * `@toppo-tracker/plugin-ui`: what a plugin's screens are drawn with. MIT, as the SDK. Each
 * component and hook here hands over to Toppo's runtime, which Toppo serves in the screen's
 * frame before the plugin's bundle: screens look like Toppo, in the person's language and
 * theme, and reach their plugin through its actions only.
 */
import {
  type Action,
  type MessageKey,
  type MessageParams,
  type Messages,
  translate,
  type z,
} from '@toppo-tracker/plugin-sdk';
import { SCREEN_RUNTIME_GLOBAL, type ScreenFailure } from '@toppo-tracker/plugin-sdk/protocol';
import { type ComponentType, createElement, type ReactElement } from 'react';
import type {
  ActionMutation,
  ActionQuery,
  AlertProps,
  BadgeProps,
  ButtonProps,
  DurationInputProps,
  EmptyStateProps,
  FieldProps,
  InputProps,
  IssueLinkProps,
  PageLinkProps,
  PageProps,
  PersonNameProps,
  ScreenState,
  ScreenUi,
  SectionProps,
  SelectProps,
  StatProps,
  SwitchProps,
  TableProps,
  TextareaProps,
} from './contract.ts';

export type {
  ScreenFailure,
  ScreenSearch,
  ScreenTarget,
} from '@toppo-tracker/plugin-sdk/protocol';
export type * from './contract.ts';

/**
 * Why an action a screen ran failed: the plugin's own message key (`ctx.fail`), or one of
 * Toppo's codes (`FORBIDDEN`, `VALIDATION_FAILED` with its issues).
 */
export class ScreenError extends Error implements ScreenFailure {
  readonly code: string;
  readonly params: ScreenFailure['params'];
  readonly issues: ScreenFailure['issues'];

  constructor(failure: ScreenFailure) {
    super(failure.code);
    this.name = 'ScreenError';
    this.code = failure.code;
    this.params = failure.params;
    this.issues = failure.issues;
  }
}

/** Toppo's runtime, in the frame; refused outside one, where no screen draws. */
function ui(): ScreenUi {
  const runtime: unknown = Reflect.get(globalThis, SCREEN_RUNTIME_GLOBAL);
  const found =
    typeof runtime === 'object' && runtime !== null ? Reflect.get(runtime, 'ui') : undefined;
  if (typeof found !== 'object' || found === null) {
    throw new Error('A screen draws in Toppo, in the frame its runtime prepares');
  }
  // Toppo's runtime fills it as this contract says.
  return found as ScreenUi;
}

/** A component of Toppo's runtime, under its name. */
function relayed<P extends object>(name: keyof ScreenUi): (props: P) => ReactElement {
  const component = (props: P) => createElement(ui()[name] as ComponentType<P>, props);
  component.displayName = name;
  return component;
}

export const Button = relayed<ButtonProps>('Button');
export const Badge = relayed<BadgeProps>('Badge');
export const Alert = relayed<AlertProps>('Alert');
export const EmptyState = relayed<EmptyStateProps>('EmptyState');
export const Field = relayed<FieldProps>('Field');
export const Input = relayed<InputProps>('Input');
export const Textarea = relayed<TextareaProps>('Textarea');
export const Select = relayed<SelectProps>('Select');
export const Switch = relayed<SwitchProps>('Switch');
export const Page = relayed<PageProps>('Page');
export const Section = relayed<SectionProps>('Section');
export const Stat = relayed<StatProps>('Stat');
export const Table = relayed<TableProps>('Table');
export const DurationInput = relayed<DurationInputProps>('DurationInput');
export const PersonName = relayed<PersonNameProps>('PersonName');
export const IssueLink = relayed<IssueLinkProps>('IssueLink');
export const PageLink = relayed<PageLinkProps>('PageLink');

/**
 * What one of the plugin's actions answers, asked as the screen shows and again when its input
 * changes: run for the person looking, with what they and the plugin may do.
 */
export function useActionQuery<I extends z.ZodType, R>(
  action: Action<I, R>,
  input: z.input<I>,
  { enabled = true }: { enabled?: boolean } = {},
): ActionQuery<R> {
  // Toppo answers what the action answers: its result as the plugin wrote it.
  return ui().useActionQuery(action.name, input, enabled) as ActionQuery<R>;
}

/**
 * One of the plugin's actions, run when the person acts, its input checked by its own schema
 * first: what the screen shows is asked again once it succeeds.
 */
export function useActionMutation<I extends z.ZodType, R>(
  action: Action<I, R>,
): ActionMutation<z.input<I>, R> {
  const mutation = ui().useActionMutation(action.name);
  return {
    ...mutation,
    async run(input) {
      const checked = action.input.safeParse(input);
      if (!checked.success) {
        throw new ScreenError({
          code: 'VALIDATION_FAILED',
          issues: checked.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      try {
        return (await mutation.run(input)) as R;
      } catch (failure) {
        throw new ScreenError(failure as ScreenFailure);
      }
    },
  };
}

/** What the screen shows and for whom, and where it may lead. */
export function useScreen(): ScreenState {
  return ui().useScreen();
}

/** The names of people, those the person looking may see; `null` for one they may not. */
export function usePeople(ids: readonly string[]): ReadonlyMap<string, string | null> {
  return ui().usePeople(ids);
}

/** The plugin's words, in the person's language, typed by its messages. */
export function useT<M extends Messages>(plugin: {
  readonly messages: { readonly en: M; readonly fr: Messages };
}): (key: MessageKey<M>, params?: MessageParams) => string {
  const { locale } = useScreen();
  return (key, params) => translate(plugin.messages[locale], key, params);
}

/** Minutes as people read them: "6 h 40". */
export function formatDuration(minutes: number): string {
  return ui().formatDuration(minutes);
}
