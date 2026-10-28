import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LABELS_MAX,
  type LabelRow,
  type LabelsRequest,
  labelsRequestSchema,
} from '@toppo-tracker/shared';
import { Alert, Button, SidePanel, SidePanelClose, SidePanelContent } from '@toppo-tracker/ui';
import { type FormEvent, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Labels } from '../../api/labels.api.ts';
import type { OptionDraft } from '../../models/option-draft.model.ts';
import { PropertiesQueries } from '../../queries/properties.queries.ts';
import {
  type NameProblem,
  nameProblemsOf,
  newOptionKey,
  nextColor,
} from '../../utils/option-drafts.util.ts';
import { AddOption } from '../options/add-option.tsx';
import { LabelOption } from '../options/label-option.tsx';
import { OptionsSection } from '../options/options-section.tsx';

const KNOWN_ERRORS = {
  LABELS_CHANGED: 'properties.changed',
  LABEL_NAME_TAKEN: 'properties.nameTaken',
} as const;

/** The labels edited beside the page, then saved at once. Reports the save. */
export function LabelPanel({
  open,
  onOpenChange,
  labels,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  labels: readonly LabelRow[];
  onSaved: () => Promise<void> | void;
}) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      {/* Mounted while open only: each opening starts again from what is saved. */}
      {open ? <LabelEditor labels={labels} onSaved={onSaved} /> : null}
    </SidePanel>
  );
}

function LabelEditor({
  labels,
  onSaved,
}: {
  labels: readonly LabelRow[];
  onSaved: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const formId = useId();
  const [drafts, setDrafts] = useState<OptionDraft[]>(() =>
    labels.map(({ id, name, color, issueCount }) => ({ key: id, id, name, color, issueCount })),
  );
  const [problems, setProblems] = useState<ReadonlyMap<string, NameProblem>>(new Map());
  // Those loaded with the panel and removed since; any other stays.
  const removed = labels.filter(({ id }) => !drafts.some((draft) => draft.id === id));
  const takenOff = removed.reduce((total, { issueCount }) => total + issueCount, 0);

  const saving = useMutation({
    mutationFn: (request: LabelsRequest) => Labels.save(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PropertiesQueries.all });
      await onSaved();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = {
      labels: drafts.map(({ id, name, color }) => ({ ...(id ? { id } : {}), name, color })),
      removed: removed.map(({ id }) => id),
    };
    // The server's own rules, checked first to point at the label concerned.
    const checked = labelsRequestSchema.safeParse(request);
    if (!checked.success) {
      setProblems(nameProblemsOf(checked.error.issues, drafts));
      return;
    }
    saving.mutate(request);
  }

  function change(key: string, fields: Partial<Pick<OptionDraft, 'name' | 'color'>>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...fields } : draft)),
    );
    if (fields.name !== undefined) {
      setProblems((current) => new Map([...current].filter(([problemKey]) => problemKey !== key)));
    }
  }

  return (
    <SidePanelContent
      title={t('properties.labels')}
      description={t('properties.labelsDescription')}
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
        {takenOff > 0 ? (
          <Alert>
            {t(`properties.removedInUse.${pluralForm(locale, takenOff)}`, { count: takenOff })}
          </Alert>
        ) : null}
        <OptionsSection count={drafts.length}>
          {drafts.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">{t('properties.noLabels')}</p>
          ) : null}
          {drafts.map((draft, index) => (
            <LabelOption
              key={draft.key}
              draft={draft}
              position={index + 1}
              problem={problems.get(draft.key)}
              onChange={(fields) => change(draft.key, fields)}
              onRemove={() => setDrafts(drafts.filter(({ key }) => key !== draft.key))}
            />
          ))}
          <AddOption
            full={drafts.length >= LABELS_MAX}
            max={LABELS_MAX}
            onAdd={(name) =>
              setDrafts((current) => [
                ...current,
                { key: newOptionKey(), name, color: nextColor(current), issueCount: 0 },
              ])
            }
          />
        </OptionsSection>
      </form>
    </SidePanelContent>
  );
}
