import { TOPPO_VERSION } from '@toppo/shared';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';

/**
 * The version running, at the bottom of the sidebar: what to give when reporting a problem. The
 * web app is built with the server it comes from, so its own version is the server's.
 */
export function AppVersion() {
  const { t } = useI18n();

  return (
    <p className="px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-xs text-sidebar-muted">
      {t('updates.version', { version: TOPPO_VERSION })}
    </p>
  );
}
