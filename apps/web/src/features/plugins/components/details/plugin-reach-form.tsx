import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PLUGIN_PROJECTS_MAX, type PluginDetailsResponse } from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import type { PlainMessageKey } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../../api/plugins.api.ts';
import { APPROVAL_ERRORS } from '../../constants/plugin-errors.constants.ts';
import type {
  PickedProject,
  PluginReach,
  ProjectPickerSlot,
} from '../../models/plugin-page.model.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { DetailsSection } from './details-section.tsx';

const REACHES: readonly PluginReach[] = ['all', 'chosen'];

const REACH_LABELS = {
  all: 'plugins.allProjects',
  chosen: 'plugins.chosenProjects',
} as const satisfies Record<PluginReach, PlainMessageKey>;

/**
 * Where a plugin acts: every project, present and future, or those chosen. Approves what it
 * declares and enables it; once approved, saves its projects the same way, which enables it too.
 */
export function PluginReachForm({
  plugin,
  projectPicker,
}: {
  plugin: PluginDetailsResponse;
  projectPicker: ProjectPickerSlot;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [reach, setReach] = useState<PluginReach>(plugin.allProjects ? 'all' : 'chosen');
  const [projects, setProjects] = useState<readonly PickedProject[]>(() =>
    plugin.projects.map(({ key, name }) => ({ key, name })),
  );
  const [problem, setProblem] = useState<string>();

  const approve = useMutation({
    mutationFn: ({ chosen }: { chosen: 'all' | readonly string[]; done: PlainMessageKey }) =>
      Plugins.approve(plugin.slug, chosen),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PluginsQueries.all });
    },
  });

  function projectsProblem(): string | undefined {
    if (reach === 'all') {
      return undefined;
    }
    if (projects.length === 0) {
      return t('plugins.chooseProjects');
    }
    return projects.length > PLUGIN_PROJECTS_MAX
      ? t('plugins.tooManyProjects', { max: PLUGIN_PROJECTS_MAX })
      : undefined;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = projectsProblem();
    setProblem(found);
    if (!found) {
      approve.mutate({
        chosen: reach === 'all' ? 'all' : projects.map(({ key }) => key),
        // Saving the projects of a plugin running changes nothing else; otherwise it starts.
        done: plugin.state === 'enabled' ? 'plugins.saved' : 'plugins.approved',
      });
    }
  }

  function change(next: { reach?: PluginReach; projects?: readonly PickedProject[] }) {
    setReach(next.reach ?? reach);
    setProjects(next.projects ?? projects);
    setProblem(undefined);
    approve.reset();
  }

  return (
    <DetailsSection title={t('plugins.whereTitle')} description={t('plugins.whereDescription')}>
      <form
        noValidate
        onSubmit={submit}
        aria-busy={approve.isPending}
        className="flex flex-col gap-4"
      >
        {approve.isError ? (
          <Alert tone="danger">{requestErrorMessage(approve.error, t, APPROVAL_ERRORS)}</Alert>
        ) : null}
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="sr-only">{t('plugins.whereTitle')}</legend>
          <div className="flex flex-col gap-x-5 gap-y-2 sm:flex-row sm:flex-wrap">
            {REACHES.map((option) => (
              <label
                key={option}
                className="flex items-center gap-2 text-sm text-foreground pointer-coarse:min-h-11"
              >
                <input
                  type="radio"
                  name="plugin-reach"
                  value={option}
                  checked={reach === option}
                  onChange={() => change({ reach: option })}
                  className="size-4 accent-primary"
                />
                {t(REACH_LABELS[option])}
              </label>
            ))}
          </div>
          {reach === 'chosen'
            ? projectPicker({
                label: t('plugins.chosenProjects'),
                chosen: projects,
                onChange: (chosen) => change({ projects: chosen }),
              })
            : null}
          {problem ? <p className="text-xs font-medium text-danger">{problem}</p> : null}
        </fieldset>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {approve.isSuccess ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t(approve.variables.done)}
            </p>
          ) : null}
          <Button type="submit" disabled={approve.isPending}>
            {approve.isPending ? t(pendingLabel(plugin)) : t(submitLabel(plugin))}
          </Button>
        </div>
      </form>
    </DetailsSection>
  );
}

/** Approving what it declares, saving where it acts, which enables it again when disabled. */
function submitLabel({ approval, state }: PluginDetailsResponse): PlainMessageKey {
  if (approval === null) {
    return 'plugins.approve';
  }
  return state === 'disabled' ? 'plugins.saveAndEnable' : 'plugins.save';
}

function pendingLabel({ approval }: PluginDetailsResponse): PlainMessageKey {
  return approval === null ? 'plugins.approving' : 'plugins.saving';
}
