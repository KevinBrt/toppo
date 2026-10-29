import { definePlugin } from '@toppo-tracker/plugin-sdk';
import { useState } from 'react';

/** Imports React on the server: a screen's code belongs in its `.tsx` files. */
definePlugin({
  id: 'server-react',
  name: 'text',
  description: 'text',
  apiVersion: '^1.0',
  messages: { en: { text: String(useState) }, fr: { text: '' } },
});
