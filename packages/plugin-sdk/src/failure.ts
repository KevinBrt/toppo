import type { MessageParams } from './messages.ts';

/**
 * What the person who acted is told when an action refuses: one of the plugin's message keys and
 * its params, which Toppo translates. Made by `ctx.fail()`, which checks the key.
 */
export class PluginFailure extends Error {
  readonly code: string;
  readonly params: MessageParams | undefined;

  constructor(code: string, params?: MessageParams) {
    super(code);
    this.name = 'PluginFailure';
    this.code = code;
    this.params = params;
  }
}
