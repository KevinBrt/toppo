# Données et propriétés

## Entités

Un plugin garde ce dont il a besoin comme enregistrements de ses **entités**, sur un ticket, sur un projet ou sur une personne. Toppo les stocke et vérifie lui-même chaque écriture, à partir de ce que déclare l’entité, jamais à partir du code du plugin.

<<< @/../plugins/time-tracking/src/entities/time-entry.entity.ts

`defineEntity({ attachedTo, fields, indexes?, limits? })`, puis `entities: { timeEntry }` dans `definePlugin()` ; 10 entités au plus.

- **`attachedTo`** : `'issue'` (demande `issue.read`), `'project'` ou `'person'` (demande `apiVersion: '^1.1'`). Un enregistrement sur un ticket ou un projet se voit comme son ticket ou son projet.
- **`visibleTo`**, pour une entité sur les personnes : qui voit les enregistrements d’une personne quand le plugin agit pour quelqu’un. `'person'` (par défaut) : cette personne seule. `'teammates'` : quiconque travaille avec elle dans un projet où le plugin agit aussi, pour une collection que des collègues comparent.
- **`fields`** : un objet Zod plat, 30 champs au plus : un texte avec son `.max()` (10 000 au plus), un format connu (`z.iso.date()`, `z.iso.datetime()`, `z.uuid()`, `z.email()`), un choix (`z.enum()`), un nombre avec ses bornes, un oui ou non. Rien de nullable ni d’imbriqué ; `.optional()` et `.default()` sont permis. 16 Ko par enregistrement.
- **`indexes`** : les champs par lesquels il filtre, trie et regroupe ses enregistrements. Chacun doit être obligatoire ou avoir une valeur par défaut : trois dates, trois nombres, trois textes (un choix, un e-mail, ou 200 caractères au plus) et deux identifiants au plus.
- **`limits`** : `{ perIssue }` (1 000 par défaut, 10 000 au plus), `{ perProject }` (100 000 par défaut, 1 000 000 au plus) ou `{ perPerson }` (1 000 par défaut, 10 000 au plus). Au-delà, une écriture est refusée avec `RECORD_LIMIT_REACHED`.

### Lire et écrire

`ctx.entities.<nom>` ne demande aucun besoin :

| Appel                                                 | Répond                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| `create({ ...champs, issueId })`                      | L’enregistrement (`projectId` sur les projets, `personId` sur les personnes) |
| `get(id)`                                             | L’enregistrement, ou `null`                                                  |
| `update(id, changements)`, `delete(id)`               | L’enregistrement ; rien                                                      |
| `list({ where, orderBy, direction, page, pageSize })` | `{ items, total }`, 50 par page, 100 au plus                                 |
| `count({ where })`, `sum(champ, { where })`           | Un nombre                                                                    |
| `countBy(groupe, …)`, `sumBy(champ, groupe, …)`       | `[{ key, value }]`, le plus grand d’abord, 1 000 groupes au plus             |

Un enregistrement se lit comme `{ id, issueId, projectId, personId, createdBy, createdAt, updatedAt, ...champs }`. `createdBy` est la personne pour qui tourne une action ; écrit en son nom, dans un événement, un job ou une route, c’est l’utilisateur du plugin, qui n’est personne : ce dont parle un enregistrement va sur une personne (`personId`) ou dans un champ.

- **`where`** filtre par `issueId`, `projectId`, `personId`, `createdBy` et les champs indexés : une valeur, `{ in: [...] }`, ou une plage `{ gte, lt… }`.
- **`orderBy`** et les **groupes** prennent `createdAt` ou un champ indexé (les groupes : `issueId`, `projectId`, `personId`, `createdBy` aussi).

Quand il agit pour une personne, le plugin ne voit que les enregistrements de ce que voit cette personne, et ceux des personnes comme le dit le `visibleTo` de leur entité.

Les appels ne forment pas une transaction : deux exécutions peuvent travailler sur les mêmes enregistrements en même temps. Pour consommer quelque chose une seule fois, un booster ouvert par exemple, supprimez-le d’abord et ne continuez que si cela a réussi : un enregistrement n’est supprimé qu’une fois, et un second `delete` est refusé avec `RECORD_NOT_FOUND`. Deux `update`, eux, réussissent tous les deux.

### Sur une personne

Un enregistrement sur une personne se rattache à quelqu’un qui travaille dans un projet où le plugin agit : jamais l’utilisateur d’un plugin, ni personne d’autre (`PERSON_NOT_FOUND`). Pour quelqu’un, une action n’écrit, ne modifie et ne supprime que les enregistrements de cette personne, même ceux que voient ses collègues (`FORBIDDEN` pour une autre). En son nom, un gestionnaire d’événement, une tâche ou une route écrit ceux de n’importe laquelle de ces personnes : qui a fermé un ticket est `event.actorId`. Effacer une personne supprime ses enregistrements. Dans un projet archivé, les enregistrements sont en lecture seule. Désinstaller le plugin les garde, pour qu’il les retrouve s’il revient, ou les supprime, au choix de l’administrateur.

## Propriétés

Un plugin ajoute des champs aux tickets : des propriétés de Toppo, affichées, filtrées et triées avec les autres.

<<< @/../plugins/time-tracking/src/properties/time-spent.property.ts

`defineProperty({ name, type, display?, writtenBy })`, puis `properties: { timeSpent }` dans `definePlugin()` ; 5 au plus, et elles demandent `issue.read`.

- **`type`** : `'number'` (affiché comme une durée avec `display: 'duration'`, en minutes), `'text'`, `'date'` ou `'checkbox'`. Il ne change jamais.
- **`writtenBy: 'people'`** : les gens la remplissent, comme n’importe quelle propriété.
- **`writtenBy: 'plugin'`** : le plugin seul l’écrit, avec `ctx.issues.setProperty(issueId, 'timeSpent', 90)` ; `null`, ou `false` pour une case, la retire. Elle n’enregistre aucune activité et ne déclenche aucun événement : son historique, ce sont les enregistrements du plugin.

Elles sont créées à l’approbation du plugin, nommées par ses messages dans la langue de qui approuve, parmi les 20 propriétés de l’instance. Elles s’affichent dans ses projets tant qu’il est activé.
