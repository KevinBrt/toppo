# Le contexte

Chaque gestionnaire reçoit `ctx` : ce avec quoi il tourne, et son seul chemin vers Toppo.

| Membre                       | Ce que c’est                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `ctx.settings`               | Les réglages de l’instance, analysés avec le schéma du plugin, valeurs par défaut appliquées, secrets ouverts |
| `ctx.locale`                 | `'en'` ou `'fr'` : la langue de la personne dans une action, l’anglais dans un événement ou un job            |
| `ctx.t(clé, params?)`        | L’un des messages du plugin, dans cette langue                                                                |
| `ctx.fail(clé, params?)`     | Ce qu’il faut lancer pour refuser, avec les mots du plugin                                                    |
| `ctx.user`                   | `{ id }` de la personne pour qui tourne une action ; absent dans les événements et les jobs                   |
| `ctx.issues`                 | Les tickets de ses projets : ci-dessous                                                                       |
| `ctx.projects.settings(id)`  | Les réglages d’un projet, analysés, valeurs par défaut appliquées                                             |
| `ctx.entities.<nom>`         | Ses enregistrements : voir [données](./data#entites)                                                          |
| `ctx.http.fetch(url, init?)` | Une requête hors de Toppo : voir [sortir de Toppo](./outside-toppo)                                           |

## Les tickets

- **`ctx.issues.get(issueId)`** répond le ticket, ou `null` pour un ticket qu’il ne voit pas : sa clé, son projet, son titre et sa description, son statut, sa priorité, sa catégorie, la personne assignée et le demandeur, ses dates, et les valeurs des propriétés du plugin. Demande `issue.read`.
- **`ctx.issues.comment(issueId, corps, { once? })`** le commente sous l’utilisateur du plugin, 20 000 caractères au plus, et répond `{ commentId }`. Demande `comment.create`, et dans une action la personne doit l’avoir aussi. Avec `once`, une clé à vous, le commentaire n’est écrit qu’une fois, quel que soit le nombre de demandes : un événement traité deux fois commente une fois. Les clés sont gardées 7 jours.
- **`ctx.issues.setProperty(issueId, propriété, valeur)`** écrit l’une de ses propriétés : voir [propriétés](./data#proprietes).

## Les réglages d’un projet

`await ctx.projects.settings(projectId)` répond ce que ce projet a réglé, analysé avec `projectSettings`, valeurs par défaut appliquées. Il ne demande aucun besoin, mais le plugin, et dans une action la personne, doivent avoir accès au projet : sinon il refuse avec `PROJECT_NOT_FOUND`.

## Quand Toppo refuse un appel

Un appel que Toppo refuse est rejeté avec une `Error` dont le `message` est le code de la raison : `FORBIDDEN` (un besoin qui manque au plugin, ou à la personne), `ISSUE_NOT_FOUND`, `PROJECT_NOT_FOUND`, `RECORD_LIMIT_REACHED`, `INVALID_ARGUMENTS`… Une panne de Toppo lui-même répond `INTERNAL_ERROR`, son détail gardé dans le journal de Toppo.

Toppo traite quatre appels d’une exécution à la fois, et mille autres attendent leur tour : au-delà, un appel est refusé avec `TOO_MANY_CALLS`. Les appels qui attendent encore quand l’exécution se termine sont abandonnés. Attendez ce que vous demandez, ou quelques appels à la fois.

Rien d’autre ne sort du bac à sable : pas de `console`, pas de minuteurs, pas de module de Node. Ce que le plugin a à dire, il le dit par sa réponse, ses enregistrements ou un commentaire.
