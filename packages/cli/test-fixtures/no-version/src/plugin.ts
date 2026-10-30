import { definePlugin } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'No version', description: 'A plugin to build.' } as const;

/** A plugin whose package.json has no version. */
definePlugin({
  id: 'no-version',
  name: 'name',
  description: 'description',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});
