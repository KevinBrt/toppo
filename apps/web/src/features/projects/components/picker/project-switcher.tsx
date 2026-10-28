import { useQuery } from '@tanstack/react-query';
import type { PaletteColor } from '@toppo-tracker/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from '@toppo-tracker/ui';
import { ChevronDownIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { ProjectsQueries } from '../../queries/projects.queries.ts';
import { ProjectMark } from '../project-mark.tsx';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

/** Keys the menu keeps: the others type in the search rather than jump between items. */
const MENU_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Escape', 'Tab']);

/**
 * The project being looked at, opening the projects the person reaches, searched by the server.
 * Reports the one chosen.
 */
export function ProjectSwitcher({
  current,
  onSelect,
}: {
  current: { key: string; name: string; color: PaletteColor } | null;
  onSelect: (projectKey: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const projects = useQuery({
    ...ProjectsQueries.list({ search: search || undefined }),
    enabled: open,
  });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const keepTyping = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!MENU_KEYS.has(event.key)) {
      event.stopPropagation();
    }
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setTyped('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-8 min-w-0 items-center gap-2 rounded-md px-1.5 font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11"
        >
          {current ? (
            <>
              <ProjectMark
                name={current.name}
                color={current.color}
                className="size-6 rounded-md text-[0.625rem]"
              />
              {/* Named by what it shows, so that speech matches the screen: "Project: Website". */}
              <span className="truncate">
                <span className="sr-only">{t('projectSwitcher.prefix')} </span>
                {current.name}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{t('projectSwitcher.choose')}</span>
          )}
          <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <div className="p-1">
          <Input
            type="search"
            aria-label={t('projectSwitcher.search')}
            placeholder={t('projectSwitcher.search')}
            value={typed}
            maxLength={100}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={keepTyping}
          />
        </div>
        {(projects.data?.rows ?? []).map((project) => (
          <DropdownMenuItem key={project.key} onSelect={() => onSelect(project.key)}>
            <ProjectMark
              name={project.name}
              color={project.color}
              className="size-6 rounded-md text-[0.625rem]"
            />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
          </DropdownMenuItem>
        ))}
        {projects.data?.rows.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">
            {t('projectSwitcher.noProject')}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
