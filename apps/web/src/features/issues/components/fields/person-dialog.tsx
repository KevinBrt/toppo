import { useQuery } from '@tanstack/react-query';
import type { UserRef } from '@toppo-tracker/shared';
import { Avatar, Dialog, DialogContent, Input } from '@toppo-tracker/ui';
import { UserXIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { IssuesQueries } from '../../queries/issues.queries.ts';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

/**
 * Chooses someone among the people the server finds who reach a project, or nobody: who an issue
 * or several go to, or who a person property names. Reports the choice; the dialog closes with it.
 */
export function PersonDialog({
  projectKey,
  title,
  current,
  open,
  onOpenChange,
  onChoose,
}: {
  projectKey: string;
  /** What is chosen: "Assign WEB-42", "Reviewer". */
  title: string;
  /** Who it is now; left out for several issues, which may each have another: anyone is a change. */
  current?: UserRef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (person: UserRef | null) => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const people = useQuery({ ...IssuesQueries.assignees(projectKey, search), enabled: open });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const choose = (person: UserRef | null) => {
    onOpenChange(false);
    setTyped('');
    if (current === undefined || person?.id !== current?.id) {
      onChoose(person);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} closeLabel={t('issues.close')}>
        <div className="flex flex-col gap-3">
          <Input
            type="search"
            aria-label={t('issues.searchPeople')}
            placeholder={t('issues.searchPeople')}
            value={typed}
            maxLength={100}
            onChange={(event) => setTyped(event.target.value)}
          />
          <ul
            aria-busy={people.isFetching}
            className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border"
          >
            {current !== null ? (
              <li>
                <button
                  type="button"
                  onClick={() => choose(null)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-surface-hover pointer-coarse:min-h-11"
                >
                  <UserXIcon aria-hidden="true" className="size-5" />
                  {t('issues.nobody')}
                </button>
              </li>
            ) : null}
            {(people.data ?? []).map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  aria-current={person.id === current?.id ? 'true' : undefined}
                  onClick={() => choose({ id: person.id, name: person.name })}
                  className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover aria-[current]:bg-primary-subtle pointer-coarse:min-h-11"
                >
                  <Avatar name={person.name} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {person.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.email}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {people.data?.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t('issues.noPerson')}
              </li>
            ) : null}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
