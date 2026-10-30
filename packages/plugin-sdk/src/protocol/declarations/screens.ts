import { z } from 'zod';

/**
 * Where a plugin's pages show: under Toppo's own entries in the main sidebar, in a section of the
 * settings named after the plugin, or as a tab of a project's settings.
 */
export const PAGE_ZONES = ['main', 'settings', 'project.settings'] as const;

export type PageZone = (typeof PAGE_ZONES)[number];

/** What a plugin's panels show beside: an issue. */
export const PANEL_PLACES = ['issue'] as const;

export type PanelPlace = (typeof PANEL_PLACES)[number];

/**
 * The icons a plugin's entries may take, from Toppo's own set: named, never drawn by the plugin,
 * so that an entry looks like Toppo's.
 */
export const SCREEN_ICONS = [
  'bar-chart',
  'briefcase',
  'calendar',
  'clock',
  'database',
  'file-text',
  'flag',
  'folder',
  'gauge',
  'list',
  'puzzle',
  'settings',
  'tag',
  'timer',
  'users',
  'wallet',
] as const;

export type ScreenIcon = (typeof SCREEN_ICONS)[number];

/** `report`, `timeEntries`: a screen's name, the last part of its address. */
export const SCREEN_NAME = /^[a-z][A-Za-z0-9]{0,39}$/;

/** What a plugin may show, at most. */
export const SCREEN_LIMITS = {
  pages: 20,
  panels: 5,
  dialogs: 10,
  /** Entries in one zone: a plugin never crowds Toppo's own. */
  entriesPerZone: 8,
} as const;

/**
 * Who may open a screen, which decides who sees its entry too: anyone signed in, or those who
 * hold a permission (in the project, for a project's settings or an issue's panel).
 */
export const screenAccessSchema = z.union([
  z.literal('authenticated'),
  z.strictObject({ permission: z.string().max(100) }),
]);

export type ScreenAccess = z.infer<typeof screenAccessSchema>;

const screenNameSchema = z.string().regex(SCREEN_NAME, 'A screen is named like timeReport');

/** A page of the plugin: its zone, who opens it, its title, and its entry in the zone's menu. */
export const pageSchema = z.strictObject({
  name: screenNameSchema,
  zone: z.enum(PAGE_ZONES),
  access: screenAccessSchema,
  /** A key of its messages. */
  title: z.string().max(200),
  /** Its entry in the zone's menu; a page without one is reached by its links. */
  nav: z.strictObject({ label: z.string().max(200), icon: z.enum(SCREEN_ICONS) }).optional(),
});

export type PageDeclaration = z.infer<typeof pageSchema>;

/** A panel of the plugin beside one of Toppo's screens: an issue's. */
export const panelSchema = z.strictObject({
  name: screenNameSchema,
  on: z.enum(PANEL_PLACES),
  access: screenAccessSchema,
  title: z.string().max(200),
});

export type PanelDeclaration = z.infer<typeof panelSchema>;

/** How wide a dialog opens: Toppo's own widths. */
export const DIALOG_SIZES = ['small', 'medium', 'large'] as const;

export type DialogSize = (typeof DIALOG_SIZES)[number];

/**
 * A dialog of the plugin: a screen Toppo opens over the page when one of the plugin's screens
 * asks, in the page's middle, or at its side as a panel.
 */
export const dialogSchema = z.strictObject({
  name: screenNameSchema,
  access: screenAccessSchema,
  title: z.string().max(200),
  size: z.enum(DIALOG_SIZES).default('medium'),
  side: z.boolean().default(false),
});

export type DialogDeclaration = z.infer<typeof dialogSchema>;

export const pagesSchema = z.array(pageSchema).max(SCREEN_LIMITS.pages);

export const panelsSchema = z.array(panelSchema).max(SCREEN_LIMITS.panels);

export const dialogsSchema = z.array(dialogSchema).max(SCREEN_LIMITS.dialogs);

/**
 * Refuses screens Toppo could not show as declared: two of one name, more entries in a zone than
 * it takes, and screens from a plugin that reads no issues where they would show an issue's.
 */
export function checkScreens(
  manifest: {
    needs: readonly string[];
    pages: readonly PageDeclaration[];
    panels: readonly PanelDeclaration[];
    dialogs: readonly DialogDeclaration[];
  },
  ctx: z.RefinementCtx,
): void {
  const screens = [...manifest.pages, ...manifest.panels, ...manifest.dialogs];
  const names = screens.map(({ name }) => name);
  names.forEach((name, at) => {
    if (names.indexOf(name) !== at) {
      ctx.addIssue({ code: 'custom', path: ['pages'], message: `Two screens are named ${name}` });
    }
  });
  for (const zone of PAGE_ZONES) {
    const entries = manifest.pages.filter((page) => page.zone === zone && page.nav).length;
    if (entries > SCREEN_LIMITS.entriesPerZone) {
      ctx.addIssue({
        code: 'custom',
        path: ['pages'],
        message: `At most ${SCREEN_LIMITS.entriesPerZone} entries in the ${zone} zone`,
      });
    }
  }
  if (manifest.panels.length > 0 && !manifest.needs.includes('issue.read')) {
    ctx.addIssue({
      code: 'custom',
      path: ['panels'],
      message: 'Panels show beside issues: the plugin needs issue.read',
    });
  }
}
