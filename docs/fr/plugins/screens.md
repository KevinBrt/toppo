# Les écrans

Les écrans d’un plugin sont des composants React, dans des fichiers `.tsx`, dessinés avec les composants de Toppo : ils ressemblent à Toppo, dans la langue de la personne, et n’atteignent leur plugin que par ses actions.

## Pages et panneaux

<<< @/../plugins/time-tracking/src/screens/time-report.page.ts

<<< @/../plugins/time-tracking/src/screens/issue-time.panel.ts

`plugin.definePage({ name, zone, access, title, nav?, component })` place une page :

| `zone`               | Où elle s’affiche                                                    |
| -------------------- | -------------------------------------------------------------------- |
| `'main'`             | Dans la barre latérale principale, avec `nav: { label, icon }`       |
| `'settings'`         | Dans les Paramètres, dans une section au nom du plugin               |
| `'project.settings'` | Comme onglet des paramètres d’un projet, dans les projets où il agit |

`plugin.definePanel({ name, on: 'issue', access, title, component })` affiche un panneau sur la page d’un ticket, sous son titre, dans les projets où le plugin agit ; il demande `issue.read`.

- **`access`** : `'authenticated'` ou `{ permission }`, l’une de celles du plugin ou l’un de ses besoins. Pour l’onglet d’un projet ou le panneau d’un ticket, elle est vérifiée dans ce projet. Qui ne peut pas ouvrir un écran n’en voit pas non plus l’entrée.
- **`title`**, **`nav.label`** : des clés de ses messages. **`nav.icon`** : `bar-chart`, `briefcase`, `calendar`, `clock`, `database`, `file-text`, `flag`, `folder`, `gauge`, `list`, `puzzle`, `settings`, `tag`, `timer`, `users` ou `wallet`.
- **`component`** : `() => import('../web/x.tsx').then((module) => module.X)`, pour que son code ne soit que dans le bundle des écrans.

20 pages et 5 panneaux au plus, 8 entrées par zone de la barre latérale.

## Dessiner un écran

```tsx
import {
  Page,
  Stack,
  Stat,
  Table,
  useActionQuery,
  useScreen,
  useT,
} from '@toppo-tracker/plugin-ui';
import { listEntries } from '../actions/list-entries.action.ts';
import { plugin } from '../plugin.ts';

export function IssueTimePanel() {
  const t = useT(plugin);
  const { issue } = useScreen();
  const entries = useActionQuery(
    listEntries,
    { issueId: issue?.id ?? '' },
    { enabled: issue !== null },
  );
  return (
    <Stack>
      <Stat label={t('panels.issueTime.total')} value={entries.data?.total ?? 0} />…
    </Stack>
  );
}
```

`@toppo-tracker/plugin-ui` donne :

| Composants                                                                  | Pour                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Page`, `Section`                                                           | Le cadre d’une page et son titre unique ; une partie titrée de celle-ci                |
| `Stack`, `Row`                                                              | La mise en page : l’un sous l’autre, ou côte à côte, avec un `gap`                     |
| `Table`, `Stat`, `Badge`, `Alert`, `EmptyState`                             | Afficher                                                                               |
| `Field`, `Input`, `Textarea`, `Select`, `Switch`, `DurationInput`, `Button` | Les formulaires : `Field` libelle son contrôle et y relie sa description et son erreur |
| `PersonName`, `IssueLink`, `PageLink`                                       | Quelqu’un par son nom ; un ticket ou une autre de ses pages, ouverts dans Toppo        |

| Hooks                                        | Répondent                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `useActionQuery(action, input, { enabled })` | `{ data, error, isLoading, refetch }` : la réponse d’une action, demandée à l’affichage                                  |
| `useActionMutation(action)`                  | `{ run, isPending, error }` : `run` vérifie l’entrée avec le schéma de l’action, la lance, puis redemande chaque requête |
| `useScreen()`                                | `{ locale, user, issue, project, search, setSearch, open }`                                                              |
| `useT(plugin)`                               | `t(clé, params?)`, les messages du plugin dans la langue de la personne                                                  |
| `usePeople(ids)`                             | Leurs noms, `null` pour quelqu’un que la personne ne peut pas voir                                                       |

L’`error` d’une action qui a échoué est une `ScreenError` : son `code` est la clé de message du plugin (`ctx.fail`), ou l’un des codes de Toppo (`FORBIDDEN`, `VALIDATION_FAILED` avec ses `issues`). `setSearch` garde les choix d’une page dans l’adresse de Toppo, pour qu’elle se partage ; `open` ouvre un ticket ou une autre de ses pages.

## Graphiques

| Composant                            | Montre                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<BarChart title bars format? />`    | Un chiffre par chose, en barres horizontales. `bars` : `{ key, label, value, limit? }` ; une limite (un budget) est marquée en travers de sa barre, et la dépasser est dit en mots |
| `<LineChart title points format? />` | Un chiffre dans le temps, en ligne. `points` : `{ key, label, value }`, dans l’ordre ; le survol, ou les flèches du clavier, lisent chaque point                                   |
| `<Meter label value max format? />`  | Un chiffre face à son maximum : les jours passés face à un budget                                                                                                                  |

