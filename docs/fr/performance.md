# Performances de la liste des tickets et de la recherche

La liste des tickets, sa recherche et la palette de recherche sont vérifiées sur une base de taille réaliste, avec les plans que PostgreSQL exécute vraiment. Relancez la vérification après avoir changé leurs requêtes ou les index de `issues`.

## Lancer la vérification

```sh
npm run db:up                    # le serveur de test (port 54330) doit tourner
npm run perf:issues              # construit le serveur, remplit, rejoue, rend compte (environ 2 minutes)
npm run perf:issues -- --reuse   # rejoue sur la base remplie par le dernier lancement
```

`scripts/src/perf/explain-issues.ts` :

1. crée `toppo_perf` sur le serveur de test, laisse le serveur construit la migrer, l’installe et invite un membre (Grace, rôle Équipe) par les vrais parcours ;
2. la remplit avec `scripts/src/perf/seed-issues.sql`, puis `VACUUM ANALYZE`, comme l’autovacuum laisse une table au repos ;
3. active `auto_explain` (analysé, avec les buffers) pour cette base seulement, et rejoue les requêtes de la liste et de la palette, en administrateur et en membre, chacune deux fois ;
4. écrit chaque plan dans `postgres.log` et, requête par requête, les plans des requêtes de tickets dans `plans.txt` (les deux dans le dossier temporaire du système, `toppo-perf`) ;
5. sans `auto_explain`, affiche le meilleur aller-retour de chaque requête sur cinq.

## Le jeu de données

| Quoi                 | Combien                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tickets              | 100 012, 170 Mo avec leurs index ; 9 000 mots vers lesquels corriger les fautes                                 |
| Propriétés           | une version sur 80 %, une plateforme sur 40 %, une échéance et une estimation sur 30 %, une case cochée sur 5 % |
| Projets              | 30 : un de 40 000 tickets, un de 20 000, 28 d’environ 1 400                                                     |
| Personnes            | 202, chacune dans environ six projets ; Grace dans dix, dont le grand                                           |
| Fermés               | deux tickets sur trois                                                                                          |
| Non assignés         | un sur quatre                                                                                                   |
| Priorités            | basse 20 %, normale 50 %, haute 20 %, urgente 10 %                                                              |
| Titres, descriptions | de 4 à 9 mots ; de 2 à 7 phrases                                                                                |

Les mots sont tirés comme dans un vrai texte : une centaine de mots anglais et français (accents compris), les premiers bien plus souvent que les derniers, et un mot sur dix un code d’erreur (`E1000` à `E9999`), rare par nature. « erreur » est dans 57 % des tickets, « facture » dans 25 %, `E4821` dans 60.

## Résultats

Allers-retours à travers le serveur (session, projet, permissions et JSON compris : environ 13 ms pour rien), meilleur de cinq, sur Docker Desktop pour Windows, PostgreSQL 18 :

| Requête                                                                  | Temps                |
| ------------------------------------------------------------------------ | -------------------- |
| Liste du grand projet : ouverts, les plus récents d’abord (par défaut)   | 15 ms                |
| La même, en membre                                                       | 15 ms                |
| Tous les tickets, page 300                                               | 44 ms                |
| Triés par dernière modification / par titre / par personne assignée      | 24–32 ms             |
| Regroupés par statut, triés par priorité                                 | 33 ms                |
| Une personne assignée / les siens                                        | 15 ms                |
| Recherche : un mot courant / un mot plus rare / un code d’erreur         | 57 / 37 / 17 ms      |
| Recherche : dans les mots (`chargem`) / une clé (`BIG-12345`)            | 23 / 12 ms           |
| Recherche avec une faute (`paiment`)                                     | 51 ms                |
| Une version / sans version / une plateforme / une case cochée            | 20 / 23 / 20 / 21 ms |
| Deux filtres de propriétés (une version et une plateforme)               | 20 ms                |
| Échéance dans le mois / une estimation de 3 à 5                          | 38 / 44 ms           |
| Palette : un mot courant / un mot plus rare / un code d’erreur / une clé | 61 / 41 / 14 / 12 ms |
| Palette : une clé écrite librement (`mid777`) / un numéro seul           | 12 / 13 ms           |
| Palette : une faute (`facutre`)                                          | 40 ms                |
| Palette en membre : un mot courant / deux mots / avec une faute          | 51 / 44 / 44 ms      |
| Mes tickets                                                              | 16 ms                |

## Ce que les plans ont appris

