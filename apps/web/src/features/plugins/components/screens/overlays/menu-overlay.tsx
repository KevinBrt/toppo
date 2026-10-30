import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@toppo-tracker/ui';
import { useRef } from 'react';
import { useI18n } from '../../../../../shared/i18n/i18n-provider.tsx';
import type { ScreenOverlay } from '../../../models/plugin-overlay.model.ts';

/**
 * A menu a plugin's screen asked for, drawn by Toppo over the page beside the screen's button,
 * where the frame could not draw it whole. Answers the item chosen, `null` when none was.
 */
export function MenuOverlay({
  overlay,
  onAnswer,
}: {
  overlay: Extract<ScreenOverlay, { kind: 'menu' }>;
  onAnswer: (chosen: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const chosen = useRef<string | null>(null);
  const { at, request } = overlay;
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) {
          onAnswer(chosen.current);
        }
      }}
    >
      {/* Where the screen's button is: the menu opens beside it. */}
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={{ left: at.x, top: at.y, width: at.width, height: at.height }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        aria-label={t('plugins.overlays.menu', { plugin: overlay.plugin[locale] })}
      >
        <DropdownMenuLabel>{overlay.plugin[locale]}</DropdownMenuLabel>
        {request.items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            tone={item.tone}
            disabled={item.disabled}
            onSelect={() => {
              chosen.current = item.id;
            }}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
