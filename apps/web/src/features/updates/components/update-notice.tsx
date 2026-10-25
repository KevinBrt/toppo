import { useQuery } from '@tanstack/react-query';
import { CircleArrowUpIcon } from 'lucide-react';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { UpdatesQueries } from '../queries/updates.queries.ts';

/** How to upgrade, in the self-hosting guide of the repository. */
const UPGRADE_GUIDE = 'https://github.com/KevinBrt/toppo/blob/main/docs/self-hosting.md#upgrades';

const LINK_CLASS =
  'font-medium text-sidebar-foreground underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Above the account in the sidebar, for whoever manages the instance: a newer version of Toppo
 * published, with its release notes and how to upgrade. Nothing while there is none.
 */
export function UpdateNotice({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const { data } = useQuery({ ...UpdatesQueries.version, enabled });
  const update = enabled ? data?.update : null;
  if (!update) {
    return null;
  }

  return (
    <section
      aria-label={t('updates.title')}
      className="mx-3 mb-3 flex gap-3 rounded-lg bg-sidebar-hover p-3 text-sm text-sidebar-foreground"
    >
      <CircleArrowUpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-logo-badge" />
      <div className="min-w-0">
        <p className="font-medium">{t('updates.available', { version: update.version })}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sidebar-muted">
          <a href={update.url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
            {t('updates.releaseNotes')}
          </a>
          <a href={UPGRADE_GUIDE} target="_blank" rel="noreferrer" className={LINK_CLASS}>
            {t('updates.howTo')}
          </a>
        </p>
      </div>
    </section>
  );
}
