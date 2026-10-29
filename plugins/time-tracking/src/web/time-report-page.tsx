import {
  Alert,
  Badge,
  Field,
  formatDuration,
  Page,
  Select,
  Table,
  useActionQuery,
  useScreen,
  useT,
} from '@toppo-tracker/plugin-ui';
import { projectReport } from '../actions/project-report.action.ts';
import { plugin } from '../plugin.ts';

/**
 * The time logged across the projects the person sees, filtered by project (kept in Toppo's
 * address): each project's time in days against its budget, those over it marked, closed
 * issues apart from the others.
 */
export function TimeReportPage() {
  const t = useT(plugin);
  const { search, setSearch, locale } = useScreen();
  const projectId = search['project'];
  const report = useActionQuery(projectReport, projectId ? { projectId } : {});
  const hours = report.data?.hoursPerDay ?? 8;
  const days = (minutes: number) =>
    t('pages.report.days', {
      days: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
        minutes / 60 / hours,
      ),
    });

  return (
    <Page title={t('pages.report.title')} description={t('pages.report.description', { hours })}>
      {report.error ? <Alert tone="danger">{t('errors.failed')}</Alert> : null}
      <Field label={t('pages.report.project')}>
        {(control) => (
          <Select
            {...control}
            value={projectId ?? ''}
            onChange={(chosen) => setSearch(chosen ? { project: chosen } : {})}
            options={[
              { value: '', label: t('pages.report.allProjects') },
              ...(report.data?.choices ?? []).map((choice) => ({
                value: choice.projectId,
                label: choice.projectKey,
              })),
            ]}
          />
        )}
      </Field>
      <Table
        caption={t('pages.report.caption')}
        empty={t('pages.report.empty')}
        columns={[
          { key: 'project', header: t('pages.report.columns.project') },
          { key: 'spent', header: t('pages.report.columns.spent'), align: 'end' },
          { key: 'budget', header: t('pages.report.columns.budget'), align: 'end' },
          { key: 'closed', header: t('pages.report.columns.closed'), align: 'end' },
          { key: 'open', header: t('pages.report.columns.open'), align: 'end' },
          { key: 'status', header: t('pages.report.columns.status') },
        ]}
        rows={(report.data?.projects ?? []).map((project) => ({
          key: project.projectId,
          project: project.projectKey,
          spent: days(project.spentMinutes),
          budget:
            project.budgetDays === null
              ? '—'
              : t('pages.report.days', { days: project.budgetDays }),
          closed: formatDuration(project.closedMinutes),
          open: formatDuration(project.openMinutes),
          status: <BudgetBadge budgetDays={project.budgetDays} over={project.overBudget} />,
        }))}
      />
    </Page>
  );
}

function BudgetBadge({ budgetDays, over }: { budgetDays: number | null; over: boolean }) {
  const t = useT(plugin);
  if (budgetDays === null) {
    return <Badge>{t('pages.report.noBudget')}</Badge>;
  }
  return over ? (
    <Badge tone="orange">{t('pages.report.overBudget')}</Badge>
  ) : (
    <Badge tone="green">{t('pages.report.withinBudget')}</Badge>
  );
}
