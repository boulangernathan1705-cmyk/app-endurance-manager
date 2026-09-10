# Audit technique — App Endurance Manager

## Objectif

Nettoyer et stabiliser la base avant d'ajouter de nouvelles fonctions (équipes, événements solo, championnats, filtres, etc.), sans modifier le comportement utilisateur existant pendant la phase de refactorisation.

## État après optimisation

- Le front reste découpé en modules sources lisibles, mais le build Workers rassemble toutes les feuilles CSS nécessaires au démarrage dans `public/app.css`.
- L’aide n’est plus chargée au démarrage : `front/help-loader.mjs` charge `help.js` et `help.css` uniquement au premier clic sur **Aide**.
- Les anciennes couches `front/my-entries-coherence.mjs`, `styles/my-entries-coherence.css` et `front/mobile-ui.mjs` ont été supprimées après vérification de leur obsolescence.
- `front/layout-polish.mjs` ne contient plus l’ancienne implémentation de **Mes inscriptions** ; la vue native et ses styles sont désormais la source active.
- `front/event-entry-state.mjs` ne surveille plus en continu tout le DOM : l’état des départs est normalisé directement à la suite des actions de navigation.
- Le créateur d’équipage et le changement d’état Ouvert/Complet réutilisent les données événement déjà affichées avant de refaire une lecture `/api/events`.
- La bannière principale 2048×512 a été recompressée de 1 292 670 à 214 564 octets, soit environ 83 % de réduction, sans changement de dimensions ni de cadrage.
- Le validateur d’images refuse désormais une bannière principale supérieure à 300 000 octets afin d’éviter une régression de poids.
- Le binding Cloudflare `ASSETS` inutilisé a été retiré et Wrangler minifie le Worker avant déploiement.
- Les réponses API restent explicitement en `Cache-Control: no-store`; les assets statiques utilisent le comportement natif de Workers Static Assets et ses ETag.
- La base D1 `fmt-endurance`, son binding `DB`, les migrations existantes et la logique d’authentification restent inchangés.

## Contrôles automatiques

`npm run check` exécute les tests, le build Workers et l’audit strict. L’audit vérifie notamment :

- l’utilisation du catalogue métier partagé par le front et le serveur ;
- la cohérence des images de circuits ;
- l’absence du binding Cloudflare `ASSETS` lorsqu’il n’est pas utilisé ;
- la minification Wrangler ;
- le routage prioritaire limité aux routes `/api/*` ;
- la présence d’une unique feuille `public/app.css` dans le build ;
- l’absence d’anciens imports CSS ou de règles de cache statique contradictoires.

## Règles pour les prochaines évolutions

- Ne pas modifier directement `main` pour un chantier structurel important : travailler par branche et PR avec preview Cloudflare.
- Ne pas ajouter une nouvelle feuille ou un nouveau module uniquement pour corriger une couche précédente si la logique peut être intégrée proprement à la source active.
- Réutiliser `app.eventViewData` pour les données déjà présentes à l’écran avant d’ajouter un nouvel appel `/api/events`.
- Réserver les `MutationObserver` aux transformations qui dépendent réellement de mutations DOM asynchrones ; privilégier les appels directs après les actions connues.
- Charger à la demande les fonctions lourdes qui ne sont pas nécessaires au parcours principal.
- Ne pas ajouter de migration destructive dans une passe de nettoyage structurel.
- Conserver la validation serveur, les rôles, les cookies sécurisés, le rate limiting et les contrôles de version optimistes.
