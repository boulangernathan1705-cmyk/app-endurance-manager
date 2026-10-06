# Équipages sur Discord et rappels de course

Deux modules, activés par les admins de chaque communauté avec un simple interrupteur dans **Administration → Modules**.

## Salons d'équipage (`crewChannels`)

- 6 jours avant le départ au plus (horaire connu), chaque équipage avec au moins un pilote reçoit **son salon vocal**, au nom de la simu et de l'équipage (« LMU-Les Tondeuz »). Le bot le crée hors catégorie : le propriétaire du serveur le range où il veut, le bot ne le déplace jamais.
- Dans le chat du vocal, un récap : course, horaire (à l'heure de chaque joueur), durée, voiture, pilotes, lien du site. Les pilotes y sont mentionnés, et un pilote qui rejoint l'équipage y est accueilli.
- Le récap est modifié à chaque changement (voiture, horaire, pilotes…), sans renvoyer de mention.
- 2 h après la fin prévue, le vocal est supprimé avec son chat (dès qu'aucun pilote de l'équipage n'y est connecté). Un équipage supprimé avant sa course est fermé tout de suite.
- Un vocal ou un récap supprimés à la main sur Discord sont recréés au passage suivant.
- Les équipages ouverts par la première version (catégorie + salon texte + vocal) perdent leur catégorie et leur salon texte au passage suivant ; les salons texte archivés sont supprimés 30 jours après leur course.

Droits du bot : tant qu'il ne les a pas, l'interrupteur est grisé et le bouton **Donner les droits au bot** l'invite à nouveau avec : voir les salons, gérer les salons, envoyer des messages, lire l'historique (puis **C'est fait** pour revérifier). Le site lit les droits réels du bot sur le serveur. Sans ce module, le bot ne fait que lire les membres et leurs rôles.

## Rappels de course (`raceReminders`)

- 24 h avant le départ : une notification dans la cloche pour chaque pilote inscrit (avec son équipage, et le lien de son vocal s'il existe), et un message dans le chat du vocal de l'équipage qui mentionne ses pilotes.
- 1 h avant : un message dans le chat du vocal.
- Si le départ change d'horaire, les rappels sont recomptés.

## Fonctionnement

Tout passe par l'API REST de Discord avec `DISCORD_BOT_TOKEN`, sans serveur supplémentaire : la tâche planifiée (toutes les 15 minutes, 8 requêtes Discord au plus par passage, 4 au passage de l'import iRacing) et, juste après un changement sur une course, une inscription ou un équipage, un passage pour la communauté concernée. Seules les lignes qui ont quelque chose à faire sur Discord sont traitées, pour rester dans les 50 appels à la base par passage de l'offre gratuite. Code : `server/crew-discord.mjs`, tables : migrations `0044_crew_discord.sql` et `0045_crew_channels.sql`.
