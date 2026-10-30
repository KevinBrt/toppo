import { definePlugin } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'Unresolved', description: 'A plugin to build.' } as const;

// A file that is not there: the bundler refuses it, and the build says so.
import './missing.ts';

definePlugin({
  id: 'unresolved',
  name: 'name',
  description: 'description',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});
