import { useQueryClient } from '@tanstack/react-query';
import {
  type FrameMessage,
  frameMessageSchema,
  type HostMessage,
  type ScreenContext,
  type ScreenSearch,
  type ScreenTarget,
} from '@toppo-tracker/plugin-sdk/protocol';
import type { PluginDialogsResponse } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '../../../../shared/api/http.client.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { PluginScreens } from '../../api/plugin-screens.api.ts';
import type { ScreenOverlay as Overlay } from '../../models/plugin-overlay.model.ts';
import { PluginsQueries } from '../../queries/plugins.queries.ts';
import { ScreenOverlay } from './overlays/screen-overlay.tsx';

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

/** What a screen asks Toppo to draw over the page. */
type OverlayRequest = Extract<FrameMessage, { kind: 'confirm' | 'dialog' | 'menu' | 'pick' }>;

/**
 * What Toppo draws for what a screen asked, its plugin's name and dialogs known: a menu beside
 * its button, which the frame (`box`, on the page) measured in its own pixels.
 */
function overlayFor(
  request: OverlayRequest,
  { plugin, dialogs }: PluginDialogsResponse,
  box: { left: number; top: number },
): Overlay {
  switch (request.kind) {
    case 'dialog': {
      const dialog = dialogs.find(({ name }) => name === request.name);
      if (!dialog) {
        throw new Error(`The plugin has no dialog ${request.name} the person may open`);
      }
      return { kind: 'dialog', plugin, request, dialog };
    }
    case 'menu': {
      const { x, y, width, height } = request.anchor;
      return {
        kind: 'menu',
        plugin,
        request,
        at: { x: box.left + x, y: box.top + y, width, height },
      };
    }
    case 'confirm':
      return { kind: 'confirm', plugin, request };
    default:
      return { kind: 'pick', plugin, request };
  }
}

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
 * names of people they see, and what Toppo draws over the page for it (a confirmation, one of its
 * dialogs, a menu, a search), one at a time, asked by the frame the person is using only.
 */
export function PluginFrame({
  pluginSlug,
  screen,
  title,
  user,
  issue = null,
  project = null,
  search = {},
  input = null,
  onSearch,
  onOpen,
  onChanged,
  onClose,
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
  /** What the screen that opened a dialog handed it. */
  input?: ScreenContext['input'];
  onSearch?: (search: ScreenSearch) => void;
  onOpen: (target: ScreenTarget) => void;
  /** An action the screen ran to change something succeeded: what Toppo shows may have changed. */
  onChanged?: () => void;
  /** A dialog's screen closed it, with what its opener is answered. */
  onClose?: (result: unknown) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [ready, setReady] = useState(false);
  const [left, setLeft] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const overlaid = useRef(false);
  const loads = useRef(0);

  const source = sourceOf(pluginSlug, screen, { issue, project });
  const post = (message: HostMessage) => frame.current?.contentWindow?.postMessage(message, '*');

  /**
   * Draws over the page what the screen asked, once its plugin's name (and dialogs) are known:
   * refused while something is drawn already, when the frame is not the one the person uses, and
   * for a dialog opening another one.
   */
  async function overlayOf(request: OverlayRequest): Promise<void> {
    const refuse = () =>
      post({ kind: 'answer', id: request.id, ok: false, error: { code: 'OVERLAY_REFUSED' } });
    const inDialog = handlers.current.onClose !== undefined;
    if (
      overlaid.current ||
      document.activeElement !== frame.current ||
      (request.kind === 'dialog' && inDialog)
    ) {
      refuse();
      return;
    }
    overlaid.current = true;
    try {
      const known = await queryClient.fetchQuery(PluginsQueries.dialogs(pluginSlug));
      const box = frame.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      setOverlay(overlayFor(request, known, box));
    } catch {
      // Not known, not reachable, or not the person's to open: the screen is told so.
      overlaid.current = false;
      refuse();
    }
  }

  const handlers = useRef({ onSearch, onOpen, onChanged, onClose, overlayOf });
  handlers.current = { onSearch, onOpen, onChanged, onClose, overlayOf };

  function answer(result: unknown) {
    if (overlay) {
      post({ kind: 'answer', id: overlay.request.id, ok: true, result });
    }
    setOverlay(null);
    overlaid.current = false;
    refocus.current = true;
  }

  // Back to the screen that asked, once what was drawn is gone (a dialog gives focus back as it
  // goes): the person goes on where they were, and the screen may ask again.
  const refocus = useRef(false);
  useEffect(() => {
    if (overlay || !refocus.current) {
      return;
    }
    refocus.current = false;
    const timer = setTimeout(() => frame.current?.focus());
    return () => clearTimeout(timer);
  }, [overlay]);

  useEffect(() => {
    const send = (message: HostMessage) => frame.current?.contentWindow?.postMessage(message, '*');
    const reply = (id: number, run: Promise<unknown>) =>
      run.then(
        (result) => send({ kind: 'answer', id, ok: true, result }),
        (error: unknown) => send({ kind: 'answer', id, ok: false, error: failureOf(error) }),
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
          void reply(
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
              send({
                kind: 'people',
                id: message.id,
                people: message.ids.map((id) => ({
                  id,
                  name: found.find((person) => person.id === id)?.name ?? null,
                })),
              }),
            () => send({ kind: 'people', id: message.id, people: [] }),
          );
          return;
        case 'search':
          handlers.current.onSearch?.(message.search);
          return;
        case 'open':
          handlers.current.onOpen(message.target);
          return;
        case 'close':
          handlers.current.onClose?.(message.result ?? null);
          return;
        default:
          void handlers.current.overlayOf(message);
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
        input,
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
    <>
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
      {overlay ? (
        <ScreenOverlay
          pluginSlug={pluginSlug}
          overlay={overlay}
          onAnswer={answer}
          frame={(dialog) => (
            <PluginFrame
              pluginSlug={pluginSlug}
              screen={dialog.screen}
              title={dialog.title}
              user={user}
              input={dialog.input}
              onOpen={onOpen}
              onClose={dialog.onClose}
              {...(onChanged ? { onChanged } : {})}
            />
          )}
        />
      ) : null}
    </>
  );
}
