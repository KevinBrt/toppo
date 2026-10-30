import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PluginDetailsResponse, UninstallPluginQuery } from '@toppo-tracker/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from '@toppo-tracker/ui';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import type { PlainMessageKey } from '../../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../../api/plugins.api.ts';
import { CHANGE_ERRORS } from '../../constants/plugin-errors.constants.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';

const DATA_CHOICES = {
  keep: 'plugins.keepData',
  delete: 'plugins.deleteData',
} as const satisfies Record<UninstallPluginQuery['data'], PlainMessageKey>;

/**
 * "Uninstall" and its confirmation, which says what goes and what stays: its permissions leave
 * the roles, what it wrote keeps its name, and what it kept stays unless deleted. Reports it once
 * done, for the screen to leave its page.
 */
export function UninstallPluginDialog({
  plugin,
  onUninstalled,
}: {
  plugin: PluginDetailsResponse;
  onUninstalled: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<UninstallPluginQuery['data']>('keep');

  const uninstall = useMutation({
    mutationFn: () => Plugins.uninstall(plugin.slug, data),
    onSuccess: async () => {
      setOpen(false);
      await onUninstalled();
      // After leaving its page: its own query would only answer 404 now.
      queryClient.removeQueries({ queryKey: PluginsQueries.detail(plugin.slug).queryKey });
      await queryClient.invalidateQueries({ queryKey: PluginsQueries.all });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        uninstall.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" className="text-danger hover:text-danger">
          <Trash2Icon aria-hidden="true" />
          {t('plugins.uninstall')}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={t('plugins.uninstallConfirmTitle', { name: plugin.name[locale] })}
        description={t('plugins.uninstallConfirmDescription')}
        closeLabel={t('plugins.close')}
      >
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">
              {t('plugins.uninstallData')}
            </legend>
            {(['keep', 'delete'] as const).map((choice) => (
              <label
                key={choice}
                className="flex items-center gap-2 text-sm text-foreground pointer-coarse:min-h-11"
              >
                <input
                  type="radio"
                  name="plugin-data"
                  value={choice}
                  checked={data === choice}
                  onChange={() => setData(choice)}
                  className="size-4 accent-primary"
                />
                {t(DATA_CHOICES[choice])}
              </label>
            ))}
          </fieldset>
          {uninstall.isError ? (
            <Alert tone="danger">{requestErrorMessage(uninstall.error, t, CHANGE_ERRORS)}</Alert>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="secondary">{t('plugins.cancel')}</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={uninstall.isPending}
              onClick={() => uninstall.mutate()}
            >
              {t('plugins.uninstallConfirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
