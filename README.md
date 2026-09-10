# Endurance Manager

Application web de gestion de courses d’endurance simracing : événements, inscriptions pilotes, disponibilités heure par heure, préférences de voitures, équipages et rôles d’organisation.

## Architecture

- Frontend statique en JavaScript ES modules.
- API sur Cloudflare Workers.
- Base partagée Cloudflare D1 (`fmt-endurance`).
- Authentification Discord.
- Assets statiques servis par Cloudflare Workers Static Assets.

## Développement

```bash
npm install
npm test
npm run check
```

`npm run check` exécute les tests, le build Workers et l’audit strict du dépôt.

Le code source CSS reste modulaire, mais `npm run build:workers` rassemble les feuilles nécessaires au démarrage dans `public/app.css`. Les fonctions non essentielles au premier écran, comme l’aide, sont chargées à la demande.

## Déploiement

La production utilise la branche `main`. La configuration Cloudflare se trouve dans `wrangler.jsonc`.

```bash
npm run deploy:workers
```

Cette commande applique les migrations D1 en attente puis déploie le Worker. La base D1 existante ne doit pas être recréée.

Voir `docs/DEPLOYMENT.md` pour les détails Cloudflare et `docs/TECHNICAL_AUDIT.md` pour les règles de maintenance et d’optimisation.
