import { definePlugin } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'Refused', description: 'A plugin to build.' } as const;

/** An id Toppo refuses: lowercase words joined by dashes only. */
definePlugin({
  id: 'Bad_Id',
  name: 'name',
  description: 'description',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});
