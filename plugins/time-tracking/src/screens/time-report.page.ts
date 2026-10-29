import { plugin } from '../plugin.ts';

/**
 * The time logged across the projects the plugin acts in, in the main sidebar: against each
 * project's budget, closed issues apart from the others.
 */
export const timeReportPage = plugin.definePage({
  name: 'report',
  zone: 'main',
  access: 'authenticated',
  title: 'pages.report.title',
  nav: { label: 'pages.report.nav', icon: 'clock' },
  component: () => import('../web/time-report-page.tsx').then((module) => module.TimeReportPage),
});
