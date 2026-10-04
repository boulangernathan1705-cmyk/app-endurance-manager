# Équipages sur Discord et rappels de course

Deux modules, activés par les admins de chaque communauté dans **Administration → Mise en place → Créer les fils et salons vocaux des équipages**.

## Fils et salons vocaux d'équipage (`crewChannels`)

- 6 jours avant le départ au plus (horaire connu), chaque équipage avec au moins un pilote reçoit :
  - un **fil** dans le salon choisi (salon texte ou forum), visible par tout le serveur, avec un récap : course, horaire (affiché à l'heure de chaque joueur), durée, voiture, pilotes, salon vocal, lien du site ;
  - un **salon vocal** dans la catégorie choisie (ou en haut du serveur).
- Les pilotes sont mentionnés dans le récap : Discord les ajoute au fil et les prévient. Un pilote qui rejoint l'équipage est accueilli dans le fil.
- Le récap est modifié à chaque changement (voiture, horaire, pilotes…), sans renvoyer de mention.
- 24 h après la fin prévue : le salon vocal est supprimé (dès qu'aucun pilote de l'équipage n'y est connecté) et le fil archivé et verrouillé. Un équipage supprimé est fermé tout de suite.
- Un fil ou un récap supprimé à la main sur Discord est recréé au passage suivant.

Droits du bot : le bouton **Donner les droits au bot** l'invite à nouveau avec : voir les salons, gérer les salons, envoyer des messages, lire l'historique, gérer les fils, créer des fils publics, envoyer des messages dans les fils. Sans ce module, le bot ne fait que lire les membres et leurs rôles.

## Rappels de course (`raceReminders`)

- 24 h avant le départ : une notification dans la cloche pour chaque pilote inscrit (avec son équipage, et le lien du fil s'il existe), et un message dans le fil de l'équipage qui mentionne ses pilotes.
- 1 h avant : un message dans le fil avec le lien du salon vocal.
- Si le départ change d'horaire, les rappels sont recomptés.

## Fonctionnement

Tout passe par l'API REST de Discord avec `DISCORD_BOT_TOKEN`, sans serveur supplémentaire : la tâche planifiée (toutes les 15 minutes, 8 requêtes Discord au plus par passage, 4 au passage de l'import iRacing) et, juste après un changement sur une course, une inscription ou un équipage, un passage pour la communauté concernée. Seules les lignes qui ont quelque chose à faire sur Discord sont traitées, pour rester dans les 50 appels à la base par passage de l'offre gratuite. Code : `server/crew-discord.mjs`, tables : migration `0044_crew_discord.sql`.
