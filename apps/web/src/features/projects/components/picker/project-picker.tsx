import { useQuery } from '@tanstack/react-query';
import { Input } from '@toppo-tracker/ui';
import { XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { ProjectsQueries } from '../../queries/projects.queries.ts';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

export interface PickedProject {
  key: string;
  name: string;
}

/**
 * Chooses projects among those the caller reaches: the server searches, the chosen ones stay
 * shown above whatever the search finds.
 */
export function ProjectPicker({
  label,
  chosen,
  onChange,
}: {
  /** Accessible name of the group. */
  label: string;
  chosen: readonly PickedProject[];
  onChange: (chosen: PickedProject[]) => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const projects = useQuery(ProjectsQueries.list({ search: search || undefined }));

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const isChosen = (key: string) => chosen.some((project) => project.key === key);
  const toggle = (project: PickedProject) =>
    onChange(
      isChosen(project.key)
        ? chosen.filter(({ key }) => key !== project.key)
        : [...chosen, project],
    );

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="sr-only">{label}</legend>
      {chosen.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {chosen.map((project) => (
            <li key={project.key}>
              <button
                type="button"
                aria-label={t('projectPicker.remove', { project: project.name })}
                onClick={() => toggle(project)}
                className="flex min-h-8 items-center gap-1 rounded-full bg-primary-subtle py-1 pr-2 pl-3 text-sm text-primary-subtle-foreground pointer-coarse:min-h-11"
              >
                {project.name}
                <XIcon aria-hidden="true" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        type="search"
        aria-label={t('projectPicker.search')}
        placeholder={t('projectPicker.search')}
        value={typed}
        maxLength={100}
        onChange={(event) => setTyped(event.target.value)}
      />
      <ul
        aria-busy={projects.isFetching}
        className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border"
      >
        {(projects.data?.rows ?? []).map((project) => (
          <li key={project.key}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-hover pointer-coarse:min-h-11">
              <input
                type="checkbox"
                checked={isChosen(project.key)}
                onChange={() => toggle({ key: project.key, name: project.name })}
                className="size-4 accent-primary"
              />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {project.key}
              </span>
              <span className="truncate text-sm text-foreground">{project.name}</span>
            </label>
          </li>
        ))}
        {projects.data?.rows.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            {t('projectPicker.noProject')}
          </li>
        ) : null}
      </ul>
    </fieldset>
  );
}
