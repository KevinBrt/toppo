/**
 * The protocol Toppo and a plugin speak, defined once for both: Toppo checks with these schemas
 * what a plugin declares and asks, and the SDK answers with them.
 */
export {
  HOST_CALLS,
  type HostCallMethod,
  type IssueDetails,
  issueDetailsSchema,
  PLUGIN_NEEDS,
  type PluginNeed,
} from './calls.ts';
export {
  type DeletedIssue,
  deletedIssueSchema,
  EVENT_CHANGES,
  EVENT_TYPES,
  type EventPayload,
  type EventType,
  eventPayloadSchema,
  type IssueSnapshot,
  issueSnapshotSchema,
} from './events.ts';
export {
  accessSchema,
  type Manifest,
  type Messages,
  manifestSchema,
  messagesSchema,
  PLUGIN_ID,
  PLUGIN_LIMITS,
  PLUGIN_VERSION,
} from './manifest.ts';
export { PLUGIN_PACKAGE_FILES, PLUGIN_PACKAGE_LIMITS } from './package.ts';
export {
  LOCALES,
  type Locale,
  messageParamsSchema,
  RUN_FAILURES,
  type RunAnswer,
  type RunContext,
  runAnswerSchema,
  runContextSchema,
} from './run.ts';
export {
  HOST_GLOBAL,
  type HostGlobal,
  PLUGIN_GLOBAL,
  type PluginGlobal,
  type RunKind,
} from './sandbox.ts';
export { API_VERSION, apiVersionSchema, isApiCompatible } from './version.ts';
