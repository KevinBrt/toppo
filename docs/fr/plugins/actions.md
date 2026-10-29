# Les actions

Une action, c’est ce qu’un plugin répond quand on le lui demande : ses écrans, le plus souvent, pour la personne qui les regarde. Elle tourne pour cette personne, avec ce qu’elle et le plugin peuvent faire tous les deux.

<<< @/../plugins/time-tracking/src/actions/log-time.action.ts

## La déclarer

`plugin.defineAction({ name, access, input, handler })` :

- **`name`** : `ressource.action`, comme `timeEntry.log`, 60 caractères au plus ; 100 actions au plus.
- **`input`** : un schéma Zod. Toppo transmet l’entrée au plugin, qui la vérifie avec ce schéma dans son bac à sable : un refus répond `VALIDATION_FAILED`, champ par champ.
- **`handler(ctx, input)`** : répond le résultat, n’importe quelle valeur JSON. Voir [le contexte](./context).

## Qui peut la lancer

`access` est vérifié par Toppo avant que le plugin tourne :

| `access`                                          | Qui peut la lancer                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `'authenticated'`                                 | Toute personne connectée                                                                       |
| `{ permission: 'reports.read' }`                  | Qui a cette permission, l’une de celles du plugin (portée `'instance'`) ou l’un de ses besoins |
| `{ issue: 'issueId' }`                            | Qui voit le ticket que désigne l’`issueId` de l’entrée, dans un projet où le plugin agit       |
| `{ issue: 'issueId', permission: 'entries.log' }` | Qui voit le ticket et a la permission dans son projet                                          |

Un ticket que la personne ou le plugin ne voit pas répond 404, comme s’il n’existait pas. Une action sur un ticket demande le besoin `issue.read`.

## Quand elle refuse

```ts
if (input.minutes > ctx.settings.maxMinutes) {
  throw ctx.fail('errors.tooMuch', { limit: ctx.settings.maxMinutes });
}
```

`ctx.fail(clé, params)` donne ce qu’il faut lancer pour refuser, avec les mots du plugin : l’une de ses clés de messages, que ses écrans traduisent. La requête répond 422 `PLUGIN_REFUSED`, avec cette clé et ses valeurs. Tout autre chose que lance le plugin répond 422 avec le code `PLUGIN_ERROR`, son message gardé dans le journal de Toppo.

## Ses limites

- **5 secondes** pour toute l’exécution, appels à Toppo compris.
- 64 Ko d’entrée, 300 actions par minute et par personne (les écrans lisent aussi par elles).
- Une action qui échoue, ou dépasse son délai, ne compte jamais pour [désactiver le plugin](./installing#quand-il-echoue-encore-et-encore) : n’importe quelle personne connectée peut la lancer avec ce qui la fait échouer.

En HTTP, une action est `POST /api/v1/plugins/<id>/actions/<nom>`, avec l’entrée en JSON, pour la personne connectée ; elle répond `{ "result": … }`.
