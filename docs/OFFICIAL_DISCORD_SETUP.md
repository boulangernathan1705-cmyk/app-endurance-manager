# Configuration du Discord officiel

Serveur : `1558538670217101373`. Application : `1546535605805125742`.

L’outil affiche un aperçu puis crée explicitement l’organisation validée : Accueil, Communauté, Aide et retours (forums aide, bugs, fonctionnalités), Courses LMU, Courses iRacing, Vocaux généraux (Discussion, Détente) et Équipe privée. Aucun salon résultats, discussion par simulateur ou recherche d’équipage. Les catégories de course sont vides jusqu’à la configuration des modules du site.

## Préparer dev

1. Fusionner cette PR dans **dev uniquement**, puis déployer ce code et appliquer ses migrations à la base **dev**. Aucun passage sur main ni migration de production. Utiliser explicitement `wrangler.dev.jsonc` pour ces opérations : les scripts npm de déploiement génériques ne doivent pas servir à ce travail.
2. Dans le Worker **endurance-manager-dev**, vérifier que `SITE_ENV=development`, `DISCORD_CLIENT_ID=1546535605805125742` et le secret `DISCORD_BOT_TOKEN` sont présents. Un secret enregistré sur le Worker de production n’est pas automatiquement disponible sur dev. Ne jamais copier de secret dans le chat ou dans Git.
3. Ajouter temporairement la variable texte `OFFICIAL_DISCORD_SETUP_ENABLED=true` sur ce Worker. Le compte utilisateur qui exécutera l’outil doit être dans `ADMIN_DISCORD_IDS` **et** être propriétaire du serveur officiel.
4. Le bot doit voir et gérer les salons, gérer les rôles, envoyer des messages, lire l’historique, envoyer des messages dans les fils, se connecter et parler. Le rôle du bot doit être au-dessus des rôles à gérer. L’invitation incluant les permissions nécessaires est :

   https://discord.com/oauth2/authorize?client_id=1546535605805125742&scope=bot&permissions=275149556752&guild_id=1558538670217101373&disable_guild_select=true

   Aucun droit Administrateur n’est requis. Le droit d’envoyer des messages dans les fils sert aux permissions des forums.

5. Se connecter au site **dev** avec Discord, puis ouvrir :

   https://dev.endurance-manager.app/api/admin/official-discord-setup/page

## Aperçu et création

Cliquer **Actualiser l’aperçu**. Cette action ne crée aucun salon, rôle ou message. Elle indique les éléments à créer, les éléments existants conservés, les conflits et le contenu des trois messages d’accueil.

Après vérification, recopier l’identifiant du serveur dans le champ de confirmation et cliquer **Créer les éléments présentés**. Chaque clic crée au maximum huit rôles/salons. L’aperçu est ensuite rechargé ; cliquer **Créer le lot suivant** pour continuer. Aucun lot suivant ne démarre sans clic. Les messages d’accueil sont publiés silencieusement à la fin, avec des identités persistées pour éviter les doublons.

Les conflits de noms, types, emplacements ou permissions de la catégorie privée bloquent toute création du lot. Aucun élément existant n’est modifié, déplacé ou supprimé. Les salons de règlement et de suivi définis par le mode Communauté sont réutilisés avec leurs permissions existantes : vérifier en particulier que le salon de suivi est privé. Les limites Discord ou les interruptions permettent une reprise depuis un nouvel aperçu ; les appels concurrents sont verrouillés.

Les rôles Administrateur, Modérateur, Support et Membre sont créés sans permissions globales. Les deux premiers accèdent à la catégorie Équipe et peuvent écrire dans Accueil. Le propriétaire attribue ensuite les rôles aux bonnes personnes et configure les pouvoirs de modération souhaités. Ne pas déplacer le rôle Administrateur au-dessus du bot tant qu’on souhaite que le bot puisse le gérer.

## Après configuration

Retirer `OFFICIAL_DISCORD_SETUP_ENABLED` ou la mettre à `false`. L’outil est toujours inaccessible en production. Relier ensuite le serveur à la communauté appropriée sur le site et configurer explicitement les modules de récaps et de vocaux : cet outil ne change aucune communauté, n’active aucun module et ne crée aucun espace course dynamique.

Les adaptations de coordination des modules sont dans la PR #263 : vocal supprimé 24 h après la fin du départ de son équipage ; récap texte supprimé 24 h après le dernier départ de la course. Leur déploiement sur dev est distinct de la création des salons fixes.
