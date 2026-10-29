import {
  type Context,
  definePlugin,
  type RouteAnswer,
  type RouteRequest,
  secret,
  z,
} from '@toppo-tracker/plugin-sdk';

/**
 * A plugin of the tests, written as an author would write one: services outside Toppo tell it of
 * a commit on an issue, and it comments there, once it checked the service sent the request. The
 * routes' tests bundle it and run it in the sandbox; the authors' guide shows its routes. Never
 * imported by the server itself.
 */

const settings = z.object({
  githubSecret: secret(z.string()).optional(),
  gitlabToken: secret(z.string()).optional(),
  hooksSecret: secret(z.string()).optional(),
});

const en = {
  plugin: { name: 'Commit links', description: 'Comments on issues the commits name.' },
  settings: {
    githubSecret: { label: 'GitHub webhook secret' },
    gitlabToken: { label: 'GitLab secret token' },
    hooksSecret: { label: 'Signing secret' },
  },
  comments: { commit: 'Commit {sha}: {message}' },
} as const;

const plugin = definePlugin({
  id: 'commit-links',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  needs: ['issue.read', 'comment.create'],
  settings,
  messages: {
    en,
    fr: {
      plugin: {
        name: 'Liens de commits',
        description: 'Commente les tickets que nomment les commits.',
      },
      settings: {
        githubSecret: { label: 'Secret du webhook GitHub' },
        gitlabToken: { label: 'Jeton secret GitLab' },
        hooksSecret: { label: 'Secret de signature' },
      },
      comments: { commit: 'Commit {sha} : {message}' },
    },
  },
});

/** What a service tells of a commit: the issue it names, and what it says. */
const commitSchema = z.object({
  issueId: z.uuid(),
  sha: z.string().regex(/^[0-9a-f]{7,40}$/),
  message: z.string().min(1).max(500),
});

/** The body read as JSON; `null` when it is not, which no commit fits. */
function jsonOf(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Comments on the issue a commit names, once per delivery: a service sends a delivery again under
 * the same id, when it got no answer in time.
 */
async function linkCommit(
  ctx: Context<typeof settings, typeof en>,
  request: RouteRequest,
  delivery: string | undefined,
): Promise<RouteAnswer> {
  const commit = commitSchema.safeParse(jsonOf(request.body));
  if (!(commit.success && delivery)) {
    return { status: 400 };
  }
  const { issueId, sha, message } = commit.data;
  if (!(await ctx.issues.get(issueId))) {
    return { status: 404 };
  }
  const comment = ctx.t('comments.commit', { sha: sha.slice(0, 7), message });
  await ctx.issues.comment(issueId, comment, { once: delivery });
  return { status: 202, body: { issueId } };
}

// #region github
plugin.defineRoute({
  name: 'github.push',
  async handler(ctx, request) {
    const secret = ctx.settings.githubSecret;
    if (!(secret && (await ctx.crypto.verify(request, { scheme: 'github', secret })))) {
      return { status: 401 };
    }
    return await linkCommit(ctx, request, request.headers['x-github-delivery']);
  },
});
// #endregion github

// #region gitlab
plugin.defineRoute({
  name: 'gitlab.push',
  async handler(ctx, request) {
    const secret = ctx.settings.gitlabToken;
    const check = { scheme: 'token', header: 'x-gitlab-token' } as const;
    if (!(secret && (await ctx.crypto.verify(request, { ...check, secret })))) {
      return { status: 401 };
    }
    return await linkCommit(ctx, request, request.headers['x-gitlab-event-uuid']);
  },
});
// #endregion gitlab

// #region standard
plugin.defineRoute({
  name: 'hooks.receive',
  async handler(ctx, request) {
    const secret = ctx.settings.hooksSecret;
    if (!(secret && (await ctx.crypto.verify(request, { scheme: 'standard-webhooks', secret })))) {
      return { status: 401 };
    }
    return await linkCommit(ctx, request, request.headers['webhook-id']);
  },
});
// #endregion standard
