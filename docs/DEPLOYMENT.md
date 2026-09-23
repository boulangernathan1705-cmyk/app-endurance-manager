# Déploiement production

Le dépôt de production est `boulangernathan1705-cmyk/app-endurance-manager` et la branche de production est `main`.

## Cloudflare Workers

Cloudflare Workers déploie le projet avec `npx wrangler deploy`. Le fichier `wrangler.jsonc` est la source de vérité du déploiement :

- `server/worker.mjs` reste le Worker d’API ;
- `npm run build:workers` génère les assets statiques dans `public/` ;
- les routes `/api/*` et `/telemetry/*` passent d’abord par le Worker ;
- les assets statiques sont servis directement par Cloudflare ;
- aucun binding `ASSETS` n’est déclaré, car le Worker ne lit pas les fichiers statiques lui-même ;
- `minify: true` laisse Wrangler minifier le Worker avant l’envoi ;
- `keep_vars: true` conserve les variables et secrets déjà configurés côté Cloudflare.

Le build rassemble les feuilles CSS utilisées par `index.html` dans un unique `public/app.css`. Les fichiers CSS restent modulaires dans le dépôt pour faciliter les modifications, mais ils ne sont pas publiés séparément dans le build de production.

L’aide est volontairement exclue du CSS principal : `front/help-loader.mjs` charge `help.js` et `help.css` uniquement lorsque l’utilisateur clique sur **Aide**. Les captures de l’aide utilisent déjà `loading="lazy"` et ne sont téléchargées que lorsqu’elles deviennent nécessaires.

Le fichier `_headers` généré ne surcharge que les en-têtes de sécurité des assets statiques. Le cache statique reste géré par le comportement natif de Cloudflare Workers Static Assets (validation par ETag), afin d’éviter les règles dupliquées dans le dépôt. Les réponses de l’API restent explicitement en `Cache-Control: no-store` dans `server/core.mjs`.

La bannière principale est validée au build : elle doit garder une largeur minimale de 1900 px, une hauteur minimale de 512 px et rester sous 300 000 octets. Cette limite protège le temps de chargement du premier écran.

## D1

La base D1 existante `fmt-endurance` doit être conservée. Son binding est `DB`.

Ne pas recréer la base ni rejouer manuellement la migration initiale sur une base déjà en production. Pour un déploiement manuel qui comporte de nouvelles migrations, utiliser `npm run deploy:workers`, qui applique uniquement les migrations D1 en attente avant `wrangler deploy`.

## Variables et secrets

`APP_ORIGIN` est versionnée dans `wrangler.jsonc`. Les identifiants Discord non secrets peuvent rester configurés côté Cloudflare grâce à `keep_vars: true`. `DISCORD_CLIENT_SECRET` et `DISCORD_BOT_TOKEN` doivent rester des secrets Cloudflare et ne jamais être ajoutés au dépôt.

`DISCORD_BOT_TOKEN` est utilisé uniquement par l’intégration facultative des communautés Discord. Il permet au Worker de vérifier un membre précis avec son identifiant Discord, de contrôler ses rôles au moment utile et de lire les métadonnées publiques du serveur nécessaires aux visuels (nom, icône, bannière/couleur quand Discord les fournit). Endurance Manager ne télécharge pas la liste complète des membres du serveur. Sans ce secret, les communautés purement Endurance Manager continuent de fonctionner, mais les règles d’accès Discord et la reprise automatique de ces visuels sont indisponibles.

Les logos et bannières personnalisés configurés manuellement sont stockés sous forme d’URL HTTPS dans D1 ; aucun fichier binaire n’est stocké dans D1.
