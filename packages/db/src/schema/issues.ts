import {
  ATTACHMENT_MEDIA_TYPES,
  NOTIFICATION_REASONS,
  PALETTE_COLORS,
  PROPERTY_TYPES,
  type PropertyValue,
} from '@toppo/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { id, timestamps } from './columns.ts';
import { projects } from './projects.ts';
import { statuses } from './workflows.ts';

/** The words of a text, as PostgreSQL's full-text search reads them. */
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/** Exactly four levels, each with its own icon and color: the administrator only renames them. */
export const priorities = pgTable(
  'priorities',
  {
    id: id(),
    /** 1 (lowest) to 4 (highest). */
    level: integer('level').notNull(),
    name: text('name').notNull(),
    /** What new issues get. */
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('priorities_level_unique').on(table.level),
    check('priorities_level_check', sql`${table.level} between 1 and 4`),
    check('priorities_name_not_blank', sql`btrim(${table.name}) <> ''`),
    uniqueIndex('priorities_name_unique').on(sql`lower(${table.name})`),
    uniqueIndex('priorities_single_default').on(table.isDefault).where(sql`${table.isDefault}`),
  ],
);

/** What an issue is about (Bug, Request, Question…): one list for the whole instance. */
export const issueCategories = pgTable(
  'issue_categories',
  {
    id: id(),
    name: text('name').notNull(),
    color: text('color', { enum: PALETTE_COLORS }).notNull().default('gray'),
    position: integer('position').notNull(),
    /** What new issues get. */
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check('issue_categories_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check(
      'issue_categories_color_check',
      sql`${table.color} in ('gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink')`,
    ),
    check('issue_categories_position_check', sql`${table.position} >= 0`),
    uniqueIndex('issue_categories_name_unique').on(sql`lower(${table.name})`),
    uniqueIndex('issue_categories_single_default')
      .on(table.isDefault)
      .where(sql`${table.isDefault}`),
  ],
);

