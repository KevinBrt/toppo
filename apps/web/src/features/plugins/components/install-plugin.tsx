import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from '@toppo-tracker/ui';
import { UploadIcon } from 'lucide-react';
import { useRef } from 'react';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../api/plugins.api.ts';
import { INSTALL_ERRORS } from '../constants/plugin-errors.constants.ts';
import { PluginsQueries } from '../queries/plugins.queries.ts';

/**
 * A button that opens the computer's files and sends the zip chosen: a new plugin, or a new
 * version of one installed. Says why the server refused it; reports the plugin installed.
 */
export function InstallPlugin({
  label,
  variant = 'primary',
  onInstalled,
}: {
  label: string;
  variant?: 'primary' | 'secondary';
  onInstalled: (slug: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);

  const install = useMutation({
    mutationFn: (zip: File) => Plugins.install(zip),
    onSuccess: async (slug) => {
      await queryClient.invalidateQueries({ queryKey: PluginsQueries.all });
      await onInstalled(slug);
    },
  });

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <Button
        variant={variant}
        disabled={install.isPending}
        onClick={() => picker.current?.click()}
      >
        <UploadIcon aria-hidden="true" />
        {install.isPending ? t('plugins.installing') : label}
      </Button>
      <input
        ref={picker}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const zip = event.target.files?.[0];
          // The same file can be chosen again, once corrected.
          event.target.value = '';
          if (zip) {
            install.mutate(zip);
          }
        }}
      />
      {install.isError ? (
        <Alert tone="danger" className="sm:max-w-sm">
          {requestErrorMessage(install.error, t, INSTALL_ERRORS)}
        </Alert>
      ) : null}
    </div>
  );
}
