import { PROPERTY_TYPES, type PropertyType } from '@toppo-tracker/shared';
import { useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PROPERTY_TYPE_ICONS } from '../../constants/property-types.constants.ts';

/**
 * The type of a new property, chosen once: radio buttons side by side, each with its mark, what
 * the chosen one holds said under them. A property saved shows its type, which no longer changes.
 */
export function PropertyTypeChoice({
  value,
  fixed,
  onChange,
}: {
  value: PropertyType;
  /** Saved already: shown, not chosen. */
  fixed: boolean;
  onChange: (type: PropertyType) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const Icon = PROPERTY_TYPE_ICONS[value];

  if (fixed) {
    return (
      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-foreground">{t('properties.type')}</h3>
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          {t(`properties.types.${value}`)}
        </p>
        <p className="text-xs text-muted-foreground">{t('properties.typeFixed')}</p>
      </section>
    );
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={`${id}-help`}>
      <legend className="mb-1.5 text-sm font-medium text-foreground">{t('properties.type')}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PROPERTY_TYPES.map((type) => {
          const TypeIcon = PROPERTY_TYPE_ICONS[type];
          return (
            <label
              key={type}
              className="relative flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover has-checked:border-primary has-checked:bg-primary-subtle has-checked:text-primary-subtle-foreground has-focus-visible:outline-2 has-focus-visible:outline-ring pointer-coarse:min-h-11"
            >
              <input
                type="radio"
                name={`${id}-type`}
                value={type}
                checked={value === type}
                onChange={() => onChange(type)}
                // Transparent over the button: clicked and focused where it is seen.
                className="absolute inset-0 cursor-pointer appearance-none opacity-0"
              />
              <TypeIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{t(`properties.types.${type}`)}</span>
            </label>
          );
        })}
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {t(`properties.typeHelps.${value}`)}
      </p>
    </fieldset>
  );
}
