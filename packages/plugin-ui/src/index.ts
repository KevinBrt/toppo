/**
 * `@toppo-tracker/plugin-ui`: what a plugin's screens are drawn with. MIT, as the SDK. Each
 * component and hook here hands over to Toppo's runtime, which Toppo serves in the screen's
 * frame before the plugin's bundle: screens look like Toppo, in the person's language and
 * theme, and reach their plugin through its actions only.
 */
import {
  type Action,
  type Dialog,
  type MessageKey,
  type MessageParams,
  type Messages,
  translate,
  type z,
} from '@toppo-tracker/plugin-sdk';
import {
  type PickedIssue,
  type PickedPerson,
  pickedIssueSchema,
  pickedPersonSchema,
  SCREEN_RUNTIME_GLOBAL,
  type ScreenFailure,
} from '@toppo-tracker/plugin-sdk/protocol';
import { type ComponentType, createElement, type ReactElement } from 'react';
import type {
  ActionMutation,
  ActionQuery,
  AlertProps,
  BadgeProps,
  BarChartProps,
  ButtonProps,
  ConfirmOptions,
  DurationInputProps,
  EmptyStateProps,
  FieldProps,
  InputProps,
  IssueLinkProps,
  LineChartProps,
  MenuProps,
  MeterProps,
  PageLinkProps,
  PageProps,
  PersonNameProps,
  PickIssueOptions,
  PickPeopleOptions,
  RowProps,
  ScreenState,
  ScreenUi,
  SectionProps,
  SelectProps,
  StackProps,
  StatProps,
  SwitchProps,
  TableProps,
  TextareaProps,
} from './contract.ts';

export type {
  PickedIssue,
  PickedPerson,
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
export const Stack = relayed<StackProps>('Stack');
export const Row = relayed<RowProps>('Row');
export const DurationInput = relayed<DurationInputProps>('DurationInput');
export const PersonName = relayed<PersonNameProps>('PersonName');
export const IssueLink = relayed<IssueLinkProps>('IssueLink');
export const PageLink = relayed<PageLinkProps>('PageLink');
export const Menu = relayed<MenuProps>('Menu');
export const BarChart = relayed<BarChartProps>('BarChart');
export const LineChart = relayed<LineChartProps>('LineChart');
export const Meter = relayed<MeterProps>('Meter');

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

/**
 * Has the person confirm, in a dialog of Toppo's that names the plugin: `true` once they did,
 * `false` when they did not.
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return ui().useConfirm();
}

/** What a dialog closes with, as its opener reads it. */
type DialogResult<R extends z.ZodType> = z.output<R> | undefined;

/**
 * Opens one of the plugin's dialogs over the page, with `input`: answers what it closed with,
 * read by its `result` schema, or `undefined` when the person dismissed it.
 */
export function useDialog<I extends z.ZodType, R extends z.ZodType>(
  dialog: Dialog<I, R>,
): { open(input: z.input<I>): Promise<DialogResult<R>> } {
  const open = ui().useOpenDialog();
  return {
    async open(input) {
      const closed = await open(dialog.name, input);
      if (closed === null || closed === undefined || dialog.result === undefined) {
        return undefined;
      }
      const read = dialog.result.safeParse(closed);
      if (!read.success) {
        throw new ScreenError({ code: 'INVALID_RESULT' });
      }
      return read.data;
    },
  };
}

/** In a dialog, what it was opened with, read by its `input` schema. */
export function useDialogInput<I extends z.ZodType>(dialog: Dialog<I, z.ZodType>): z.output<I> {
  const read = dialog.input.safeParse(ui().useDialogInput());
  if (!read.success) {
    throw new ScreenError({ code: 'INVALID_INPUT' });
  }
  return read.data;
}

/** In a dialog, closes it: its opener is answered `result`, checked by the `result` schema. */
export function useCloseDialog<R extends z.ZodType>(
  dialog: Dialog<z.ZodType, R>,
): (result?: z.input<R>) => void {
  const close = ui().useCloseDialog();
  return (result) => {
    if (result !== undefined && dialog.result?.safeParse(result).success === false) {
      throw new ScreenError({ code: 'INVALID_RESULT' });
    }
    close(result);
  };
}

/**
 * Toppo's search of issues, in the projects where the plugin acts that the person sees: the
 * issue they picked, or `null`. The plugin needs `issue.read`.
 */
export function usePickIssue(): (options?: PickIssueOptions) => Promise<PickedIssue | null> {
  const pick = ui().usePick();
  return async (options = {}) => {
    const picked = await pick('issue', options);
    return picked === null ? null : pickedIssueSchema.parse(picked);
  };
}

/**
 * Toppo's search of people who share with the person a project where the plugin acts: those
 * they picked, one unless `multiple`; none when they picked nobody.
 */
export function usePickPeople(): (options?: PickPeopleOptions) => Promise<PickedPerson[]> {
  const pick = ui().usePick();
  return async (options = {}) => {
    const picked = await pick('people', options);
    return picked === null ? [] : pickedPersonSchema.array().parse(picked);
  };
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
