# Architecture d’Endurance Manager

## Où intervenir

| Périmètre | Point d’entrée | Contrat à préserver | Vérification ciblée |
| --- | --- | --- | --- |
| Connexion Discord | `server/discord-oauth.mjs` | Préserver les cookies par environnement, le retour vers la communauté et l’usage unique de l’état OAuth. | `sites.test.mjs`, `api.test.mjs` |
| Session, cache de courses | `front/app/api-client.mjs`, `front/app/race-service.mjs` | Dédupliquer et revalider les listes dans leur contexte de session. Invalider après une mutation ou un changement d’accès. | `api-client.test.mjs`, `event-refresh.test.mjs`, `week-view.test.mjs` |
| Routes, inscriptions et départs | `server/worker.mjs`, `server/event-list.mjs`, `server/event-departures.mjs`, `server/api-shared.mjs` | Lors du retrait d’un départ, préserver les inscriptions et équipages selon les règles de report. Appliquer les écritures du report avec la version attendue de la course. | `api.test.mjs`, `event-refresh.test.mjs`, `registration-pilot-flow.test.mjs` |
| Supervision du bot | `front/admin/discord-supervision.mjs`, `server/api-platform.mjs` | Charger le suivi à l’ouverture du panneau. La vérification d’un fil est une lecture réservée aux gestionnaires de la plateforme. | `admin-supervision.spec.mjs`, `discord-diagnostic.test.mjs` |
| Tâches Discord | `server/worker-with-migrations.mjs`, `server/discord-weekly.mjs`, `server/recap-discord.mjs`, `server/crew-discord.mjs` | Conserver la cadence, les limites d’appels, la fermeture sûre des fils et vocaux et les règles de mentions. | `recap-discord.test.mjs`, `crew-discord.test.mjs` |
| Rappel sur le site | `server/race-bell-reminders.mjs` | Conserver le filtre par communauté, les épreuves officielles partagées, le seuil de 24 h et le marquage avant l’envoi. | `crew-discord.test.mjs`, `event-last-start.test.mjs` |
| Fiches combo | `front/combos-page.mjs`, `front/combos-stats.mjs`, `server/combos.mjs` | Préserver l’API et les droits du plugin SimHub. La ligne équipage donne le même poids à chaque pilote affiché. | `combos.test.mjs`, `combos-stats.test.mjs` |
| Mur des stands | `front/pit-wall.mjs`, `front/live-page.mjs`, `server/live.mjs`, `relay/worker.mjs` | Préserver les mises à jour de session et la reconnexion. Vérifier la branche du relais avant de toucher à son protocole ou à ses dépendances. | `live.test.mjs`, `relay-pass.test.mjs`, `pit-wall-idle.spec.mjs` |
| CSS et responsive | [Charte graphique](DESIGN_SYSTEM.md) | Garder l’ordre de cascade et les variantes de chaque communauté et simulateur. | `scripts/css-compare.mjs`, `tests/visual/` |

Les pages et le plugin passent par le Worker pour leurs API. Les requêtes métier du site accèdent à D1 via le binding `DB`. Le suivi du muret passe par le relais lorsqu’un laissez-passer est disponible. Le plugin, le site et le relais partagent le contrat de télémétrie. Voir les [règles de déploiement](../DEPLOYMENT.md) avant de le modifier.

## Valider un lot

- Lancer `npm run check`, qui contrôle aussi les cycles d’imports statiques, et les tests ciblés du tableau. Les tests navigateur utilisent une base locale ou des API simulées.
- Vérifier les interfaces avec plusieurs communautés et des profils distincts. Pour une retouche CSS, garder les références visuelles et comparer la géométrie.
- Pour D1, comparer le plan, les résultats et leur ordre avant/après. Mesurer les lignes lues par exécution et par période dans Cloudflare sur un trafic comparable. Les instructions mesurées en SQLite local ne sont pas des lignes facturées par D1.
- Contrôler la version servie sur `dev` et `dev2` avant validation. Voir [l’usage des requêtes](REQUEST_USAGE.md) et [les permissions Discord](DISCORD_ROLES.md).
