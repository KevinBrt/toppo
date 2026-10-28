import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { PluginSummary } from '@toppo-tracker/shared';
import { Alert, EmptyState } from '@toppo-tracker/ui';
import { ChevronRightIcon, PuzzleIcon } from 'lucide-react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { PluginLogo } from '../plugin-logo.tsx';
import { PluginStateBadge } from '../plugin-state-badge.tsx';

/** The plugins installed, each row opening its page. At most 50: the list comes whole. */
export function PluginsList() {
  const { t } = useI18n();
  const plugins = useQuery(PluginsQueries.list);

  if (plugins.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('plugins.loading')}
      </p>
    );
  }
  if (plugins.isError) {
    return <Alert tone="danger">{requestErrorMessage(plugins.error, t)}</Alert>;
  }
  if (plugins.data.length === 0) {
    return (
      <EmptyState
        icon={PuzzleIcon}
        title={t('plugins.emptyTitle')}
        description={t('plugins.emptyDescription')}
      />
    );
  }
  return (
    <ul
      aria-label={t('plugins.listLabel')}
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
    >
      {plugins.data.map((plugin) => (
        <PluginRow key={plugin.slug} plugin={plugin} />
      ))}
    </ul>
  );
}

/** A plugin, the whole row opening it: its name is the link, stretched over the row. */
function PluginRow({ plugin }: { plugin: PluginSummary }) {
  const { t, locale } = useI18n();

  return (
    <li className="relative flex items-center gap-3 px-4 py-3 transition-[background-color] hover:bg-surface-hover">
      <PluginLogo url={plugin.logoUrl} className="size-10" />
      <div className="min-w-0 flex-1">
        <Link
          to="/settings/plugins/$pluginSlug"
          params={{ pluginSlug: plugin.slug }}
          className="block truncate text-sm font-medium text-foreground outline-none after:absolute after:inset-0 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
        >
          {plugin.name[locale]}
        </Link>
        <p className="text-xs text-muted-foreground">
          {t('plugins.version', { version: plugin.version })}
        </p>
      </div>
      <PluginStateBadge state={plugin.state} />
      <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </li>
  );
}
