# Écrire des plugins

Un plugin ajoute à ce que fait Toppo : les champs et les écrans propres à une équipe, un outil qu’il relie, un travail fait tout seul chaque semaine. C’est du TypeScript, écrit avec un SDK sous licence MIT, construit en un zip qu’un administrateur installe dans **Paramètres › Plugins**. Toppo le fait tourner à part, où il ne fait que ce que cet administrateur a approuvé.

## Ce qu’un plugin peut faire

| Avec                                           | Un plugin                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| [Des actions](./actions)                       | Répond à ce que lui demandent ses écrans, ou toute personne connectée, pour elle |
| [Des événements](./events-and-jobs#evenements) | Est prévenu de ce qui change sur les tickets de ses projets, et y réagit         |
| [Des jobs](./events-and-jobs#jobs)             | Travaille seul, chaque heure, jour ou semaine                                    |
| [Des entités](./data#entites)                  | Garde ses propres enregistrements, sur un ticket ou un projet, que Toppo vérifie |
| [Des propriétés](./data#proprietes)            | Ajoute des champs aux tickets, remplis par les gens ou par lui-même              |
| [Des écrans](./screens)                        | Affiche des pages et des panneaux, dessinés avec les composants de Toppo         |
| [Des requêtes sortantes](./outside-toppo)      | Joint les sites qu’il déclare : une messagerie, un service                       |

## Comment Toppo le fait tourner

- **Son code serveur** tourne dans un bac à sable à lui : un moteur JavaScript compilé en WebAssembly, sans fichier, réseau, processus ni minuteur du serveur. Sa seule sortie, ce sont les appels de Toppo (`ctx.issues.get`, `ctx.entities…`), chacun vérifié comme la requête d’une personne. Chaque exécution a un délai et une mémoire ; un plugin qui les dépasse est arrêté, sans bloquer Toppo.
- **Ses écrans** sont des composants React dessinés dans un cadre isolé sans origine, sous une politique de sécurité de contenu stricte : ils n’atteignent rien d’autre que les actions de leur propre plugin, par Toppo.
- **Il agit en son nom**, sous un utilisateur à lui (`<id>@plugins.invalid`), qui n’a aucun rôle et ne se connecte jamais. Ce qu’il écrit apparaît comme écrit par lui. Quand il agit pour une personne (une action), il ne peut faire que ce que lui et cette personne peuvent faire tous les deux.

## Ce qu’un administrateur approuve

Avant qu’un plugin tourne, un administrateur lit ce qu’il déclare et l’approuve :

- **Ses besoins** : ce qu’il lit et écrit de Toppo (`issue.read`, `comment.create`).
- **Les permissions qu’il ajoute**, que les rôles peuvent ensuite avoir, comme celles de Toppo.
- **Les événements qu’il écoute**, **les propriétés qu’il ajoute**, **ses jobs**, **ce qu’il joint hors de Toppo**.
- **Où il agit** : tous les projets, ou ceux choisis ; et les hôtes du réseau interne qu’il peut joindre.

Une nouvelle version qui demande plus attend une nouvelle approbation, et s’arrête d’ici là. Voir [installer et faire tourner](./installing).

## Les paquets

| Paquet                          | À quoi il sert                                                       |
| ------------------------------- | -------------------------------------------------------------------- |
| `@toppo-tracker/plugin-sdk`     | `definePlugin()`, ses actions, événements, jobs, entités, propriétés |
| `@toppo-tracker/plugin-ui`      | Les composants et les hooks de ses écrans                            |
| `@toppo-tracker/plugin-testing` | Un Toppo en mémoire, pour le tester                                  |
| `@toppo-tracker/cli`            | `toppo plugin build`, le zip qu’un administrateur installe           |
| `@toppo-tracker/create-plugin`  | `npm create @toppo-tracker/plugin`, pour en démarrer un              |

Tous sont sous licence MIT, pour qu’un plugin puisse avoir la licence de son choix : ses écrans se dessinent avec les composants de Toppo, servis par Toppo dans leur cadre, si bien qu’il n’embarque aucun code de Toppo. Ils partagent une même version ; un plugin nomme aussi l’API de plugin qu’il parle (`apiVersion: '^1.0'`), que Toppo vérifie en l’installant.

Le plugin de suivi du temps, dans le dépôt de Toppo (`plugins/time-tracking`), est construit et testé avec ces paquets comme n’importe quel plugin : les exemples de ces pages viennent de lui.

Ensuite : [démarrer](./getting-started).
