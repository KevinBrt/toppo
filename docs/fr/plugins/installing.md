# Installer et faire tourner

Ce qu’un administrateur fait du zip d’un plugin, et comment Toppo le garde en marche. Gérer les plugins demande la permission _Gérer les plugins_, que seul le rôle Administrateur a.

## Installer

Dans **Paramètres › Plugins**, **Installer un plugin** envoie le zip qu’a produit `toppo plugin build`. Toppo le vérifie avant que quoi que ce soit en tourne : seulement les fichiers d’un zip de plugin, 50 Mo au plus, chaque fichier arrêté dès qu’il dépasse sa limite en se décompressant ; puis ce qu’il déclare, lu dans un bac à sable à part, pour une API de plugin que ce Toppo parle. Une instance a 50 plugins au plus.

Un nouveau plugin attend une approbation, et ne fait rien d’ici là.

## Approuver

La page du plugin montre :

- sa version et l’**empreinte du paquet** (SHA-256), à comparer avec celle que publie son auteur ;
- **ce qu’il fait dans Toppo** (ses besoins), **les permissions qu’il ajoute**, **les propriétés qu’il ajoute**, **ce qu’il écoute**, **ce qu’il joint hors de Toppo**, **ce qu’il fait de lui-même** ;
- ses **réglages**, en formulaire, les secrets gardés secrets une fois enregistrés.

Sous **Où il agit**, choisissez **Tous les projets, présents et à venir** ou **Projets choisis**, et, pour un plugin qui sort de Toppo, les hôtes de votre réseau qu’il peut joindre. **Approuver et activer** approuve le paquet que vous avez examiné : un autre envoyé entre-temps est refusé, pour être examiné à son tour.

L’approbation crée l’utilisateur du plugin et les propriétés qu’il ajoute.

## Mettre à jour

**Installer une nouvelle version** envoie son zip suivant. Une version qui demande plus que ce qui a été approuvé (un besoin, une permission, un événement, une propriété, un job, plus à joindre), ou dont le code refuse les réglages déjà enregistrés, attend une nouvelle approbation, et le plugin s’arrête d’ici là. Une version qui ne demande pas plus prend aussitôt la place de la version approuvée.

## Désactiver et désinstaller

**Désactiver** l’arrête, **Activer** le relance, tel qu’il a été approuvé. **Désinstaller** demande quoi faire de ce qu’il a gardé (ses enregistrements, les valeurs de ses propriétés) : le garder, pour qu’il le retrouve s’il revient, ou le supprimer pour de bon. Son utilisateur reste, pour que ce qu’il a écrit garde son auteur.

## Quand il échoue encore et encore

Un événement ou un job qui échoue compte contre le plugin, une seule fois, quel que soit le nombre de nouvelles tentatives ; une action, jamais. À **10 échecs d’affilée**, Toppo le désactive et prévient par e-mail ceux qui gèrent les plugins, avec ses propres mots, jamais ceux du plugin. Sa page dit pourquoi ; **Activer de nouveau** le relance, son compte remis à zéro. Une exécution qui réussit remet aussi le compte à zéro.

## Limites

| Quoi                               | Limite                                                            |
| ---------------------------------- | ----------------------------------------------------------------- |
| Une action                         | 5 secondes, 64 Ko d’entrée, 300 par minute et par personne        |
| Un événement, un job               | 60 secondes chacun ; les événements dix à la fois                 |
| La mémoire                         | 128 Mo par plugin                                                 |
| Les appels à Toppo d’une exécution | 4 à la fois, 1 000 en attente                                     |
| Les requêtes hors de Toppo         | 60 par minute, 10 secondes, 256 Ko de réponse                     |
| Le zip                             | 50 Mo ; bundle serveur 10 Mo, bundle des écrans 5 Mo, logo 256 Ko |
| Les plugins                        | 50 par instance                                                   |
