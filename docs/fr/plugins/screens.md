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

## Ce qu’un écran ne peut pas faire

Un écran tourne dans un cadre isolé sans origine, sous une politique de sécurité de contenu qui n’atteint rien :

- **Pas de réseau** : il demande à son plugin, par ses actions, tout ce qu’il affiche.
- **Pas de styles à lui** : il ne livre aucun CSS, et la feuille de style de Toppo ne contient que les classes de Toppo. Mettez-le en page avec `Stack` et `Row`, jamais avec `className`.
- **Pas de navigation** : un formulaire appelle `event.preventDefault()` ; les liens passent par `IssueLink`, `PageLink` ou `open`. Un cadre qui charge un autre document est fermé.

Un composant qui lève une erreur affiche à sa place les mots de Toppo. La hauteur du cadre suit son contenu.
