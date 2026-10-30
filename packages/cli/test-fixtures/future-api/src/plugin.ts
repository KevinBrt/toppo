import { definePlugin } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'From the future', description: 'A plugin to build.' } as const;

/** A plugin written for an API to come. */
definePlugin({
  id: 'from-the-future',
  name: 'name',
  description: 'description',
  apiVersion: '^2.0',
  messages: { en: WORDS, fr: WORDS },
});
