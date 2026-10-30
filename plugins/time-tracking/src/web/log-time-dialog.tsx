import {
  Alert,
  Button,
  DurationInput,
  Field,
  Input,
  type PickedIssue,
  Row,
  type ScreenFailure,
  Stack,
  useActionMutation,
  useCloseDialog,
  useDialogInput,
  usePickIssue,
  useT,
} from '@toppo-tracker/plugin-ui';
import { type FormEvent, useState } from 'react';
import { logTime } from '../actions/log-time.action.ts';
import { plugin } from '../plugin.ts';
import { logTimeDialog } from '../screens/log-time.dialog.ts';

/** What the person is told when logging fails: refused, a value that does not fit, or else. */
const FAILURES: Partial<Record<string, 'errors.forbidden' | 'errors.invalid'>> = {
  FORBIDDEN: 'errors.forbidden',
  NOT_FOUND: 'errors.forbidden',
  VALIDATION_FAILED: 'errors.invalid',
};

/** Today, as the person's calendar has it: `2026-10-28`. */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Time logged on an issue picked in Toppo's search: the issue first, then the time and the day.
 * Closes once logged, with the minutes, for the page that opened it to count them.
 */
export function LogTimeDialog() {
  const t = useT(plugin);
  // #region dialog
  const { projectId } = useDialogInput(logTimeDialog);
  const close = useCloseDialog(logTimeDialog);
  const pickIssue = usePickIssue();
  const log = useActionMutation(logTime);
  const [issue, setIssue] = useState<PickedIssue | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [spentOn, setSpentOn] = useState(today);
  const [failure, setFailure] = useState<ScreenFailure | null>(null);

  async function choose() {
    const picked = await pickIssue(projectId ? { projectId } : {});
    if (picked) {
      setIssue(picked);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issue) {
      return;
    }
    setFailure(null);
    try {
      await log.run({ issueId: issue.id, minutes: minutes ?? 0, spentOn });
      close({ minutes: minutes ?? 0 });
    } catch (error) {
      setFailure(error as ScreenFailure);
    }
  }
  // #endregion dialog

  return (
    <form onSubmit={submit}>
      <Stack>
        {failure ? (
          <Alert tone="danger">{t(FAILURES[failure.code] ?? 'errors.failed')}</Alert>
        ) : null}
        <Row justify="between">
          <span>{issue ? `${issue.key} · ${issue.title}` : t('dialogs.logTime.noIssue')}</span>
          <Button variant="secondary" onClick={() => void choose()}>
            {issue ? t('dialogs.logTime.change') : t('dialogs.logTime.choose')}
          </Button>
        </Row>
        <DurationInput
          label={t('panels.issueTime.time')}
          value={minutes}
          onChange={setMinutes}
          required
        />
        <Field label={t('panels.issueTime.day')} required>
          {(control) => <Input {...control} type="date" value={spentOn} onChange={setSpentOn} />}
        </Field>
        <Row justify="end">
          <Button type="submit" disabled={!issue || log.isPending}>
            {t('panels.issueTime.log')}
          </Button>
        </Row>
      </Stack>
    </form>
  );
}
