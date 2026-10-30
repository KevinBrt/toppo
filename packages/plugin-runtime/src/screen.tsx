import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ServedScreens } from '@toppo-tracker/plugin-sdk';
import type { ScreenContext } from '@toppo-tracker/plugin-sdk/protocol';
import { Alert } from '@toppo-tracker/ui';
import { Component, type ComponentType, type ReactNode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type Bridge, createBridge } from './bridge.ts';
import { RUNTIME_WORDS, ScreenSessionContext } from './screen-context.ts';

/** The locale of the screen's person, for what reads it outside React. */
export let screenLocale: 'en' | 'fr' = 'en';

/** Says the screen failed, in Toppo's words; the plugin's own stay in the console. */
class ScreenBoundary extends Component<
  { failed: string; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? (
      <Alert tone="danger">{this.props.failed}</Alert>
    ) : (
      this.props.children
    );
  }
}

/** Draws the screen once Toppo said where it is, and again as that changes. */
function ScreenApp({ bridge, load }: { bridge: Bridge; load: () => Promise<unknown> }) {
  const [context, setContext] = useState<ScreenContext | null>(null);
  const [Screen, setScreen] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );

  useEffect(
    () =>
      bridge.onContext((next) => {
        screenLocale = next.locale;
        setContext(next);
      }),
    [bridge],
  );
  useEffect(() => {
    load().then(
      (drawn) => {
        if (typeof drawn === 'function') {
          setScreen(() => drawn as ComponentType);
        } else {
          setFailed(true);
        }
      },
      () => setFailed(true),
    );
  }, [load]);

  if (!context) {
    return null;
  }
  const failure = RUNTIME_WORDS[context.locale].failed;
  if (failed) {
    return <Alert tone="danger">{failure}</Alert>;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ScreenSessionContext value={{ context, bridge }}>
        <ScreenBoundary failed={failure}>{Screen ? <Screen /> : null}</ScreenBoundary>
      </ScreenSessionContext>
    </QueryClientProvider>
  );
}

/** Tells Toppo the height of the screen's content, for the frame to fit it. */
function reportHeight(bridge: Bridge, root: HTMLElement): void {
  new ResizeObserver(() => {
    bridge.post({ kind: 'resize', height: Math.ceil(root.getBoundingClientRect().height) });
  }).observe(root);
}

/**
 * Draws the screen this frame was opened for (its name on the document, set by Toppo), with
 * the plugin's screens handed over by its bundle; `host` is the page holding the frame.
 */
export function startScreens(screens: ServedScreens, host: Window = window.parent): void {
  const name = document.documentElement.dataset['screen'] ?? '';
  const root = document.getElementById('root');
  if (!root) {
    return;
  }
  const bridge = createBridge(host);
  // Every module of the plugin's bundle has run once this one does: its screens are all known.
  const load = () => {
    const component = screens.component(name);
    return component ? component() : Promise.reject(new Error(`No screen ${name}`));
  };
  reportHeight(bridge, root);
  // Escape reaches the frame, not the page holding it: a dialog's screen asks Toppo to close it,
  // as Escape closes any dialog. Toppo closes nothing else for it.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      bridge.post({ kind: 'close' });
    }
  });
  createRoot(root).render(<ScreenApp bridge={bridge} load={load} />);
  bridge.post({ kind: 'ready' });
}
