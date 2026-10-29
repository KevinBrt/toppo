# Tickets

Un ticket, c’est quelque chose à faire ou à quoi répondre : un bug, une demande, une question. Il a une clé (`WEB-42`), un sujet, une description, et les champs qui le classent : son statut, sa priorité, sa catégorie, ses étiquettes, la personne assignée et les propriétés du projet. La personne qui l’a signalé est son **demandeur**.

## Signaler un ticket

Dans **Tickets**, choisissez le projet dans la barre du haut, puis cliquez sur **Nouveau ticket**. Il faut la permission _Créer des tickets_.

- **Sujet** : obligatoire, 200 caractères au plus.
- **Description** : facultative, écrite en [Markdown](#la-description), 50 000 caractères au plus.
- **Pièces jointes** : des fichiers à envoyer avec, déposés sur le formulaire ou choisis.
- **Propriétés** : la priorité et la catégorie, préremplies avec leur valeur par défaut sauf si le projet vous demande de choisir ; et les propriétés que le projet demande au signalement d’un ticket, certaines obligatoires.

**Créer le ticket** l’ouvre. Il commence au statut initial du workflow, sans personne assignée : la personne assignée et les étiquettes se choisissent sur le ticket lui-même.

## La page d’un ticket

L’en-tête porte le sujet, qui l’a ouvert et quand, son statut et **Suivre**. Le menu du statut ne propose que les statuts que le workflow permet ensuite. **Plus d’actions** le marque comme doublon ou le supprime.

Le panneau **Propriétés** montre et change son statut, sa priorité, la personne assignée, sa catégorie, ses étiquettes et ses propriétés. Un changement s’affiche aussitôt ; si Toppo le refuse, il est remis tel qu’il était, avec la raison.

| Pour changer                                         | Il faut                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| Le sujet, la description, les fichiers de la demande | En être le demandeur, ou _Modifier les tickets_                  |
| Statut, priorité, catégorie, étiquettes, propriétés  | _Modifier les tickets_, même sur un ticket que vous avez signalé |
| La personne assignée, une propriété de type Personne | _Assigner les tickets_ ; la personne doit avoir accès au projet  |

## La description

La description s’écrit en Markdown, affiché tel qu’il se lira : gras, italique, listes, liens, code, citations, tableaux et titres. La barre d’outils et les raccourcis habituels (`**`, `-`, `#`) l’écrivent pour vous.

Les liens commencent par `https://`, `http://` ou `mailto:`. Le HTML n’est pas interprété, et les images ne sont jamais chargées : elles s’affichent comme des liens. Joignez plutôt une image comme fichier.

## Les commentaires

Écrivez dans la zone au-dessus de l’activité, puis **Envoyer**. Il faut la permission _Commenter_. Un commentaire est du texte brut, retours à la ligne gardés, 20 000 caractères au plus, avec des fichiers si vous voulez.

- **@nom** mentionne quelqu’un : la liste propose les personnes qui voient le ticket. Une personne mentionnée est notifiée, qu’elle suive le ticket ou non. Un commentaire mentionne 20 personnes au plus.
- Le menu **…** d’un commentaire le modifie (son auteur) ou le supprime (son auteur, ou qui a _Modérer les commentaires_). Un commentaire supprimé ne laisse aucune trace.

## Les pièces jointes

Déposez des fichiers sur un ticket ou un commentaire, ou cliquez sur **Joindre des fichiers** : images (PNG, JPEG, WebP), PDF, texte et journaux, CSV, Word, Excel, PowerPoint et leurs équivalents OpenDocument. Chacun est vérifié par le serveur, jusqu’à 20 Mo par défaut, 20 fichiers sur la demande et 20 sur chaque commentaire.

Images et fichiers texte s’ouvrent dans l’application, les PDF dans la visionneuse du navigateur ; tout fichier peut se télécharger. Un fichier se retire par qui l’a joint ou par qui a _Modifier les tickets_ ; les fichiers d’un commentaire, par qui peut supprimer le commentaire.

## L’activité

Sous la description, commentaires et changements se suivent, les plus récents d’abord : qui a changé quoi, et quand. Les changements faits ensemble forment une seule entrée, avec leurs **Détails**. L’historique garde le sujet, la description (le fait qu’elle a été modifiée, pas son ancien texte), chaque champ, les marques de doublon, les commentaires et les fichiers joints.

## Suivre un ticket

Son demandeur, la personne assignée et ceux qui commentent suivent un ticket d’eux-mêmes ; quiconque le voit peut le **Suivre**, ou **Ne plus suivre** pour de bon. Ceux qui le suivent sont prévenus de ses commentaires, de son statut et de la personne à qui il est assigné : voir [notifications](./notifications).

## Les doublons

Quand deux tickets disent la même chose, ouvrez le plus récent, puis **Plus d’actions › Marquer comme doublon…**. Choisissez l’original, dans n’importe quel projet que vous voyez, par sa clé ou les mots de son sujet, et le statut de fermeture à lui donner. Le doublon est fermé, les deux tickets montrent le lien, et son demandeur suit l’original, pour en être prévenu. **Ce n’est pas un doublon** retire la marque et laisse le statut tel qu’il est. Il faut _Modifier les tickets_.

## Supprimer un ticket

**Plus d’actions › Supprimer le ticket** le retire avec son historique, pour de bon, et son numéro n’est jamais redonné. Il faut _Supprimer des tickets_. Personne n’est prévenu.

## Mes tickets

**Mes tickets** liste les tickets qui vous sont assignés dans tous les projets actifs, ouverts et fermés, les plus urgents d’abord, puis les plus récents.
