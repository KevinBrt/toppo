import type { Locale, PaletteColor, PriorityLevel } from '@toppo-tracker/shared';

/**
 * What a fresh instance starts with: one workflow and its transitions, four priorities and three
 * categories. Mirrors
 * the seed of the migrations (checked by tests). The first-run wizard names them in the
 * administrator's language; afterwards they are ordinary data the administrator edits.
 */

/** The instance's workflow, which every project follows until it makes a copy of its own. */
export const DEFAULT_WORKFLOW_ID = '01a16286-f096-7c5d-94b4-022c1ffb35a5';

export type DefaultStatusKind = 'new' | 'toDo' | 'inProgress' | 'waiting' | 'resolved';

export interface DefaultStatus {
  id: string;
  /** Its row in the instance's workflow. */
  workflowStatusId: string;
  kind: DefaultStatusKind;
  /** English name, as seeded by the migrations. */
  name: string;
  /** Issues on it are closed. */
  closes: boolean;
  color: PaletteColor;
  /** Where new issues start. */
  initial: boolean;
}

export type DefaultPriorityKind = 'low' | 'normal' | 'high' | 'urgent';

export interface DefaultPriority {
  id: string;
  kind: DefaultPriorityKind;
  level: PriorityLevel;
  name: string;
  isDefault: boolean;
}

export type DefaultCategoryKind = 'bug' | 'request' | 'question';

export interface DefaultCategory {
  id: string;
  kind: DefaultCategoryKind;
  name: string;
  color: PaletteColor;
  isDefault: boolean;
}

export const DEFAULT_FIELD_NAMES: Readonly<
  Record<
    Locale,
    {
      statuses: Readonly<Record<DefaultStatusKind, string>>;
      priorities: Readonly<Record<DefaultPriorityKind, string>>;
      categories: Readonly<Record<DefaultCategoryKind, string>>;
    }
  >
> = {
  en: {
    statuses: {
      new: 'New',
      toDo: 'To do',
      inProgress: 'In progress',
      waiting: 'Waiting',
      resolved: 'Resolved',
    },
    priorities: { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' },
    categories: { bug: 'Bug', request: 'Request', question: 'Question' },
  },
  fr: {
    statuses: {
      new: 'Nouveau',
      toDo: 'À traiter',
      inProgress: 'En cours',
      waiting: 'En attente',
      resolved: 'Résolu',
    },
    priorities: { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' },
    categories: { bug: 'Bug', request: 'Demande', question: 'Question' },
  },
};

const { statuses, priorities, categories } = DEFAULT_FIELD_NAMES.en;

/** The statuses of the instance's workflow, in order. */
export const DEFAULT_STATUSES: readonly DefaultStatus[] = [
  {
    id: '01a16286-f097-76c3-99ef-142009179f39',
    workflowStatusId: '01a16286-f097-728e-8429-a636fe6a8ba0',
    kind: 'new',
    name: statuses.new,
    closes: false,
    color: 'cyan',
    initial: true,
  },
  {
    id: '01a16286-f097-7230-ae0a-2665141a1c79',
    workflowStatusId: '01a16286-f097-7b84-b497-9e484c1b6b09',
    kind: 'toDo',
    name: statuses.toDo,
    closes: false,
    color: 'blue',
    initial: false,
  },
  {
    id: '01a16286-f097-797e-8ffe-9d08ab570fed',
    workflowStatusId: '01a16286-f097-7ce6-80c3-8b1f10af70f4',
    kind: 'inProgress',
    name: statuses.inProgress,
    closes: false,
    color: 'violet',
    initial: false,
  },
  {
    id: '01a16286-f097-7910-adf1-e82c47706491',
    workflowStatusId: '01a16286-f097-76fd-a12f-c4e528008154',
    kind: 'waiting',
    name: statuses.waiting,
    closes: false,
    color: 'amber',
    initial: false,
  },
  {
    id: '01a16286-f097-7d2f-8165-6070ac26c187',
    workflowStatusId: '01a16286-f097-7896-93d3-94335035dec0',
    kind: 'resolved',
    name: statuses.resolved,
    closes: true,
    color: 'green',
    initial: false,
  },
];

export interface DefaultTransition {
  id: string;
  from: DefaultStatusKind;
  to: DefaultStatusKind;
}

/** Which status may follow which in the instance's workflow: a guided path, reopening included. */
export const DEFAULT_TRANSITIONS: readonly DefaultTransition[] = [
  { id: '01a162b9-6774-7bf8-94e3-01971393af31', from: 'new', to: 'toDo' },
  { id: '01a162b9-6774-7f51-80fc-08577a26042d', from: 'new', to: 'inProgress' },
  { id: '01a162b9-6774-779e-af72-dfed260a5c10', from: 'new', to: 'resolved' },
  { id: '01a162b9-6774-7e26-bf50-c71fdffb408f', from: 'toDo', to: 'inProgress' },
  { id: '01a162b9-6775-729a-b3dc-817d5454dbaf', from: 'toDo', to: 'resolved' },
  { id: '01a162b9-6775-7391-afb8-1c8478f22b00', from: 'inProgress', to: 'toDo' },
  { id: '01a162b9-6775-76c4-8640-0570292c975a', from: 'inProgress', to: 'waiting' },
  { id: '01a162b9-6775-7bac-bcbb-d8fb7d96e477', from: 'inProgress', to: 'resolved' },
  { id: '01a162b9-6775-70ed-b915-e803652731fd', from: 'waiting', to: 'inProgress' },
  { id: '01a162b9-6775-762c-8300-2f750b78d197', from: 'waiting', to: 'resolved' },
  { id: '01a162b9-6775-7459-9fab-ebafaa245a05', from: 'resolved', to: 'toDo' },
];

/** The four priorities, lowest first. */
export const DEFAULT_PRIORITIES: readonly DefaultPriority[] = [
  {
    id: '01a16286-f097-7420-b8b5-53e31ece4809',
    kind: 'low',
    level: 1,
    name: priorities.low,
    isDefault: false,
  },
  {
    id: '01a16286-f097-741e-8499-8d3adbd5c2d6',
    kind: 'normal',
    level: 2,
    name: priorities.normal,
    isDefault: true,
  },
  {
    id: '01a16286-f097-7031-b0a5-653999e6a1e3',
    kind: 'high',
    level: 3,
    name: priorities.high,
    isDefault: false,
  },
  {
    id: '01a16286-f098-702e-b31c-00b4639a6236',
    kind: 'urgent',
    level: 4,
    name: priorities.urgent,
    isDefault: false,
  },
];

/** The categories, in order. */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  {
    id: '01a16286-f098-7e89-95b4-e2b2aa971d11',
    kind: 'bug',
    name: categories.bug,
    color: 'gray',
    isDefault: false,
  },
  {
    id: '01a16286-f098-7eba-93de-76873ba83fec',
    kind: 'request',
    name: categories.request,
    color: 'gray',
    isDefault: true,
  },
  {
    id: '01a16286-f098-7082-a99d-9636cf947dea',
    kind: 'question',
    name: categories.question,
    color: 'gray',
    isDefault: false,
  },
];
