import { useQuery } from '@tanstack/react-query';
import { cn, Dialog, DialogContent } from '@toppo-tracker/ui';
import { ArrowRightIcon, SearchIcon } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { PaletteCommand, PaletteOption } from '../../models/palette.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { paletteOptions } from '../../utils/palette.util.ts';
import { StatusLabel } from '../fields/status-label.tsx';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 200;

/**
 * The search palette: issues of every project the person reaches, found as they type, and the
 * pages and actions they may use. Arrows move through the list, Enter takes what is chosen.
 * Reports the issue or runs the command chosen, and closes.
 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
  onOpenIssue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly PaletteCommand[];
  onOpenIssue: (key: string) => void;
}) {
  const { t } = useI18n();
  const choose = (option: PaletteOption) => {
    onOpenChange(false);
    if (option.kind === 'command') {
      option.command.run();
    } else {
      onOpenIssue(option.kind === 'key' ? option.key : option.issue.key);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('palette.title')}
        closeLabel={t('palette.close')}
        hideTitle
        className="top-[12dvh] max-w-xl translate-y-0 p-0 sm:p-0"
      >
        <PaletteSearch commands={commands} onChoose={choose} />
      </DialogContent>
    </Dialog>
  );
}

/** The search box and what it finds; it starts afresh each time the palette opens. */
function PaletteSearch({
  commands,
  onChoose,
}: {
  commands: readonly PaletteCommand[];
  onChoose: (option: PaletteOption) => void;
}) {
  const { t } = useI18n();
  const listId = useId();
  const [text, setText] = useState('');
  const [searched, setSearched] = useState('');
  const [active, setActive] = useState(0);
  const found = useQuery(IssuesQueries.search(searched));

  useEffect(() => {
    const timer = setTimeout(() => setSearched(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  // Before anything is typed, the issues of an earlier search would only be in the way.
  const issues = text.trim() === '' ? [] : (found.data?.rows ?? []);
  const options = paletteOptions(text, issues, commands);
  const current = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView({ block: 'nearest' });
  }, [listId, current]);

  const move = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = options.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(count === 0 ? 0 : (current + step + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[current];
      if (option) {
        onChoose(option);
      }
    }
  };

  const searching = searched !== '' && found.isFetching;
  const nothing = text.trim() !== '' && !searching && options.length === 0;
  const firstCommand = options.findIndex((option) => option.kind === 'command');
  return (
    <>
      <div className="flex items-center gap-3 border-b border-border pr-12 pl-4">
        <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={options.length > 0 ? optionId(current) : undefined}
          aria-autocomplete="list"
          aria-label={t('palette.label')}
          placeholder={t('palette.placeholder')}
          maxLength={100}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
          onKeyDown={move}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
        />
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label={t('palette.results')}
        className="max-h-[min(60dvh,28rem)] overflow-y-auto p-2 empty:hidden"
      >
        {options.map((option, index) => (
          <PaletteRow
            key={rowKey(option)}
            id={optionId(index)}
            option={option}
            heading={headingOf(t, options, index, firstCommand)}
            active={index === current}
            onHover={() => setActive(index)}
            onChoose={() => onChoose(option)}
          />
        ))}
      </div>
      <p role="status" className="px-4 pb-3 text-sm text-muted-foreground empty:hidden">
        {searching ? t('palette.searching') : null}
        {nothing ? t('palette.noMatch') : null}
      </p>
    </>
  );
}

function rowKey(option: PaletteOption): string {
  switch (option.kind) {
    case 'key':
      return `key:${option.key}`;
    case 'issue':
      return `issue:${option.issue.key}`;
    case 'command':
      return `command:${option.command.id}`;
  }
}

/** "Issues" over the first issue, "Actions" over the first command: seen, not read aloud. */
function headingOf(
  t: ReturnType<typeof useI18n>['t'],
  options: readonly PaletteOption[],
  index: number,
  firstCommand: number,
): string | null {
  if (index === 0 && options[0]?.kind !== 'command') {
    return t('palette.issues');
  }
  return index === firstCommand ? t('palette.actions') : null;
}

/**
 * One option: the issue a key names, an issue found, or a command. The pointer chooses it too;
 * the keyboard stays in the search box, the option marked as the active one.
 */
function PaletteRow({
  id,
  option,
  heading,
  active,
  onHover,
  onChoose,
}: {
  id: string;
  option: PaletteOption;
  heading: string | null;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  return (
    <>
      {heading ? (
        <p aria-hidden="true" className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
          {heading}
        </p>
      ) : null}
      <div
        id={id}
        role="option"
        tabIndex={-1}
        aria-selected={active}
        onMouseMove={onHover}
        // The search box keeps the focus, so that typing goes on.
        onMouseDown={(event) => event.preventDefault()}
        onClick={onChoose}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onChoose();
          }
        }}
        className={cn(
          'flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground pointer-coarse:min-h-11',
          active && 'bg-surface-hover',
        )}
      >
        <OptionContent option={option} />
      </div>
    </>
  );
}

function OptionContent({ option }: { option: PaletteOption }): ReactNode {
  const { t } = useI18n();

  switch (option.kind) {
    case 'key':
      return (
        <>
          <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {t('palette.openKey', { key: option.key })}
        </>
      );
    case 'issue':
      return (
        <>
          <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
            {option.issue.key}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{option.issue.title}</span>
          <span className="hidden max-w-32 truncate text-xs text-muted-foreground sm:inline">
            {option.issue.project.name}
          </span>
          <span className="shrink-0 text-xs">
            <StatusLabel status={option.issue.status} />
          </span>
        </>
      );
    case 'command': {
      const Icon = option.command.icon;
      return (
        <>
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {option.command.label}
        </>
      );
    }
  }
}
