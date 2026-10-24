import { queryOptions } from '@tanstack/react-query';
import { Mail } from '../api/mail.api.ts';

/** Cached mail data. Keys start with `mail`. */
export const MailQueries = {
  settings: queryOptions({
    queryKey: ['mail', 'settings'],
    queryFn: () => Mail.settings(),
  }),
};
