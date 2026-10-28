import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PluginFailure } from '@toppo-tracker/shared';
import { Alert, Button } from '@toppo-tracker/ui';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Plugins } from '../../api/plugins.api.ts';
import { CHANGE_ERRORS } from '../../constants/plugin-errors.constants.ts';
import { PLUGIN_FAILURE_MESSAGES } from '../../constants/plugin-failures.constants.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';

/**
 * Says that Toppo stopped a plugin failing again and again, and why in Toppo's words: the
 * plugin's own stay in the server's log. Enables it again, its failures counted from zero.
 */
export function PluginStoppedAlert({
  slug,
  failures,
  reason,
}: {
  slug: string;
  failures: number;
  reason: PluginFailure;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const enable = useMutation({
    mutationFn: () => Plugins.enable(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PluginsQueries.all });
    },
  });

  return (
    <Alert tone="danger">
      <p>{t('plugins.stopped', { count: failures })}</p>
      <p className="mt-1">
        {t('plugins.lastFailure', { reason: t(PLUGIN_FAILURE_MESSAGES[reason]) })}
      </p>
      {enable.isError ? (
        <p className="mt-2 font-medium">{requestErrorMessage(enable.error, t, CHANGE_ERRORS)}</p>
      ) : null}
      <Button
        variant="secondary"
        className="mt-3"
        disabled={enable.isPending}
        onClick={() => enable.mutate()}
      >
        {t('plugins.enableAgain')}
      </Button>
    </Alert>
  );
}
