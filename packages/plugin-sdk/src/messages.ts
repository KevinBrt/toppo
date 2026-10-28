import type { Messages } from './protocol/manifest.ts';

/** Every key of a plugin's messages, dotted: `panel.title`. */
export type MessageKey<M> = {
  [K in keyof M & string]: M[K] extends string ? K : `${K}.${MessageKey<M[K]>}`;
}[keyof M & string];

/** The same keys as the English messages, each translated: a missing one fails type checking. */
export type MessagesOf<M> = {
  readonly [K in keyof M]: M[K] extends string ? string : MessagesOf<M[K]>;
};

/** The words of a message that vary: `{limit}`. */
export type MessageParams = Readonly<Record<string, string | number>>;

/** A message, its `{params}` filled in; its key when the language lacks it. */
export function translate(messages: Messages, key: string, params: MessageParams = {}): string {
  const found = key
    .split('.')
    .reduce<string | Messages | undefined>(
      (node, part) => (typeof node === 'object' ? node[part] : undefined),
      messages,
    );
  const text = typeof found === 'string' ? found : key;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    String(params[name] ?? placeholder),
  );
}
