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

## Les secrets

Un jeton ou l’adresse d’un webhook est un réglage déclaré `secret()` : scellé avec la clé de l’instance une fois enregistré, jamais réaffiché, ouvert pour le seul bac à sable du plugin, comme `ctx.settings.<nom>`. Voir [les réglages](./manifest#les-reglages).
