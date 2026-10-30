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

## Tri complémentaire : essais et branches mises en pause

De nombreuses branches `claude/*`, `codex/*`, `feature/*`, `hotfix/*` et sans préfixe ont été comparées à `dev`. Les résultats observés sont souvent `diverged` avec un à quelques commits propres, ce qui est attendu si une PR a été intégrée en squash ou si un essai a été abandonné. **Ne pas réintégrer automatiquement ces commits.**

### Branches explicitement ancêtres de dev, sans commit propre

Les comparaisons ont notamment confirmé les candidates suivantes :
- `feature/grindfest-tdz`
- `feature/grindfest-multiple-rounds`
- `feature/grindfest-dev-test`
- `feature/261-discord-recap`
- `fix/grindfest-optional-twitch`
- `claude/acces-stinger-xznhdr`
- `claude/plugin-simhub-v2`
- `claude/project-thread-5rjj4k`
- `communautes`
- `events-commentes`
- `noop-temp-ignore`
- `release-sync-150`
- `sync/main-v1.54`
- `sync/main-v1.57`

L'archive `archive/dev-communautes-2026-09-24` est également ancêtre de `dev`, mais **à conserver comme archive** jusqu'à décision explicite.

### Branches divergentes constituant probablement des essais ou versions anciennes

Familles à vérifier par PR et comparaison des fichiers : `claude/memo-*`, `codex/*training*`, `feature/memo-v2`, `fix/remove-*`, `claude/mur-*`, `overlay-*`, `hotfix/v1.*`, `release/v1.*`, `fiche-*`, `fiches-combo*`, `claude/project-thread-*`. Certains travaux ont été arrêtés ou remplacés, mais leur seule divergence Git ne permet pas de les déclarer supprimables.

### Cas qui méritent une attention particulière

- `claude/project-thread-at8rnd` contient 43 commits propres par rapport à `dev`. Ne pas supprimer sur un simple critère de date.
- `feature/tdz-rally-real-comparison`, `feature/discord-daily-detailed-layout`, `fix/discord-preview-concise-headline` et d'autres branches récentes ne divergent que de quelques commits. Elles peuvent représenter une version intermédiaire déjà squashée ; vérifier les PR.
- Les PR **#569** (branche `claude/project-thread-ogkwfr`) et **#431** (branche `suite-modules`) sont ouvertes : conserver leurs branches.

## Décision de classement

- **Intégrée** : ancêtre Git de `dev`, et aucune PR ouverte ni dépendance active ; candidate au nettoyage.
- **Essai remplacé** : la fonctionnalité actuelle est vérifiée et rend les modifications obsolètes ; candidate seulement après contrôle du patch/PR.
- **En pause** : une reprise reste plausible ; conserver ou créer un tag de sauvegarde avant suppression.
- **À examiner** : commits propres, travaux récents ou PR ouverte ; conserver.

Aucune suppression historique n'est réalisée par cet audit. Le nouveau workflow de nettoyage automatique proposé porte uniquement sur les futures fusions de PR vers `dev`, et non sur le stock de branches existantes.

---

# Revue globale actualisée après le premier nettoyage (30 octobre 2026)

## État actuel

