import './runtime.css';
import type { ServedScreens } from '@toppo-tracker/plugin-sdk';
import { SCREEN_RUNTIME_GLOBAL } from '@toppo-tracker/plugin-sdk/protocol';
import type { ScreenUi } from '@toppo-tracker/plugin-ui';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as components from './components.tsx';
import { useActionMutation, useActionQuery, usePeople, useScreen } from './hooks.ts';
import { screenLocale, startScreens } from './screen.tsx';
import { formatDuration } from './screen-context.ts';

/** What plugins' screens draw with, behind `@toppo-tracker/plugin-ui`. */
const ui: ScreenUi = {
  ...components,
  useActionQuery,
  useActionMutation,
  useScreen,
  usePeople,
  formatDuration: (minutes) => formatDuration(minutes, screenLocale),
};

/**
 * Toppo's runtime in a screen's frame, before the plugin's bundle: one React for every plugin
 * (their bundles leave it out), the components and hooks of `@toppo-tracker/plugin-ui`, and what
 * the plugin hands its screens to as its bundle runs.
 */
Reflect.set(globalThis, SCREEN_RUNTIME_GLOBAL, {
  React,
  jsxRuntime,
  ui,
  serve: (screens: ServedScreens) => startScreens(screens),
});
