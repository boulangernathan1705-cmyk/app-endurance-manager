# Audit de maintenance — Endurance Manager

Audit du 14 septembre 2026, uniquement sur `dev`, depuis `bc4fda59e9892827be2b9b853c2a2072e0fe4deb`. Revue du code actuel et de l’historique des corrections. Ce document remplace l’ancien bilan qui décrivait plusieurs modules déjà supprimés.

## Nettoyage effectué

| Fichier | Modification et preuve |
| --- | --- |
| `front/app/crews.mjs` | Retrait de l’import inutilisé `registrationCarLabel` et de l’alias sans appel `renderCrews`. Le commit `b87eca2` avait remplacé son dernier appel par `renderPilots`. |
| `front/app/registration.mjs` | Retrait de l’import `app`, jamais utilisé dans ce module. |
| `front/app/core.mjs` | Retrait de `pilotWishes` et de son seul auxiliaire `pilotAvailability`. Aucun consommateur restant dans le dépôt ; les cartes actives utilisent `renderRegistration` et la timeline partagée. |
| `README.md`, `DEPLOYMENT.md`, `docs/DEPLOYMENT.md` | Correction des indications DEV/PROD, du point d’entrée Workers, du routage telemetry, du build CSS et de la page d’aide. |
| `docs/DISCORD_WEEKLY.md` | Description du comportement existant : courses en cours avec équipage, prochains départs de la semaine disponible, cron toutes les 15 minutes, recréation après 404. |
| `docs/TECHNICAL_AUDIT.md` | Bilan actuel, preuves et points conservés pour examen séparé. |

Aucun CSS, HTML, texte affiché, rôle, route, API, Worker, schéma, migration, image, dépendance ou workflow n’est modifié. Les versions d’URL existantes sont conservées. Aucun changement de données distantes, envoi Discord, déploiement manuel ou publication vers `main` n’est effectué dans cet audit.

## Revue par domaine

| Domaine | Constat |
| --- | --- |
| JavaScript et modules | Analyse syntaxique de 65 fichiers JS/MJS, tests et scripts compris ; 67 imports locaux statiques/dynamiques à chemin littéral résolus. Deux imports inutilisés confirmés. Les écouteurs, conditions métier et rendus actifs sont conservés. |
| Anciens correctifs | Les modules supprimés lors de la modularisation ne sont pas restaurés. Le maintien de l’accordéon après rejoindre/quitter, le pont vers le formulaire modal et les correctifs de sélection restent actifs. |
| CSS et responsive | Analyse du bundle par Chromium : 2 441 règles/groupes CSS, avec media queries et container queries. Des répétitions existent, notamment `.duration-*`, `.site-nav-shell`, `.crew-card` et `.fold-index`. Elles sont conservées : l’ordre de cascade et les contextes de chargement doivent être vérifiés avant consolidation. Les répétitions `.presence-time[class]` réinitialisent les graduations à chaque seuil de container ; elles ne sont pas de simples doublons. |
| HTML | Les pages générées ne présentent ni identifiant HTML dupliqué détecté ni chemin local manquant pour scripts, feuilles de style et images statiques. Ce contrôle ne constitue pas une validation exhaustive d’accessibilité ou de chaque état DOM dynamique. |
| Workers / Cloudflare | Les configurations DEV et PROD utilisent des Workers et D1 distincts. Le point d’entrée réel est `server/worker-with-migrations.mjs`. Les chemins `/api/*` et `/telemetry/*` sont prioritaires, les autres fichiers relèvent des Static Assets. |
| D1 | Les 17 migrations passent dans l’ordre sur SQLite locale vide, chacune dans une transaction ; `foreign_key_check` est vide. Les numéros `0016` sont partagés par deux noms distincts : aucun renommage. Le risque historique sur données existantes est détaillé ci-dessous. |
| Discord | Revue de l’OAuth, de la sélection des départs, du formatage, des mentions désactivées, du hachage, du verrouillage et de la synchronisation différée. Code conservé. Tests unitaires inclus dans les 99 tests ; aucun webhook réel appelé. |
| Tests et workflows | `check` lance les tests Node, le build Workers et l’audit strict. Playwright couvre six profils mais reste séparé de `check`. Plusieurs tests UI vérifient le code source plutôt qu’un rendu réel. Les limites du workflow navigateur et du nettoyage de branches sont signalées ci-dessous. |
| Fichiers et images | Les 26 images d’aide sont toutes référencées via les arguments de `helpScreenshot`/`helpScreenshots` et existent. L’audit automatique les signale à tort parce qu’il cherche des chemins complets. Aucun asset supprimé sur cette seule heuristique. |
| Cache et versions | Les liens CSS sources versionnés sont remplacés au build par `/app.css`. Les imports JS combinent parfois un même chemin avec et sans `?v=`. Aucune uniformisation : cela peut modifier les instances de modules et l’ordre d’exécution. En-têtes et URLs restent inchangés. |
| Documentation | Les guides techniques sont alignés sur les fichiers actifs. Les archives documentaires restent conservées comme historique. |

## Points à surveiller, non modifiés

