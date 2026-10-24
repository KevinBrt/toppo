import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { Session } from '../api/session.api.ts';
import type { SessionState } from '../models/session.model.ts';

/** Cached session data. Keys start with `session` so the whole feature can be reset at once. */
export const SessionQueries = {
  setupRequired: queryOptions({
    queryKey: ['session', 'setup-required'],
    queryFn: () => Session.isSetupRequired(),
    staleTime: Number.POSITIVE_INFINITY,
  }),
  currentUser: queryOptions({
    queryKey: ['session', 'current-user'],
    queryFn: () => Session.currentUser(),
  }),
  passwordReset: queryOptions({
    queryKey: ['session', 'password-reset'],
    queryFn: () => Session.isPasswordResetAvailable(),
  }),
};

/** What route guards need to choose between the wizard, the sign-in page and the app. */
export async function loadSession(queryClient: QueryClient): Promise<SessionState> {
  const setupRequired = await queryClient.ensureQueryData(SessionQueries.setupRequired);
  const user = setupRequired ? null : await queryClient.ensureQueryData(SessionQueries.currentUser);
  return { setupRequired, user };
}
