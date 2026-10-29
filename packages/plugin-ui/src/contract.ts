import type { ScreenFailure, ScreenSearch, ScreenTarget } from '@toppo-tracker/plugin-sdk/protocol';
import type { ComponentType, ReactNode } from 'react';

/** Toppo's palette, for a badge or a stat that needs a color. */
export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'violet' | 'cyan' | 'orange' | 'pink';

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
}

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
}

export interface AlertProps {
  children: ReactNode;
  tone?: 'info' | 'danger';
}

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

/** What a labelled field gives its control, to spread on it: `<Input {...control} … />`. */
export interface FieldControl {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

/** A labelled field: the control is given the id, and the description and error it is tied to. */
export interface FieldProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: (control: FieldControl) => ReactNode;
}

export interface InputProps extends Partial<FieldControl> {
  type?: 'text' | 'number' | 'date' | 'email' | 'url';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  disabled?: boolean;
}

export interface TextareaProps extends Partial<FieldControl> {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
}

export interface SelectProps extends Partial<FieldControl> {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Its accessible name. */
  label: string;
  disabled?: boolean;
}

/** Room between what a stack or a row holds. */
export type Gap = 'small' | 'medium' | 'large';

/**
 * What it holds, one under the other: a screen lays itself out with stacks and rows, never with
 * classes of its own, which Toppo's stylesheet may not have.
 */
export interface StackProps {
  children: ReactNode;
  /** `medium` by default. */
  gap?: Gap;
}

/** What it holds, side by side, going to the next line when the screen is narrow. */
export interface RowProps {
  children: ReactNode;
  /** `medium` by default. */
  gap?: Gap;
  /** Across the row: `center` by default. */
  align?: 'start' | 'center' | 'end' | 'baseline';
  /** Along the row: `start` by default; `between` pushes the first and last to each end. */
  justify?: 'start' | 'end' | 'between';
}

/** A page's frame: its one title, what may be done on it, then its content. */
export interface PageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** A part of a screen, named by its title. */
export interface SectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** A figure and what it counts. */
export interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'danger' | 'success';
}

export interface TableColumn {
  key: string;
  header: string;
  align?: 'start' | 'end';
}

/** Rows given whole: a screen asks its plugin for a page of them, never for all. */
export interface TableProps {
  caption: string;
  columns: readonly TableColumn[];
  rows: readonly ({ key: string } & Record<string, ReactNode>)[];
  empty?: string;
}

/** A duration typed as hours and minutes, kept in minutes. */
export interface DurationInputProps {
  label: string;
  value: number | null;
  onChange: (minutes: number | null) => void;
  error?: string;
  required?: boolean;
}

/** Someone, by their name, as the person looking may see them. */
export interface PersonNameProps {
  id: string | null;
}

/** One of Toppo's issues, opened in Toppo. */
export interface IssueLinkProps {
  issueKey: string;
  children?: ReactNode;
}

/** Another of the plugin's pages, opened in Toppo. */
export interface PageLinkProps {
  page: string;
  search?: ScreenSearch;
  children: ReactNode;
}

/** An action's answer, asked as the screen shows. */
export interface ActionQuery<R> {
  data: R | undefined;
  error: ScreenFailure | null;
  isLoading: boolean;
  refetch: () => void;
}

/** An action run when the person acts: every answer shown is asked again once it succeeds. */
export interface ActionMutation<I, R> {
  run: (input: I) => Promise<R>;
  isPending: boolean;
  error: ScreenFailure | null;
}

/** What the screen shows and for whom, and where it may lead. */
export interface ScreenState {
  locale: 'en' | 'fr';
  user: { id: string; name: string };
  /** The issue beside which a panel shows. */
  issue: { id: string; key: string; projectId: string; projectKey: string } | null;
  /** The project whose settings a page is a tab of. */
  project: { id: string; key: string; name: string } | null;
  /** A page's search, kept in Toppo's address. */
  search: ScreenSearch;
  setSearch: (search: ScreenSearch) => void;
  open: (target: ScreenTarget) => void;
}

/**
 * What Toppo's runtime gives a plugin's screens, in their frame: the implementations behind this
 * package's components and hooks. Kept stable within a major version of the plugin API.
 */
export interface ScreenUi {
  Button: ComponentType<ButtonProps>;
  Badge: ComponentType<BadgeProps>;
  Alert: ComponentType<AlertProps>;
  EmptyState: ComponentType<EmptyStateProps>;
  Field: ComponentType<FieldProps>;
  Input: ComponentType<InputProps>;
  Textarea: ComponentType<TextareaProps>;
  Select: ComponentType<SelectProps>;
  Switch: ComponentType<SwitchProps>;
  Page: ComponentType<PageProps>;
  Section: ComponentType<SectionProps>;
  Stat: ComponentType<StatProps>;
  Table: ComponentType<TableProps>;
  Stack: ComponentType<StackProps>;
  Row: ComponentType<RowProps>;
  DurationInput: ComponentType<DurationInputProps>;
  PersonName: ComponentType<PersonNameProps>;
  IssueLink: ComponentType<IssueLinkProps>;
  PageLink: ComponentType<PageLinkProps>;
  useActionQuery(name: string, input: unknown, enabled: boolean): ActionQuery<unknown>;
  useActionMutation(name: string): ActionMutation<unknown, unknown>;
  useScreen(): ScreenState;
  usePeople(ids: readonly string[]): ReadonlyMap<string, string | null>;
  /** Minutes as people read them: "6 h 40". */
  formatDuration(minutes: number): string;
}
