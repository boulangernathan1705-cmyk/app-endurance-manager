# Annonce Discord hebdomadaire LMU

Endurance Manager peut maintenir un message Discord unique qui résume uniquement les départs LMU de la semaine courante, du lundi au dimanche en heure de Paris.

## Comportement

- un seul message Discord est créé puis édité ;
- aucune nouvelle publication n'est envoyée lors d'une inscription ou d'une modification d'équipage ;
- le résumé affiche les événements LMU, leurs départs, les équipages, catégories, voitures, pilotes et l'état Ouvert/Complet ;
- les noms présents dans le site ne peuvent pas déclencher de mention Discord (`allowed_mentions` est désactivé) ;
- chaque écriture réussie concernant un événement, une inscription ou un équipage demande une synchronisation ;
- un contrôle Cloudflare est également exécuté chaque heure afin de changer automatiquement de semaine, même si personne n'utilise le site ;
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

Le Cron Trigger Cloudflare est configuré à `17 * * * *`. Il ne republie pas le message à chaque heure : il recalcule le résumé puis s'arrête immédiatement si son contenu est identique.
