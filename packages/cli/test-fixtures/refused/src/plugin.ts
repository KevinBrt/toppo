import { definePlugin } from '@toppo-tracker/plugin-sdk';

/** An id Toppo refuses: lowercase words joined by dashes only. */
definePlugin({ id: 'Bad_Id', apiVersion: '^1.0', messages: { en: {}, fr: {} } });
