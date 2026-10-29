# Trouver des tickets

## La liste des tickets

**Tickets** liste les tickets d’un projet, 50 par page : ses tickets ouverts, les plus récents d’abord, sauf si vous choisissez autrement. Changez de projet depuis la barre du haut. Ce que montre la liste grandit avec l’écran : la clé, le sujet et le statut toujours, puis la priorité, la dernière modification et la personne assignée, puis le demandeur et la catégorie. Les propriétés réglées pour s’afficher dans la liste apparaissent à côté du sujet, avec les étiquettes du ticket.

Chaque choix ci-dessous est gardé dans l’adresse de la page : copiez-la pour partager exactement ce que vous voyez, ou ajoutez-la à vos favoris. Toppo n’a pas de vues enregistrées à lui ; l’adresse est la vue.

## Les filtres

La barre d’outils resserre la liste, de gauche à droite :

- **Rechercher des tickets** : des mots du sujet ou de la description (voir [recherche](#recherche)).
- **État** : **Ouverts** (par défaut), **Fermés** ou **Tous**. Un ticket est fermé tant que son statut le clôt.
- **Statut**, **Priorité**, **Catégorie**, **Étiquettes** : cochez une valeur ou plusieurs.
- **Assigné à** : **Moi**, **Non assigné**, ou des personnes. **Demandeur** : **Moi**, ou des personnes, pour ceux qui voient tous les tickets du projet.
- **+ Propriété** : un filtre sur l’une des propriétés du projet. Listes, choix multiples et personnes proposent leurs valeurs et **Aucune** ; une case est **Cochée** ou **Non cochée** ; nombres et dates prennent une plage, **De** et **À**, l’un des deux laissé vide si vous voulez. Les lignes de texte ne se filtrent pas.

Les valeurs d’un même filtre s’ajoutent (ce statut _ou_ celui-là) ; des filtres différents se resserrent l’un l’autre (ce statut _et_ cette personne assignée). **Effacer les filtres** revient aux tickets ouverts, en gardant le tri.

## Trier et regrouper

Cliquez sur un en-tête de colonne pour trier par elle, de nouveau pour inverser : par clé, sujet, demandeur, personne assignée, catégorie, priorité, statut ou dernière modification. Statuts et catégories se trient dans l’ordre que leur donnent les paramètres, les priorités de la plus urgente, les personnes par nom, les non assignés en dernier. Sur un téléphone, le menu **Trier** fait de même.

**Grouper** rassemble les tickets par **Statut**, **Priorité** ou **Assigné**, chaque groupe avec son nombre. Les tickets sont triés dans chaque groupe.

## Recherche

La recherche lit le sujet et la description des tickets que vous pouvez voir :

- **Des mots, où qu’ils commencent** : `crash sav` trouve « Crash on save » ; chaque mot tapé doit y être. Majuscules et accents ne comptent pas.
- **Dans le sujet** : une partie d’un mot ou un chemin, comme `/api/login`.
- **Les fautes de frappe** : un mot qu’aucun ticket n’a est lu comme les plus proches de ceux qu’ont les tickets du projet (`facutre` trouve « facture »), une lettre fausse dans un mot court, deux dans un plus long. Seulement dans les projets où vous voyez tous les tickets.
- **Les clés**, de quelque façon qu’on les tape : `WEB-42`, `web 42`, `web42`, `#42` ou `42`.

Dans la liste, la recherche reste dans le projet et dans le tri choisi. La [palette de commandes](./getting-around#la-palette-de-commandes) cherche dans tous les projets que vous voyez et classe ce qu’elle trouve : le ticket désigné par sa clé d’abord, puis les mots tels que tapés, puis les fautes.

## Plusieurs tickets à la fois

Cochez des tickets dans la liste, ou toute la page, et une barre propose ce qu’on peut changer pour tous : le statut, la priorité, la catégorie ou la personne assignée, une étiquette à ajouter ou retirer, ou leur suppression, chaque action proposée si vous avez la permission qu’elle demande sur un ticket. Chaque action dit ce qui va se passer et demande confirmation ; elle s’applique à 100 tickets au plus.

Chaque ticket prend le changement comme s’il était fait sur lui seul : son historique le garde, et ceux qui le suivent sont prévenus. Ceux qui ne peuvent pas le prendre (un statut que leur workflow ne permet pas depuis le leur, un ticket supprimé entre-temps) sont nommés ensuite, avec la raison, et restent cochés.
