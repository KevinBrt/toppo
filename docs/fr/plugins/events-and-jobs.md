# Événements et jobs

Ce que fait un plugin quand personne ne le lui demande : il est prévenu des changements, et il travaille seul. Dans les deux cas, il agit en son nom, avec ses besoins, dans les projets où il est approuvé.

## Événements

```ts
plugin.defineEventHandler({
  event: 'issue.statusChanged',
  async handler(ctx, { event, issue, change }) {
    // Le ticket tel qu’il est : fermé par le statut où il est passé.
    if (issue.status.closes) {
      await ctx.issues.comment(issue.id, ctx.t('comments.closed', { status: change.to.name }), {
        once: event.id,
      });
    }
  },
});
```

Un gestionnaire par événement ; les événements qu’il traite font partie de ce qu’un administrateur approuve. Chacun reçoit :

- **`event`** : `{ id, type, occurredAt, actorId }`, qui a fait le changement.
- **`issue`** : le ticket tel qu’il est, sans sa description : `{ id, key, projectId, projectKey, title, status, category, priority, assigneeId, reporterId, closedAt, createdAt, updatedAt }`. Pour `issue.deleted`, seulement `{ id, key, projectId }`.
- **`change`** : ce qui a changé.

| Événement                                         | `change`                                                      |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `issue.created`, `issue.deleted`                  | `{}`                                                          |
| `issue.titleChanged`, `issue.descriptionChanged`  | `{ from, to }`, les textes                                    |
| `issue.statusChanged`, `issue.categoryChanged`    | `{ from, to }`, chacun `{ id, name }`                         |
| `issue.priorityChanged`                           | `{ from, to }`, chacun `{ id, name, level }`, niveau de 1 à 4 |
| `issue.assigneeChanged`, `issue.duplicateChanged` | `{ from, to }`, des identifiants ou `null`                    |
| `issue.labelsChanged`                             | `{ added, removed }`, chacune `{ id, name }`                  |
| `issue.propertyChanged`                           | `{ type, property, from, to }`, selon le type de la propriété |
| `issue.commented`, `issue.commentEdited`          | `{ comment: { id, authorId, body, mentioned } }`              |
| `issue.commentDeleted`                            | `{ commentId }`                                               |
| `issue.attachmentAdded`                           | `{ attachment: { id, fileName, mediaType, size } }`           |
| `issue.attachmentRemoved`                         | `{ attachmentId }`                                            |

Un plugin n’est prévenu que des tickets de ses projets, et jamais de ce qu’a fait un plugin, lui compris : deux plugins ne se répondent jamais sans fin. Les événements lui arrivent un instant après le changement, dix à la fois, l’un après l’autre, chacun avec **60 secondes**.

### Traité deux fois

Quand un événement d’un lot échoue, le lot est retenté plus tard, événements précédents compris. Ce que fait un gestionnaire doit supporter d’être fait deux fois : commentez avec `once: event.id`, et cherchez un enregistrement avant d’en créer un.

## Jobs

<<< @/../plugins/time-tracking/src/jobs/weekly-summary.job.ts{ts:line-numbers}

`plugin.defineJob({ name, every, label, handler })` :

- **`every`** : `'hour'`, `'day'` ou `'week'`, compté depuis sa dernière exécution. Toppo ne garde pas de fuseau horaire pour le lancer à une heure donnée.
- **`label`** : ce qu’il fait, parmi ses messages, montré à qui approuve le plugin ; 5 jobs au plus.
- **60 secondes** par exécution. Comme un événement, une exécution peut avoir lieu deux fois : ce qu’elle fait hors de Toppo doit le supporter.

Le job d’un plugin qui n’est plus activé, ou qui ne le déclare plus, ne tourne plus.

## Quand ils échouent

Un événement ou un job qui échoue est retenté plus tard, avec une attente plus longue à chaque fois. Il compte une seule fois pour [désactiver le plugin](./installing#quand-il-echoue-encore-et-encore), quel que soit le nombre de tentatives.
