# Audit des branches et règles de maintenance — 30 octobre 2026

## Périmètre

Dépôt : `app-endurance-manager`, audit sans modification des branches existantes.
Inventaire effectué via GitHub : **203 branches**.

| Catégorie | Nombre |
| --- | ---: |
| `claude/*` | 77 |
| `hotfix/*` | 43 |
| Sans préfixe | 33 |
| `fix/*` | 20 |
| `feature/*` | 19 |
| `codex/*` | 4 |
| `release/*` | 4 |
| `sync/*` | 2 |
| `archive/*` | 1 |

## Branches durables

- `main` : production ; protéger et ne pas modifier directement.
- `dev` : intégration ; préserver les changements en cours et les tests.
- Les autres branches sont temporaires, sauf archives explicitement justifiées.

## Contrôles avant suppression

1. Vérifier la PR liée (ouverte, fusionnée, fermée sans fusion) et le propriétaire du travail.
2. Comparer les commits et, **en cas de squash**, le contenu effectif du patch avec `dev` ou `main`.
3. Vérifier l'absence de déploiement, de prévisualisation ou de session Claude/Codex active dépendant de la branche.
4. Conserver un tag/une référence si la branche porte une version ou un point de restauration encore nécessaire.
5. Supprimer uniquement les branches validées, par lots limités, avec inventaire préalable ; ne jamais supprimer `main` ni `dev`.

**Un historique divergent ne prouve pas que le code diffère** : le squash produit souvent des commits différents pour un contenu déjà intégré. Inversement, une branche sans PR n'est pas automatiquement inutile.

## Échantillon confirmé (comparaison contre dev)

### Branches intégrées dans l'historique de dev — candidates au nettoyage après vérification opérationnelle

- `feature/grindfest-tdz`
- `feature/grindfest-multiple-rounds`
- `sync/main-v1.54`
- `sync/main-v1.57`

La branche `archive/dev-communautes-2026-09-24` est également ancêtre de `dev`, mais sa vocation d'archive invite à la conserver provisoirement.

### Branches divergentes — aucune suppression automatique

Exemples : `feature/memo-v2`, `codex/memo-collection-cycle`, `overlay-dash`, `feature/discord-message-preview-v2`, `feature/tdz-rally-real-comparison`, `hotfix/v1.85`. Les commits propres doivent être rapprochés des PR fusionnées et des patches actuels avant décision.

## Pull requests ouvertes observées

- PR #569 : réglages d'emplacement des salons Discord, cible `dev`.
- PR #431 : distribution des plugins SimHub, cible `dev`.

Ne pas clore ces PR dans une campagne de nettoyage sans validation fonctionnelle.

## Règle de travail pour Claude et Codex

1. Partir d'une version fraîche de `dev` (hors `hotfix/*` urgent, qui suit la procédure de release).
2. Une branche thématique par fonctionnalité ou correction : `feature/...`, `fix/...`.
3. Petites itérations sur la même branche et la même PR tant que le sujet reste identique.
4. Passer `npm run check` ; ajouter les tests du comportement modifié.
5. Fusionner vers `dev` seulement après revue et tests ; supprimer ensuite la branche temporaire lorsque c'est sûr.
6. Pour publier en production, respecter exclusivement la procédure `dev` → `main` documentée dans `docs/DEPLOYMENT.md`.

## Contrôles complémentaires à réaliser

- Achever les comparaisons des 203 branches et établir une liste nominative de suppression ; ne pas déduire la sécurité d'une suppression du seul nom.
- Vérifier le statut réel des checks et des workflows Cloudflare sur chaque type de PR.
- Revoir les modules d'API sensibles (autorisations communautaires, migrations, interactions Discord), puis exécuter les tests et un contrôle de scénarios navigateur.
- Une vérification statique partielle ne constitue pas un audit de sécurité exhaustif.
