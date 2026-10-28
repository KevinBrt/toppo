import { definePlugin } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'Minimal', description: 'A plugin to build.' } as const;

/** A plugin that declares nothing beyond itself. */
definePlugin({
  id: 'minimal',
  name: 'name',
  description: 'description',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});
