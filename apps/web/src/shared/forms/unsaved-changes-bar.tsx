import { Button } from '@toppo-tracker/ui';
import { useI18n } from '../i18n/i18n-provider.tsx';
import { pluralForm } from '../i18n/plural.util.ts';

/** "3 unsaved changes", with the way to save or discard them, kept in view at the bottom. */
export function UnsavedChangesBar({
  count,
  saving,
  onSave,
  onDiscard,
}: {
  count: number;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { t, locale } = useI18n();

  return (
    <div className="sticky bottom-0 z-20 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:pl-4">
        <p className="text-sm font-medium text-foreground">
          {t(`unsaved.count.${pluralForm(locale, count)}`, { count })}
        </p>
        <div className="flex gap-2 self-end sm:self-auto">
          <Button variant="secondary" disabled={saving} onClick={onDiscard}>
            {t('unsaved.discard')}
          </Button>
          <Button disabled={saving} onClick={onSave}>
            {saving ? t('unsaved.saving') : t('unsaved.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