`format` écrit chaque valeur, comme `(days) => t('days', { days })`. Chacun est dessiné aux couleurs de Toppo, et dit aux lecteurs d’écran sous forme de tableau (un `meter` pour `Meter`). Le rapport de temps dessine les jours de chaque projet face à son budget avec un `BarChart`.

## Dialogues

<<< @/../plugins/time-tracking/src/screens/log-time.dialog.ts

`plugin.defineDialog({ name, access, title, component, input, result?, size?, side? })` déclare un écran qu’un autre de ses écrans ouvre par-dessus la page : le dialogue de Toppo, sous son `title` et le nom de son plugin, le tient dans un cadre à lui.

- **`input`** : le schéma de ce que lui passe l’écran qui l’ouvre, 4 Ko de JSON au plus.
- **`result`** : le schéma de ce avec quoi il se ferme, 16 Ko au plus. Sans lui, il se ferme sans rien.
- **`size`** : `'small'`, `'medium'` (par défaut) ou `'large'`. **`side: true`** l’ouvre sur le côté de la page, plutôt qu’en son milieu.
- **`access`** : comme celui d’une page, vérifié à l’ouverture.

10 dialogues au plus, nommés autrement que les pages et panneaux du plugin. L’écran qui l’ouvre :

<<< @/../plugins/time-tracking/src/web/time-report-page.tsx#log-time

Et l’écran du dialogue lui-même, qui lit ce avec quoi il a été ouvert, puis se ferme :

<<< @/../plugins/time-tracking/src/web/log-time-dialog.tsx#dialog

| Hooks                    | Répondent                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `useDialog(dialog)`      | `{ open(input) }` : ce avec quoi le dialogue s’est fermé, lu par son schéma `result` ; `undefined` quand la personne l’a écarté |
| `useDialogInput(dialog)` | Dans le dialogue, ce avec quoi il a été ouvert, lu par son schéma `input`                                                       |
| `useCloseDialog(dialog)` | Dans le dialogue, `close(result)` : son ouvreur reçoit `result`, vérifié d’abord par le schéma `result`                         |

Échap, le bouton de fermeture de Toppo ou un clic à côté l’écartent. Un dialogue n’en ouvre pas d’autre.

## Ce que Toppo dessine par-dessus la page

Un cadre dessine mal certaines choses : ce qui le déborde, ce que la personne doit distinguer des mots du plugin. Un écran demande à Toppo de les dessiner, et chacune dit quel plugin l’a demandée :

| Hook ou composant               | Dessine                                                                                                                                           | Répond                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `useConfirm()`                  | `confirm({ title, description?, confirmLabel?, tone? })` : une confirmation ; `tone: 'danger'` pour ce qui ne se défait pas                       | `true` une fois confirmé, `false` sinon                                    |
| `<Menu label items onSelect />` | Un bouton, et son menu à côté, jamais coupé par le cadre. `items` : `{ id, label, tone?, disabled? }`, 20 au plus                                 | `onSelect(id)`                                                             |
| `usePickIssue()`                | `pick({ projectId? })` : la recherche de Toppo dans les tickets que la personne voit, dans les projets où agit le plugin. Il demande `issue.read` | `{ id, key, title, projectId, projectKey }`, ou `null`                     |
| `usePickPeople()`               | `pick({ projectId?, multiple? })` : la recherche de Toppo dans les personnes d’un projet où agit le plugin, dont la personne lit tous les tickets | Celles choisies, `{ id, name }[]` : une sauf `multiple`, aucune si écartée |

Toppo cherche : l’écran n’apprend que ce que la personne a choisi. Il dessine une chose à la fois par écran, pour l’écran que la personne utilise seulement, puis rend le focus à côté de l’écran : il en dessine une autre quand la personne utilise de nouveau l’écran. Demandé autrement, il refuse avec `OVERLAY_REFUSED`. Un menu s’ouvre au-dessus du cadre de l’écran lui-même.

## Ce qu’un écran ne peut pas faire

Un écran tourne dans un cadre isolé sans origine, sous une politique de sécurité de contenu qui n’atteint rien :

- **Pas de réseau** : il demande à son plugin, par ses actions, tout ce qu’il affiche.
- **Pas de styles à lui** : il ne livre aucun CSS, et la feuille de style de Toppo ne contient que les classes de Toppo. Mettez-le en page avec `Stack` et `Row`, jamais avec `className`.
- **Pas de navigation** : un formulaire appelle `event.preventDefault()` ; les liens passent par `IssueLink`, `PageLink` ou `open`. Un cadre qui charge un autre document est fermé.

Un composant qui lève une erreur affiche à sa place les mots de Toppo. La hauteur du cadre suit son contenu.
