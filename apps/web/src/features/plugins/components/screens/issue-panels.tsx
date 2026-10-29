import { useQuery } from '@tanstack/react-query';
import type { ScreenTarget } from '@toppo-tracker/plugin-sdk/protocol';
import type { IssuePanelsResponse, PluginScreen } from '@toppo-tracker/shared';
import { useId } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { PluginFrame } from './plugin-frame.tsx';

/**
 * The panels plugins show beside an issue, each in its frame under its title: those of the
 * plugins at work in its project that the person may open. Nothing while none is.
 */
export function IssuePanels({
  issueKey,
  user,
  onOpen,
  onChanged,
}: {
  issueKey: string;
  /** Who looks at them: the signed-in person, once known. */
  user: { id: string; name: string } | undefined;
  onOpen: (target: ScreenTarget, pluginSlug: string) => void;
  /** A panel changed something: the issue may read otherwise (its properties). */
  onChanged: () => void;
}) {
  const { data } = useQuery(PluginsQueries.issuePanels(issueKey));
  if (!data || data.screens.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-6">
      {data.screens.map((panel) => (
        <IssuePanel
          key={`${panel.pluginSlug}/${panel.name}`}
          panel={panel}
          issue={data.issue}
          user={user}
          onOpen={(target) => onOpen(target, panel.pluginSlug)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

function IssuePanel({
  panel,
  issue,
  user,
  onOpen,
  onChanged,
}: {
  panel: PluginScreen;
  issue: IssuePanelsResponse['issue'];
  user: { id: string; name: string } | undefined;
  onOpen: (target: ScreenTarget) => void;
  onChanged: () => void;
}) {
  const { locale } = useI18n();
  const id = useId();
  const title = panel.title[locale];
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      <PluginFrame
        pluginSlug={panel.pluginSlug}
        screen={panel.name}
        title={title}
        user={user}
        issue={issue}
        onOpen={onOpen}
        onChanged={onChanged}
      />
    </section>
  );
}
