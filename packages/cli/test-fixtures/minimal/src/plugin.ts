import { definePlugin } from '@toppo-tracker/plugin-sdk';

/** A plugin that declares nothing beyond itself. */
definePlugin({ id: 'minimal', apiVersion: '^1.0', messages: { en: {}, fr: {} } });
