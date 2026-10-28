import { Button, Dialog, DialogClose, DialogContent, Field, Input } from '@toppo-tracker/ui';
import { type FormEvent, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** The only addresses a link may go to: web pages and email. */
const LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function linkTarget(typed: string): string | null {
  try {
    const url = new URL(typed.trim());
    return LINK_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Asks where a link goes; reports the address once it is one a link may have. */
export function LinkDialog({
  open,
  onOpenChange,
  onLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (href: string) => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [invalid, setInvalid] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    // The editor's own form must not be submitted.
    event.preventDefault();
    event.stopPropagation();
    const href = linkTarget(typed);
    setInvalid(href === null);
    if (href) {
      onOpenChange(false);
      setTyped('');
      onLink(href);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        setInvalid(false);
      }}
    >
      <DialogContent title={t('issues.link.title')} closeLabel={t('issues.close')}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <Field
            label={t('issues.link.address')}
            required
            error={invalid ? t('issues.link.invalid') : undefined}
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                value={typed}
                placeholder={t('issues.link.placeholder')}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('issues.cancel')}</Button>
            </DialogClose>
            <Button type="submit">{t('issues.link.add')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
