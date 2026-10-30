import type { DialogSize } from '@toppo-tracker/plugin-sdk/protocol';
import { Dialog, DialogContent, SidePanel, SidePanelContent } from '@toppo-tracker/ui';
import { useI18n } from '../../../../../shared/i18n/i18n-provider.tsx';
import type { DialogFrameSlot, ScreenOverlay } from '../../../models/plugin-overlay.model.ts';
import { AskedBy } from './asked-by.tsx';

/** Toppo's widths for a plugin's dialog, in the page's middle and at its side. */
const WIDTHS: Readonly<Record<DialogSize, { middle: string; side: string }>> = {
  small: { middle: 'sm:max-w-md', side: 'sm:max-w-md' },
  medium: { middle: 'sm:max-w-lg', side: 'sm:max-w-lg' },
  large: { middle: 'sm:max-w-3xl', side: 'sm:max-w-2xl' },
};

/**
 * One of a plugin's dialogs, opened by one of its screens: Toppo's dialog, or side panel, named
 * by its title and its plugin, holding the dialog's own screen in a frame. Answers what the
 * screen closed it with, `null` when the person dismissed it.
 */
export function DialogOverlay({
  overlay,
  frame,
  onAnswer,
}: {
  overlay: Extract<ScreenOverlay, { kind: 'dialog' }>;
  frame: DialogFrameSlot;
  onAnswer: (result: unknown) => void;
}) {
  const { t, locale } = useI18n();
  const { dialog, request } = overlay;
  const title = dialog.title[locale];
  const content = (
    <div className="flex flex-col gap-3">
      <AskedBy plugin={overlay.plugin} />
      {frame({
        screen: dialog.name,
        title,
        input: request.input,
        onClose: (result) => onAnswer(result ?? null),
      })}
    </div>
  );
  const dismissed = (open: boolean) => {
    if (!open) {
      onAnswer(null);
    }
  };
  if (dialog.side) {
    return (
      <SidePanel open onOpenChange={dismissed}>
        <SidePanelContent
          title={title}
          closeLabel={t('plugins.close')}
          className={WIDTHS[dialog.size].side}
        >
          {content}
        </SidePanelContent>
      </SidePanel>
    );
  }
  return (
    <Dialog open onOpenChange={dismissed}>
      <DialogContent
        title={title}
        closeLabel={t('plugins.close')}
        className={WIDTHS[dialog.size].middle}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
