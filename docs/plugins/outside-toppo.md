# Reaching outside Toppo

A plugin reaches only what its manifest declares, shown to who approves it. Without `http`, it reaches nothing.

| `http`                                   | It may reach                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `['hooks.slack.com', 'api.example.com']` | These hosts, by name: 20 at most                                              |
| `{ fromSettings: ['summaryUrl'] }`       | The address typed in these text settings of the instance's: a team's own chat |
| `'any'`                                  | Any public site, at addresses it gets as data                                 |

Never an address inside the network (the loopback, private networks, a cloud's metadata…), checked as the connection is made and at each redirect, unless the administrator named the host when approving the plugin. Then it reaches it on the port of http or https, or on the one an address in its settings gives.

## Sending a request

```ts
const answer = await ctx.http.fetch(ctx.settings.summaryUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: summary }),
});
if (!answer.ok) {
  throw new Error(`The chat answered ${answer.status}`);
}
```

`ctx.http.fetch(url, { method?, headers?, body? })` answers `{ status, ok, headers, text(), json() }`; any status is an answer. When there is none, it rejects with an `HttpFailure`, whose `code` says why:

| `code`                | Why                                                  |
| --------------------- | ---------------------------------------------------- |
| `HOST_NOT_DECLARED`   | The host is not among those the plugin declared      |
| `ADDRESS_NOT_ALLOWED` | An address inside the network, not named at approval |
| `TOO_MANY_CALLS`      | 60 requests a minute already                         |
| `TIMEOUT`             | No answer within 10 seconds, redirects included      |
| `RESPONSE_TOO_LARGE`  | An answer over 256 KB                                |
| `TOO_MANY_REDIRECTS`  | More than 5                                          |
| `NETWORK_ERROR`       | The connection failed                                |

Requests are http or https only, without cookies, 64 KB of body and 30 headers at most. A redirect to another origin keeps only harmless headers (`accept`, `content-type`…), never one that may carry a secret, and never goes from https down to http.

The plugin's page shows its last 50 requests to administrators: the host, the method, the status or why there was none, never the path, query or body.

## Receiving requests

A route is where a service outside Toppo calls the plugin: GitHub, GitLab, a CI script. It answers as the plugin itself, with its needs, in the projects it acts in, as an event or a job does.

<<< @/../apps/server/src/platform/plugins/fixtures/commit-links.fixture.ts#github

Its address is `/api/v1/plugins/<id>/routes/<name>`: the plugin's page gives it whole, to copy into the service's settings, and who approves the plugin sees its routes. An upgrade that adds one asks for an approval again.

**Anyone may send a request there**: check it is the service's before anything else, and answer `401` otherwise. `ctx.crypto.verify(request, check)` checks it as the service signs it, computed by Toppo, since the sandbox has no cryptography of its own:

| `check`                                                            | The service                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `{ scheme: 'github', secret }`                                     | GitHub, Bitbucket Cloud: `x-hub-signature-256`                                                                                  |
| `{ scheme: 'standard-webhooks', secret, toleranceSeconds? }`       | [Standard Webhooks](https://www.standardwebhooks.com/), Toppo's own webhooks among them: dated, five minutes at most by default |
| `{ scheme: 'token', header, secret }`                              | A header holding the secret itself: GitLab's `x-gitlab-token`                                                                   |
| `{ scheme: 'hmac', header, algorithm, encoding, prefix?, secret }` | Any HMAC of the body: Gitea's `x-gitea-signature` (`sha256`, `hex`)                                                             |

<<< @/../apps/server/src/platform/plugins/fixtures/commit-links.fixture.ts#gitlab

For a service that signs its own way, `ctx.crypto.hmac(algorithm, key, data, encoding?)` and `ctx.crypto.equal(a, b)`, which compares in constant time, do the same by hand. Keep the secret a `secret()` setting.

The request is `{ method, headers, query, body, json() }`: the body as it came, unparsed, since a signature is of these very characters; the headers in lowercase, never a cookie. The route answers `{ status, body? }`: `200`, `201`, `202` or `204`, or `400`, `401`, `403`, `404`, `409` or `422`, with JSON. A `ctx.fail` answers `422`.

A service sends a delivery again when it got no answer in time: comment with `once` and its delivery's id (`x-github-delivery`, `webhook-id`), as an event handler does. It names an issue by its key, as people write it in a commit's message: `ctx.issues.find(key)` finds it.

<<< @/../apps/server/src/platform/plugins/fixtures/commit-links.fixture.ts#link

| Bound    |                                                        |
| -------- | ------------------------------------------------------ |
| Body     | 256 KB, of text: JSON, a form, or `text/*`             |
| Answer   | 64 KB of JSON                                          |
| Time     | 10 seconds                                             |
| Requests | 120 a minute from one client, 600 a minute to a plugin |

A route that throws, takes too long or answers otherwise answers `502` to its caller, and counts no failure toward disabling the plugin: anyone may send it what makes it fail. The server's log says why.

## Secrets

A token or a webhook address is a setting declared `secret()`: sealed with the instance's key once saved, never shown again, opened for the plugin's sandbox only, as `ctx.settings.<name>`. See [settings](./manifest#settings).
