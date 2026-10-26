import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type CreateInvitationsResponse,
  INVITATION_PROJECTS_MAX,
  INVITATIONS_PER_REQUEST_MAX,
  type RoleBadge,
} from '@toppo/shared';
import { Alert, Button, Field, Select, Textarea } from '@toppo/ui';
import { type FormEvent, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Invitations } from '../../api/invitations.api.ts';
import type {
  ChosenProject,
  InvitationProjectAccess,
  ProjectPickerSlot,
} from '../../models/invitation.model.ts';
import { UsersQueries } from '../../queries/users.queries.ts';
import { parseEmails } from '../../utils/invitation-emails.util.ts';

const KNOWN_ERRORS = {
  INVALID_ROLE: 'members.invalidRole',
  ALL_PROJECTS_RESERVED: 'members.allProjectsReserved',
  SYSTEM_ROLE_RESERVED: 'members.systemRoleReserved',
  INVALID_PROJECT: 'invitations.invalidProject',
} as const;

const PROJECT_ACCESS: readonly InvitationProjectAccess[] = ['none', 'all', 'chosen'];

/** Addresses, a role, and the projects they open; reports the links the server made. */
export function InviteForm({
  roles,
  projectPicker,
  onInvited,
}: {
  roles: readonly RoleBadge[];
  projectPicker: ProjectPickerSlot;
  onInvited: (result: CreateInvitationsResponse) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [roleId, setRoleId] = useState('');
  const [projectAccess, setProjectAccess] = useState<InvitationProjectAccess>('none');
  const [projects, setProjects] = useState<readonly ChosenProject[]>([]);
  const [errors, setErrors] = useState<{ emails?: string; role?: string; projects?: string }>({});

  const invite = useMutation({
    mutationFn: ({ emails }: { emails: string[] }) =>
      Invitations.create(emails, roleId, {
        allProjects: projectAccess === 'all',
        projectKeys: projectAccess === 'chosen' ? projects.map(({ key }) => key) : [],
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: UsersQueries.allMembers });
      onInvited(result);
    },
  });

  function emailsError(emails: string[], invalid: string[]): string | undefined {
    if (invalid.length > 0) {
      return t('invitations.invalidEmails', { emails: invalid.join(', ') });
    }
    if (emails.length === 0) {
      return t('validation.required');
    }
    if (emails.length > INVITATIONS_PER_REQUEST_MAX) {
      return t('invitations.tooManyEmails', { max: INVITATIONS_PER_REQUEST_MAX });
    }
    return undefined;
  }

  function projectsError(): string | undefined {
    if (projectAccess !== 'chosen') {
      return undefined;
    }
    if (projects.length === 0) {
      return t('validation.required');
    }
    return projects.length > INVITATION_PROJECTS_MAX
      ? t('validation.tooLong', { max: INVITATION_PROJECTS_MAX })
      : undefined;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { emails, invalid } = parseEmails(text);
    const emailsProblem = emailsError(emails, invalid);
    const projectsProblem = projectsError();
    // No role is preselected: nobody gets the administrator role by accident.
    const next = {
      ...(emailsProblem ? { emails: emailsProblem } : {}),
      ...(roleId ? {} : { role: t('validation.required') }),
      ...(projectsProblem ? { projects: projectsProblem } : {}),
    };
    setErrors(next);
    if (!(next.emails || next.role || next.projects)) {
      invite.mutate({ emails });
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={invite.isPending} className="flex flex-col gap-5">
      {invite.isError ? (
        <Alert tone="danger">{requestErrorMessage(invite.error, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      <Field
        label={t('invitations.emails')}
        required
        description={t('invitations.emailsHelp', { max: INVITATIONS_PER_REQUEST_MAX })}
        error={errors.emails}
      >
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            value={text}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </Field>
      <Field label={t('invitations.role')} required error={errors.role}>
        {(control) => (
          <Select {...control} value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            <option value="" disabled>
              {t('invitations.chooseRole')}
            </option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-foreground">
          {t('invitations.projectAccess')}
        </legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {PROJECT_ACCESS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm pointer-coarse:min-h-11">
              <input
                type="radio"
                name="project-access"
                value={option}
                checked={projectAccess === option}
                onChange={() => setProjectAccess(option)}
                className="size-4 accent-primary"
              />
              {t(PROJECT_ACCESS_LABELS[option])}
            </label>
          ))}
        </div>
        {projectAccess === 'none' ? (
          <p className="text-xs text-muted-foreground">{t('invitations.noProjectsHelp')}</p>
        ) : null}
        {projectAccess === 'chosen'
          ? projectPicker({
              label: t('invitations.chosenProjects'),
              chosen: projects,
              onChange: setProjects,
            })
          : null}
        {errors.projects ? (
          <p className="text-xs font-medium text-danger">{errors.projects}</p>
        ) : null}
      </fieldset>
      <Button type="submit" disabled={invite.isPending} className="self-end">
        {invite.isPending ? t('invitations.submitting') : t('invitations.submit')}
      </Button>
    </form>
  );
}

const PROJECT_ACCESS_LABELS = {
  none: 'invitations.noProjects',
  all: 'invitations.allProjects',
  chosen: 'invitations.chosenProjects',
} as const;
