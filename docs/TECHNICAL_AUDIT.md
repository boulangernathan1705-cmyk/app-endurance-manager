# Audit technique — App Endurance Manager

## Objectif

Nettoyer et stabiliser la base avant d'ajouter de nouvelles fonctions (équipes, événements solo, championnats, filtres, etc.), sans modifier le comportement utilisateur existant pendant la phase de refactorisation.

## Constats initiaux

- `app.js` concentre l'essentiel de l'interface et de la logique front dans un seul fichier d'environ 59 Ko.
- `styles.css` concentre l'ensemble des styles desktop/mobile dans un seul fichier d'environ 58 Ko.
- `server/worker.mjs` regroupe routes, validation, authentification, accès D1 et logique métier dans un seul fichier d'environ 36 Ko.
- Les catalogues catégories / voitures / circuits sont dupliqués entre le front et le Worker.
- La liste des circuits n'est pas parfaitement synchronisée : le Worker accepte `nurburgring`, alors que l'interface ne le propose pas.
- `public/` était versionné alors qu'il est entièrement régénéré par `scripts/build.mjs`.
- Un fichier `download` à la racine contenait en réalité une ancienne liste de règles `.gitignore`.
- Le schéma D1 a évolué progressivement jusqu'au modèle `participants`; les colonnes historiques des inscriptions doivent être conservées tant que la logique de propriété/compatibilité les utilise.
- Les tests API et interface existants constituent une bonne base de non-régression.
- Les protections serveur existantes (validation, rôles, cookies sécurisés, rate limiting, taille des payloads) doivent être conservées.

## Plan de refactorisation

1. Hygiène du dépôt et génération des artefacts.
2. Audit automatisé + CI.
3. Catalogue métier partagé et suppression des constantes dupliquées.
4. Découpage du front par responsabilités (API, état, événements, inscriptions, équipages, membres, utilitaires).
5. Découpage du Worker (auth, validation, repositories D1, services métier, routes).
6. Nettoyage CSS et séparation base/layout/composants/responsive.
7. Revue des migrations et index D1 sans suppression de données en production.
8. Nettoyage des assets réellement inutilisés.
9. Tests desktop/mobile et non-régression fonctionnelle.
10. PR vers `main` uniquement quand tous les contrôles sont verts.

## Règles de sécurité du chantier

- Aucun changement direct sur `main`.
- Pas de migration destructive pendant le refactor structurel.
- Chaque étape doit préserver les endpoints et comportements existants sauf correction de bug explicitement documentée.
- Les données D1 de production ne sont pas modifiées par ce dépôt de travail tant que Cloudflare reste connecté à l'ancien dépôt.
