# Vocaux d’équipage et récaps de course sur Discord

Dans **Administration → Modules**, **Récaps de course sur Discord** et **Vocaux d’équipage sur Discord** restent deux modules indépendants. Ils coordonnent leur rangement quand les récaps sont activés en mode **Un salon par événement**. Le module **Rappels de course** conserve son propre interrupteur.

## Organisation

- **Récaps seuls** : un salon texte par course, avec un message unique actualisé sans notification répétée.
- **Vocaux seuls** : un vocal par équipage dans la catégorie choisie (ou en haut du serveur).
- **Les deux** : le vocal rejoint la catégorie du salon texte de sa course. Son nom précise la simu, la course et l’équipage. On peut sélectionner une catégorie **Courses LMU** et une catégorie **Courses iRacing** dans le parcours des récaps. Une seule catégorie reste possible ; les réglages existants sont conservés.
- Un récap général reste dans son salon permanent. Il ne détermine pas la catégorie des vocaux.
- Les courses exclues des filtres des récaps utilisent la catégorie indépendante des vocaux. Désactiver les récaps par course fait revenir les vocaux existants dans cette catégorie au prochain passage ; leurs identifiants et leur chat sont conservés.
- Discord affiche les salons texte avant les vocaux d’une catégorie : le vocal est lié à la course par son nom et sa catégorie, sans garantie d’alternance texte/vocaux lorsque plusieurs courses coexistent.

## Vocaux d’équipage (`crewChannels`)

- Dès la création de l’équipage sur le site, le bot prépare son vocal, même s’il est encore vide ou si son horaire reste à confirmer. Les changements déclenchent une synchronisation en arrière-plan. Les passages suivants reprennent le travail si le budget de requêtes est atteint ou si Discord est indisponible.
- **Voir le salon, Se connecter et Parler** sont autorisés à `@everyone` sur le vocal. Les restrictions Discord individuelles ou de rôles et la modération du serveur restent applicables.
- Dans le chat du vocal : course, départ, durée, voiture, pilotes et lien du site. Le premier message mentionne les pilotes, les modifications sont silencieuses, et les nouveaux pilotes reçoivent un accueil. Le récap texte de la course reste distinct et unique.
- **Le vocal est supprimé 24 h après la fin du départ de son équipage**, même si un pilote y est encore connecté. Exemple : fin vendredi à 17 h → échéance samedi à 17 h.
- **Le salon texte du récap est supprimé 24 h après la fin du dernier départ de la course.** Il reste donc disponible pour les équipages qui courent plus tard.
- Un départ reporté déplace l’échéance. Un horaire ou une durée inconnus bloquent la suppression concernée. Un autre départ en attente ne bloque pas la suppression d’un vocal dont le propre horaire est connu, mais bloque celle du récap de la course.
- La suppression est exécutée au premier passage du bot après l’échéance (tâche planifiée toutes les 15 minutes), avec reprise en cas de panne ou de limite Discord. Ce n’est pas une alarme à la seconde près.
- Désactiver un module arrête les nouvelles publications ; les salons déjà créés continuent d’expirer. Un équipage supprimé manuellement ferme son vocal ; une course supprimée garde la dernière échéance connue pour ses salons.
- Un vocal ou son récap de chat supprimé à la main est recréé au passage suivant tant que l’équipage reste éligible. Les messages récapitulatifs texte supprimés manuellement ne sont pas republiés automatiquement.

Le bot a besoin de **Voir les salons, Gérer les salons, Envoyer des messages, Voir les anciens messages, Se connecter et Parler**. Les deux derniers droits lui permettent d’accorder l’accès public aux vocaux. Le bouton **Donner les droits au bot**, puis **C’est fait**, permet de les vérifier sans accorder Administrateur. Les permissions particulières des catégories peuvent toujours bloquer les opérations : les erreurs apparaissent dans les réglages.

## Rappels de course (`raceReminders`)

- 24 h avant le départ : notification dans la cloche pour chaque pilote inscrit, avec le lien du vocal s’il existe, et message dans le chat du vocal mentionnant les pilotes.
- 1 h avant : message dans le chat du vocal.
- Si le départ change d’horaire, les rappels sont recomptés. Les horaires à confirmer ne déclenchent aucun rappel.

## Fonctionnement

Tout passe par l’API REST de Discord avec `DISCORD_BOT_TOKEN`, sans serveur supplémentaire. La synchronisation après mutation et la tâche planifiée traitent de petits lots, avec des verrous et un budget commun lorsqu’un vocal nécessite d’abord son récap texte. Le nettoyage du récap ferme les vocaux suivis de la même course et de la même communauté avant le texte ; un verrou actif ou une erreur reporte le nettoyage. Aucun salon non suivi n’est supprimé.

`server/discord-course-space.mjs` définit les deux échéances avec une durée commune de 24 h. `server/crew-discord.mjs` gère les vocaux ; `server/recap-discord.mjs` gère les textes. La migration additive `0061_discord_course_spaces.sql` ajoute la catégorie iRacing facultative et conserve l’identité de course et l’échéance de chaque vocal après suppression de la course. Aucune migration distante n’est appliquée par les tests.
