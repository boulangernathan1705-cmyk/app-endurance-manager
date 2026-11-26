# Vérifications avant la publication du lot d’optimisation

Ce suivi reprend les points de l’audit du 25 novembre 2026. La référence de production est le commit `0f9051c`. Les mesures locales et les vérifications sur dev portent sur le lot de consolidation.

| Point de l’audit | État et preuve attendue |
| --- | --- |
| 1–2. Objectifs et référence | Les comparaisons portent sur les contrats, la géométrie, les requêtes et les dépendances. La longueur des fichiers reste un indicateur pour repérer les responsabilités mélangées. |
| 3. CSS | La charte, les feuilles de navigation et les pages ont été regroupées par rôle. Le découpage a conservé la cascade. Les surcharges historiques qui participent au rendu demandent une preuve d’équivalence avant suppression. Contrôler sur dev les fiches Endurance validées, les petits écrans et les variantes de communauté. |
| 4. Administration | Configuration et aperçus Discord, supervision de plateforme, diagnostic par communauté et recadrage ont leurs propres modules. Les vues Membres, Rôles, Modules et Apparence restent coordonnées par le panneau. |
| 5. Bot Discord | Les lectures des récapitulatifs, leur publication et les rappels sur le site sont séparés. Les opérations sur les vocaux et les fils restent couvertes par des tests avec Discord simulé. Les budgets, les mentions et la planification restent des invariants. |
| 6. Serveur | Lecture des courses, report des départs et connexion Discord sont isolés. Les contrats des routes, le cloisonnement des inscriptions et le retour OAuth sont contrôlés par les tests existants. |
| 7. Frontend | Les requêtes de courses et le cache sont mutualisés. La séparation des champs de formulaire a retiré les cycles identifiés. Les préférences de coéquipiers et le commentaire ont leur propre module commun au formulaire et au créateur d’équipage. Le répartiteur d’actions et le parcours d’inscription restent des points d’entrée de coordination. |
| 8. Cloudflare et D1 | Les trois requêtes du relevé ont été traitées. Comparer les résultats avant/après, les plans et les métriques par exécution. En production, comparer aussi les lignes lues, les écritures, les erreurs et la fréquence sur deux périodes de trafic comparable. |
| 9. Caches et actualisations | Le cache des courses est contextualisé et les réponses conditionnelles sont testées. Le site détecte le changement de version via `/front/version.json`. Cloudflare revalide ses ressources statiques par défaut. Vérifier aussi le comportement d’un onglet ouvert pendant un déploiement, dont un formulaire en cours. |
| 10. Muret et télémétrie | Le rendu se suspend à vide, la carte évite les écritures redondantes et les onglets gardent le focus. Il reste à relever le comportement pendant une vraie session SimHub et à confirmer le branchement du relais sur son compte Cloudflare. |
| 11. Fiches combo | Les calculs de rythme et de pneus sont séparés du rendu. Le résumé par condition réutilise l’agrégat des pneus et évite une requête D1. Les tests couvrent le contrat du plugin et les anciennes télémétries. Voir le relevé ci-dessous. |
| 12. Documentation | [Architecture](ARCHITECTURE.md), [charte](DESIGN_SYSTEM.md), [permissions](DISCORD_ROLES.md) et [usage des requêtes](REQUEST_USAGE.md) indiquent où commencer et quels tests lancer. Les économies de tokens restent à mesurer sur une tâche réelle. |
| 13. Qualité | Les contrôles existants couvrent le build, les parcours et les références visuelles. Le graphe des imports statiques est désormais vérifié. L’inventaire tient compte des logos et émojis construits dynamiquement et des captures Playwright. Chaque ressource signalée par l’audit automatique doit être vérifiée sur ses usages dynamiques avant une éventuelle suppression. |
| 14. Régressions et cloisonnement | Rejouer les parcours pilote et administrateur de plusieurs communautés. Les tests du dépôt couvrent les permissions des courses partagées, les écritures concurrentes et le report des inscriptions. Le chantier de protections GitHub est suivi dans l’audit sécurité. |
| 15–17. Branches, validation et publication | Garder des branches et contrôles par sujet. Vérifier ensemble les lots et la version réellement servie sur dev et dev2. Relever les différences d’apparence dues aux PR visuelles validées séparément. La publication en une seule fois sur main demande le feu vert de Nathan. |

## Vérifications sur la version intégrée

- Inscription, modification, changement de communauté, course officielle partagée, course sans horaire, puis ajout ou retrait d’un départ.
- Cycle de connexion Discord, diagnostic administrateur et supervision de plateforme avec fixtures. Le bot réel reste désactivé sur dev.
- Fiches LMU et iRacing sur téléphone et ordinateur, puis ouverture d’une page conservée pendant un changement de version.
- Muret sur une vraie session SimHub, avec rafraîchissement, changement d’onglet et reconnexion. La documentation du relais indique une branche de production à confirmer dans Cloudflare avant toute intervention sur son code.
- Vérification du commit publié et mesure D1 après la mise en production. Les instructions SQLite locales ne mesurent pas les lignes lues facturées.

[Documentation Cloudflare sur la revalidation des ressources](https://developers.cloudflare.com/workers/static-assets/headers/) et [le décalage entre versions](https://developers.cloudflare.com/workers/versions-and-deployments/version-skew/).

## Relevé D1 des fiches combo

D1 Insights, du 19 au 26 novembre 2026 à 12 h, heure de Paris. Les requêtes impliquant une table `combo_*` ont totalisé environ 20 623 lignes lues et 431 écrites sur dev. Quelques requêtes identifiées en production représentent deux lignes lues et aucune écrite sur cette période. La requête retirée du résumé représente 2 995 lignes lues pour 73 exécutions sur dev. Ces compteurs sont des estimations historiques. Le prochain relevé doit comparer les lignes lues par ouverture de fiche avec un jeu de sessions comparable. La conservation des télémétries est inchangée.
