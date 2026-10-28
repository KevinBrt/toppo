import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PRIORITY_NAME_MAX_LENGTH,
  type PrioritiesRequest,
  type PriorityRow,
  prioritiesRequestSchema,
} from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Field,
  Input,
  PriorityIcon,
  Select,
  SidePanel,
  SidePanelClose,
  SidePanelContent,
} from '@toppo-tracker/ui';
import { type FormEvent, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Priorities } from '../../api/priorities.api.ts';
import type { OptionDraft } from '../../models/option-draft.model.ts';
import { PropertiesQueries } from '../../queries/properties.queries.ts';
import { type NameProblem, nameProblemsOf } from '../../utils/option-drafts.util.ts';
import { NAME_FIELD_CLASS } from '../options/category-option.tsx';
import { NameError } from '../options/name-error.tsx';
import { OptionsSection } from '../options/options-section.tsx';

const KNOWN_ERRORS = {
  PRIORITY_NOT_FOUND: 'properties.changed',
  PRIORITY_NAME_TAKEN: 'properties.nameTaken',
} as const;

/** The four priority levels renamed beside the page, the default chosen, saved at once. */
export function PriorityPanel({
  open,
  onOpenChange,
  priorities,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priorities: readonly PriorityRow[];
  onSaved: () => Promise<void> | void;
}) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      {/* Mounted while open only: each opening starts again from what is saved. */}
      {open ? <PriorityEditor priorities={priorities} onSaved={onSaved} /> : null}
    </SidePanel>
  );
}

function PriorityEditor({
  priorities,
  onSaved,
}: {
  priorities: readonly PriorityRow[];
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const formId = useId();
  // The highest level first, as people rank them.
  const levels = priorities.toReversed();
  const [names, setNames] = useState<ReadonlyMap<string, string>>(
    () => new Map(levels.map(({ id, name }) => [id, name])),
  );
  const [defaultId, setDefaultId] = useState(
    () => levels.find(({ isDefault }) => isDefault)?.id ?? '',
  );
  const [problems, setProblems] = useState<ReadonlyMap<string, NameProblem>>(new Map());
  const nameOf = (id: string) => names.get(id) ?? '';

  const saving = useMutation({
    mutationFn: (list: PrioritiesRequest['priorities']) => Priorities.save(list),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PropertiesQueries.all });
      await onSaved();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const list = levels.map(({ id }) => ({ id, name: nameOf(id), isDefault: id === defaultId }));
    const checked = prioritiesRequestSchema.safeParse({ priorities: list });
    if (!checked.success) {
      const drafts: OptionDraft[] = list.map(({ id, name }) => ({
        key: id,
        name,
        color: 'gray',
        issueCount: 0,
      }));
      setProblems(nameProblemsOf(checked.error.issues, drafts));
      return;
    }
    saving.mutate(list);
  }

  function rename(id: string, name: string) {
    setNames((current) => new Map(current).set(id, name));
    setProblems((current) => new Map([...current].filter(([key]) => key !== id)));
  }

  return (
    <SidePanelContent
      title={t('properties.priority')}
      description={t('properties.priorityDescription')}
      closeLabel={t('properties.close')}
      footer={
        <>
          <SidePanelClose asChild>
            <Button variant="secondary">{t('properties.cancel')}</Button>
          </SidePanelClose>
          <Button type="submit" form={formId} disabled={saving.isPending}>
            {saving.isPending ? t('properties.saving') : t('properties.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-6">
        {saving.isError ? (
          <Alert tone="danger">{requestErrorMessage(saving.error, t, KNOWN_ERRORS)}</Alert>
        ) : null}
        <OptionsSection count={levels.length}>
          <ul className="divide-y divide-border">
            {levels.map(({ id, level }, index) => (
              <LevelOption
                key={id}
                level={level}
                position={index + 1}
                name={nameOf(id)}
                problem={problems.get(id)}
                onRename={(name) => rename(id, name)}
              />
            ))}
          </ul>
        </OptionsSection>
        <Field label={t('properties.default')} description={t('properties.defaultHint')}>
          {(control) => (
            <Select
              {...control}
              value={defaultId}
              onChange={(event) => setDefaultId(event.target.value)}
            >
              {levels.map(({ id }) => (
                <option key={id} value={id}>
                  {nameOf(id).trim() || t('properties.unnamed')}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </SidePanelContent>
  );
}

function LevelOption({
  level,
  position,
  name,
  problem,
  onRename,
}: {
  level: PriorityRow['level'];
  position: number;
  name: string;
  problem: NameProblem | undefined;
  onRename: (name: string) => void;
}) {
  const { t } = useI18n();
  const errorId = useId();

  return (
    <li className="flex flex-col py-1">
      <div className="flex items-center gap-2 px-3">
        <PriorityIcon level={level} />
        <Input
          aria-label={t('properties.optionName', { position })}
          aria-invalid={Boolean(problem)}
          {...(problem ? { 'aria-describedby': errorId } : {})}
          value={name}
          maxLength={100}
          onChange={(event) => onRename(event.target.value)}
          className={NAME_FIELD_CLASS}
        />
      </div>
      {problem ? <NameError id={errorId} problem={problem} max={PRIORITY_NAME_MAX_LENGTH} /> : null}
    </li>
  );
}
