import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IssueFieldsResponse, IssueResponse, IssueWithProject } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Input,
  Select,
} from '@toppo-tracker/ui';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Issues } from '../../api/issues.api.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

const KNOWN_ERRORS = {
  ORIGINAL_NOT_FOUND: 'issues.duplicate.originalNotFound',
  DUPLICATE_CYCLE: 'issues.duplicate.cycle',
  STATUS_NOT_ALLOWED: 'issues.statusNotAllowed',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
} as const;

/**
 * Marks an issue as a duplicate: the original found by its key or words, in any project the
 * reader sees, and the closing status the issue's workflow allows from its own. Closes once done.
 */
export function MarkDuplicateDialog({
  issue,
  statuses,
  open,
  onOpenChange,
}: {
  issue: IssueResponse;
  statuses: IssueFieldsResponse['statuses'] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const searchId = useId();
  const helpId = useId();
  const statusId = useId();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [originalKey, setOriginalKey] = useState<string | null>(null);
  const closing = closingStatusesOf(issue, statuses ?? []);
  const [chosenStatus, setChosenStatus] = useState<string | null>(null);
  const status = chosenStatus ?? closing[0]?.id ?? null;
  const found = useQuery({ ...IssuesQueries.search(search), enabled: open && search !== '' });
  const candidates = (found.data?.rows ?? []).filter(({ key }) => key !== issue.key);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const mark = useMutation({
    mutationFn: ({ key, statusId: to }: { key: string; statusId: string }) =>
      Issues.markDuplicate(issue.key, key, to),
    onSuccess: () => {
      close(false);
      return queryClient.invalidateQueries({ queryKey: IssuesQueries.all });
    },
  });

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setTyped('');
      setOriginalKey(null);
      setChosenStatus(null);
      mark.reset();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (originalKey && status) {
      mark.mutate({ key: originalKey, statusId: status });
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        title={t('issues.duplicate.title', { key: issue.key })}
        description={t('issues.duplicate.description')}
        closeLabel={t('issues.close')}
      >
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {mark.isError ? (
            <Alert tone="danger">{requestErrorMessage(mark.error, t, KNOWN_ERRORS)}</Alert>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={searchId} className="text-sm font-medium text-foreground">
              {t('issues.duplicate.search')}
            </label>
            <Input
              id={searchId}
              type="search"
              aria-describedby={helpId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            <p id={helpId} className="text-xs text-muted-foreground">
              {t('issues.duplicate.searchHelp')}
            </p>
          </div>
          {search === '' ? null : (
            <OriginalChoices
              found={found}
              candidates={candidates}
              chosen={originalKey}
              onChoose={setOriginalKey}
            />
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={statusId} className="text-sm font-medium text-foreground">
              {t('issues.duplicate.status')}
            </label>
            {closing.length > 0 ? (
              <Select
                id={statusId}
                value={status ?? ''}
                onChange={(event) => setChosenStatus(event.target.value)}
              >
                {closing.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p id={statusId} className="text-sm text-muted-foreground">
                {t('issues.duplicate.noClosingStatus')}
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('issues.cancel')}</Button>
            </DialogClose>
            <Button type="submit" disabled={!(originalKey && status) || mark.isPending}>
              {mark.isPending ? t('issues.duplicate.marking') : t('issues.duplicate.confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The issues a search found, one to choose as the original; what the search is doing, else. */
function OriginalChoices({
  found,
  candidates,
  chosen,
  onChoose,
}: {
  found: { isPending: boolean; isFetching: boolean };
  candidates: readonly IssueWithProject[];
  chosen: string | null;
  onChoose: (key: string) => void;
}) {
  const { t } = useI18n();

  return (
    <fieldset
      aria-busy={found.isFetching}
      className="max-h-60 overflow-y-auto rounded-md border border-border"
    >
      <legend className="sr-only">{t('issues.duplicate.search')}</legend>
      {found.isPending ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">{t('issues.duplicate.searching')}</p>
      ) : null}
      {!found.isPending && candidates.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">{t('issues.duplicate.noMatch')}</p>
      ) : null}
      {candidates.map((candidate) => (
        <label
          key={candidate.key}
          className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-hover pointer-coarse:min-h-11"
        >
          <input
            type="radio"
            name="original"
            value={candidate.key}
            checked={chosen === candidate.key}
            onChange={() => onChoose(candidate.key)}
            className="size-4 accent-primary"
          />
          <span className="font-mono text-xs font-medium text-muted-foreground">
            {candidate.key}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{candidate.title}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * The closing statuses an issue may be closed in: its own if it closes, then those its workflow
 * allows from it, in the workflow's order.
 */
function closingStatusesOf(
  issue: IssueResponse,
  statuses: IssueFieldsResponse['statuses'],
): IssueFieldsResponse['statuses'] {
  const next = statuses.find(({ id }) => id === issue.status.id)?.next ?? [];
  return statuses.filter(
    (status) => status.closes && (status.id === issue.status.id || next.includes(status.id)),
  );
}
