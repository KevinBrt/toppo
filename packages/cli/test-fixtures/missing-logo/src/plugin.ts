import { definePlugin } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'Missing logo', description: 'A plugin to build.' } as const;

/** Names a logo it does not have. */
definePlugin({
  id: 'missing-logo',
  name: 'name',
  description: 'description',
  logo: 'logo.webp',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});