/** An issue, known to people by its key: the project's key and its number (`WEB-42`). */
export const issues = pgTable(
  'issues',
  {
    id: id(),
    /** Deleted with their project by the command made for it, never by a cascade. */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    number: integer('number').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => issueCategories.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    /** Markdown. */
    description: text('description').notNull().default(''),
    statusId: uuid('status_id')
      .notNull()
      .references(() => statuses.id, { onDelete: 'restrict' }),
    priorityId: uuid('priority_id')
      .notNull()
      .references(() => priorities.id, { onDelete: 'restrict' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'restrict' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Set while the issue's status closes it. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /**
     * The value of each property it has, by property id, as its type stores it
     * (`PROPERTY_VALUE_SCHEMAS`): an option's id for a list, an array of them for a multi-select…
     * Checked by the commands against the properties (`@toppo/core`); one without a value is left
     * out.
     */
    properties: jsonb('properties').$type<Record<string, PropertyValue>>().notNull().default({}),
    /**
     * The words of the title, weighing more, and of the description, folded by `fold_text()` so
     * that search ignores case and accents. Computed by PostgreSQL, never written.
     */
    searchVector: tsvector('search_vector')
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('simple', fold_text("title")), 'A') || setweight(to_tsvector('simple', fold_text("description")), 'B')`,
      ),
    ...timestamps,
  },
  (table) => [
    unique('issues_project_number_unique').on(table.projectId, table.number),
    check('issues_number_positive', sql`${table.number} >= 1`),
    check('issues_title_not_blank', sql`btrim(${table.title}) <> ''`),
    // Mirror ISSUE_TITLE_MAX_LENGTH and ISSUE_DESCRIPTION_MAX_LENGTH (`@toppo/shared`).
    check('issues_title_length', sql`char_length(${table.title}) <= 200`),
    check('issues_description_length', sql`char_length(${table.description}) <= 50000`),
    index('issues_category_id_idx').on(table.categoryId),
    index('issues_status_id_idx').on(table.statusId),
    index('issues_priority_id_idx').on(table.priorityId),
    index('issues_assignee_id_idx').on(table.assigneeId),
    index('issues_reporter_id_idx').on(table.reporterId),
    // Counts a project's open (or closed) issues from the index alone, on every list shown.
    index('issues_project_closed_at_idx').on(table.projectId, table.closedAt),
    index('issues_search_vector_idx').using('gin', table.searchVector),
    // Finds any part of a title, even inside a word or a path, through containsText().
    index('issues_title_trigram_idx').using('gin', sql`fold_text(${table.title}) gin_trgm_ops`),
    // Finds the issues having an option (`properties @> '{"<property>": "<option>"}'`).
    index('issues_properties_idx').using('gin', sql`${table.properties} jsonb_path_ops`),
  ],
);

/**
 * The words issues are written with, folded as they are searched (`search_vector`): what a word
 * typed with a typo is matched to, the closest first (`similar_issue_words()`, migration 0040).
 * Words of letters and digits only, four at least: shorter ones are never corrected. Added as
 * issues are written, rebuilt each night: a word may outlive its last issue until then.
 */
export const issueWords = pgTable(
  'issue_words',
  {
    id: id(),
    word: text('word').notNull(),
    ...timestamps,
  },
  (table) => [
    check('issue_words_word_plain', sql`${table.word} ~ '^[[:alnum:]]{4,}$'`),
    uniqueIndex('issue_words_word_unique').on(table.word),
    // Finds the words close to a typed one, and those it starts.
    index('issue_words_word_trigram_idx').using('gin', sql`${table.word} gin_trgm_ops`),
  ],
);

/**
 * Properties of the issues (Version, Team…), defined for the whole instance in the settings, or
 * for one project (`project_id`), of a type fixed at creation. Each says whether it shows in the
 * issue list and whether it is asked at creation, then required.
 */
export const properties = pgTable(
  'properties',
  {
    id: id(),
    /** The project it belongs to, or none for a property of the instance. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: PROPERTY_TYPES }).notNull(),
    shownInList: boolean('shown_in_list').notNull().default(false),
    askedAtCreation: boolean('asked_at_creation').notNull().default(false),
    required: boolean('required').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check('properties_name_not_blank', sql`btrim(${table.name}) <> ''`),
    // Mirrors PROPERTY_NAME_MAX_LENGTH (`@toppo/shared`).
    check('properties_name_length', sql`char_length(${table.name}) <= 40`),
    // Mirrors PROPERTY_TYPES (`@toppo/shared`).
    check(
      'properties_type_check',
      sql`${table.type} in ('list', 'multiSelect', 'text', 'number', 'date', 'user', 'checkbox')`,
    ),
    check('properties_required_if_asked', sql`${table.askedAtCreation} or not ${table.required}`),
    // A box that must be ticked to create an issue would always be ticked: it says nothing.
    check(
      'properties_checkbox_not_required',
      sql`${table.type} <> 'checkbox' or not ${table.required}`,
    ),
    // Each name once in the instance, and once in each project; the commands keep a project's
    // own properties from taking the name of one of the instance's.
    uniqueIndex('properties_instance_name_unique')
      .on(sql`lower(${table.name})`)
      .where(sql`${table.projectId} is null`),
    uniqueIndex('properties_project_name_unique')
      .on(table.projectId, sql`lower(${table.name})`)
      .where(sql`${table.projectId} is not null`),
    index('properties_project_id_idx').on(table.projectId),
  ],
);

/**
 * The options of a list property, in their order; gone with their property. Those with a
 * `project_id` are a project's own options of a property of the instance, replacing its options
 * there (its own versions).
 */
export const propertyOptions = pgTable(
  'property_options',
  {
    id: id(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color', { enum: PALETTE_COLORS }).notNull().default('gray'),
    position: integer('position').notNull(),
    ...timestamps,
  },
  (table) => [
    check('property_options_name_not_blank', sql`btrim(${table.name}) <> ''`),
    // Mirrors PROPERTY_NAME_MAX_LENGTH (`@toppo/shared`).
    check('property_options_name_length', sql`char_length(${table.name}) <= 40`),
    check(
      'property_options_color_check',
      sql`${table.color} in ('gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink')`,
    ),
    uniqueIndex('property_options_instance_name_unique')
      .on(table.propertyId, sql`lower(${table.name})`)
      .where(sql`${table.projectId} is null`),
    uniqueIndex('property_options_project_name_unique')
      .on(table.propertyId, table.projectId, sql`lower(${table.name})`)
      .where(sql`${table.projectId} is not null`),
    index('property_options_property_id_idx').on(table.propertyId, table.position),
    index('property_options_project_id_idx').on(table.projectId),
  ],
);

/**
 * How a project adapts a property of the instance: hidden there, or given options of its own
 * (`property_options.project_id`). No row: the project takes the property as it is.
 */
export const projectProperties = pgTable(
  'project_properties',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    hidden: boolean('hidden').notNull().default(false),
    ownOptions: boolean('own_options').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique('project_properties_project_property_unique').on(table.projectId, table.propertyId),
    index('project_properties_property_id_idx').on(table.propertyId),
  ],
);

/**
 * Labels issues are tagged with, any number each: one list for the whole instance, edited in the
 * settings. Deleting one takes it off its issues; their history keeps its name.
 */
export const labels = pgTable(
  'labels',
  {
    id: id(),
    name: text('name').notNull(),
    color: text('color', { enum: PALETTE_COLORS }).notNull().default('gray'),
    ...timestamps,
  },
  (table) => [
    check('labels_name_not_blank', sql`btrim(${table.name}) <> ''`),
    // Mirrors LABEL_NAME_MAX_LENGTH (`@toppo/shared`).
    check('labels_name_length', sql`char_length(${table.name}) <= 40`),
    check(
      'labels_color_check',
      sql`${table.color} in ('gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink')`,
    ),
    uniqueIndex('labels_name_unique').on(sql`lower(${table.name})`),
  ],
);

/** The labels of each issue: gone with the issue, or with the label. */
export const issueLabels = pgTable(
  'issue_labels',
  {
    id: id(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    // Also finds an issue's labels, and whether it has one, from the index alone.
    unique('issue_labels_unique').on(table.issueId, table.labelId),
    index('issue_labels_label_id_idx').on(table.labelId),
  ],
);

/**
 * What happened to issues, written in the same transaction as each change: the one source of
 * history, notifications, webhooks and plugins. Never updated.
 */
export const activities = pgTable(
  'activities',
  {
    id: id(),
    /** Deleted with their project by the command made for it, never by a cascade. */
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'restrict' }),
    /**
     * Gone with their issue. The deletion itself is recorded without an issue, its key in the
     * payload.
     */
    issueId: uuid('issue_id').references(() => issues.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** `issue.created`, `issue.statusChanged`…: each type has its own payload schema. */
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index('activities_issue_id_created_at_idx').on(table.issueId, table.createdAt),
    index('activities_project_id_idx').on(table.projectId),
    index('activities_actor_id_idx').on(table.actorId),
  ],
);

/**
 * What people write on an issue, in plain text. Its author edits it; its author or a moderator
 * deletes it, for good: the activities about it keep its id only. Gone with its issue.
 */
export const comments = pgTable(
  'comments',
  {
    id: id(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Plain text, its line breaks kept. */
    body: text('body').notNull(),
    /** Set when its author last changed it. */
    editedAt: timestamp('edited_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check('comments_body_not_blank', sql`btrim(${table.body}) <> ''`),
    // Mirrors COMMENT_BODY_MAX_LENGTH (`@toppo/shared`).
    check('comments_body_length', sql`char_length(${table.body}) <= 20000`),
    // Lets an attachment name its comment and that comment's issue together.
    unique('comments_id_issue_unique').on(table.id, table.issueId),
    index('comments_issue_id_created_at_idx').on(table.issueId, table.createdAt),
    index('comments_author_id_idx').on(table.authorId),
  ],
);

/**
 * Files attached to an issue's request or, with `comment_id`, to one of its comments (of the same
 * issue: composite foreign key). The file lies on disk under a random key, never under its name.
 * Gone with their issue or comment; the files no row names any more are swept from the disk.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    /** Set when the file came with a comment, rather than with the issue's request. */
    commentId: uuid('comment_id'),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** As its uploader named it, cleaned: no path, no control or bidirectional characters. */
    fileName: text('file_name').notNull(),
    /** Detected by the server from the content, never taken from the client. */
    mediaType: text('media_type', { enum: ATTACHMENT_MEDIA_TYPES }).notNull(),
    /** In bytes. */
    size: integer('size').notNull(),
    /** The file's name on disk: 64 random hexadecimal characters. Never leaves the server. */
    storageKey: text('storage_key').notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'attachments_comment_fk',
      columns: [table.commentId, table.issueId],
      foreignColumns: [comments.id, comments.issueId],
    }).onDelete('cascade'),
    unique('attachments_storage_key_unique').on(table.storageKey),
    check('attachments_file_name_not_blank', sql`btrim(${table.fileName}) <> ''`),
    // Mirror ATTACHMENT_NAME_MAX_LENGTH, ATTACHMENT_MEDIA_TYPES and ATTACHMENT_SIZE_CEILING
    // (`@toppo/shared`).
    check('attachments_file_name_length', sql`char_length(${table.fileName}) <= 255`),
    check(
      'attachments_media_type_check',
      sql`${table.mediaType} in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation')`,
    ),
    check('attachments_size_check', sql`${table.size} between 1 and 1073741824`),
    check('attachments_storage_key_check', sql`${table.storageKey} ~ '^[0-9a-f]{64}$'`),
    index('attachments_issue_id_created_at_idx').on(table.issueId, table.createdAt),
    index('attachments_comment_id_created_at_idx')
      .on(table.commentId, table.createdAt)
      .where(sql`${table.commentId} is not null`),
    index('attachments_uploader_id_idx').on(table.uploaderId),
  ],
);

/**
 * What someone is told about a change to an issue they are involved in, made from its activity
 * by a job: once per person and activity, gone with the activity. Read ones are pruned after 90
 * days.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    reason: text('reason', { enum: NOTIFICATION_REASONS }).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique('notifications_user_activity_unique').on(table.userId, table.activityId),
    // Mirrors NOTIFICATION_REASONS (`@toppo/shared`).
    check(
      'notifications_reason_check',
      sql`${table.reason} in ('assigned', 'mentioned', 'participating', 'newIssue')`,
    ),
    // Someone's notifications, the latest first.
    index('notifications_user_id_created_at_idx').on(table.userId, table.createdAt),
    // How many they have not read, from the index alone.
    index('notifications_unread_idx').on(table.userId).where(sql`${table.readAt} is null`),
    index('notifications_activity_id_idx').on(table.activityId),
    index('notifications_read_at_idx').on(table.readAt).where(sql`${table.readAt} is not null`),
  ],
);
