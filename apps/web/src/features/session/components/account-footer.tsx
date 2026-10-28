import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Avatar, Button } from '@toppo-tracker/ui';
import { LogOutIcon } from 'lucide-react';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Session } from '../api/session.api.ts';
import { SessionQueries } from '../queries/session.queries.ts';

/**
 * The signed-in user, leading to their account, with the way out. The caller decides where to
 * go once signed out.
 */
export function AccountFooter({
  onNavigate,
  onSignedOut,
}: {
  /** Called when the account link is followed, e.g. to close the drawer it sits in. */
  onNavigate?: (() => void) | undefined;
  onSignedOut: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: user } = useQuery(SessionQueries.currentUser);

  const signOut = useMutation({
    mutationFn: () => Session.signOut(),
    onSuccess: async () => {
      // Nothing from this session may remain visible to the next person on this device.
      queryClient.clear();
      await onSignedOut();
    },
  });

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 border-t border-sidebar-border px-2 pt-2 pb-1">
      <Link
        to="/account"
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-hover data-[status=active]:bg-sidebar-active"
      >
        <span className="sr-only">{t('account.title')}</span>
        <Avatar name={user.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">
            {user.name}
          </span>
          <span className="block truncate text-xs text-sidebar-muted">{user.email}</span>
        </span>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label={signOut.isPending ? t('account.signingOut') : t('account.signOut')}
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
        className="text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
      >
        <LogOutIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
