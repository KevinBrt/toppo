import type { FrameMessage, ScreenContext } from '@toppo-tracker/plugin-sdk/protocol';
import type { PluginDialog } from '@toppo-tracker/shared';
import type { ReactNode } from 'react';

type Request<K extends FrameMessage['kind']> = Extract<FrameMessage, { kind: K }>;

/** Something Toppo's search found for a plugin's screen: as the list shows it, as it is answered. */
export interface PickedItem {
  id: string;
  label: string;
  hint: string;
  value: unknown;
}

/** Where something is on the page, in its pixels: a menu opens beside it. */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What Toppo draws over the page for one of a plugin's screens, waiting for the person: what the
 * screen asked, and the plugin's name, which each shows.
 */
export type ScreenOverlay = { plugin: { en: string; fr: string } } & (
  | { kind: 'confirm'; request: Request<'confirm'> }
  | { kind: 'dialog'; request: Request<'dialog'>; dialog: PluginDialog }
  | { kind: 'menu'; request: Request<'menu'>; at: PageRect }
  | { kind: 'pick'; request: Request<'pick'> }
);

/**
 * Draws a dialog's own screen, in a frame of its own, as `PluginFrame` does: given by the frame
 * that opened it, which closes the dialog with what the screen closes with.
 */
export type DialogFrameSlot = (props: {
  screen: string;
  title: string;
  input: ScreenContext['input'];
  onClose: (result: unknown) => void;
}) => ReactNode;
