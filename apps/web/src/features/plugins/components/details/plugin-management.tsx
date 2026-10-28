import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PluginDetailsResponse } from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import type { ReactNode } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../../api/plugins.api.ts';
import { CHANGE_ERRORS } from '../../constants/plugin-errors.constants.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { InstallPlugin } from '../install-plugin.tsx';
import { DetailsSection } from './details-section.tsx';
import { UninstallPluginDialog } from './uninstall-plugin-dialog.tsx';

/**
 * What an administrator does with a plugin installed: send its new version, disable it or enable
 * it again, uninstall it. Reports a plugin installed and this one uninstalled.
 */
export function PluginManagement({
  plugin,
  stopped,
  onInstalled,
  onUninstalled,
}: {
  plugin: PluginDetailsResponse;
  /** Toppo stopped it for failing: the alert above enables it again. */
  stopped: boolean;
  onInstalled: (slug: string) => Promise<void> | void;
  onUninstalled: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  // A plugin waiting for an approval is enabled by approving it.
  const enableable = plugin.state === 'disabled' && plugin.approval !== null && !stopped;

  return (
    <DetailsSection title={t('plugins.manageTitle')}>
      <div className="-mx-5 -mb-5 divide-y divide-border border-t border-border sm:-mx-6 sm:-mb-6">
        <ManageRow
          title={t('plugins.newVersionTitle')}
          description={t('plugins.newVersionDescription')}
        >
          <InstallPlugin
            label={t('plugins.installNewVersion')}
            variant="secondary"
            onInstalled={onInstalled}
          />
        </ManageRow>
        {plugin.state === 'enabled' ? (
          <ManageRow
            title={t('plugins.disableTitle')}
            description={t('plugins.disableDescription')}
          >
            <StateButton slug={plugin.slug} change="disable" label={t('plugins.disable')} />
          </ManageRow>
        ) : null}
        {enableable ? (
          <ManageRow title={t('plugins.enableTitle')} description={t('plugins.enableDescription')}>
            <StateButton slug={plugin.slug} change="enable" label={t('plugins.enable')} />
          </ManageRow>
        ) : null}
        <ManageRow
          title={t('plugins.uninstallTitle')}
          description={t('plugins.uninstallDescription')}
        >
          <UninstallPluginDialog plugin={plugin} onUninstalled={onUninstalled} />
        </ManageRow>
      </div>
    </DetailsSection>
  );
}

function ManageRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 self-end sm:self-auto">{children}</div>
    </div>
  );
}

/** Enables or disables a plugin at once: neither loses anything, both undo the other. */
function StateButton({
  slug,
  change,
  label,
}: {
  slug: string;
  change: 'enable' | 'disable';
  label: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => (change === 'enable' ? Plugins.enable(slug) : Plugins.disable(slug)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PluginsQueries.all });
    },
  });

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {label}
      </Button>
      {mutation.isError ? (
        <Alert tone="danger" className="sm:max-w-sm">
          {requestErrorMessage(mutation.error, t, CHANGE_ERRORS)}
        </Alert>
      ) : null}
    </div>
  );
}
