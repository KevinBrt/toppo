import { schema } from '@toppo-tracker/db';
import { runAnswerSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { DEFAULT_LOCALE, pluginActionParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineDetachedCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { answerCalls } from '../../../platform/plugins/host-calls.ts';
import type { SandboxOutcome } from '../../../platform/plugins/sandbox/sandbox-protocol.ts';
import { assertActionAccess } from '../utils/action-access.util.ts';
import { actingFor, actingPlugin } from '../utils/plugin-actor.util.ts';
import { failureOf, recordFailure, recordSuccess } from '../utils/plugin-failures.util.ts';

const { users } = schema;

/** What an action may take: someone waits for it. */
const ACTION_DEADLINE_MS = 5000;

const notFound = () =>
  new HttpError(404, 'PLUGIN_ACTION_NOT_FOUND', 'No enabled plugin runs this action');

/**
 * Runs a plugin's action for the person signed in: the access it declares checked first, then
 * its input, by the plugin's own schema in its sandbox, where a hostile one cannot hold Toppo up.
 * The plugin acts with what both it and the person hold, and writes as itself. It holds no
 * transaction while it runs: what it writes goes through Toppo's commands, each in its own.
 * Answers the action's result; a refusal of the plugin's comes in its own words, for its screens
 * to translate.
 */
export const runPluginAction = defineDetachedCommand({
  name: 'plugin.runAction',
  access: 'authenticated',
  input: pluginActionParamsSchema.extend({ input: z.record(z.string(), z.unknown()) }),
  async handler({ db, actor, log, services }, { pluginSlug, action, input }) {
    const plugin = await actingPlugin(db, { slug: pluginSlug });
    const declared = plugin?.manifest.actions.find(({ name }) => name === action);
    if (!(plugin && declared)) {
      throw notFound();
    }
    const context = { db, actor: actingFor(plugin, actor), log, services };
    await assertActionAccess(context, plugin.manifest, declared.access, input);
    const [person] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, actor.id));
    let outcome: SandboxOutcome<unknown>;
    try {
      outcome = await services.plugins.runtime.run(
        { slug: plugin.slug, sha256: plugin.sha256 },
        {
          kind: 'action',
          name: action,
          payload: input,
          context: {
            locale: person?.locale ?? DEFAULT_LOCALE,
            user: { id: actor.id },
            settings: plugin.settings,
          },
          deadlineMs: ACTION_DEADLINE_MS,
        },
        answerCalls(services.plugins.calls, context, plugin.needs),
        log,
      );
    } catch (error) {
      log.error({ err: error, plugin: plugin.slug }, 'The plugin could not be run');
      outcome = { ok: false, failure: 'CRASHED' };
    }
    const answer = runAnswerSchema.safeParse(outcome.ok ? outcome.value : null);
    if (answer.success && !answer.data.ok) {
      // Refusing is part of an action's work: it counts as no failure.
      const { code, params, issues } = answer.data.error;
      throw new HttpError(422, 'PLUGIN_REFUSED', 'The plugin refused', {
        plugin: { code, ...(params ? { params } : {}) },
        ...(issues ? { details: issues } : {}),
      });
    }
    const failure = failureOf(outcome);
    if (failure || !answer.success || !answer.data.ok) {
      log.warn({ plugin: plugin.slug, action, failure, outcome }, 'Plugin failed');
      await recordFailure(db, plugin, failure ?? 'INVALID_ANSWER', `action ${action}`, log);
      throw new HttpError(502, 'PLUGIN_FAILED', 'The plugin failed to run this action');
    }
    await recordSuccess(db, plugin.id);
    return { result: answer.data.result };
  },
});
