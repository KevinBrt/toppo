import { Button, Dialog, DialogContent } from '@toppo-tracker/ui';
import { useI18n } from '../../../../../shared/i18n/i18n-provider.tsx';
import type { ScreenOverlay } from '../../../models/plugin-overlay.model.ts';
import { AskedBy } from './asked-by.tsx';

/**
 * A plugin's screen asks the person to confirm: its words, in Toppo's dialog, naming the plugin.
 * Answers `true` once they confirmed, `false` otherwise.
 */
export function ConfirmOverlay({
  overlay,
  onAnswer,
}: {
  overlay: Extract<ScreenOverlay, { kind: 'confirm' }>;
  onAnswer: (confirmed: boolean) => void;
}) {
  const { t } = useI18n();
  const { request } = overlay;
  return (
    <Dialog open onOpenChange={(open) => !open && onAnswer(false)}>
      <DialogContent
        title={request.title}
        {...(request.description ? { description: request.description } : {})}
        closeLabel={t('plugins.close')}
        className="sm:max-w-md"
      >
        <div className="flex flex-col gap-4">
          <AskedBy plugin={overlay.plugin} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => onAnswer(false)}>
              {t('plugins.cancel')}
            </Button>
            <Button
              variant={request.tone === 'danger' ? 'danger' : 'primary'}
              onClick={() => onAnswer(true)}
            >
              {request.confirmLabel ?? t('plugins.overlays.confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
