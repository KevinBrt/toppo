# Sortir de Toppo

Un plugin ne joint que ce que déclare son manifeste, montré à qui l’approuve. Sans `http`, il ne joint rien.

| `http`                                   | Il peut joindre                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `['hooks.slack.com', 'api.example.com']` | Ces hôtes, par leur nom : 20 au plus                                                |
| `{ fromSettings: ['summaryUrl'] }`       | L’adresse saisie dans ces réglages texte de l’instance : la messagerie d’une équipe |
| `'any'`                                  | N’importe quel site public, à des adresses qu’il reçoit comme données               |

Jamais une adresse du réseau interne (la boucle locale, les réseaux privés, les métadonnées d’un cloud…), vérifiée à l’ouverture de la connexion et à chaque redirection, sauf si l’administrateur a nommé l’hôte en approuvant le plugin. Il le joint alors sur le port de http ou https, ou sur celui que donne une adresse de ses réglages.

## Envoyer une requête

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

`ctx.http.fetch(url, { method?, headers?, body? })` répond `{ status, ok, headers, text(), json() }` ; tout statut est une réponse. Quand il n’y en a pas, il est rejeté avec une `HttpFailure`, dont le `code` dit pourquoi :

| `code`                | Pourquoi                                                  |
| --------------------- | --------------------------------------------------------- |
| `HOST_NOT_DECLARED`   | L’hôte n’est pas parmi ceux que le plugin a déclarés      |
| `ADDRESS_NOT_ALLOWED` | Une adresse du réseau interne, non nommée à l’approbation |
| `TOO_MANY_CALLS`      | Déjà 60 requêtes dans la minute                           |
| `TIMEOUT`             | Pas de réponse en 10 secondes, redirections comprises     |
| `RESPONSE_TOO_LARGE`  | Une réponse de plus de 256 Ko                             |
| `TOO_MANY_REDIRECTS`  | Plus de 5                                                 |
| `NETWORK_ERROR`       | La connexion a échoué                                     |

Les requêtes sont en http ou https seulement, sans cookies, 64 Ko de corps et 30 en-têtes au plus. Une redirection vers une autre origine ne garde que les en-têtes inoffensifs (`accept`, `content-type`…), jamais un qui peut porter un secret, et ne passe jamais de https à http.

La page du plugin montre ses 50 dernières requêtes aux administrateurs : l’hôte, la méthode, le statut ou la raison de son absence, jamais le chemin, la requête ni le corps.

## Recevoir des requêtes

Une route est l’endroit où un service hors de Toppo appelle le plugin : GitHub, GitLab, un script de CI. Elle répond en tant que le plugin lui-même, avec ses besoins, dans les projets où il agit, comme un événement ou un job.

<<< @/../apps/server/src/platform/plugins/fixtures/commit-links.fixture.ts#github

Son adresse est `/api/v1/plugins/<id>/routes/<nom>` : la page du plugin la donne entière, à copier dans les réglages du service, et qui approuve le plugin voit ses routes. Une mise à jour qui en ajoute une redemande une approbation.

**N’importe qui peut y envoyer une requête** : vérifiez qu’elle vient du service avant toute chose, et répondez `401` sinon. `ctx.crypto.verify(request, check)` la vérifie comme le service la signe, calculé par Toppo, puisque le bac à sable n’a pas de cryptographie à lui :

| `check`                                                            | Le service                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `{ scheme: 'github', secret }`                                     | GitHub, Bitbucket Cloud : `x-hub-signature-256`                                                                            |
| `{ scheme: 'standard-webhooks', secret, toleranceSeconds? }`       | [Standard Webhooks](https://www.standardwebhooks.com/), dont les webhooks de Toppo : daté, cinq minutes au plus par défaut |
| `{ scheme: 'token', header, secret }`                              | Un en-tête qui porte le secret lui-même : `x-gitlab-token` de GitLab                                                       |
| `{ scheme: 'hmac', header, algorithm, encoding, prefix?, secret }` | N’importe quel HMAC du corps : `x-gitea-signature` de Gitea (`sha256`, `hex`)                                              |

<<< @/../apps/server/src/platform/plugins/fixtures/commit-links.fixture.ts#gitlab

Pour un service qui signe à sa façon, `ctx.crypto.hmac(algorithm, key, data, encoding?)` et `ctx.crypto.equal(a, b)`, qui compare en temps constant, font la même chose à la main. Gardez le secret dans un réglage `secret()`.

La requête est `{ method, headers, query, body, json() }` : le corps tel qu’il est arrivé, non lu, puisqu’une signature porte sur ces caractères mêmes ; les en-têtes en minuscules, jamais un cookie. La route répond `{ status, body? }` : `200`, `201`, `202` ou `204`, ou `400`, `401`, `403`, `404`, `409` ou `422`, avec du JSON. Un `ctx.fail` répond `422`.

Un service renvoie une livraison quand il n’a pas eu de réponse à temps : commentez avec `once` et l’identifiant de sa livraison (`x-github-delivery`, `webhook-id`), comme le fait un gestionnaire d’événement. Il nomme un ticket par sa clé, comme les gens l’écrivent dans le message d’un commit : `ctx.issues.find(key)` le trouve.

<<< @/../apps/server/src/platform/plugins/fixtures/commit-links.fixture.ts#link

| Limite   |                                                                |
| -------- | -------------------------------------------------------------- |
| Corps    | 256 Ko, de texte : du JSON, un formulaire, ou `text/*`         |
| Réponse  | 64 Ko de JSON                                                  |
| Temps    | 10 secondes                                                    |
| Requêtes | 120 par minute d’un même client, 600 par minute vers un plugin |

Une route qui lève une erreur, prend trop de temps ou répond autrement répond `502` à son appelant, et ne compte aucun échec vers la désactivation du plugin : n’importe qui peut lui envoyer ce qui la fait échouer. Le journal du serveur dit pourquoi.

## Les secrets

Un jeton ou l’adresse d’un webhook est un réglage déclaré `secret()` : scellé avec la clé de l’instance une fois enregistré, jamais réaffiché, ouvert pour le seul bac à sable du plugin, comme `ctx.settings.<nom>`. Voir [les réglages](./manifest#les-reglages).
