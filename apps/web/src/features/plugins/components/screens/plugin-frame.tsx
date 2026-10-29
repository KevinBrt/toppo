import {
  type FrameMessage,
  frameMessageSchema,
  type HostMessage,
  type ScreenContext,
  type ScreenSearch,
  type ScreenTarget,
} from '@toppo-tracker/plugin-sdk/protocol';
import { Alert } from '@toppo-tracker/ui';
import { useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../../../shared/api/http.client.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PluginScreens } from '../../api/plugin-screens.api.ts';

/** Where a screen's frame is served: for the issue or the project it shows, if any. */
function sourceOf(
  pluginSlug: string,
  screen: string,
  shown: { issue: ScreenContext['issue']; project: ScreenContext['project'] },
): string {
  const path = `/plugin-screens/${encodeURIComponent(pluginSlug)}/${encodeURIComponent(screen)}`;
  if (shown.issue) {
    return `${path}?issue=${encodeURIComponent(shown.issue.key)}`;
  }
  return shown.project ? `${path}?project=${encodeURIComponent(shown.project.key)}` : path;
}

/** The tallest a frame grows to, whatever its content says. */
const FRAME_MAX_HEIGHT = 20_000;

/** Why something a screen asked failed, as it reads it: the plugin's own key when it refused. */
function failureOf(error: unknown): Extract<HostMessage, { ok: false }>['error'] {
  if (error instanceof ApiRequestError) {
    return {
      code: error.plugin?.code ?? error.code,
      ...(error.plugin?.params ? { params: error.plugin.params } : {}),
      ...(error.details.length > 0 ? { issues: [...error.details] } : {}),
    };
  }
  return { code: 'INTERNAL_ERROR' };
}

/**
 * One of a plugin's screens, in a frame without an origin (`sandbox="allow-scripts allow-forms"`): it reaches
 * nothing but through messages to this page, which answers only its own frame, and only while
 * the frame holds the screen Toppo served. A frame that loads another document is taken away.
 * What a screen asks is done for the signed-in person, as they may: its plugin's actions, the
 * names of people they see.
 */
export function PluginFrame({
  pluginSlug,
  screen,
  title,
  user,
  issue = null,
  project = null,
  search = {},
  onSearch,
  onOpen,
  onChanged,
}: {
  pluginSlug: string;
  screen: string;
  /** The frame's accessible name: the screen's title. */
  title: string;
  /** Who looks at it: the signed-in person, once known. */
  user: { id: string; name: string } | undefined;
  /** The issue beside which a panel shows. */
  issue?: ScreenContext['issue'];
  /** The project whose settings a page is a tab of. */
  project?: ScreenContext['project'];
  search?: ScreenSearch;
  onSearch?: (search: ScreenSearch) => void;
  onOpen: (target: ScreenTarget) => void;
  /** An action the screen ran to change something succeeded: what Toppo shows may have changed. */
  onChanged?: () => void;
}) {
  const { t, locale } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);
  const [left, setLeft] = useState(false);
  const loads = useRef(0);
  const handlers = useRef({ onSearch, onOpen, onChanged });
  handlers.current = { onSearch, onOpen, onChanged };

  const source = sourceOf(pluginSlug, screen, { issue, project });

  useEffect(() => {
    const post = (message: HostMessage) => frame.current?.contentWindow?.postMessage(message, '*');
    const answer = (id: number, run: Promise<unknown>) =>
      run.then(
        (result) => post({ kind: 'answer', id, ok: true, result }),
        (error: unknown) => post({ kind: 'answer', id, ok: false, error: failureOf(error) }),
      );
    const handle = (message: FrameMessage) => {
      switch (message.kind) {
        case 'ready':
          setReady(true);
          return;
        case 'resize':
          setHeight(Math.min(Math.ceil(message.height), FRAME_MAX_HEIGHT));
          return;
        case 'action':
          void answer(
            message.id,
            PluginScreens.runAction(pluginSlug, message.name, message.input).then((result) => {
              if (message.changes) {
                handlers.current.onChanged?.();
              }
              return result;
            }),
          );
          return;
        case 'people':
          void PluginScreens.people(message.ids).then(
            (found) =>
              post({
                kind: 'people',
                id: message.id,
                people: message.ids.map((id) => ({
                  id,
                  name: found.find((person) => person.id === id)?.name ?? null,
                })),
              }),
            () => post({ kind: 'people', id: message.id, people: [] }),
          );
          return;
        case 'search':
          handlers.current.onSearch?.(message.search);
          return;
        case 'open':
          handlers.current.onOpen(message.target);
          return;
      }
    };
    const listen = (event: MessageEvent) => {
      // Its own frame only, and only while it holds Toppo's document, which has no origin.
      if (left || event.source !== frame.current?.contentWindow || event.origin !== 'null') {
        return;
      }
      const parsed = frameMessageSchema.safeParse(event.data);
      if (parsed.success) {
        handle(parsed.data);
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [pluginSlug, left]);

  // Compared by value: told again whenever what it holds changes, never as the page draws again.
  const context = user
    ? JSON.stringify({
        kind: 'context',
        locale,
        user: { id: user.id, name: user.name },
        screen,
        search,
        issue,
        project,
      } satisfies ScreenContext)
    : null;
  useEffect(() => {
    if (ready && context && !left) {
      frame.current?.contentWindow?.postMessage(JSON.parse(context), '*');
    }
  }, [ready, context, left]);

  if (left) {
    return <Alert tone="danger">{t('plugins.screenLeft')}</Alert>;
  }
  return (
    <iframe
      ref={frame}
      title={title}
      src={source}
      sandbox="allow-scripts allow-forms"
      className="block w-full border-0 bg-transparent"
      style={{ height }}
      onLoad={() => {
        loads.current += 1;
        // A second document is not Toppo's: the screen went elsewhere, it is taken away.
        if (loads.current > 1) {
          setLeft(true);
        }
      }}
    />
  );
}