- **Trier dans l’ordre où les index se lisent.** `desc nulls last` sur une colonne jamais nulle ne correspond pas à un btree lu à l’envers (`desc nulls first`) : la liste par défaut lisait toute la table et triait 14 000 lignes pour en montrer 50 (38 ms pour la requête, 0,4 ms maintenant). Seule la personne assignée, qui peut manquer, trie `nulls last`.
- **Planifier chaque exécution avec ses propres valeurs.** postgres.js prépare les requêtes, et après cinq exécutions PostgreSQL peut garder un plan générique, fait sans les valeurs : aveugle à la rareté d’un mot cherché, il choisissait un parcours de toute la table. Les connexions de Toppo fixent `plan_cache_mode = force_custom_plan` (`packages/db/src/database.ts`).
- **Une liste cherchée ne suit jamais l’index des numéros.** PostgreSQL estime mal les mots tapés en partie (`e4821:*`) ; lire l’index à l’envers jusqu’à remplir une page parcourait tout le grand projet pour un code trouvé 27 fois (240 ms, et plus pour un mot introuvable). Triée par numéro, une liste cherchée trie sur `number + 0`, qu’aucun index ne porte : les résultats sont toujours rassemblés d’abord par les index de recherche. Un mot très courant coûte un peu plus (61 ms au lieu de 45), un mot rare bien moins.
- **Classer les meilleurs avant d’aller chercher leurs champs.** La palette classait et joignait les champs de chaque résultat quand PostgreSQL en croyait peu ; elle choisit maintenant les dix meilleurs à partir des tickets et de leurs projets seuls, puis joint les champs de ces dix-là (141 ms pour deux mots courants, 58 ms maintenant).
- **Compter depuis un index.** Chaque liste montre combien de tickets correspondent ; compter les tickets ouverts d’un projet lisait la table (14 ms pour le grand projet). `issues (project_id, closed_at)` (migration 0025) les compte depuis l’index seul (1,4 ms).
- **Ne calculer que les lignes de la page.** Un décalage produit quand même chaque ligne avant la page, colonnes calculées par sous-requêtes comprises : la page 300 construisait les labels et les valeurs de propriétés des 15 000 tickets qu’elle sautait (1 077 ms). La liste choisit maintenant d’abord les identifiants de la page, puis lit ces 50 tickets avec leurs labels et leurs valeurs (63 ms).
- **Vérifier l’accès une fois par projet.** La palette vérifiait l’accès de l’appelant pour chaque ticket trouvé : 27 000 vérifications pour deux mots courants en membre (149 ms). Elle lit maintenant d’abord les projets que l’appelant lit, puis garde leurs tickets projet par projet (44 ms).
- **Corriger les fautes vers les mots que les tickets ont.** `issue_words` (migrations 0039, 0040 et 0044) garde les mots des tickets, projet par projet, avec un index trigramme : un mot tapé qu’aucun des tickets que la personne lit en entier ne contient ni ne commence est rapproché du plus proche de leurs projets par distance d’édition (`similar_issue_words()`, environ 4 ms par mot), puis cherché avec eux. Les mots que les tickets ont ne sont jamais corrigés : une recherche juste ne coûte rien de plus.
- **Filtrer les propriétés par l’index de leurs valeurs.** Options, personnes et cases sont des tests d’inclusion sur `issues.properties` (`@>`), auxquels répond son index GIN (`jsonb_path_ops`) ; « sans valeur » est `@?` sur le chemin de la propriété. Les plages de nombres et de jours comparent la valeur de chaque ticket dans le projet, protégées par son type JSON, les jours comme texte dans la collation `C`.

## Limites connues

- Les pages s’atteignent par décalage : la page 300 du grand projet lit les 15 000 tickets qui la précèdent (44 ms). Les pages profondes sont rares ; une pagination par clé supprimerait ce coût si elles devenaient courantes.
- Une plage de nombres ou de jours lit chaque ticket du projet que gardent les autres filtres : environ 45 ms à 40 000 tickets, proportionnellement au-delà. Un index d’expression par propriété le supprimerait, au prix d’un index par propriété.
- Trier par une colonne d’une autre table (priorité, statut, catégorie, personnes, titre) trie chaque ticket correspondant du projet : de 30 à 60 ms à 40 000 tickets, proportionnellement au-delà.
- Chercher un mot présent dans la moitié des tickets les classe tous : environ 60 ms à 100 000 tickets, proportionnellement au-delà. Les mots tapés lettre par lettre attendent une pause de la frappe (300 ms dans la liste, 200 ms dans la palette).
