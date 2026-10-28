import { definePlugin } from '@toppo-tracker/plugin-sdk';
// A file that is not there: the bundler refuses it, and the build says so.
import './missing.ts';

definePlugin({ id: 'unresolved', apiVersion: '^1.0', messages: { en: {}, fr: {} } });
