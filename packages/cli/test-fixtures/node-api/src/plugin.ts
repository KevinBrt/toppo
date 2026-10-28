import { readFileSync } from 'node:fs';
import { definePlugin } from '@toppo-tracker/plugin-sdk';

/** Reads a file: what no plugin can do in Toppo's sandbox. */
definePlugin({
  id: 'reads-files',
  name: 'text',
  description: 'text',
  apiVersion: '^1.0',
  messages: { en: { text: readFileSync('words.txt', 'utf8') }, fr: { text: '' } },
});
