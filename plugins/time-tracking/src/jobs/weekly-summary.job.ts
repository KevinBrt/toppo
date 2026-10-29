import { translate } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `2026-10-28`: the day `days` before `today`, in UTC as Toppo keeps days. */
const dayBefore = (today: Date, days: number) =>
  new Date(today.getTime() - days * DAY_MS).toISOString().slice(0, 10);

/** A count as people of `language` write it: one decimal at most. */
function written(value: number, language: 'en' | 'fr'): string {
  const rounded = String(Math.round(value * 10) / 10);
  return language === 'fr' ? rounded.replace('.', ',') : rounded;
}

/**
 * Each week, the time logged during the seven days before, by project, posted to the chat whose
 * address is in the settings, in the language they say: against each project's budget, in days.
 * Nothing is posted without an address, nor for a week without time.
 */
export const weeklySummary = plugin.defineJob({
  name: 'weeklySummary',
  every: 'week',
  label: 'jobs.weeklySummary',
  async handler(ctx) {
    const { summaryUrl, summaryLanguage: language, hoursPerDay } = ctx.settings;
    if (summaryUrl === undefined) {
      return;
    }
    const today = new Date();
    const [from, to] = [dayBefore(today, 7), dayBefore(today, 1)];
    const entries = ctx.entities.timeEntry;
    const week = await entries.sumBy('minutes', 'projectId', {
      where: { spentOn: { gte: from, lte: to } },
    });
    if (week.length === 0) {
      return;
    }
    const words = plugin.messages[language];
    // A project is known by the key of one of its issues: the plugin reads issues, not projects.
    const lineOf = async (projectId: string, minutes: number) => {
      const { items } = await entries.list({ where: { projectId }, pageSize: 1 });
      const issues = await Promise.all(items.map(({ issueId }) => ctx.issues.get(issueId)));
      const total = await entries.sum('minutes', { where: { projectId } });
      const { budgetDays } = await ctx.projects.settings(projectId);
      const params = {
        project: issues.find((issue) => issue !== null)?.projectKey ?? projectId,
        week: written(minutes / 60, language),
        spent: written(total / 60 / hoursPerDay, language),
      };
      if (budgetDays === undefined) {
        return translate(words, 'summary.line', params);
      }
      const over = total > budgetDays * hoursPerDay * 60;
      return translate(words, over ? 'summary.lineOver' : 'summary.lineBudget', {
        ...params,
        budget: written(budgetDays, language),
      });
    };
    // Entries hang on issues: each has its project.
    const lines = await Promise.all(
      week
        .filter((group): group is { key: string; value: number } => group.key !== null)
        .map(({ key, value }) => lineOf(key, value)),
    );
    const text = [translate(words, 'summary.title', { from, to }), ...lines.sort()].join('\n');
    const answer = await ctx.http.fetch(summaryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!answer.ok) {
      throw new Error(`The chat answered ${answer.status}`);
    }
  },
});
