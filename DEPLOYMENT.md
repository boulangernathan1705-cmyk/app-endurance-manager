# Déploiement Endurance Manager

## Environnements

- `dev` -> `https://app.endurance-manager.workers.dev`
- `main` -> `https://endurance-manager.app`

Les deux environnements utilisent des Workers et des bases D1 distincts.

## Règle de travail

1. Toute modification fonctionnelle est développée sur `dev` ou sur une branche temporaire fusionnée dans `dev`.
2. La version DEV est testée sur le domaine `workers.dev`.
3. La production est publiée uniquement avec une Pull Request `dev -> main`.
4. Les contrôles GitHub doivent être verts avant fusion.
5. Après fusion, Cloudflare déploie `main` vers `endurance-manager.app`.
6. Le workflow Browser compatibility est déclenché sur les pushes vers `dev`, ou manuellement, et cible le domaine DEV. Il ne contrôle pas automatiquement la production après fusion.

## Configurations Cloudflare

### DEV

Configuration : `wrangler.jsonc`

`npm run deploy:workers` utilise cette configuration DEV, quelle que soit la branche courante.

La base D1 DEV et `APP_ORIGIN=https://app.endurance-manager.workers.dev` sont isolés de la production.

### PROD

Configuration : `wrangler.prod.jsonc`

La base D1 PROD est `endurance-manager-prod` et `APP_ORIGIN=https://endurance-manager.app`.

## Données

Ne jamais copier automatiquement la base DEV vers PROD. Les migrations de schéma sont partagées dans `migrations/`, mais les données utilisateur restent propres à chaque environnement.
