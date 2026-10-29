import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

/** A project with time logged, as the filter offers it. */
interface ProjectChoice {
  projectId: string;
  projectKey: string;
  spentMinutes: number;
}

/**
 * The time logged in the projects the plugin acts in, as far as the person sees it, by project:
 * against each project's budget (days of the instance's working hours), closed issues apart from
 * the others, in progress or to come. One project only when asked; every project with time is a
 * choice of the filter.
 */
export const projectReport = plugin.defineAction({
  name: 'report.projects',
  access: 'authenticated',
  input: z.object({ projectId: z.uuid().optional() }),
  async handler(ctx, { projectId }) {
    const entries = ctx.entities.timeEntry;

    // A project is known by the key of one of its issues: the plugin reads issues, not projects.
    const choiceOf = async ({ key: id, value: spentMinutes }: { key: string; value: number }) => {
      const { items } = await entries.list({ where: { projectId: id }, pageSize: 1 });
      const issues = await Promise.all(items.map(({ issueId }) => ctx.issues.get(issueId)));
      return issues
        .filter((issue) => issue !== null)
        .map(({ projectKey }) => ({ projectId: id, projectKey, spentMinutes }));
    };
    const closedMinutesIn = async (id: string) => {
      const byIssue = await entries.sumBy('minutes', 'issueId', { where: { projectId: id } });
      const closed = await Promise.all(
        byIssue.map(async ({ key, value }) =>
          key !== null && (await ctx.issues.get(key))?.closedAt ? value : 0,
        ),
      );
      return closed.reduce((sum, minutes) => sum + minutes, 0);
    };
    const timeOf = async (choice: ProjectChoice) => {
      const closedMinutes = await closedMinutesIn(choice.projectId);
      const budgetDays = (await ctx.projects.settings(choice.projectId)).budgetDays ?? null;
      return {
        ...choice,
        closedMinutes,
        openMinutes: choice.spentMinutes - closedMinutes,
        budgetDays,
        overBudget:
          budgetDays !== null && choice.spentMinutes > budgetDays * ctx.settings.hoursPerDay * 60,
      };
    };

    // Entries hang on issues: each has its project.
    const byProject = (await entries.sumBy('minutes', 'projectId')).filter(
      (group): group is { key: string; value: number } => group.key !== null,
    );
    const choices: ProjectChoice[] = (await Promise.all(byProject.map(choiceOf)))
      .flat()
      .sort((left, right) => left.projectKey.localeCompare(right.projectKey));
    const shown = choices.filter((one) => projectId === undefined || one.projectId === projectId);
    return {
      hoursPerDay: ctx.settings.hoursPerDay,
      choices: choices.map(({ projectId: id, projectKey }) => ({ projectId: id, projectKey })),
      projects: await Promise.all(shown.map(timeOf)),
    };
  },
});
