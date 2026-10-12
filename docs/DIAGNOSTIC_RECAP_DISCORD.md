# Diagnostic du récap Discord — 12 octobre 2026

Référence examinée : main d2231ca (v1.28, #312). Correction locale : fix/discord-recap-permissions.

## Captures

La capture du récap hebdomadaire montre Portimao avec les horaires, aucun inscrit et une bannière. La capture du salon de course montre aucun message et le sujet endurance-manager:d72035b9a3e50a00f2dee22a. Ce sujet est le marqueur de récupération prévu par ensurePublication/publish, pas une publication de récap. Le garder permet de retrouver un salon après une interruption.

## Divergence constatée dans le code

Le récap historique publie par webhook (discord-weekly.mjs). Les modes général et par événement du nouveau module publient par token de bot (recap-discord.mjs), avec leurs propres réglages, verrous et identifiants de message. Le succès d’un webhook ne prouve pas les droits du bot dans un autre salon. Un test explicite peut créer des salons sans activer ni adopter le nouveau module (enabled=0, adopted=0) : le webhook continue alors normalement. Après adoption, les webhooks sont ignorés ; désactiver ensuite le nouveau module ne les réactive pas automatiquement.

Le passage à une catégorie par course (#267, commit 33a325b) crée une catégorie indépendante sans permission_overwrites. Les droits de la destination sont validés, mais ne sont pas transportés vers cette catégorie. Des autorisations locales du bot, ou des restrictions d’accès aux membres, peuvent ainsi disparaître. La validation oublie aussi Embed Links (16384), alors que les messages sont exclusivement des embeds. Le changement #310/#312 élargit la création aux courses officielles LMU sans inscrit ; il ne modifie pas l’envoi du message mais expose davantage ce chemin.

## Correction minimale

Valider et demander Intégrer des liens dans les deux modes ; copier les règles d’accès exactes de la catégorie choisie lors de la création d’une nouvelle catégorie de course ; conserver le code Discord pour les refus HTTP 400. Aucun élargissement automatique des droits des salons existants. Les restrictions Discord sur les permissions que le bot peut définir restent applicables : un refus de création est remonté, sans supprimer ces règles.

Aucun changement de sélection des courses, inscriptions, communautés, nonce, routage, messages existants, nettoyage à 24 heures ou salons vocaux. Aucune migration supplémentaire. Les migrations 0060 (réglages et publications) et 0061 (parent des vocaux) sont présentes et appliquées dans les tests. Leur application en production n’a pas été vérifiée.

## Vérifications

npm run check : 280 tests réussis, 0 échec ; compilation Worker et audit strict réussis. Les 27 tests du module couvrent les deux modes, les courses officielles sans inscrit, l’isolation, les permissions, les verrous, les migrations de salons, le nettoyage et la reprise après un refus d’envoi sans doublon. Les appels Discord sont simulés ; aucun message réel envoyé.

## Confirmation en production nécessaire

Pas d’accès à la configuration Discord ni à la base ou aux logs Cloudflare de production dans cette session. La cause exacte de ce salon vide reste à confirmer : lire community_recap_settings (mode, enabled, adopted, destination_id, last_error), puis la publication de Portimao (channel_id, category_id, message_id, content_hash), les permissions effectives du bot dans la catégorie et le salon, et l’erreur de synchronisation. Un code 403 indique un refus de permissions ; un 400 est un refus de payload à examiner ; une interruption ou un budget épuisé doit reprendre au prochain passage. Vérifier que le Worker utilise le bot du même serveur et que les migrations 0060/0061 sont appliquées.

Pour le salon existant, corriger uniquement les droits nécessaires du bot en conservant les restrictions des membres, puis utiliser le test du module avec les réglages actuels : le code reprend le channel_id existant et publie son premier message. Ne pas supprimer le salon ni effacer son marqueur. Une publication par webhook encore visible peut être un ancien message ou un test non adopté ; son aspect seul ne suffit pas à déterminer le mode actif.

Aucune modification de main, aucun déploiement, aucune modification du serveur Discord.
