# Rôles et permissions

Ce que chacun peut faire vient de son **rôle**, fait des permissions que vous choisissez. Toppo ne regarde jamais le nom d’un rôle : renommez les rôles comme parle votre organisation, changez ce qu’ils permettent, ou créez les vôtres. Ils se gèrent dans **Paramètres › Rôles et permissions**, par les administrateurs.

## Les rôles de départ

| Rôle               | Ce qu’il permet                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Administrateur** | Tout, aujourd’hui et à l’avenir. Il ne se modifie ni ne se supprime, et Toppo garde toujours un administrateur actif.                        |
| **Équipe**         | Voit tous les tickets des projets auxquels il a accès ; crée, modifie et assigne des tickets, et commente. Prévenu de chaque nouveau ticket. |
| **Demandeur**      | Ne voit que les tickets qu’il a signalés ; signale des tickets et commente. Pour vos clients ou le reste de votre organisation.              |

Équipe et Demandeur sont un point de départ : modifiez-les, renommez-les ou supprimez-les.

## Les permissions

La matrice montre tous les rôles côte à côte (un à la fois sur un téléphone). Les changements attendent dans une barre jusqu’à ce que vous les **Enregistriez**, tous ensemble.

**Tickets**, **Conversation** et **Projet** s’appliquent dans chaque projet auquel la personne a accès :

| Permission                 | Ce qu’elle permet                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| _Voir les tickets_         | **Aucun**, **Les siens** (les tickets qu’on a signalés) ou **Tous**                                                                         |
| _Créer des tickets_        | Signaler des tickets                                                                                                                        |
| _Modifier les tickets_     | Changer le sujet, la description, le statut, la priorité, la catégorie, les étiquettes et les propriétés d’un ticket ; marquer les doublons |
| _Assigner les tickets_     | Choisir à qui un ticket est assigné, et remplir les propriétés de type Personne                                                             |
| _Supprimer des tickets_    | Supprimer des tickets pour de bon                                                                                                           |
| _Commenter_                | Écrire des commentaires, et modifier les siens                                                                                              |
| _Modérer les commentaires_ | Supprimer les commentaires de n’importe qui                                                                                                 |
| _Paramètres du projet_     | Renommer ou archiver un projet, adapter son workflow et ses propriétés                                                                      |
| _Accès au projet_          | Choisir qui a accès à un projet, et avec quel rôle                                                                                          |

**Organisation** s’applique à toute l’instance :

| Permission                 | Ce qu’elle permet                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| _Gérer les membres_        | Inviter des personnes, changer leur rôle, les désactiver ou les supprimer                      |
| _Créer des projets_        | Créer des projets                                                                              |
| _Supprimer des projets_    | Supprimer des projets pour de bon                                                              |
| _Paramètres de l’instance_ | Le workflow, les propriétés, les priorités, les catégories et les étiquettes de l’organisation |
| _Paramètres e-mail_        | Le serveur d’envoi (administrateurs uniquement)                                                |
| _Gérer les rôles_          | Cet écran (administrateurs uniquement)                                                         |

**Nouveaux tickets**, sous **Notifications**, n’est pas une permission : il prévient les membres du rôle de chaque nouveau ticket qu’ils peuvent voir.

## Un rôle dans un projet

Chaque personne a son propre rôle, qui lui donne ses permissions d’organisation partout, et ses permissions de projet dans chaque projet auquel elle a accès. Un projet peut lui donner un autre rôle : il remplace ses permissions de projet là, et seulement là. Un demandeur peut ainsi être membre à part entière d’un projet. Voir [membres et accès](./members#acces-aux-projets).

## Créer et supprimer des rôles

**Nouveau rôle** demande un nom et une couleur ; un nouveau rôle ne permet rien tant que vous ne cochez pas ses permissions. Une instance a 20 rôles au plus. Un rôle ne se supprime pas tant qu’un membre, une invitation ou un projet l’utilise encore : la fenêtre dit lesquels.

## Jamais plus que ce qu’on a

Qui donne un accès ne peut pas donner plus que ce qu’il a : dans un projet, vous ne donnez, ou ne changez le rôle de quelqu’un qui a, qu’un rôle dont vous avez vous-même les permissions de projet là. Seuls les administrateurs donnent le rôle Administrateur, ou agissent sur un administrateur. Personne ne change son propre rôle.
