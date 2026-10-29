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

## Secrets

A token or a webhook address is a setting declared `secret()`: sealed with the instance's key once saved, never shown again, opened for the plugin's sandbox only, as `ctx.settings.<name>`. See [settings](./manifest#settings).
