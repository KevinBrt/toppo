import {
  installPluginResponseSchema,
  type PluginDetailsResponse,
  type PluginSettingValues,
  type PluginSummary,
  type ProjectPlugin,
  pluginDetailsResponseSchema,
  pluginsResponseSchema,
  projectPluginsResponseSchema,
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

  /**
   * Saves its settings, once the plugin's own code accepted them; those left out take their
   * default. Settings it refused since an upgrade are so corrected.
   */
  async saveSettings(slug: string, values: PluginSettingValues): Promise<void> {
    await apiRequest(`${pluginPath(slug)}/settings`, {
      method: 'PUT',
      body: { values },
      schema: noContent,
    });
  },

  /** The plugins at work in a project that take settings of it, with what it set: loaded whole. */
  async inProject(projectKey: string): Promise<ProjectPlugin[]> {
    return (
      await apiRequest(`/api/v1/projects/${encodeURIComponent(projectKey)}/plugins`, {
        schema: projectPluginsResponseSchema,
      })
    ).plugins;
  },

  /** Saves what a project sets for itself of a plugin, once the plugin's own code accepted it. */
  async saveProjectSettings(
    projectKey: string,
    slug: string,
    values: PluginSettingValues,
  ): Promise<void> {
    await apiRequest(
      `/api/v1/projects/${encodeURIComponent(projectKey)}/plugins/${encodeURIComponent(slug)}/settings`,
      { method: 'PUT', body: { values }, schema: noContent },
    );
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