1. **Migration historique `0011` sur une base remplie.** Elle fait `PRAGMA foreign_keys=OFF`, puis supprime et recrée `registrations`. Dans une transaction SQLite déjà ouverte, ce pragma ne désactive pas les clés étrangères : sur une fixture locale contenant un équipage et son membre, le nombre de lignes de `crew_members` passe de 1 à 0 après migration. Les tests existants ne couvrent pas cette reprise de `0011` sur données remplies. Ce résultat local ne démontre pas qu’une perte a eu lieu dans D1 distant. Ne pas modifier ni rejouer une migration déjà appliquée dans un chantier de maintenance.
2. **Workflow `cleanup-merged-branches.yml`.** Malgré son nom, il supprime toutes les branches sauf `main` et `dev`, sans vérifier leur fusion. Il est manuel et n’a pas été exécuté.
3. **Validation navigateur DEV.** La sonde `/api/session` redirige vers Cloudflare Access. Le workflow n’a pas de mécanisme d’authentification Access ; son attente utilise `curl --fail` sans suivi ni rejet explicite des redirections. Elle ne vérifie pas non plus que le déploiement servi correspond au SHA testé. Le [run navigateur initial](https://github.com/boulangernathan1705-cmyk/app-endurance-manager/actions/runs/34815678992) est déjà en échec ; le [run qualité initial](https://github.com/boulangernathan1705-cmyk/app-endurance-manager/actions/runs/34815679006) est réussi.
4. **Build Pages et exemple Wrangler anciens.** `npm run build` copie `server/worker.mjs` vers `public/_worker.js`, alors que ses imports relatifs `./core.mjs` et `./telemetry.mjs` ne sont pas copiés à cet endroit. Le chemin Workers utilisé actuellement passe. `wrangler.workers.example.jsonc` n’inclut pas le wrapper de migrations, telemetry ni le cron des configurations actives. Ces chemins ne sont ni supprimés ni réécrits sans savoir s’ils ont encore des consommateurs externes.
5. **Couverture serveur partielle.** Les tests API utilisent surtout le Worker interne et SQLite/mocks ; ils ne valident pas tout le cycle réel du wrapper, des migrations de récupération, des secrets, de la concurrence D1 et des envois Discord. Les promesses de préparation de schéma mémorisées au niveau module sont conservées. `isDepartureRelevant` n’a plus de consommateur et `nextParisWeek` est uniquement utilisé par les tests ; le nettoyage du module Discord est laissé hors de cette modification.
6. **Montée en charge et télémétrie.** Les requêtes `IN (...)` de `listEvents` et du récap Discord grandissent avec le nombre d’événements/participants ; aucun essai de charge D1 distant n’est réalisé. `reportClientError` appelle à la fois `sendBeacon` et `fetch`, ce qui peut produire deux enregistrements. Supprimer l’un des envois changerait le comportement de secours, donc aucune modification.
7. **Audit et installation.** Les faux positifs sur les captures d’aide restent une limite de `audit:strict`. Il n’existe pas de lockfile ; Playwright est fixé à `1.55.0`, mais une installation transitive n’est pas verrouillée. Aucune mise à jour de dépendance ni changement des règles de contrôle dans cet audit.

L’ancien point sur le raccourcissement d’une course est déjà traité dans `server/worker.mjs` : l’UPDATE refuse les disponibilités horaires situées au-delà de la nouvelle durée. Il ne faut pas le présenter comme un défaut encore ouvert ni retirer cette protection.

## Vérification des modifications

- `npm run check` avant et après nettoyage : **99 tests réussis**, 0 échec ; build Workers et audit strict réussis. Environnement local : Node `24.19.0`, contre `22.13.0` dans le workflow qualité.
- Comparaison des arbres syntaxiques avant/après : les trois modules ont exactement le même code hors des deux imports et des trois déclarations supprimés.
- Comparaison SHA-256 de tous les fichiers produits par le build : seuls `front/app/core.mjs`, `front/app/crews.mjs` et `front/app/registration.mjs` diffèrent. Les HTML, CSS, images, fichiers de routage, en-têtes et autres modules publiés restent identiques octet par octet.
- Application locale de toutes les migrations sur une base vide et contrôle des clés étrangères : réussis. Reproduction isolée du risque `0011` sur données remplies : confirmée localement, sans accès à D1 distant.
- `git diff --check` : réussi.
- Suite existante Playwright lancée avec `npm run compat:test -- --workers=6 --retries=0 --output=/tmp/endurance-playwright-results` : **36 scénarios en échec, aucun validé**. Chromium/Android rencontrent `EAI_AGAIN` ou `ERR_EMPTY_RESPONSE` vers DEV ; Firefox expire à la création de page ; WebKit/iPhone ne démarrent pas faute de bibliothèques système. La sonde HTTP séparée atteint Cloudflare Access. Ce sont des blocages de validation, pas une preuve de régression du nettoyage ; aucun test ni contrôle d’accès n’a été assoupli pour obtenir un résultat vert.

Les vérifications locales démontrent la portée limitée du nettoyage ; elles ne certifient pas tous les rôles et états visuels d’un déploiement réel.

## Règles de maintenance

- Travailler sur `dev` ; aucune fusion vers `main` ni release sans accord explicite.
- Vérifier les références, les chemins dynamiques et l’historique avant toute suppression.
- Ne pas fusionner des CSS sur la seule ressemblance : tenir compte de l’ordre de cascade, des media/container queries, du rôle, du jeu et de chaque page.
- Préserver les migrations appliquées, les droits serveur, les versions optimistes, les cookies sécurisés et les protections de validation.
- Tester une modification de comportement ou de déploiement dans un chantier distinct de ce nettoyage.
