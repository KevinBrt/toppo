import { Button, Input } from '@toppo-tracker/ui';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';

/** The clipboard needs HTTPS (or localhost): plain-HTTP installs on a LAN copy by hand. */
function canCopy(): boolean {
  return window.isSecureContext && navigator.clipboard !== undefined;
}

/**
 * A webhook's secret, freshly made, to copy into its receiver now: it is never shown again. Copied
 * with a button, or selected by hand where the clipboard is not available.
 */
export function WebhookSecret({ secret, onDone }: { secret: string; onDone: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  // The browser may still refuse (permissions): then the secret is copied by hand.
  const [clipboard, setClipboard] = useState(canCopy);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setClipboard(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-2">
        <Input
          readOnly
          aria-label={t('webhooks.secret')}
          value={secret}
          onFocus={(event) => event.target.select()}
          className="font-mono text-xs"
        />
        {clipboard ? (
          <Button variant="secondary" className="shrink-0" onClick={copy}>
            {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? t('webhooks.copied') : t('webhooks.copy')}
          </Button>
        ) : null}
      </div>
      {clipboard ? null : (
        <p className="text-sm text-muted-foreground">{t('webhooks.copyByHand')}</p>
      )}
      <Button className="self-end" onClick={onDone}>
        {t('webhooks.done')}
      </Button>
    </div>
  );
}
