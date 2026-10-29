import type { PluginDetailsResponse } from '@toppo-tracker/shared';
import { Button, Input } from '@toppo-tracker/ui';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { DetailsSection } from './details-section.tsx';

/** The clipboard needs HTTPS (or localhost): plain-HTTP installs on a LAN copy by hand. */
function canCopy(): boolean {
  return window.isSecureContext && navigator.clipboard !== undefined;
}

/**
 * Where services outside Toppo call the plugin, each address to give the service (GitHub's
 * webhook settings, say): open to anyone, the plugin checks who sends what it receives.
 */
export function PluginRoutes({ routes }: { routes: PluginDetailsResponse['routes'] }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  // The browser may still refuse (permissions): then the addresses are copied by hand.
  const [clipboard, setClipboard] = useState(canCopy);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setClipboard(false);
    }
  }

  return (
    <DetailsSection
      title={t('plugins.routesTitle')}
      description={routes.length > 0 ? t('plugins.routesDescription') : undefined}
    >
      {routes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('plugins.routesNone')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {routes.map(({ name, url }) => {
            const label = t('plugins.routeAddress', { name });
            return (
              <li key={name} className="flex flex-col gap-1.5">
                <span className="font-mono text-xs text-muted-foreground">{name}</span>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    aria-label={label}
                    value={url}
                    onFocus={(event) => event.target.select()}
                    className="font-mono text-xs"
                  />
                  {clipboard ? (
                    <Button variant="secondary" className="shrink-0" onClick={() => copy(url)}>
                      {copied === url ? (
                        <CheckIcon aria-hidden="true" />
                      ) : (
                        <CopyIcon aria-hidden="true" />
                      )}
                      {copied === url ? t('plugins.copied') : t('plugins.copy')}
                      <span className="sr-only">{label}</span>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {routes.length > 0 && !clipboard ? (
        <p className="text-sm text-muted-foreground">{t('plugins.copyByHand')}</p>
      ) : null}
    </DetailsSection>
  );
}
