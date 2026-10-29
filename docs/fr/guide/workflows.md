# Workflows et statuts

Un **workflow** est la liste des statuts par lesquels passe un ticket, et les passages permis entre eux. L’instance en a un, que suit chaque projet ; un projet peut en prendre une copie et l’adapter. Les deux se gèrent par qui a _Paramètres de l’instance_ ou, pour un projet, _Paramètres du projet_.

## Les statuts

**Paramètres › Statuts** montre le workflow de l’organisation. Un statut a :

- un **nom**, 40 caractères au plus ;
- une **couleur**, parmi huit ;
- **Clôt le ticket** : un ticket est fermé tant que son statut le clôt. Passer à un tel statut le ferme, revenir à un autre le rouvre.

Un statut est le **statut initial**, où commence chaque nouveau ticket : il ne peut pas clore de tickets. **En faire le statut initial**, dans le menu d’un statut, le change. Faites glisser les statuts pour les ordonner : les menus et le tri par statut suivent cet ordre. Un workflow compte 20 statuts au plus.

Sur une instance neuve, le workflow est :

| Statut     | Couleur | Clôt le ticket | Passe à                       |
| ---------- | ------- | -------------- | ----------------------------- |
| Nouveau    | cyan    |                | À traiter, En cours, Résolu   |
| À traiter  | bleu    |                | En cours, Résolu              |
| En cours   | violet  |                | À traiter, En attente, Résolu |
| En attente | ambre   |                | En cours, Résolu              |
| Résolu     | vert    | oui            | À traiter                     |

Nouveau est le statut initial. Renommez, recolorez et réordonnez-les comme parle votre équipe.

## Les passages

**Passages** est soit :

- **Défini** : une grille des passages permis, depuis chaque statut (lignes) vers chaque autre (colonnes). Le menu du statut d’un ticket ne propose que ceux-là, et Toppo refuse tout autre passage, de qui que ce soit, administrateurs compris.
- **Libre** : n’importe quel statut peut suivre n’importe quel autre. Les passages cochés sont gardés, pour quand vous revenez à **Défini**.

Les changements attendent dans une barre en bas de la page jusqu’à ce que vous les **Enregistriez**, tous ensemble, ou les **Annuliez**.

## Retirer un statut

**Retirer**, dans le menu d’un statut, le sort du workflow. Quand des tickets l’ont, Toppo demande à quel statut ils passent ; chaque ticket déplacé garde le changement dans son historique, et personne n’est prévenu. Le statut initial, et le dernier statut restant, ne peuvent pas être retirés.

## Le workflow propre à un projet

Dans l’onglet **Statuts** d’un projet, un projet suit d’abord le workflow de l’organisation, montré en lecture seule, et change avec lui. **Personnaliser pour ce projet** lui en donne une copie :

- ajoutez-y ses propres statuts, réordonnez-les, retirez ceux qu’il n’utilise pas, choisissez son statut initial et ses propres passages ;
- les statuts de l’organisation gardent leur nom, leur couleur et leur clôture : ils se changent dans **Paramètres › Statuts**, pour tous les projets à la fois.

Un statut ajouté plus tard au workflow de l’organisation n’apparaît pas dans les projets qui ont personnalisé le leur : ajoutez-le là aussi s’ils en ont besoin.

**Revenir au workflow de l’organisation** abandonne la copie. Pour chaque statut que l’organisation n’a pas, Toppo demande où vont ses tickets.
