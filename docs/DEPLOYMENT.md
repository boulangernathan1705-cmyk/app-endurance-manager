# Déploiement et séparation des environnements

La branche `main` correspond à la production ; `dev` est la branche d'intégration et de test.

## Trois configurations Wrangler distinctes

| Utilisation | Fichier | Worker | Origine | Base D1 |
| --- | --- | --- | --- | --- |
| Local | `wrangler.jsonc` | `endurance-manager-local` | `http://localhost:8787` | `fmt-endurance` |
| Développement distant | `wrangler.dev.jsonc` | `endurance-manager-dev` | `https://dev.endurance-manager.app` | `endurance-manager-dev` |
| Production | `wrangler.prod.jsonc` | `endurance-manager-prod` | `https://endurance-manager.app` | `endurance-manager-prod` |

Le fichier `wrangler.jsonc` est la configuration **locale par défaut**. Il ne doit pas être pris pour la configuration de production. Chaque environnement distant a une base D1 séparée, qui ne doit être ni recréée ni remplacée pendant un nettoyage de code.

## Architecture Cloudflare actuelle

- Entrée Worker : `server/worker-with-migrations.mjs`, qui enveloppe le Worker d'API `server/worker.mjs`.
- `npm run build:workers` génère les assets dans `public/` et rassemble notamment le CSS dans `public/app.css`.
- `ASSETS` est effectivement déclaré : le Worker l'utilise pour servir/adapter certaines pages et ressources de communauté.
- La production utilise `run_worker_first` pour des routes déterminées, et sert directement les ressources statiques exclues ; elle utilise `not_found_handling: "404-page"`.
- Le développement distant fait transiter les pages par le Worker pour personnaliser les communautés et gérer son environnement de test.
- `minify: true` et `keep_vars: true` sont présents sur les configurations.
- L'API envoie `Cache-Control: no-store` ; le cache des assets reste géré par Cloudflare.

Les fichiers CSS restent modulaires dans le dépôt, mais le build publie une feuille principale. Les ressources d'aide sont chargées à la demande.

## Commandes de déploiement : attention à la configuration

L’ancien script `npm run deploy:workers` (Wrangler **sans** `--config`, donc `wrangler.jsonc` et la base distante `fmt-endurance`) a été retiré. Le seul script de déploiement est `npm run deploy:dev`, qui nomme `wrangler.dev.jsonc` pour les migrations comme pour le Worker. La production n’est déployée que par Cloudflare à la fusion dans `main`.

Toute opération sur les environnements distants doit sélectionner explicitement le bon fichier de configuration. Les migrations D1 doivent cibler la même configuration que le Worker à déployer. Vérifier l'identité du compte, le nom du Worker, la base D1 et les changements de migration avant l'exécution. La procédure automatique de livraison existante reste la référence ; ce document ne la déclenche pas.

Les secrets `DISCORD_CLIENT_SECRET` et `DISCORD_BOT_TOKEN` restent dans Cloudflare, jamais dans le dépôt.

## Publication main après validation dev

1. Les fonctionnalités sont développées dans une branche temporaire puis intégrées par PR dans `dev`.
2. Vérifier le site de développement, les tests et les migrations éventuelles ; mettre `CHANGELOG.md` à jour.
3. Ouvrir une PR `dev` → `main`, titrée `vX.Y : …`. Le ruleset « Protect production » exige les checks `check` et `Release must come from dev`, ainsi qu'une fusion squash.
4. Après la fusion autorisée, le workflow `Sync dev after release` fusionne `main` dans `dev` afin de préserver la filiation Git après le squash. Vérifier sa réussite avant la release suivante.

**Ne pas fusionner dans `main` sans accord explicite.** Le nettoyage des branches historiques est indépendant des releases.

## Points de vérification avant toute refonte du déploiement

- Confirmer dans le tableau de bord Cloudflare les workflows réellement chargés du déploiement, leur compte et leurs secrets.
- Contrôler que les environnements de test et de production restent isolés.
- Vérifier les résultats du workflow de synchronisation et des contrôles de release.
- Ne modifier ni les routes Cloudflare, ni les bindings, ni les bases D1 dans une PR purement documentaire.
