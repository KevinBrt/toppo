import type { MessageKey } from './messages.ts';
import type { PluginPropertyType, PropertyDisplay } from './protocol/declarations/properties.ts';

/** Who writes a property: people, as any of Toppo's, or the plugin alone. */
export type Writer = 'people' | 'plugin';

/** A property a plugin adds to issues, as `defineProperty` declares it. */
export interface Property<
  N extends string = string,
  T extends PluginPropertyType = PluginPropertyType,
  W extends Writer = Writer,
> {
  /** A key of the plugin's messages: its name when the plugin is approved, renamed at will. */
  readonly name: N;
  readonly type: T;
  /** How a number shows: `duration` reads minutes as "6 h 40". */
  readonly display?: PropertyDisplay | undefined;
  readonly writtenBy: W;
}

/**
 * Declares a property the plugin adds to issues: a column of the issue list, a filter, a sort,
 * like any of Toppo's. Written by people, with an activity in the issue's history; or by the
 * plugin alone (`ctx.issues.setProperty`), with none: it is derived from what the plugin keeps.
 */
export function defineProperty<
  const N extends string,
  const T extends PluginPropertyType,
  const W extends Writer,
>(definition: {
  name: N;
  type: T;
  display?: T extends 'number' ? PropertyDisplay : never;
  writtenBy: W;
}): Property<N, T, W> {
  return definition.display === undefined
    ? { name: definition.name, type: definition.type, writtenBy: definition.writtenBy }
    : definition;
}

/** A plugin's properties, by the name it gives them. */
export type Properties = Readonly<Record<string, Property>>;

/** Each property named by a key of the plugin's messages. */
export type PropertyNames<M, Pr extends Properties> = {
  readonly [K in keyof Pr]: { readonly name: MessageKey<M> };
};

/** What a property of type `T` holds on an issue: a number, a text, a day, a box ticked. */
export type PropertyValue<T extends PluginPropertyType> = T extends 'number'
  ? number
  : T extends 'checkbox'
    ? true
    : string;

/** What a plugin writes to a property of type `T`: a box unticked with `false`. */
export type PropertyInput<T extends PluginPropertyType> = T extends 'checkbox'
  ? boolean
  : PropertyValue<T>;

/** The properties the plugin writes, by their names. */
export type OwnWritten<Pr extends Properties> = {
  [K in keyof Pr]: Pr[K]['writtenBy'] extends 'plugin' ? K : never;
}[keyof Pr] &
  string;

/** The values of the plugin's properties an issue has, by their names. */
export type PropertyValues<Pr extends Properties> = {
  readonly [K in keyof Pr]?: PropertyValue<Pr[K]['type']>;
};
