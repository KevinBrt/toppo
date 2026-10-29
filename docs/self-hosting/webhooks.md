# Webhooks

A webhook tells another tool what happens on issues, as it happens: a chat, a deployment, a script of your own. Toppo sends its address a signed `POST` of each event chosen, in JSON. Add one in **Settings › Webhooks**: only the administrators manage them, as what leaves the instance is theirs to decide.

## Adding one

- **Address**: where Toppo sends its requests, in `https`. Toppo refuses an address inside your network (`localhost`, private ranges, link-local addresses) unless you switch on **An address inside your network**, for a server of your own: that one may be in `http` too. Toppo never follows a redirect.
- **Events**: what Toppo tells it of, among the events [plugins hear of](/plugins/events-and-jobs#events).
- **Projects**: all of them, present and future, or those chosen.

Once added, Toppo shows its **secret**, once: copy it into the receiver, which checks with it that each request comes from Toppo. Renew it from the webhook's page if it leaks; the old one stops working at once. An instance keeps 20 webhooks at most.

**Send a test** on its page sends a `webhook.test` request, signed as any other, to check the receiver before any event is told.

## What it sends

```http
POST /hooks/toppo HTTP/1.1
content-type: application/json
webhook-id: 019a2f6c-5d1e-7c3a-9b41-6f0d2e8a1c57
webhook-timestamp: 1793299743
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=

{
  "type": "issue.statusChanged",
  "timestamp": "2026-10-29T09:14:03.120Z",
  "data": {
    "event": { "id": "019a2f6c-…", "type": "issue.statusChanged", "occurredAt": "2026-10-29T09:14:03.120Z", "actorId": "0199e1…" },
    "issue": { "id": "…", "key": "WEB-42", "title": "Invoices fail to download", "description": "Since this morning…", "status": { "id": "…", "name": "Done", "closes": true }, … },
    "change": { "from": { "id": "…", "name": "In progress" }, "to": { "id": "…", "name": "Done" } }
  }
}
```

- **`type`**: the event; **`timestamp`**: when it happened.
- **`data.event`**: `{ id, type, occurredAt, actorId }`, who made the change, a person or a plugin.
- **`data.issue`**: the issue as it stands when the request is made, its description included. For `issue.deleted`, only `{ id, key, projectId }`.
- **`data.change`**: what changed, as [plugins are told it](/plugins/events-and-jobs#events): the texts before and after, the status left and the one reached, the comment and its text…

A test carries `data: { webhook: { id, name }, sentBy }`.

## Checking a request

Requests are signed as the [Standard Webhooks](https://www.standardwebhooks.com/) specification writes it, for which libraries exist in most languages (`standardwebhooks` on npm and PyPI, for one): give them the secret, the three headers and the body as received.

By hand, the signature is an HMAC SHA-256 of `webhook-id.webhook-timestamp.body`, under the secret's key (what follows `whsec_`, decoded from base64), encoded in base64 after `v1,`:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Whether a request comes from Toppo: signed with the secret, at most five minutes ago. */
export function fromToppo(secret, headers, body) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) {
    return false;
  }
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return headers['webhook-signature'].split(' ').some((signature) => {
    const [version, value] = signature.split(',');
    const given = Buffer.from(value ?? '', 'base64');
    return version === 'v1' && given.length === expected.length && timingSafeEqual(given, expected);
  });
}
```

Check the body exactly as it arrived, before parsing it: JSON written again would not match. Refuse a timestamp too old, so that a request caught on the way cannot be sent again later.

## When the receiver fails

A request is delivered when the receiver answers `2xx` within 10 seconds. Otherwise it is tried again, with a longer wait each time, 5 times over some forty minutes, then given up. The webhook's page lists its 50 latest deliveries, how each went, and sends any one of them again.

The same event keeps the same `webhook-id`, tried again or sent again by hand: **keep each `webhook-id` once**, and an event received twice does nothing twice.

After 10 deliveries given up in a row, Toppo stops the webhook and emails the administrators. Mend the receiver, then **Enable again** on its page.

The secret is encrypted with the secret key kept in the `/data` volume. Restored without that volume, Toppo cannot read it any more: renew it, and give the receiver the new one.
