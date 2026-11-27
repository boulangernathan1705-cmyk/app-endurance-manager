# Endurance Manager

Endurances LMU et iRacing. Répondre à Nathan en français.

- Partir de `dev`, travailler sur une branche dédiée et ouvrir une PR vers `dev`. Fusionner après les contrôles. La publication `dev → main` nécessite l'accord explicite de Nathan.
- Préserver les contrats, les droits par communauté, le rendu et la compatibilité du plugin SimHub. Aucune migration destructive ni activation du bot Discord réel sur `dev`.
- Préserver le fonctionnement du relais du muret. Lire la section Relais de [DEPLOYMENT.md](DEPLOYMENT.md) avant toute modification du relais, de son protocole ou de ses dépendances partagées.
- Avant de pousser, lancer `npm run check`. Pour le navigateur, utiliser la CI et les commandes de [DEPLOYMENT.md](DEPLOYMENT.md). Pour une refactorisation CSS à rendu constant, comparer les captures sans régénérer les références de la CI.

## Travailler avec Nathan et les autres IA

- Nathan pilote le produit sans coder : échanger en français clair, proposer les changements importants et les maquettes avant de les réaliser ; prendre en charge le code, les commandes et les tests. Ne lui demander que les choix et les validations concrètes qui nécessitent son intervention.
- Lire [l'index documentaire](docs/README.md), la [méthode commune](docs/AI_WORKFLOW.md) et les documents utiles au chantier. Les [décisions validées](docs/DECISIONS.md) et la [charte](docs/DESIGN_SYSTEM.md) ne doivent pas être contournées.
- Pour reprendre un chantier, consulter les PR ouvertes, leur diff et la CI ; ne pas recommencer ni écraser le travail existant. Documenter les changements durables dans la même PR et les limites de validation dans sa description.
- Ne pas automatiser de dialogue, d'attribution ou de relance entre IA. Aucun secret ni accès de production supplémentaire pour un agent.

## Point de départ par domaine

Les dépendances, contrats et tests ciblés sont dans la [cartographie de l’architecture](docs/ARCHITECTURE.md).

| Domaine | À lire en premier | Tests à cibler |
| --- | --- | --- |
| Sessions, droits et courses | `server/worker.mjs`, `server/access.mjs`, `docs/DISCORD_ROLES.md` | `access`, `communities`, `event-refresh` |
| Équipages et demandes | `server/api-crews.mjs`, `front/app/crews-page.mjs` | `crew-requests`, `crews-page-v3` |
| Récaps, fils et vocaux Discord | `server/worker-with-migrations.mjs`, `server/discord-weekly.mjs`, `server/recap-discord.mjs`, `server/crew-discord.mjs` | `recap-discord`, `crew-discord`, tests des droits et limites Discord |
| Administration | `front/members-page.mjs`, `server/api-community.mjs`, `server/api-platform.mjs` | `admin-todo`, parcours navigateur `admin-roles` |
| Charte et CSS | `styles/tokens.css`, `styles/ux-refresh.css`, `charte.html` | `tests/visual`, `scripts/css-compare.mjs` |
| Muret, relais et SimHub | `front/pit-wall.mjs`, `front/live-page.mjs`, `server/live.mjs`, `relay/worker.mjs`, `server/combos.mjs` | `live`, `relay-pass`, `combos` |
| Mesures D1 et Workers | `docs/REQUEST_USAGE.md`, `wrangler.prod.jsonc`, `migrations/` | `migrations`, `request-metrics` |

Les tests unitaires du tableau se lancent avec `node --test tests/<nom>.test.mjs`. La cartographie complémentaire et le démarrage local sont dans [CLAUDE.md](CLAUDE.md). Lire les sections utiles au lot en cours.
