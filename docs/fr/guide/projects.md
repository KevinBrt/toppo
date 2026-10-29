# Projets

Chaque ticket appartient à un projet : un produit, un client, une équipe. Un projet a un nom, une couleur et une **clé**, qui commence le numéro de chacun de ses tickets : le projet `WEB` contient `WEB-1`, `WEB-2`…

## Créer un projet

Dans **Projets**, cliquez sur **Nouveau projet**. Il faut la permission _Créer des projets_, que seul le rôle Administrateur a par défaut.

- **Nom** : 80 caractères au plus.
- **Clé** : de 2 à 10 lettres majuscules ou chiffres, commençant par une lettre, et unique dans l’instance. Toppo en propose une à partir du nom (`Website` donne `WEB`, `Portail clients` donne `PC`) jusqu’à ce que vous tapiez la vôtre.
- **Description** : facultative, 1 000 caractères au plus, montrée aux membres du projet.

Vous y avez accès avec votre propre rôle, et Toppo ouvre ses paramètres. Personne d’autre n’y a encore accès : donnez [l’accès](./members#acces-aux-projets) aux autres.

La clé peut changer jusqu’au premier ticket du projet, jamais après : la clé d’un ticket, une fois écrite dans un e-mail ou un commit, doit continuer de le désigner. Les numéros ne sont jamais réutilisés non plus, même après la suppression d’un ticket.

## Les paramètres d’un projet

Ouvrez **Projets**, puis un projet. Ses onglets s’affichent pour ceux qui ont la permission que chacun demande :

| Onglet         | Permission             | Ce qu’il contient                                                                                                |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Général**    | _Paramètres du projet_ | Nom, clé, couleur, description ; l’archivage et la suppression                                                   |
| **Accès**      | _Accès au projet_      | Qui a accès au projet, et avec quel rôle : voir [membres et accès](./members#acces-aux-projets)                  |
| **Statuts**    | _Paramètres du projet_ | Le workflow de l’organisation, ou celui du projet : voir [workflows](./workflows#le-workflow-propre-a-un-projet) |
| **Propriétés** | _Paramètres du projet_ | Les champs qu’ont les tickets du projet : voir [propriétés](./properties#dans-un-projet)                         |

L’écran **Projets** liste les projets que vous gérez, actifs ou archivés, et les cherche par clé ou par nom.

## Archiver un projet

Dans **Général › Zone sensible**, **Archiver** range un projet terminé. Un projet archivé est en lecture seule : ses tickets restent, s’ouvrent et se lisent, mais plus rien n’y change. Il quitte le sélecteur de projet, **Mes tickets** et la recherche. **Désarchiver** le rend tel qu’il était.

## Supprimer un projet

Dans **Général › Zone sensible**, **Supprimer** retire le projet, ses tickets et leur historique, pour de bon. Il faut la permission _Supprimer des projets_, et taper la clé du projet pour confirmer. Archivez plutôt que de supprimer ce que vous voudrez peut-être relire.
