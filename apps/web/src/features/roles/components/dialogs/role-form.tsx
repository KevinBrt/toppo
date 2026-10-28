import {
  ROLE_COLORS,
  ROLE_NAME_MAX_LENGTH,
  type RoleRequest,
  roleRequestSchema,
} from '@toppo-tracker/shared';
import { Alert, Button, badgeClassName, Field, Input } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { fieldErrors, requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

const KNOWN_ERRORS = {
  ROLE_NAME_TAKEN: 'roles.roleNameTaken',
  ROLE_LIMIT_REACHED: 'roles.roleLimitReached',
  ROLE_NOT_FOUND: 'roles.roleNotFound',
  SYSTEM_ROLE_LOCKED: 'roles.systemRoleLocked',
} as const;

/** A role's name and color, to create it or change them. Reports a valid role; the caller saves it. */
export function RoleForm({
  initial = { name: '', color: 'gray' },
  submitLabel,
  pendingLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: RoleRequest;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  /** The server's refusal of the last attempt, if any. */
  error: unknown;
  onSubmit: (role: RoleRequest) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [nameError, setNameError] = useState<string>();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = roleRequestSchema.safeParse({ name, color });
    setNameError(parsed.success ? undefined : fieldErrors(parsed.error, t)['name']);
    if (parsed.success) {
      onSubmit(parsed.data);
    }
  }

  return (
    <form noValidate onSubmit={submit} aria-busy={pending} className="flex flex-col gap-5">
      {error ? <Alert tone="danger">{requestErrorMessage(error, t, KNOWN_ERRORS)}</Alert> : null}
      <Field label={t('roles.name')} required error={nameError}>
        {(control) => (
          <Input
            {...control}
            value={name}
            maxLength={ROLE_NAME_MAX_LENGTH}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-foreground">{t('roles.color')}</legend>
        <div className="flex flex-wrap gap-2">
          {ROLE_COLORS.map((option) => (
            <label key={option} className="flex min-h-8 items-center pointer-coarse:min-h-11">
              <input
                type="radio"
                name="role-color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                className="peer sr-only"
              />
              <span
                className={badgeClassName(
                  option,
                  'cursor-pointer outline-offset-2 peer-checked:outline-2 peer-checked:outline-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring',
                )}
              >
                {t(`colors.${option}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}
