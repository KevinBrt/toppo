import {
  type IssuePanelsResponse,
  issuePanelsResponseSchema,
  type PluginScreen,
  type PluginScreensResponse,
  peopleResponseSchema,
  pluginActionResponseSchema,
  pluginPlacedScreensResponseSchema,
  pluginScreensResponseSchema,
} from '@toppo-tracker/shared';
import { apiRequest } from '../../../shared/api/http.client.ts';

const encoded = encodeURIComponent;

/** Server calls about plugins' screens, for whoever is signed in. */
export const PluginScreens = {
  /** The pages of enabled plugins the person may open, in the main sidebar and the settings. */
  async list(): Promise<PluginScreensResponse> {
    return await apiRequest('/api/v1/plugin-screens', { schema: pluginScreensResponseSchema });
  },

  /** The tabs plugins add to a project's settings that the person may open. */
  async inProject(projectKey: string): Promise<PluginScreen[]> {
    return (
      await apiRequest(`/api/v1/projects/${encoded(projectKey)}/plugin-screens`, {
        schema: pluginPlacedScreensResponseSchema,
      })
    ).screens;
  },

  /** The panels plugins show beside an issue that the person may open, and the issue. */
  async besideIssue(issueKey: string): Promise<IssuePanelsResponse> {
    return await apiRequest(`/api/v1/issues/${encoded(issueKey)}/plugin-panels`, {
      schema: issuePanelsResponseSchema,
    });
  },

  /** Runs one of a plugin's actions for the person, as one of its screens asks: its answer. */
  async runAction(pluginSlug: string, action: string, input: unknown): Promise<unknown> {
    return (
      await apiRequest(`/api/v1/plugins/${encoded(pluginSlug)}/actions/${encoded(action)}`, {
        method: 'POST',
        body: input ?? {},
        schema: pluginActionResponseSchema,
      })
    ).result;
  },

  /** The names of people a screen shows, those the person may see. */
  async people(ids: readonly string[]): Promise<{ id: string; name: string }[]> {
    return (
      await apiRequest(`/api/v1/people?ids=${ids.map(encoded).join(',')}`, {
        schema: peopleResponseSchema,
      })
    ).people;
  },
};
