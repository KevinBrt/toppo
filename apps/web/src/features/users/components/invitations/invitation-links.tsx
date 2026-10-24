import type { InvitationLink } from '@toppo/shared';
import { Alert, Button, Input } from '@toppo/ui';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** The clipboard needs HTTPS (or localhost): plain-HTTP installs on a LAN copy by hand. */
function canCopy(): boolean {
  return window.isSecureContext && navigator.clipboard !== undefined;
}

/** What the dialog of fresh links says: they left by email, or are to be passed on by hand. */
export function linksDescription(
  links: readonly InvitationLink[],
): 'invitations.linksEmailedDescription' | 'invitations.linksDescription' {
  return links.some(({ emailed }) => emailed)
    ? 'invitations.linksEmailedDescription'
    : 'invitations.linksDescription';
}

/**
 * Freshly made invitation links, to pass on now: they are never shown again. Each one can be
 * copied, or selected by hand where the clipboard is not available.
 */
export function InvitationLinks({
  links,
  alreadyMembers,
  onDone,
}: {
  links: readonly InvitationLink[];
  alreadyMembers: readonly string[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // The browser may still refuse (permissions): then the links are copied by hand.
  const [clipboard, setClipboard] = useState(canCopy);

  async function copy({ id, link }: InvitationLink) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
    } catch {
      setClipboard(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {links.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {links.map((invitation) => {
            const label = t('invitations.linkFor', { email: invitation.email });
            return (
              <li key={invitation.id} className="flex flex-col gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {invitation.email}
                </span>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    aria-label={label}
                    value={invitation.link}
                    onFocus={(event) => event.target.select()}
                    className="font-mono text-xs"
                  />
                  {clipboard ? (
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => copy(invitation)}
                    >
                      {copiedId === invitation.id ? (
                        <CheckIcon aria-hidden="true" />
                      ) : (
                        <CopyIcon aria-hidden="true" />
                      )}
                      {copiedId === invitation.id ? t('invitations.copied') : t('invitations.copy')}
                      <span className="sr-only">{label}</span>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {clipboard ? null : (
        <p className="text-sm text-muted-foreground">{t('invitations.copyByHand')}</p>
      )}
      {alreadyMembers.length > 0 ? (
        <Alert tone="info">
          {t('invitations.alreadyMembers', { emails: alreadyMembers.join(', ') })}
        </Alert>
      ) : null}
      <Button className="self-end" onClick={onDone}>
        {t('invitations.done')}
      </Button>
    </div>
  );
}
