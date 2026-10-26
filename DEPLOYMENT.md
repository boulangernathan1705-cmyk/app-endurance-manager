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

## Relais du mur des stands (second compte Cloudflare)

Le direct du mur des stands (plugin SimHub du pilote au volant, pages des coéquipiers) passe par un relais déployé seul,
sur un **second compte Cloudflare gratuit**, pour ne jamais consommer le quota du site : `relay/worker.mjs`,
configuration `wrangler.relay.jsonc`. Il ne garde que les salons (`LiveRoom`, `server/live.mjs`) et n'ouvre la porte
qu'avec un laissez-passer de quelques minutes signé par le site (`shared/relay-pass.mjs`).

1. Créer le second compte Cloudflare, puis y importer le dépôt (Workers Builds) : Worker `app-endurance-manager-relais`,
   build vide, déploiement `npx wrangler deploy --config wrangler.relay.jsonc`, **branche de production `dev`** (Paramètres
   → Build → Contrôle des branches ; seul un envoi sur la branche lance un build, relancer un build refait le même commit).
2. Choisir un secret d'au moins 32 caractères et le poser des deux côtés :
   `npx wrangler secret put RELAY_SECRET --config wrangler.relay.jsonc` (relais), puis sur le Worker du site (dev ou
   prod) la variable secrète `RELAY_SECRET` avec la même valeur.
3. L'adresse du relais (`https://app-endurance-manager-relais.<compte>.workers.dev`) s'écrit dans `RELAY_ORIGIN`
   (`shared/relay-pass.mjs`) : le site la donne avec les laissez-passer et l'autorise aux pages (`connect-src`). Une
   variable `RELAY_URL` sur le Worker la remplace au besoin.

Le site de test a ses propres salons sur le même relais (`dev:<communauté>`). Sans adresse ou sans `RELAY_SECRET`, rien
ne change : le plugin et les pages se connectent au site comme avant.

## Données

Ne jamais copier automatiquement la base DEV vers PROD. Les migrations de schéma sont partagées dans `migrations/`, mais les données utilisateur restent propres à chaque environnement.
