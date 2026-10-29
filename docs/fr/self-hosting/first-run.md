# Premier démarrage

1. Lisez le code d’installation dans les journaux :

   ```sh
   docker compose logs toppo | grep "setup code"
   ```

   La ligne ressemble à `Toppo is not set up yet: open http://localhost:3000 and enter the setup code ABCD-EFGH-JKLM`. Un nouveau code s’affiche à chaque démarrage tant que l’installation n’est pas faite.

2. Ouvrez Toppo, entrez le code et créez le premier compte administrateur.
3. Configurez l’[e-mail](./email) dans **Paramètres › E-mail**.
4. Invitez votre équipe depuis **Paramètres › Membres** : chaque personne reçoit un lien personnel, valable 7 jours, envoyé par e-mail s’il est configuré, ou que vous lui transmettez vous-même. Elle choisit son nom et son mot de passe en l’ouvrant.
5. Ajustez ce que chaque rôle permet dans **Paramètres › Rôles et permissions**. Administrateur, Équipe et Demandeur ne sont qu’un point de départ : renommez-les, modifiez-les ou créez les vôtres.

Le code existe pour que personne d’autre ne s’approprie une instance neuve joignable depuis le réseau. Une fois le premier administrateur créé, l’assistant est fermé pour de bon. Pour les déploiements automatisés, fixez le code d’avance avec `TOPPO_SETUP_CODE` : 12 lettres ou chiffres au moins, tirets et espaces mis à part.

Code perdu ? Redémarrez Toppo (`docker compose restart toppo`) : il en affiche un nouveau tant que l’installation n’est pas faite.
