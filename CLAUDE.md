# Instructions pour Claude

Site Endurance Manager (endurances LMU et iRacing, communautés Discord). Réponses à Nathan en français, courtes.
Devise : « La simplicité, c'est la sophistication suprême » : interface la plus simple, textes courts.

À lire selon le besoin, sans les recopier ici : `README.md` (droits, architecture), `DEPLOYMENT.md`
(environnements, charte, tests visuels, règles de maintenance), `docs/` (un fichier par module Discord).

## Où chercher

| Sujet | Fichiers |
| --- | --- |
| API, routes `/api/*` | `server/worker.mjs` (gros fichier : chercher la route avec Grep, lire seulement la section) |
| Entrée Worker, en-têtes, migrations | `server/worker-with-migrations.mjs` |
| Accès, rôles, communautés | `server/access.mjs`, `server/community.mjs`, `server/core.mjs` |
| Discord : affiche du jour, calendrier, fils, vocaux | `server/discord-*.mjs`, `server/recap-discord.mjs`, `server/crew-discord.mjs` |
| Pages endurance/events (front) | `front/app/*.mjs` (point d'entrée `app.js`), vues `*-view.mjs`, formulaires `*-form.mjs` |
| Administration | `front/members-page.mjs` |
| Données partagées front/serveur | `shared/` (catalogue voitures/circuits, durées, stream) |
| Styles | `styles/tokens.css` (valeurs de la charte), `styles/*.css` |
| Base D1 | `migrations/NNNN_nom.sql` (numéro suivant le dernier) |
| Build | `scripts/build.mjs` (toute nouvelle page `.html` s'y ajoute, et dans `run_worker_first` de `wrangler.prod.jsonc`) |
| Tests | `tests/<sujet>.test.mjs` (même nom que le module), navigateur `tests/compat/`, visuels `tests/visual/` |

À ne pas lire en entier : `CHANGELOG.md` (lire seulement la dernière version), `public/` (généré),
`images/`, `tests/visual/__screenshots__/`, `docs/archive/`, `package-lock.json`.

## Commandes

- Un test : `node --test tests/<sujet>.test.mjs`
- Avant chaque push : `npm run check` (tests + build Workers + audit strict ; c'est le contrôle `check` de la CI)
- Tests navigateur et visuels : tournent dans la CI (`browser-compatibility`) ; refaire les références visuelles
  seulement sur GitHub (voir `DEPLOYMENT.md`).

## Règles de travail

- Branche de travail → PR vers `dev` (Claude fusionne ses PR vertes dans `dev`). Production = PR `dev → main`
  seulement après le « go prod » de Nathan ; dire alors tout ce qui part avec.
- `CHANGELOG.md` s'écrit à la release (`## vX.Y — date`), pas dans chaque PR. Il alimente la page Nouveautés.
- Correctif urgent : branche `hotfix/*` vers `main`, puis `main` refusionné dans `dev`.
- Nouvelle idée de fonctionnalité ou d'interface : proposer d'abord, construire après l'OK de Nathan.
  Correctif de bug : directement vers `dev`.
- Jamais de migration destructive ; ne jamais activer les modules Discord sur le dev (liés au serveur FMT réel).
- Nouveau style : variables `var(--em-…)` de `styles/tokens.css`, pas de valeur brute.
