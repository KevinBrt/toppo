import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIES_MAX,
  type CategoriesRequest,
  type CategoryRow,
  categoriesRequestSchema,
} from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Field,
  Select,
  SidePanel,
  SidePanelClose,
  SidePanelContent,
  SortableList,
} from '@toppo-tracker/ui';
import { type FormEvent, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { sortableMessages } from '../../../../shared/forms/sortable-messages.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Categories } from '../../api/categories.api.ts';
import type { OptionDraft } from '../../models/option-draft.model.ts';
import { PropertiesQueries } from '../../queries/properties.queries.ts';
import {
  type NameProblem,
  nameProblemsOf,
  newOptionKey,
  nextColor,
} from '../../utils/option-drafts.util.ts';
import { AddOption } from '../options/add-option.tsx';
import { CategoryOption } from '../options/category-option.tsx';
import { OptionsSection } from '../options/options-section.tsx';

const KNOWN_ERRORS = {
  CATEGORIES_CHANGED: 'properties.changed',
  CATEGORY_IN_USE: 'properties.inUseError',
  CATEGORY_NAME_TAKEN: 'properties.nameTaken',
} as const;

/** The categories edited beside the page, then saved at once. Reports the save. */
export function CategoryPanel({
  open,
  onOpenChange,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: readonly CategoryRow[];
  onSaved: () => Promise<void> | void;
}) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      {/* Mounted while open only: each opening starts again from what is saved. */}
      {open ? <CategoryEditor categories={categories} onSaved={onSaved} /> : null}
    </SidePanel>
  );
}

function CategoryEditor({
  categories,
  onSaved,
}: {
  categories: readonly CategoryRow[];
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const formId = useId();
  const [drafts, setDrafts] = useState<OptionDraft[]>(() =>
    categories.map(({ id, name, color, issueCount }) => ({ key: id, id, name, color, issueCount })),
  );
  const [defaultKey, setDefaultKey] = useState(
    () => categories.find(({ isDefault }) => isDefault)?.id ?? '',
  );
  const [problems, setProblems] = useState<ReadonlyMap<string, NameProblem>>(new Map());

  const saving = useMutation({
    mutationFn: (request: CategoriesRequest) => Categories.save(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PropertiesQueries.all });
      await onSaved();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = {
      categories: drafts.map(({ key, id, name, color }) => ({
        ...(id ? { id } : {}),
        name,
        color,
        isDefault: key === defaultKey,
      })),
      // Those loaded with the panel and removed since; any other stays.
      removed: categories
        .map(({ id }) => id)
        .filter((id) => !drafts.some((draft) => draft.id === id)),
    };
    // The server's own rules, checked first to point at the option concerned.
    const checked = categoriesRequestSchema.safeParse(request);
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

  function remove(key: string) {
    const rest = drafts.filter((draft) => draft.key !== key);
    setDrafts(rest);
    if (key === defaultKey) {
      setDefaultKey(rest[0]?.key ?? '');
    }
  }

  return (
    <SidePanelContent
      title={t('properties.category')}
      description={t('properties.categoryDescription')}
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
        <OptionsSection count={drafts.length}>
          <SortableList
            items={drafts}
            nameOf={(draft) => draft.name.trim() || t('properties.unnamed')}
            messages={sortableMessages(t)}
            onReorder={setDrafts}
            className="divide-y divide-border"
            renderItem={(draft, handle) => (
              <CategoryOption
                draft={draft}
                position={drafts.indexOf(draft) + 1}
                handle={handle}
                problem={problems.get(draft.key)}
                removable={drafts.length > 1}
                onChange={(fields) => change(draft.key, fields)}
                onRemove={() => remove(draft.key)}
              />
            )}
          />
          <AddOption
            full={drafts.length >= CATEGORIES_MAX}
            max={CATEGORIES_MAX}
            onAdd={(name) =>
              setDrafts((current) => [
                ...current,
                { key: newOptionKey(), name, color: nextColor(current), issueCount: 0 },
              ])
            }
          />
        </OptionsSection>
        <Field label={t('properties.default')} description={t('properties.defaultHint')}>
          {(control) => (
            <Select
              {...control}
              value={defaultKey}
              onChange={(event) => setDefaultKey(event.target.value)}
            >
              {drafts.map((draft) => (
                <option key={draft.key} value={draft.key}>
                  {draft.name.trim() || t('properties.unnamed')}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </SidePanelContent>
  );
}
