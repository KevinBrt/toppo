# Webhooks

Un webhook prévient un autre outil de ce qui arrive aux tickets, sur le moment : une messagerie, un déploiement, un script à vous. Toppo envoie à son adresse un `POST` signé de chaque événement choisi, en JSON. Ajoutez-en un dans **Paramètres › Webhooks** : seuls les administrateurs les gèrent, car ce qui sort de l’instance est à eux d’en décider.

## En ajouter un

- **Adresse** : où Toppo envoie ses requêtes, en `https`. Toppo refuse une adresse de votre réseau (`localhost`, plages privées, adresses link-local) sauf si vous activez **Une adresse de votre réseau**, pour un serveur à vous : celle-ci peut aussi être en `http`. Toppo ne suit jamais une redirection.
- **Événements** : ce dont Toppo le prévient, parmi les événements [dont les plugins sont prévenus](/fr/plugins/events-and-jobs#evenements).
- **Projets** : tous, actuels et futurs, ou ceux choisis.

Une fois ajouté, Toppo montre son **secret**, une seule fois : copiez-le dans le récepteur, qui vérifie avec lui que chaque requête vient de Toppo. Renouvelez-le depuis la page du webhook s’il fuit ; l’ancien cesse aussitôt de fonctionner. Une instance garde au plus 20 webhooks.

**Envoyer un test**, sur sa page, envoie une requête `webhook.test`, signée comme les autres, pour vérifier le récepteur avant qu’aucun événement ne soit envoyé.

## Ce qu’il envoie

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
    "issue": { "id": "…", "key": "WEB-42", "title": "Les factures ne se téléchargent plus", "description": "Depuis ce matin…", "status": { "id": "…", "name": "Terminé", "closes": true }, … },
    "change": { "from": { "id": "…", "name": "En cours" }, "to": { "id": "…", "name": "Terminé" } }
  }
}
```

- **`type`** : l’événement ; **`timestamp`** : quand il a eu lieu.
- **`data.event`** : `{ id, type, occurredAt, actorId }`, qui a fait le changement, une personne ou un plugin.
- **`data.issue`** : le ticket tel qu’il est au moment de la requête, description comprise. Pour `issue.deleted`, seulement `{ id, key, projectId }`.
- **`data.change`** : ce qui a changé, comme [les plugins l’apprennent](/fr/plugins/events-and-jobs#evenements) : les textes avant et après, le statut quitté et celui atteint, le commentaire et son texte…

Un test porte `data: { webhook: { id, name }, sentBy }`.

## Vérifier une requête

Les requêtes sont signées comme l’écrit la spécification [Standard Webhooks](https://www.standardwebhooks.com/), pour laquelle des bibliothèques existent dans la plupart des langages (`standardwebhooks` sur npm et PyPI, par exemple) : donnez-leur le secret, les trois en-têtes et le corps tel que reçu.

À la main, la signature est un HMAC SHA-256 de `webhook-id.webhook-timestamp.corps`, sous la clé du secret (ce qui suit `whsec_`, décodé du base64), encodé en base64 après `v1,` :

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

Vérifiez le corps exactement tel qu’il est arrivé, avant de le lire : du JSON réécrit ne correspondrait plus. Refusez un horodatage trop ancien, pour qu’une requête interceptée ne puisse pas être renvoyée plus tard.

## Quand le récepteur échoue

Une requête est livrée quand le récepteur répond `2xx` en moins de 10 secondes. Sinon elle est retentée, avec une attente plus longue à chaque fois, 5 fois en une quarantaine de minutes, puis abandonnée. La page du webhook liste ses 50 dernières livraisons, comment chacune s’est passée, et renvoie celle que vous voulez.

Un même événement garde le même `webhook-id`, retenté ou renvoyé à la main : **ne gardez chaque `webhook-id` qu’une fois**, et un événement reçu deux fois ne fait rien deux fois.

Après 10 livraisons abandonnées d’affilée, Toppo arrête le webhook et prévient les administrateurs par e-mail. Réparez le récepteur, puis **Réactiver** sur sa page.

Le secret est chiffré avec la clé secrète gardée dans le volume `/data`. Restauré sans ce volume, Toppo ne peut plus le lire : renouvelez-le, et donnez le nouveau au récepteur.
