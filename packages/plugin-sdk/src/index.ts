/**
 * `@toppo-tracker/plugin-sdk`: what a Toppo plugin is written with. MIT, so that plugins may use
 * any license. Zod comes with it: plugins use the very Zod the SDK checks with.
 */
export { z } from 'zod';
export type { ActionContext, Context, Entities, IssueOf } from './context.ts';
export {
  type Attachment,
  defineEntity,
  type Entity,
  type EntityClient,
  type EntityRecord,
  type FieldCondition,
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
export {
  defineProperty,
  type Properties,
  type Property,
  type PropertyInput,
  type PropertyValue,
  type Writer,
} from './property.ts';
export type { IssueDetails, PluginNeed } from './protocol/calls.ts';
export type { RecordGroup } from './protocol/declarations/entities.ts';
export type { PluginPropertyType, PropertyDisplay } from './protocol/declarations/properties.ts';
export type { DeletedIssue, EventPayload, EventType, IssueSnapshot } from './protocol/events.ts';
export type { Messages } from './protocol/manifest.ts';
export type { Locale } from './protocol/run.ts';
