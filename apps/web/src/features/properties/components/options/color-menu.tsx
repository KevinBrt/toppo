import { PALETTE_COLORS, type PaletteColor } from '@toppo-tracker/shared';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  swatchClassName,
} from '@toppo-tracker/ui';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';

/** An option's color: its dot, opening the palette to choose another. */
export function ColorMenu({
  name,
  color,
  onChange,
}: {
  /** The option's name, for the button's label. */
  name: string;
  color: PaletteColor;
  onChange: (color: PaletteColor) => void;
}) {
  const { t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('properties.colorOf', { name, color: t(`colors.${color}`) })}
          className="flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-11"
        >
          <span aria-hidden="true" className={cn('size-3 rounded-full', swatchClassName(color))} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={color}
          onValueChange={(value) => {
            const chosen = PALETTE_COLORS.find((candidate) => candidate === value);
            if (chosen) {
              onChange(chosen);
            }
          }}
        >
          {PALETTE_COLORS.map((candidate) => (
            <DropdownMenuRadioItem key={candidate} value={candidate}>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn('size-3 rounded-full', swatchClassName(candidate))}
                />
                {t(`colors.${candidate}`)}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
