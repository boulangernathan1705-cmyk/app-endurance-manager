# Déploiement Endurance Manager

## Environnements

- `dev` -> `https://dev.endurance-manager.app` (et `dev2.endurance-manager.app`, 2e communauté de test)
- `main` -> `https://endurance-manager.app`

Les deux environnements utilisent des Workers et des bases D1 distincts.

## Règle de travail

1. Toute modification fonctionnelle est développée sur `dev` ou sur une branche temporaire fusionnée dans `dev`.
2. La version DEV est testée sur `dev.endurance-manager.app`.
3. La production est publiée uniquement avec une Pull Request `dev -> main`.
4. Les contrôles GitHub doivent être verts avant fusion.
5. Après fusion, Cloudflare déploie `main` vers `endurance-manager.app`.
6. Le workflow Browser compatibility contrôle ensuite le domaine correspondant à la branche.

## Configurations Cloudflare

### DEV

Configuration : `wrangler.dev.jsonc` (Worker `endurance-manager-dev`, base D1 `endurance-manager-dev`).

Cloudflare Workers Builds déploie ce Worker à chaque push sur la branche **dev** :
- Branch control : `dev` (si le site de test ne bouge plus, vérifier ce réglage en premier : il est resté sur l'ancienne branche `communautes` du 30/09 au 04/10) ;
- Build command : `npm run build:workers` ;
- Deploy command : `npx wrangler d1 migrations apply DB --remote --config wrangler.dev.jsonc && npx wrangler deploy --config wrangler.dev.jsonc`.

Chaque build apparaît sur le commit dans GitHub sous le nom « Workers Builds: endurance-manager-dev ».

### PROD

Configuration : `wrangler.prod.jsonc`

La base D1 PROD est `endurance-manager-prod` et `APP_ORIGIN=https://endurance-manager.app`.

## Données

Ne jamais copier automatiquement la base DEV vers PROD. Les migrations de schéma sont partagées dans `migrations/`, mais les données utilisateur restent propres à chaque environnement.
