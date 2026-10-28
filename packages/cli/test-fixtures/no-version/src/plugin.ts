import { definePlugin } from '@toppo-tracker/plugin-sdk';

/** A plugin whose package.json has no version. */
definePlugin({ id: 'no-version', apiVersion: '^1.0', messages: { en: {}, fr: {} } });
