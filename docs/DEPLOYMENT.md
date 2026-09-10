# Déploiement production

Le dépôt de production est `boulangernathan1705-cmyk/app-endurance-manager` et la branche de production est `main`.

## Cloudflare Workers

Cloudflare Workers déploie le projet avec `npx wrangler deploy`. Le fichier `wrangler.jsonc` est la source de vérité du déploiement :

- `server/worker.mjs` reste le Worker d’API ;
- `npm run build:workers` génère les assets statiques dans `public/` ;
- seules les routes `/api/*` passent d’abord par le Worker ;
- les assets statiques sont servis directement par Cloudflare ;
- aucun binding `ASSETS` n’est déclaré, car le Worker ne lit pas les fichiers statiques lui-même ;
- `minify: true` laisse Wrangler minifier le Worker avant l’envoi ;
- `keep_vars: true` conserve les variables et secrets déjà configurés côté Cloudflare.

Le build rassemble les feuilles CSS utilisées par `index.html` dans un unique `public/app.css`. Les fichiers CSS restent modulaires dans le dépôt pour faciliter les modifications, mais ils ne sont pas publiés séparément dans le build de production.

Le fichier `_headers` généré ne surcharge que les en-têtes de sécurité des assets statiques. Le cache statique reste géré par le comportement natif de Cloudflare Workers Static Assets (validation par ETag), afin d’éviter les règles dupliquées dans le dépôt. Les réponses de l’API restent explicitement en `Cache-Control: no-store` dans `server/core.mjs`.

## D1

La base D1 existante `fmt-endurance` doit être conservée. Son binding est `DB`.

Ne pas recréer la base ni rejouer manuellement la migration initiale sur une base déjà en production. Pour un déploiement manuel qui comporte de nouvelles migrations, utiliser `npm run deploy:workers`, qui applique uniquement les migrations D1 en attente avant `wrangler deploy`.

## Variables et secrets

`APP_ORIGIN` est versionnée dans `wrangler.jsonc`. Les identifiants Discord non secrets peuvent rester configurés côté Cloudflare grâce à `keep_vars: true`. `DISCORD_CLIENT_SECRET` doit rester un secret Cloudflare et ne jamais être ajouté au dépôt.
