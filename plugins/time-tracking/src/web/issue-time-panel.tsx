import {
  Alert,
  Button,
  DurationInput,
  Field,
  formatDuration,
  Input,
  PersonName,
  Row,
  type ScreenFailure,
  Section,
  Stack,
  Stat,
  Table,
  Textarea,
  useActionMutation,
  useActionQuery,
  useScreen,
  useT,
} from '@toppo-tracker/plugin-ui';
import { type FormEvent, useState } from 'react';
import { listEntries } from '../actions/list-entries.action.ts';
import { logTime } from '../actions/log-time.action.ts';
import { plugin } from '../plugin.ts';

/** What the person is told when logging fails: refused, a value that does not fit, or else. */
const FAILURES: Partial<Record<string, 'errors.forbidden' | 'errors.invalid'>> = {
  FORBIDDEN: 'errors.forbidden',
  VALIDATION_FAILED: 'errors.invalid',
};

/** Today, as the person's calendar has it: `2026-10-28`. */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Beside an issue: its time spent, entry by entry, and a form to log more. */
export function IssueTimePanel() {
  const t = useT(plugin);
  const { issue } = useScreen();
  const issueId = issue?.id ?? '';
  const entries = useActionQuery(listEntries, { issueId }, { enabled: issue !== null });
  const log = useActionMutation(logTime);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [spentOn, setSpentOn] = useState(today);
  const [note, setNote] = useState('');
  const [failure, setFailure] = useState<ScreenFailure | null>(null);
  const [logged, setLogged] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setLogged(false);
    try {
      await log.run({ issueId, minutes: minutes ?? 0, spentOn, ...(note.trim() ? { note } : {}) });
      setMinutes(null);
      setNote('');
      setLogged(true);
    } catch (error) {
      setFailure(error as ScreenFailure);
    }
  }

  const failureText = failure === null ? null : t(FAILURES[failure.code] ?? 'errors.failed');

  return (
    <Stack>
      <Stat label={t('panels.issueTime.total')} value={formatDuration(entries.data?.total ?? 0)} />
      <Table
        caption={t('panels.issueTime.caption')}
        empty={t('panels.issueTime.empty')}
        columns={[
          { key: 'who', header: t('panels.issueTime.columns.who') },
          { key: 'day', header: t('panels.issueTime.columns.day') },
          { key: 'time', header: t('panels.issueTime.columns.time'), align: 'end' },
          { key: 'note', header: t('panels.issueTime.columns.note') },
        ]}
        rows={(entries.data?.entries ?? []).map((entry) => ({
          key: entry.id,
          who: <PersonName id={entry.createdBy} />,
          day: entry.spentOn,
          time: formatDuration(entry.minutes),
          note: entry.note ?? '',
        }))}
      />
      <Section title={t('panels.issueTime.log')}>
        <form onSubmit={submit}>
          <Stack>
            {failureText ? <Alert tone="danger">{failureText}</Alert> : null}
            {logged ? <Alert>{t('panels.issueTime.logged')}</Alert> : null}
            <DurationInput
              label={t('panels.issueTime.time')}
              value={minutes}
              onChange={setMinutes}
              required
            />
            <Field label={t('panels.issueTime.day')} required>
              {(control) => (
                <Input {...control} type="date" value={spentOn} onChange={setSpentOn} />
              )}
            </Field>
            <Field label={t('panels.issueTime.note')}>
              {(control) => (
                <Textarea {...control} value={note} onChange={setNote} maxLength={500} />
              )}
            </Field>
            <Row>
              <Button type="submit" disabled={log.isPending}>
                {t('panels.issueTime.log')}
              </Button>
            </Row>
          </Stack>
        </form>
      </Section>
    </Stack>
  );
}
