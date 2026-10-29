import { plugin } from '../plugin.ts';

/** Beside an issue: its time spent, entry by entry, and a way to log more. */
export const issueTimePanel = plugin.definePanel({
  name: 'issueTime',
  on: 'issue',
  access: 'authenticated',
  title: 'panels.issueTime.title',
  component: () => import('../web/issue-time-panel.tsx').then((module) => module.IssueTimePanel),
});
