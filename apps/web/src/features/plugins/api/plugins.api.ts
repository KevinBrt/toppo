import {
  installPluginResponseSchema,
  type PluginDetailsResponse,
  type PluginSummary,
  pluginDetailsResponseSchema,
  pluginsResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

const PLUGINS_PATH = '/api/v1/plugins';

const pluginPath = (slug: string) => `${PLUGINS_PATH}/${encodeURIComponent(slug)}`;

/** Server calls about the plugins of the instance. Administrators only. */
export const Plugins = {
  /** Every plugin installed: a short list, loaded whole. */
  async list(): Promise<PluginSummary[]> {
    return (await apiRequest(PLUGINS_PATH, { schema: pluginsResponseSchema })).plugins;
  },

  /** What a plugin declares, where it acts, who approved it and how it last failed. */
  async get(slug: string): Promise<PluginDetailsResponse> {
    return await apiRequest(pluginPath(slug), { schema: pluginDetailsResponseSchema });
  },

  /**
   * Sends a plugin's zip, which installs it or upgrades the plugin of the same id; answers its
   * slug. The server takes `application/zip` only, whatever type the browser saw in the file.
   */
  async install(zip: File): Promise<string> {
    return (
      await apiRequest(PLUGINS_PATH, {
        method: 'POST',
        body: zip,
        headers: { 'content-type': 'application/zip' },
        schema: installPluginResponseSchema,
      })
    ).slug;
  },

  /** Approves what it declares, in the projects of these keys or all of them, and enables it. */
  async approve(slug: string, projects: 'all' | readonly string[]): Promise<void> {
    await apiRequest(`${pluginPath(slug)}/approve`, {
      method: 'POST',
      body: { projects },
      schema: noContent,
    });
  },

  /** Enables it again, as it was approved: its failures are counted from zero. */
  async enable(slug: string): Promise<void> {
    await apiRequest(`${pluginPath(slug)}/enable`, { method: 'POST', schema: noContent });
  },

  async disable(slug: string): Promise<void> {
    await apiRequest(`${pluginPath(slug)}/disable`, { method: 'POST', schema: noContent });
  },

  /** Removes it and its permissions; what it wrote stays, signed with its name. */
  async uninstall(slug: string): Promise<void> {
    await apiRequest(pluginPath(slug), { method: 'DELETE', schema: noContent });
  },
};
