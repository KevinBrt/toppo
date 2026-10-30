# Le manifeste

`definePlugin()` déclare ce qu’est le plugin et ce qu’il demande. Toppo ne lit jamais de fichier de manifeste : il exécute le bundle du plugin dans son bac à sable et lit ce que `definePlugin()` a déclaré, strictement, en refusant tout ce qu’il ne connaît pas. Le plugin de suivi du temps déclare :

```ts
export const plugin = definePlugin({
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  logo: 'logo.png',
  apiVersion: '^1.0',
  needs: ['issue.read'],
  permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
  settings: z.object({
    hoursPerDay: z.number().min(1).max(24).default(8),
    summaryUrl: secret(z.url()).optional(),
    summaryLanguage: z.enum(['en', 'fr']).default('en'),
  }),
  http: { fromSettings: ['summaryUrl'] },
  projectSettings: z.object({
    budgetDays: z.number().positive().max(100_000).optional(),
  }),
  entities: { timeEntry },
  properties: { timeSpent },
  messages: { en: { … }, fr: { … } },
});
```

## Identité

| Champ                 | Ce que c’est                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | De 3 à 40 lettres minuscules, chiffres et tirets, commençant par une lettre. Il nomme le plugin pour de bon. `toppo` et les ressources de Toppo (`issue`, `project`…) sont pris.                                                                      |
| `name`, `description` | Des clés de ses messages : un administrateur les lit dans sa langue.                                                                                                                                                                                  |
| `logo`                | Facultatif : `logo.png` ou `logo.webp`, à côté de `package.json`, 256 Ko au plus. Vérifié par ses octets ; le SVG, qui peut porter du script, est refusé.                                                                                             |
| `apiVersion`          | L’API de plugin qu’il parle, `^1.0` : Toppo l’installe s’il parle la même version majeure et au moins cette mineure. L’API 1.1 (Toppo 1.2) apporte les enregistrements sur une personne et `ctx.people.can` : un plugin qui s’en sert demande `^1.1`. |

Sa version est celle de `package.json`.

## Les messages

Chaque mot qu’affiche un plugin est l’un de ses messages, en anglais et en français : `messages: { en, fr }`, des objets imbriqués de chaînes, 1 000 caractères au plus chacune. Un message français absent de `fr` fait échouer la vérification des types. `{name}` dans un message est rempli par `ctx.t('greeting', { name })`. Les écrans les lisent avec `useT`.

## Les besoins

Ce que le plugin lit et écrit de Toppo, en son nom, dans les projets où il est approuvé. Ce sont ses limites : quand il agit pour une personne, il a ce qu’ils ont tous les deux.

| Besoin           | Lui permet de                                                     |
| ---------------- | ----------------------------------------------------------------- |
| `issue.read`     | Lire les tickets de ses projets : `ctx.issues.get`, `find`        |
| `comment.create` | Les commenter, sous son propre utilisateur : `ctx.issues.comment` |

Une action sur un ticket, un panneau de ticket, une entité sur les tickets et une propriété demandent tous `issue.read` : le build les refuse sans.

## Les permissions

`permissions` ajoute au catalogue de Toppo des permissions nommées d’après le plugin (`time-tracking.entries.log`), que les rôles ont comme celles de Toppo. Chacune a une portée, `scope` : `'project'` (dans chaque projet auquel une personne a accès) ou `'instance'`, et un libellé, `label`, parmi ses messages ; 30 au plus. Seul le rôle Administrateur les a au départ : un administrateur les donne aux autres rôles dans **Paramètres › Rôles et permissions**. Une action, une page ou un panneau en demande une dans son `access`.

## Les réglages

`settings` et `projectSettings` sont des objets Zod plats, que Toppo dessine en formulaires : ceux de l’instance sur la page du plugin, ceux d’un projet dans son onglet **Plugins**, avec _Paramètres du projet_.

- Un champ est un texte (`z.string()`, `z.url()` et `z.email()` dessinés comme tels), un nombre avec ses bornes, un oui ou non (`z.boolean()`), ou un choix (`z.enum()`, 50 valeurs au plus) ; 30 champs au plus.
- Chacun est `.optional()` ou a un `.default()` : un plugin tourne avant que quiconque le règle.
- Chacun est libellé par `settings.<nom>.label` dans ses messages (`projectSettings.<nom>.label` pour ceux d’un projet), avec un `.help` facultatif, et `.options.<valeur>` pour un choix.
- `secret(z.string())`, `secret(z.url())` : un texte de l’instance, sans valeur par défaut, scellé avec la clé de l’instance une fois enregistré et jamais réaffiché. Seul le bac à sable du plugin l’ouvre.

Le schéma du plugin vérifie lui-même ce qui est enregistré, dans son bac à sable, champ par champ. Il les lit comme `ctx.settings`, et ceux d’un projet avec `await ctx.projects.settings(projectId)`, analysés, valeurs par défaut appliquées.

## Le reste

| Champ                    | Voir                               |
| ------------------------ | ---------------------------------- |
| `entities`, `properties` | [Données et propriétés](./data)    |
| `http`                   | [Sortir de Toppo](./outside-toppo) |

Actions, gestionnaires d’événements, jobs, routes et écrans se déclarent par les appels du plugin lui-même (`plugin.defineAction`…), chacun dans son fichier : voir les pages suivantes.

## Demander plus

Une nouvelle version qui demande plus que ce qui a été approuvé attend une nouvelle approbation, et s’arrête d’ici là : un besoin, une permission ou une portée plus large, un événement, une propriété, un job ou une route de plus, plus à joindre hors de Toppo ; ou un code qui refuse les réglages déjà enregistrés. Une version qui ne demande pas plus remplace aussitôt la version approuvée. Les permissions qu’une version ne déclare plus quittent tous les rôles.
