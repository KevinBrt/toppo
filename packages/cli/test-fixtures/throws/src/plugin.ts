import { definePlugin } from '@toppo-tracker/plugin-sdk';

definePlugin({ id: 'throws-on-load', apiVersion: '^1.0', messages: { en: {}, fr: {} } });

// Fails as it loads: Toppo would refuse it, and so does its build.
throw new Error('Broken on purpose');
