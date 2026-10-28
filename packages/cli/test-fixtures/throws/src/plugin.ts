import { definePlugin } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'Throws', description: 'A plugin to build.' } as const;

definePlugin({
  id: 'throws-on-load',
  name: 'name',
  description: 'description',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});

// Fails as it loads: Toppo would refuse it, and so does its build.
throw new Error('Broken on purpose');
