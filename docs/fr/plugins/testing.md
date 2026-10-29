# Tester

`@toppo-tracker/plugin-testing` fait tourner un plugin contre un Toppo en mémoire, avec les règles de Toppo : l’accès vérifié avant l’exécution, les appels limités à ses besoins, `once` respecté, les enregistrements vérifiés et comptés. Pas d’instance, pas de base de données : un test prend quelques millisecondes.

```ts
import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { plugin } from '../plugin.ts';
import { logTime } from './log-time.action.ts';

describe('timeEntry.log', () => {
  it('keeps the time spent on an issue, and counts it again', async () => {
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue();
    const logger = toppo.createUser({ permissions: ['entries.log'] });

    await logger.run(logTime, { issueId: issue.id, minutes: 90, spentOn: '2026-10-28' });

    expect(toppo.records('timeEntry')).toMatchObject([{ fields: { minutes: 90 } }]);
    expect(toppo.properties(issue.id)).toStrictEqual({ timeSpent: 90 });
  });
});
```

## Le Toppo qu’il donne

`createTestToppo(plugin, options?)` vérifie le manifeste du plugin comme le ferait Toppo, puis répond :

| Membre                                         | Ce qu’il fait                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `createIssue(champs?)`                         | Un ticket d’un projet de test, `WEB-1`, `WEB-2`…                                |
| `createUser({ sees?, permissions? })`          | Quelqu’un qui voit ces tickets (tous par défaut) et a ces permissions du plugin |
| `user.run(action, input)`                      | Lance une action pour cette personne, et répond son résultat                    |
| `emit(événement, { issue, change, actorId? })` | Transmet un événement au plugin                                                 |
| `runJob(job)`                                  | Lance l’un de ses jobs                                                          |
| `records(entité)`, `properties(issueId)`       | Ce qu’il a écrit                                                                |
| `comments`, `requests`                         | Les commentaires qu’il a écrits, les requêtes qu’il a envoyées hors de Toppo    |
| `manifest`                                     | Ce qu’il déclare, tel que Toppo le lit                                          |

`options` lui donne des `settings`, les `projectSettings` d’un projet (par identifiant de projet), la `locale` (`'en'` par défaut), et `http` : une fonction qui répond aux requêtes du plugin, ou un code d’échec. Sans elle, chaque requête échoue avec `NETWORK_ERROR`.

## Les refus

Une exécution que Toppo ou le plugin refuse est rejetée avec une `PluginRunError`, dont le `code` dit pourquoi :

- `NOT_FOUND` : un ticket que la personne ne voit pas.
- `FORBIDDEN` : une permission qui lui manque.
- `VALIDATION_FAILED`, avec ses `issues` : une entrée que refuse le schéma de l’action.
- La clé de message du plugin, avec ses `params` : un `ctx.fail`.
- `PLUGIN_ERROR`, avec son `detail` : toute autre chose qu’il a lancée, ou un appel que Toppo a refusé.

```ts
await expect(stranger.run(logTime, entry)).rejects.toMatchObject({ code: 'FORBIDDEN' });
```

## Ce qu’il ne fait pas

Il ne reproduit ni le délai ni la mémoire du bac à sable, ni la protection des adresses du réseau interne, et il ne dessine aucun écran : testez ce que fait un écran par les actions qu’il lance. Seules les définitions qu’un test importe sont enregistrées : importez l’action, le gestionnaire d’événement ou le job testé.
