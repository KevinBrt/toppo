import type { z } from 'zod';
import { SCREEN_RUNTIME_GLOBAL } from '../protocol/bridge.ts';
import type {
  DialogSize,
  PageZone,
  PanelPlace,
  ScreenIcon,
} from '../protocol/declarations/screens.ts';
import type { Messages } from '../protocol/manifest.ts';

/**
 * What draws a screen: a React component, imported as the screen opens, from a `.tsx` file that
 * only the screens' bundle holds. `() => import('./web/report-page.tsx').then((m) => m.ReportPage)`.
 */
export type ScreenComponent = () => Promise<unknown>;

/** A page of the plugin, as `plugin.definePage` declares it: linked to by its name. */
export interface Page {
  readonly name: string;
  readonly zone: PageZone;
}

/** A panel of the plugin, beside one of Toppo's screens. */
export interface Panel {
  readonly name: string;
  readonly on: PanelPlace;
}

/** What the SDK keeps of a screen: its declaration, and what draws it. */
export interface ScreenDefinition {
  access: 'authenticated' | { permission: string };
  title: string;
  component: ScreenComponent;
}

export interface PageDefinition extends ScreenDefinition {
  zone: PageZone;
  nav?: { label: string; icon: ScreenIcon } | undefined;
}

export interface PanelDefinition extends ScreenDefinition {
  on: PanelPlace;
}

/**
 * A dialog of the plugin, as `plugin.defineDialog` declares it: opened by its screens, with
 * what `input` reads, closing with what `result` reads.
 */
export interface Dialog<I extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType> {
  readonly name: string;
  readonly input: I;
  readonly result: R | undefined;
}

export interface DialogDefinition extends ScreenDefinition {
  size: DialogSize;
  side: boolean;
}

/** What a plugin's screens give Toppo's runtime, in their frame. */
export interface ServedScreens {
  readonly id: string;
  readonly messages: { readonly en: Messages; readonly fr: Messages };
  /** What draws the screen of that name, once every module of the bundle has run. */
  component(name: string): ScreenComponent | undefined;
}

/** Toppo's runtime, in a screen's frame: it draws the screen the frame was opened for. */
interface ScreenRuntime {
  serve(screens: ServedScreens): void;
}

function isScreenRuntime(value: unknown): value is ScreenRuntime {
  return (
    typeof value === 'object' && value !== null && typeof Reflect.get(value, 'serve') === 'function'
  );
}

/**
 * In a screen's frame, hands the plugin's screens to Toppo's runtime, which draws the one asked
 * for; elsewhere (Toppo's sandbox, tests), does nothing.
 */
export function serveScreens(screens: ServedScreens): void {
  const runtime: unknown = Reflect.get(globalThis, SCREEN_RUNTIME_GLOBAL);
  if (isScreenRuntime(runtime)) {
    runtime.serve(screens);
  }
}
