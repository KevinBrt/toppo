import type {
  DialogFrameSlot,
  ScreenOverlay as Overlay,
} from '../../../models/plugin-overlay.model.ts';
import { ConfirmOverlay } from './confirm-overlay.tsx';
import { DialogOverlay } from './dialog-overlay.tsx';
import { MenuOverlay } from './menu-overlay.tsx';
import { PickerOverlay } from './picker-overlay.tsx';

/** What Toppo draws over the page for one of a plugin's screens, answered once the person acts. */
export function ScreenOverlay({
  pluginSlug,
  overlay,
  frame,
  onAnswer,
}: {
  pluginSlug: string;
  overlay: Overlay;
  frame: DialogFrameSlot;
  onAnswer: (result: unknown) => void;
}) {
  switch (overlay.kind) {
    case 'confirm':
      return <ConfirmOverlay overlay={overlay} onAnswer={onAnswer} />;
    case 'dialog':
      return <DialogOverlay overlay={overlay} frame={frame} onAnswer={onAnswer} />;
    case 'menu':
      return <MenuOverlay overlay={overlay} onAnswer={onAnswer} />;
    case 'pick':
      return <PickerOverlay pluginSlug={pluginSlug} overlay={overlay} onAnswer={onAnswer} />;
  }
}
