# Annonce Discord hebdomadaire LMU

Endurance Manager peut maintenir un message Discord unique avec les courses LMU en cours ayant au moins un équipage engagé et tous les départs futurs de la semaine courante, du lundi au dimanche en heure de Paris. S’il ne reste aucun départ futur cette semaine, le planning passe à la prochaine semaine contenant un départ LMU.

## Comportement

- un seul message Discord est créé puis édité ;
- les inscriptions et modifications d’équipage actualisent le message existant ; il est recréé si Discord indique qu’il a été supprimé (404) ;
- le résumé affiche les événements LMU, leurs départs, les équipages, catégories, voitures, pilotes et l'état Ouvert/Complet ;
- les noms présents dans le site ne peuvent pas déclencher de mention Discord (`allowed_mentions` est désactivé) ;
- chaque écriture réussie concernant un événement, une inscription ou un équipage demande une synchronisation ;
- un contrôle Cloudflare est également exécuté toutes les 15 minutes afin d’actualiser les courses en cours et le planning, même si personne n’utilise le site ;
- le contenu est haché avant envoi : si rien n'a changé, Discord n'est pas édité.

## Configuration Discord

1. Créer un salon dédié, par exemple `#endurance-semaine`.
2. Dans les paramètres du salon ou du serveur, ouvrir **Intégrations > Webhooks**.
3. Créer un webhook nommé par exemple **Endurance Manager** et sélectionner le salon.
4. Copier l'URL du webhook.

L'URL du webhook donne le droit de publier dans le salon : ne jamais la placer dans le dépôt, le JavaScript du navigateur ou une variable publique.

## Configuration Cloudflare

Ajouter l'URL comme secret du Worker :

- nom : `DISCORD_WEEKLY_WEBHOOK_URL`
- valeur : l'URL complète copiée dans Discord

Pour la production, le Worker est `endurance-manager-prod`. Pour tester séparément sur DEV, utiliser un autre webhook et ajouter le même nom de secret au Worker `app`.

La migration `0017_discord_weekly.sql` stocke uniquement l'identifiant du message, son empreinte de contenu et l'état technique de synchronisation. L'URL du webhook n'est jamais stockée en D1.

## Mise à jour automatique

Le Cron Trigger Cloudflare est configuré à `*/15 * * * *` dans les deux configurations Wrangler. Il recalcule le résumé et n’édite pas le message si l’empreinte des données est identique. L’heure affichée dans le pied du message correspond à sa dernière actualisation effective.
