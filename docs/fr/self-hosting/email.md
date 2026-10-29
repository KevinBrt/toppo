# E-mail

Toppo envoie invitations, réinitialisations de mot de passe et notifications par votre serveur d’envoi : saisissez son hôte, son port, sa sécurité (STARTTLS, TLS, ou aucune pour un relais de votre propre réseau), le compte et l’adresse d’expédition dans **Paramètres › E-mail**, puis envoyez-vous un message de test depuis la même page : s’il échoue, il dit pourquoi (la connexion, TLS, le compte, ou le message refusé).

Sans e-mail, Toppo fonctionne, mais les liens d’invitation se transmettent à la main, les notifications restent dans la cloche, et **un mot de passe oublié ne peut pas être réinitialisé** : configurez l’e-mail avant que quelqu’un en ait besoin.

Chaque e-mail est écrit dans la langue que son destinataire a choisie dans **Mon compte › Langue**. Les e-mails que quelqu’un attend, comme une réinitialisation de mot de passe ou une invitation, partent avant les notifications.

Le mot de passe de l’e-mail est chiffré avec la clé secrète gardée dans le volume `/data`. Restauré sans ce volume, Toppo ne peut plus le lire : saisissez-le de nouveau dans **Paramètres › E-mail**.
