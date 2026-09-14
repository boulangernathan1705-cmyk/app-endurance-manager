# Déploiement Cloudflare

Le dépôt est `boulangernathan1705-cmyk/app-endurance-manager`. `dev` correspond au développement et `main` à la production ; la procédure de publication est décrite dans [DEPLOYMENT.md](../DEPLOYMENT.md).

## Cloudflare Workers

`wrangler.jsonc` configure le Worker DEV `app` ; `wrangler.prod.jsonc` configure le Worker PROD `endurance-manager-prod`. Un déploiement Wrangler sans option `--config` utilise la configuration DEV, même depuis `main` :

- `server/worker-with-migrations.mjs` est le point d’entrée : il délègue les requêtes à `server/worker.mjs`, assure la récupération du schéma de propriété des équipages et programme la synchronisation Discord ;
- `npm run build:workers` génère les assets statiques dans `public/` ;
- les routes `/api/*` et `/telemetry/*` passent d’abord par le Worker ;
- les assets statiques sont servis directement par Cloudflare ;
- aucun binding `ASSETS` n’est déclaré ; les routes prioritaires configurées ne nécessitent pas le repli `env.ASSETS.fetch()` encore présent dans `server/worker.mjs` ;
- `minify: true` laisse Wrangler minifier le Worker avant l’envoi ;
- `keep_vars: true` conserve les variables et secrets déjà configurés côté Cloudflare.

Le build rassemble les feuilles CSS utilisées par `index.html`, `game.html`, `members.html`, `diagnostics.html` et `help.html` dans `public/app.css`. Le gabarit `game.html` est publié sous `/lmu/` et `/iracing/`. Le dossier source `styles/` n’est pas publié séparément ; `help.css` et `privacy.css` sont également copiés par le build.

L’aide est une page dédiée `help.html`. `front/help-page.mjs` lit la session puis importe `help.js` pour afficher l’aide du rôle correspondant. Les 26 captures sont référencées dynamiquement par `helpScreenshot()` et `helpScreenshots()` avec `loading="lazy"` ; elles ne sont pas des fichiers inutilisés.

Le fichier `_headers` généré ne surcharge que les en-têtes de sécurité des assets statiques. Le cache statique reste géré par le comportement natif de Cloudflare Workers Static Assets (validation par ETag), afin d’éviter les règles dupliquées dans le dépôt. Les réponses de l’API restent explicitement en `Cache-Control: no-store` dans `server/core.mjs`.

La bannière principale est validée au build : elle doit garder une largeur minimale de 1900 px, une hauteur minimale de 512 px et rester sous 300 000 octets. Cette limite protège le temps de chargement du premier écran.

## D1

DEV utilise la base `fmt-endurance` ; PROD utilise `endurance-manager-prod`. Les deux configurations utilisent le binding `DB`, avec des identifiants de base distincts.

Ne pas recréer les bases ni rejouer manuellement la migration initiale. `npm run deploy:workers` applique les migrations en attente et déploie uniquement DEV. Toute commande manuelle destinée à PROD doit sélectionner explicitement `wrangler.prod.jsonc`, pour les migrations comme pour le déploiement, après autorisation de publication.

## Variables et secrets

`APP_ORIGIN` est versionnée dans chaque configuration Wrangler. Les identifiants Discord non secrets peuvent rester configurés côté Cloudflare grâce à `keep_vars: true`. `DISCORD_CLIENT_SECRET` et `DISCORD_WEEKLY_WEBHOOK_URL` doivent rester des secrets Cloudflare. Le récapitulatif Discord utilise un cron toutes les 15 minutes ; voir [DISCORD_WEEKLY.md](DISCORD_WEEKLY.md).
