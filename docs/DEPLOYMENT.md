# Déploiement production

Le dépôt de production est `boulangernathan1705-cmyk/app-endurance-manager` et la branche de production est `main`.

Cloudflare Workers déploie avec `npx wrangler deploy`. Le fichier `wrangler.jsonc` définit le build `npm run build:workers`, les assets générés dans `public/`, le binding D1 `DB` et `keep_vars: true` pour conserver les variables déjà configurées côté Cloudflare.

La base D1 existante `fmt-endurance` doit être conservée. Ne pas recréer la base ni réappliquer la migration initiale sur une base déjà en production.
