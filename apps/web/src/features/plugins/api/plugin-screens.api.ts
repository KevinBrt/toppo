import {
  type IssuePanelsResponse,
  issuePanelsResponseSchema,
  type PickedIssuesResponse,
  type PickedPeopleResponse,
  type PickQuery,
  type PluginDialogsResponse,
  type PluginScreen,
  type PluginScreensResponse,
  peopleResponseSchema,
  pickedIssuesResponseSchema,
  pickedPeopleResponseSchema,
  pluginActionResponseSchema,
  pluginDialogsResponseSchema,
  pluginPlacedScreensResponseSchema,
  pluginScreensResponseSchema,
} from '@toppo-tracker/shared';
import { apiRequest } from '../../../shared/api/http.client.ts';

const encoded = encodeURIComponent;

/** A picker's query, as the address carries it. */
function searchOf({ search = '', projectId }: PickQuery): string {
  return new URLSearchParams({ search, ...(projectId ? { projectId } : {}) }).toString();
}

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

  /** A plugin's dialogs the person may open, and its name, which Toppo shows with them. */
  async dialogs(pluginSlug: string): Promise<PluginDialogsResponse> {
    return await apiRequest(`/api/v1/plugin-screens/${encoded(pluginSlug)}/dialogs`, {
      schema: pluginDialogsResponseSchema,
    });
  },

  /** Toppo's search of issues for a plugin's screen: what the person reads where it acts. */
  async pickIssues(pluginSlug: string, query: PickQuery): Promise<PickedIssuesResponse['issues']> {
    return (
      await apiRequest(`/api/v1/plugins/${encoded(pluginSlug)}/pick/issues?${searchOf(query)}`, {
        schema: pickedIssuesResponseSchema,
      })
    ).issues;
  },

  /** Toppo's search of people for a plugin's screen: who shares a project where it acts. */
  async pickPeople(pluginSlug: string, query: PickQuery): Promise<PickedPeopleResponse['people']> {
    return (
      await apiRequest(`/api/v1/plugins/${encoded(pluginSlug)}/pick/people?${searchOf(query)}`, {
        schema: pickedPeopleResponseSchema,
      })
    ).people;
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
