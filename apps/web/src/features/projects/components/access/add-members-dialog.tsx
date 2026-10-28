import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PROJECT_MEMBERS_PER_REQUEST_MAX } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  Select,
} from '@toppo-tracker/ui';
import { UserPlusIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { ProjectAccess } from '../../api/project-access.api.ts';
import { ProjectsQueries } from '../../queries/projects.queries.ts';

const KNOWN_ERRORS = {
  ROLE_BEYOND_YOURS: 'projectAccess.roleBeyondYours',
  USER_NOT_FOUND: 'projectAccess.userNotFound',
  INVALID_ROLE: 'projectAccess.invalidRole',
  SYSTEM_ROLE_HOLDER: 'projectAccess.systemRoleHolder',
} as const;

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

interface Person {
  id: string;
  name: string;
  email: string;
}

/**
 * "Add members": people found by the server, chosen one by one, and the role they get here among
 * those the caller may give.
 */
export function AddMembersDialog({ projectKey }: { projectKey: string }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<readonly Person[]>([]);
  const [roleId, setRoleId] = useState('');
  const candidates = useQuery({
    ...ProjectsQueries.candidates(projectKey, search),
    enabled: open,
  });
  const roles = useQuery({ ...ProjectsQueries.roles(projectKey), enabled: open });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const add = useMutation({
    mutationFn: () =>
      ProjectAccess.add(
        projectKey,
        chosen.map(({ id }) => id),
        roleId || null,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ProjectsQueries.all });
      changeOpen(false);
    },
  });

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setTyped('');
      setChosen([]);
      setRoleId('');
      add.reset();
    }
  }

  const toggle = (person: Person) =>
    setChosen((previous) =>
      previous.some(({ id }) => id === person.id)
        ? previous.filter(({ id }) => id !== person.id)
        : [...previous, person],
    );

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon aria-hidden="true" />
          {t('projectAccess.add')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('projectAccess.add')}
        description={t('projectAccess.addDescription')}
        closeLabel={t('projectAccess.close')}
      >
        <div className="flex flex-col gap-5">
          {add.isError ? (
            <Alert tone="danger">{requestErrorMessage(add.error, t, KNOWN_ERRORS)}</Alert>
          ) : null}
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-foreground">
              {t('projectAccess.people')}
            </legend>
            {chosen.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {chosen.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      aria-label={t('projectAccess.unselect', { name: person.name })}
                      onClick={() => toggle(person)}
                      className="flex min-h-8 items-center gap-1 rounded-full bg-primary-subtle py-1 pr-2 pl-3 text-sm text-primary-subtle-foreground pointer-coarse:min-h-11"
                    >
                      {person.name}
                      <XIcon aria-hidden="true" className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Input
              type="search"
              aria-label={t('projectAccess.searchPeople')}
              placeholder={t('projectAccess.searchPeople')}
              value={typed}
              maxLength={100}
              onChange={(event) => setTyped(event.target.value)}
            />
            <ul
              aria-busy={candidates.isFetching}
              className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border"
            >
              {(candidates.data ?? []).map((person) => (
                <li key={person.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-hover pointer-coarse:min-h-11">
                    <input
                      type="checkbox"
                      checked={chosen.some(({ id }) => id === person.id)}
                      disabled={
                        chosen.length >= PROJECT_MEMBERS_PER_REQUEST_MAX &&
                        !chosen.some(({ id }) => id === person.id)
                      }
                      onChange={() => toggle(person)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {person.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {person.email}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {candidates.data?.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t('projectAccess.noCandidate')}
                </li>
              ) : null}
            </ul>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {t(`projectAccess.selected.${pluralForm(locale, chosen.length)}`, {
                count: chosen.length,
              })}
            </p>
          </fieldset>
          <Field label={t('projectAccess.roleHere')}>
            {(control) => (
              <Select
                {...control}
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                <option value="">{t('projectAccess.ownRoleOption')}</option>
                {(roles.data ?? []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('projectAccess.cancel')}</Button>
            </DialogClose>
            <Button disabled={chosen.length === 0 || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? t('projectAccess.adding') : t('projectAccess.addConfirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
