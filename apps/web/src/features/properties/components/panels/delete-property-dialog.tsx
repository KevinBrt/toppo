import { useMutation } from '@tanstack/react-query';
import type { PropertyRow } from '@toppo/shared';
import { Alert, Button, Dialog, DialogClose, DialogContent } from '@toppo/ui';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { ProjectProperties } from '../../api/project-properties.api.ts';
import { Properties } from '../../api/properties.api.ts';

/** Asks before deleting a property, saying how many issues lose a value; reports it once done. */
export function DeletePropertyDialog({
  property,
  projectKey,
  open,
  onOpenChange,
  onDeleted,
}: {
  property: PropertyRow;
  /** The project it belongs to; none for one of the instance. */
  projectKey: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const inUse = property.issueCount;
  const remove = useMutation({
    mutationFn: () =>
      projectKey
        ? ProjectProperties.remove(projectKey, property.id)
        : Properties.remove(property.id),
    onSuccess: async () => {
      onOpenChange(false);
      await onDeleted();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        remove.reset();
      }}
    >
      <DialogContent
        title={t('properties.deleteTitle', { name: property.name })}
        description={
          inUse > 0
            ? t(`properties.deleteInUse.${pluralForm(locale, inUse)}`, { count: inUse })
            : t('properties.deleteUnused')
        }
        closeLabel={t('properties.close')}
      >
        {remove.isError ? (
          <Alert tone="danger" className="mb-4">
            {requestErrorMessage(remove.error, t)}
          </Alert>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary">{t('properties.cancel')}</Button>
          </DialogClose>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t('properties.deleting') : t('properties.deleteProperty')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