- **192 branches** relevées dans GitHub, après la suppression confirmée des 14 branches du premier lot et la création de nouvelles branches de maintenance.
- **2 PR ouvertes** : #569 (`claude/project-thread-ogkwfr`) et #431 (`suite-modules`). Conserver impérativement.
- `dev` est actuellement un descendant de `main` (0 commit propre à `main`, 1 338 commits d'avance pour `dev`). Ce compte est un indicateur d'historique, **pas** de modifications applicatives à publier sans revue.
- Le workflow dangereux de suppression massive a été remplacé sur `main`, et les 14 branches du premier lot ont disparu.

## Second lot : 6 branches confirmées intégrées à dev

Comparaison actuelle `dev...branche` : **0 commit propre à la branche**, historique entièrement dans `dev`.

| Branche | Décision |
| --- | --- |
| `claude/project-thread-9s5f96` | Candidate à suppression ciblée |
| `claude/project-thread-45sfow` | Candidate à suppression ciblée |
| `claude/project-thread-576zob` | Candidate à suppression ciblée |
| `claude/project-thread-buns8z` | Candidate à suppression ciblée |
| `claude/project-thread-d9cp4o` | Candidate à suppression ciblée |
| `claude/project-thread-niyep3` | Candidate à suppression ciblée |

Ces six branches ne sont pas parmi les deux branches des PR ouvertes. Refaire la vérification de leur SHA, des PR et de leur ancêtre de `dev` immédiatement avant suppression.

`archive/dev-communautes-2026-09-24` est également intégrée, **mais doit être conservée comme archive**.

## Branches avec changements potentiellement réutilisables : conserver

- `claude/project-thread-at8rnd` : **43 commits propres** relativement à `dev`. Les différences concernent notamment `server/discord-weekly-format.mjs`, `server/recap-discord.mjs`, la documentation et les tests de récap Discord.
- `overlay-dash` : **5 commits propres** ; concerne le plugin C# SimHub, les dashes et leur livraison. Ne pas éliminer sans rapprochement avec le plugin actuellement distribué.
- `suite-modules` : PR #431 ouverte, contient notamment des éléments SimHub et de packaging. Conserver.
- `claude/project-thread-ogkwfr` : PR #569 ouverte, concerne `front/members-page.mjs`. Conserver.
- Branches récentes de l'aperçu Discord : `feature/discord-daily-detailed-layout`, `feature/discord-evening-concept-preview`, `feature/discord-evening-real-preview`, `feature/discord-message-preview-v2`, `feature/tdz-rally-real-comparison`, `fix/discord-preview-comparison`, `fix/discord-preview-concise-headline`. Leur ancien patch peut avoir été repris par squash : vérifier avant suppression.

## Branches d'essais/anciens chantiers : potentiellement obsolètes, mais non approuvées pour suppression

- Mémo abandonné : `feature/memo-v2`, `claude/memo-*`, `codex/memo-collection-cycle`, `fix/remove-memo-v2`, `fix/remove-training-memo`.
- Mur des stands mis en pause : `claude/mur-*`, `hotfix/bouton-mur`, certaines branches `feature/endurance-preparation`.
- Essais d'interface : `fiche-*`, `fiches-combo*`, `analyse-*`, `carte-fluide`, `palette-sans-violet`, `overlay-essais`.
- Anciennes versions et corrections : `hotfix/v1.*`, `release/v1.*`, autres `claude/project-thread-*`.
- Branches issues de Codex : `codex/endurance-training-checklist`, `codex/pit-training-usability`, `codex/training-mockup`.

**Important :** la plupart de ces branches ont des commits propres à leur historique. Elles peuvent correspondre à du code déjà squashé, à des essais abandonnés ou à des fonctions en pause. Leur nom et leur statut `diverged` ne prouvent pas l'absence de contenu inédit.

## Décision opérationnelle

1. Autoriser **seulement les 6 branches du second lot** à entrer dans une future liste de suppression après dernier contrôle du SHA et des PR. Ne pas relancer le premier lot de 14 (déjà supprimé).
2. Conserver `main`, `dev`, toutes les archives, les 2 branches de PR ouvertes et les branches SimHub/Discord ayant des commits propres.
3. Pour supprimer d'autres branches divergentes, comparer leur patch à la version fonctionnelle et à la PR de fusion squash, puis classer chacune comme `repris`, `abandonné`, `en pause` ou `inédit`.
4. Ne pas utiliser le workflow de suppression massive historique, et ne pas confondre réduction du nombre de branches et réduction de la dette de code.

**Périmètre de cette revue :** analyse de branches et inspection de fichiers ciblés par GitHub ; ni exécution de tests applicatifs ni audit de sécurité exhaustif du code.
