import type {
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
  SectionProps,
  SelectProps,
  StatProps,
  SwitchProps,
  TableProps,
  TextareaProps,
} from '@toppo-tracker/plugin-ui';
import * as Toppo from '@toppo-tracker/ui';
import { PuzzleIcon } from 'lucide-react';
import { type MouseEvent, type ReactNode, useId } from 'react';
import { usePeople, useScreen } from './hooks.ts';
import { RUNTIME_WORDS } from './screen-context.ts';

/*
 * Toppo's components, as plugins' screens draw them: the design system's own where it has one,
 * and a few for screens, built from its tokens. Props are those of `@toppo-tracker/plugin-ui`,
 * kept stable whatever the design system becomes.
 */

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
}: ButtonProps) {
  return (
    <Toppo.Button type={type} variant={variant} disabled={disabled ?? false} onClick={onClick}>
      {children}
    </Toppo.Button>
  );
}

export function Badge({ children, tone = 'gray' }: BadgeProps) {
  return <Toppo.Badge tone={tone}>{children}</Toppo.Badge>;
}

export function Alert({ children, tone = 'info' }: AlertProps) {
  return <Toppo.Alert tone={tone}>{children}</Toppo.Alert>;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Toppo.EmptyState icon={PuzzleIcon} title={title} description={description} action={action} />
  );
}

export function Field({ label, description, error, required, children }: FieldProps) {
  return (
    <Toppo.Field label={label} description={description} error={error} required={required ?? false}>
      {(control) => children(control)}
    </Toppo.Field>
  );
}

export function Input({ onChange, ...props }: InputProps) {
  return <Toppo.Input {...props} onChange={(event) => onChange(event.target.value)} />;
}

export function Textarea({ onChange, ...props }: TextareaProps) {
  return <Toppo.Textarea {...props} onChange={(event) => onChange(event.target.value)} />;
}

export function Select({ onChange, options, ...props }: SelectProps) {
  return (
    <Toppo.Select {...props} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Toppo.Select>
  );
}

export function Switch({ checked, onCheckedChange, label, disabled }: SwitchProps) {
  return (
    <Toppo.Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      disabled={disabled ?? false}
    />
  );
}

export function Page({ title, description, actions, children }: PageProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Section({ title, description, actions, children }: SectionProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={id} className="text-sm font-semibold text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

const STAT_TONES = {
  default: 'text-foreground',
  danger: 'text-danger',
  success: 'text-success',
} as const;

export function Stat({ label, value, hint, tone = 'default' }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface-muted p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-lg font-semibold ${STAT_TONES[tone]}`}>{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function Table({ caption, columns, rows, empty }: TableProps) {
  const { locale } = useScreen();
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted text-xs text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-3 py-2 font-medium ${column.align === 'end' ? 'text-right' : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-muted-foreground">
                {empty ?? RUNTIME_WORDS[locale].noRows}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-2 text-foreground ${column.align === 'end' ? 'text-right tabular-nums' : ''}`}
                  >
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DurationInput({ label, value, onChange, error, required }: DurationInputProps) {
  const { locale } = useScreen();
  const words = RUNTIME_WORDS[locale];
  const id = useId();
  const hours = value === null ? '' : String(Math.floor(value / 60));
  const minutes = value === null ? '' : String(value % 60);
  const changed = (nextHours: string, nextMinutes: string) => {
    if (nextHours === '' && nextMinutes === '') {
      onChange(null);
      return;
    }
    const total = Number(nextHours || 0) * 60 + Number(nextMinutes || 0);
    onChange(Number.isFinite(total) ? total : null);
  };
  return (
    <fieldset
      aria-describedby={error ? `${id}-error` : undefined}
      className="flex flex-col gap-1.5"
    >
      <legend className="mb-1.5 text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </legend>
      <div className="flex gap-2">
        <Toppo.Input
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={words.hours}
          aria-invalid={Boolean(error)}
          value={hours}
          onChange={(event) => changed(event.target.value, minutes)}
          className="w-24"
        />
        <Toppo.Input
          type="number"
          min={0}
          max={59}
          inputMode="numeric"
          aria-label={words.minutes}
          aria-invalid={Boolean(error)}
          value={minutes}
          onChange={(event) => changed(hours, event.target.value)}
          className="w-24"
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function PersonName({ id }: PersonNameProps) {
  const { locale } = useScreen();
  const names = usePeople(id === null ? [] : [id]);
  return <span>{(id && names.get(id)) || RUNTIME_WORDS[locale].someone}</span>;
}

const LINK_CLASS =
  'font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring rounded-sm';

/** A link that Toppo follows, the frame going nowhere itself. */
function ToppoLink({
  href,
  onOpen,
  children,
}: {
  href: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onOpen();
  };
  return (
    <a href={href} onClick={follow} className={LINK_CLASS}>
      {children}
    </a>
  );
}

export function IssueLink({ issueKey, children }: IssueLinkProps) {
  const { open } = useScreen();
  return (
    <ToppoLink href={`/issues/${issueKey}`} onOpen={() => open({ to: 'issue', key: issueKey })}>
      {children ?? issueKey}
    </ToppoLink>
  );
}

export function PageLink({ page, search, children }: PageLinkProps) {
  const { open } = useScreen();
  return (
    <ToppoLink
      href={`#${page}`}
      onOpen={() => open(search ? { to: 'page', name: page, search } : { to: 'page', name: page })}
    >
      {children}
    </ToppoLink>
  );
}
