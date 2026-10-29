# Démarrer

Il vous faut Node.js 24, et un Toppo où installer le plugin, sur lequel vous avez le rôle Administrateur.

## Démarrer un plugin

```sh
npm create @toppo-tracker/plugin issue-digest
cd issue-digest
npm install
```

Le nom du dossier est l’**identifiant** du plugin : de 3 à 40 lettres minuscules, chiffres et tirets, commençant par une lettre. Il nomme le plugin partout, ses permissions comprises, et ne change jamais. `create-plugin` écrit :

```
issue-digest/
├── package.json        # sa version, et ses scripts de build et de test
├── tsconfig.json
└── src/
    ├── plugin.ts       # definePlugin() : ce qu’il est et ce qu’il déclare
    └── actions/
        ├── greet.action.ts
        └── greet.action.test.ts
```

Chaque fichier `.ts` de `src/` fait partie du plugin, `src/plugin.ts` en premier : rien à enregistrer. Un fichier de test (`*.test.ts`) est laissé hors du build.

## Sa première action

`src/plugin.ts` déclare le plugin ; son nom et sa description sont des clés de ses messages, en anglais et en français, pour qu’un administrateur les lise dans sa langue :

```ts
import { definePlugin } from '@toppo-tracker/plugin-sdk';

export const plugin = definePlugin({
  id: 'issue-digest',
  name: 'plugin.name',
  description: 'plugin.description',
  apiVersion: '^1.0',
  messages: {
    en: {
      plugin: { name: 'Issue digest', description: 'What Issue digest does, in a sentence.' },
      greeting: 'Hello, {name}!',
    },
    fr: {
      plugin: { name: 'Issue digest', description: 'Ce que fait Issue digest, en une phrase.' },
      greeting: 'Bonjour, {name} !',
    },
  },
});
```

`src/actions/greet.action.ts` définit une action que toute personne connectée peut lancer, et qui répond dans sa langue :

```ts
import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

export const greet = plugin.defineAction({
  name: 'greeting.say',
  access: 'authenticated',
  input: z.object({ name: z.string().trim().min(1).max(100) }),
  handler: (ctx, { name }) => Promise.resolve({ text: ctx.t('greeting', { name }) }),
});
```

## Le tester

```sh
npm test
```

Le test lance l’action contre un Toppo en mémoire, comme le ferait une personne, sans instance :

```ts
const toppo = createTestToppo(plugin, { locale: 'fr' });
const someone = toppo.createUser();

expect(await someone.run(greet, { name: ' Ada ' })).toStrictEqual({ text: 'Bonjour, Ada !' });
```

Voir [tester](./testing).

## Le construire

```sh
npm run typecheck
npm run build
```

`toppo plugin build` assemble le plugin dans `dist/issue-digest-0.1.0.zip`, la version tirée de `package.json`, puis lit ce qu’il déclare comme Toppo le fera, et l’affiche. Il refuse ce que Toppo refuserait, avec la raison : un import des modules de Node, un manifeste que Toppo ne prendrait pas, un bundle trop lourd.

## L’installer

Dans Toppo, ouvrez **Paramètres › Plugins**, cliquez sur **Installer un plugin** et choisissez le zip. Le plugin attend une approbation : lisez ce qu’il déclare, choisissez les projets où il agit, puis **Approuver et activer**. Voir [installer et faire tourner](./installing).

Ensuite : [le manifeste](./manifest), tout ce qu’un plugin peut déclarer.
