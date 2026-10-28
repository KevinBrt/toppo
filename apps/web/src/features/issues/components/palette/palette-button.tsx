import { Button } from '@toppo-tracker/ui';
import { SearchIcon } from 'lucide-react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { paletteShortcutLabel } from '../../../../shared/keyboard/palette-shortcut.util.ts';

/**
 * The way to the search palette for a pointer or a finger, saying the shortcut that opens it
 * from the keyboard; a magnifier alone on phones.
 */
export function PaletteButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();

  return (
    <Button
      variant="secondary"
      size="sm"
      aria-keyshortcuts="Control+K Meta+K"
      onClick={onOpen}
      className="text-muted-foreground pointer-coarse:size-11 pointer-coarse:px-0 sm:pointer-coarse:w-auto sm:pointer-coarse:px-3"
    >
      <SearchIcon aria-hidden="true" />
      {/* The name of the button, read on phones too, where only the magnifier shows. */}
      <span className="sr-only sm:not-sr-only">{t('palette.button')}</span>
      {/* Said by aria-keyshortcuts: the name stays "Search". */}
      <span
        aria-hidden="true"
        className="hidden rounded border border-border bg-surface-muted px-1.5 font-sans text-xs sm:inline"
      >
        {paletteShortcutLabel(navigator.userAgent)}
      </span>
    </Button>
  );
}
