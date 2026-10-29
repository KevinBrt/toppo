/**
 * The protocol Toppo and a plugin speak, defined once for both: Toppo checks with these schemas
 * what a plugin declares and asks, and the SDK answers with them.
 */
export {
  type FieldCondition,
  HOST_CALLS,
  type HostCallMethod,
  type IssueDetails,
  issueDetailsSchema,
  PLUGIN_NEEDS,
  type PluginNeed,
  RECORD_GROUPS_MAX,
  RECORD_IN_MAX,
  type RecordData,
  recordSchema,
  recordWhereSchema,
} from './calls.ts';
export {
  checkEntities,
  comparedValueSchemaOf,
  ENTITY_FIELDS_MAX,
  ENTITY_INDEXES_MAX,
  ENTITY_INDEXES_TOTAL,
  ENTITY_LIMITS,
  ENTITY_NAME,
  type EntityDeclaration,
  type EntityField,
  type EntityFields,
  entitiesSchema,
  entityFieldSchema,
  entityFieldsSchema,
  entitySchema,
  INDEX_KINDS,
  INDEXED_TEXT_MAX_LENGTH,
  type IndexKind,
  indexKindOf,
  PLUGIN_ENTITIES_MAX,
  RECORD_ANCHORS,
  RECORD_GROUPS,
  RECORD_MAX_BYTES,
  RECORD_TEXT_MAX_LENGTH,
  type RecordGroup,
  recordFieldsSchemaOf,
} from './declarations/entities.ts';
export {
  checkProperties,
  PLUGIN_PROPERTIES_MAX,
  PLUGIN_PROPERTY_TYPES,
  type PluginPropertyDeclaration,
  type PluginPropertyType,
  PROPERTY_DISPLAYS,
  type PropertyDisplay,
  pluginPropertySchema,
  propertiesSchema,
} from './declarations/properties.ts';
export {
  NO_SETTINGS_SCHEMA,
  PLUGIN_SETTINGS_MAX,
  SETTING_NAME,
  type Setting,
  type SettingsSchema,
  settingSchema,
  settingsSchema,
} from './declarations/settings.ts';
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
export {
  logoTypeOf,
  PLUGIN_LOGO_FILES,
  PLUGIN_LOGO_TYPES,
  PLUGIN_PACKAGE_FILES,
  PLUGIN_PACKAGE_LIMITS,
  type PluginLogo,
} from './package.ts';
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
