# Équipages sur Discord et rappels de course

Deux modules, activés par les admins de chaque communauté dans **Administration → Mise en place → Créer les salons des équipages**.

## Salons d'équipage (`crewChannels`)

- 6 jours avant le départ au plus (horaire connu), chaque équipage avec au moins un pilote reçoit **sa catégorie** (« 🏁 Les Tondeuz · 6h de Spa »), avec :
  - un **salon texte** visible par tout le serveur, avec un récap : course, horaire (affiché à l'heure de chaque joueur), durée, voiture, pilotes, salon vocal, lien du site ;
  - **son salon vocal juste en dessous** (dans une catégorie, Discord affiche toujours les salons texte avant les vocaux : une catégorie par équipage garde chaque vocal sous son salon).
- Les pilotes sont mentionnés dans le récap. Un pilote qui rejoint l'équipage est accueilli dans le salon.
- Le récap est modifié à chaque changement (voiture, horaire, pilotes…), sans renvoyer de mention.
- 24 h après la fin prévue : le salon vocal est supprimé (dès qu'aucun pilote de l'équipage n'y est connecté), le salon texte part dans la **catégorie des archives** choisie par les admins (avec ses permissions : en lecture seule si elle l'est) puis est supprimé au bout de 30 jours, et la catégorie de l'équipage est supprimée. Sans catégorie d'archives, le salon texte est supprimé. Un équipage supprimé est fermé tout de suite.
- Un salon texte, un récap ou une catégorie supprimés à la main sur Discord sont recréés au passage suivant.

Droits du bot : le bouton **Donner les droits au bot** l'invite à nouveau avec : voir les salons, gérer les salons, envoyer des messages, lire l'historique. Sans ce module, le bot ne fait que lire les membres et leurs rôles.

## Rappels de course (`raceReminders`)

- 24 h avant le départ : une notification dans la cloche pour chaque pilote inscrit (avec son équipage, et le lien de son salon s'il existe), et un message dans le salon de l'équipage qui mentionne ses pilotes.
- 1 h avant : un message dans le salon de l'équipage avec le lien du salon vocal.
- Si le départ change d'horaire, les rappels sont recomptés.

## Fonctionnement

Tout passe par l'API REST de Discord avec `DISCORD_BOT_TOKEN`, sans serveur supplémentaire : la tâche planifiée (toutes les 15 minutes, 8 requêtes Discord au plus par passage, 4 au passage de l'import iRacing) et, juste après un changement sur une course, une inscription ou un équipage, un passage pour la communauté concernée. Seules les lignes qui ont quelque chose à faire sur Discord sont traitées, pour rester dans les 50 appels à la base par passage de l'offre gratuite. Code : `server/crew-discord.mjs`, tables : migrations `0044_crew_discord.sql` et `0045_crew_channels.sql`.
