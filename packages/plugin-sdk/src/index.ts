/**
 * `@toppo-tracker/plugin-sdk`: what a Toppo plugin is written with. MIT, so that plugins may use
 * any license. Zod comes with it: plugins use the very Zod the SDK checks with.
 */
export { z } from 'zod';
export type { ActionContext, Context, Entities } from './context.ts';
export {
  type Attachment,
  defineEntity,
  type Entity,
  type EntityClient,
  type EntityRecord,
  type RecordGroupTotal,
  type RecordWhere,
} from './entity.ts';
export type { PluginFailure } from './failure.ts';
export type { MessageKey, MessageParams, MessagesOf } from './messages.ts';
export {
  type Access,
  type Action,
  definePlugin,
  type EventHandler,
  type PermissionDefinitions,
  type Plugin,
  type PluginConfig,
} from './plugin.ts';
export type { IssueDetails, PluginNeed } from './protocol/calls.ts';
export type { RecordGroup } from './protocol/entities.ts';
export type { DeletedIssue, EventPayload, EventType, IssueSnapshot } from './protocol/events.ts';
export type { Messages } from './protocol/manifest.ts';
export type { Locale } from './protocol/run.ts';
