# Propriétés et champs

Au-delà de son statut, un ticket se décrit par des champs : une **priorité**, une **catégorie**, des **étiquettes**, et les **propriétés** qu’ajoute votre équipe, comme une version, une plateforme, une échéance ou une estimation. Ils se gèrent dans **Paramètres › Propriétés des tickets**, par qui a _Paramètres de l’instance_ ; chaque projet les adapte dans son propre onglet **Propriétés**, avec _Paramètres du projet_.

La règle est la même que pour les [workflows](./workflows) : l’instance fixe les valeurs par défaut, et chaque projet adapte ce dont il a besoin, une propriété à la fois. Priorités, catégories et étiquettes font exception : une seule liste pour toute l’instance.

## Les priorités

Quatre niveaux, de bas à urgent, chacun avec ses barres et sa couleur : **Basse**, **Normale**, **Haute** et **Urgente**. Leur nombre et leurs couleurs sont fixes, pour qu’« urgent » se lise pareil partout ; renommez-les comme votre équipe les dit, et choisissez celui que prennent les nouveaux tickets. Normale est la valeur par défaut.

## Les catégories

Le genre du ticket : **Bug**, **Demande** ou **Question** sur une instance neuve, Demande étant la valeur par défaut. Une instance a de 1 à 20 catégories, chacune avec un nom, une couleur et un ordre, et l’une d’elles par défaut. Une catégorie reste tant que des tickets l’ont.

## Les étiquettes

Des repères libres, autant que vous voulez par ticket : un composant, un client, un sprint. Chacune a un nom et une couleur, 100 au plus ; une instance neuve n’en a aucune. Retirer une étiquette l’enlève de ses tickets, dont l’historique garde son nom. Les étiquettes sont les mêmes dans tous les projets.

## Les propriétés

**Nouvelle propriété** en ajoute une, de l’un des sept types :

| Type               | Contient                          |
| ------------------ | --------------------------------- |
| **Liste**          | Une option d’une liste            |
| **Choix multiple** | Plusieurs options d’une liste     |
| **Texte**          | Une ligne, 500 caractères au plus |
| **Nombre**         | Un nombre, décimales permises     |
| **Date**           | Un jour du calendrier             |
| **Personne**       | Quelqu’un qui a accès au projet   |
| **Case à cocher**  | Cochée ou non                     |

Une propriété garde son type : pour le changer, créez-en une autre. Chaque propriété choisit aussi :

- **Affichée dans la liste des tickets** : sa valeur apparaît à côté du sujet de chaque ticket.
- **Demandée à la création d’un ticket** : elle figure sur le formulaire d’un nouveau ticket.
- **Obligatoire** : il faut la remplir au signalement d’un ticket (seulement pour une propriété demandée alors ; jamais pour une case à cocher).

Listes et choix multiples ont de 1 à 100 options, chacune avec un nom et une couleur. Retirer une option l’enlève de ses tickets ; leur historique garde son nom. **Supprimer la propriété** retire ses valeurs de chaque ticket, chaque changement gardé dans leur historique.

Une instance a 20 propriétés, et chaque projet 20 de plus à lui. Chaque ticket se filtre par ses propriétés, sauf les lignes de texte : voir [les filtres](./finding-issues#les-filtres).

## Dans un projet

L’onglet **Propriétés** d’un projet liste les champs de l’organisation, puis les siens.

- **La priorité et la catégorie** peuvent être **Masquées dans ce projet** (ses tickets gardent la valeur par défaut) ou **Obligatoires à la création** (rien n’est présélectionné : qui signale choisit).
- **Une propriété de l’organisation** peut être **Masquée dans ce projet** : elle quitte les formulaires, la liste et les tickets du projet, et ses valeurs attendent, intactes. Une liste ou un choix multiple peut prendre des **Options propres**, qui partent d’une copie de celles de l’organisation ; revenir aux options de l’organisation retire celles du projet de ses tickets. Son nom et ses réglages restent ceux de l’organisation.
- **Les propriétés propres à ce projet** se créent, se règlent et se suppriment comme celles de l’organisation, et n’existent que dans ce projet.
