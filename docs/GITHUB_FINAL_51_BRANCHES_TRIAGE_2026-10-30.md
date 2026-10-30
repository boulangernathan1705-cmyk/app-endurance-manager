# Revue finale des 51 branches — 30 octobre 2026

## Méthode et limites

- Inventaire GitHub actualisé : **51 branches** avant création de cette branche documentaire.
- Chaque branche de cet inventaire a été comparée à `dev` en vérifiant le nombre de commits propres (`ahead_by`) et les fichiers divergents visibles.
- Une recherche de PR par branche a été faite pour les anciens travaux principaux. Une PR fusionnée et un nom correspondant ne suffisent pas à prouver qu'aucun travail supplémentaire n'a été ajouté après sa fusion.
- **Aucune branche existante n'est supprimée par ce rapport.** Les 57 suppressions des quatre premiers lots et les 106 suppressions constatées après nettoyage global restent confirmées par la vérification des noms, mais le total de branches a évolué au fil des branches de maintenance.
- Les écarts `ahead_by` sont mesurés relativement à `dev`, pas des fonctionnalités inédites prouvées : une fusion par squash peut rendre l'historique divergent.

## Répartition exhaustive

| Famille | Branches | Action recommandée |
| --- | ---: | --- |
| Socle et archives | 3 | Conserver |
| PR ouvertes — conserver | 2 | Conserver |
| SimHub / synchronisation LMU — conserver pour examen | 16 | Conserver puis rapprocher les composants du code actuel |
| Mémo / entraînement / préparation — anciens essais à vérifier | 15 | Comparer les PR et les patches ; suppression ciblée si preuve |
| Pitwall / anciennes fiches — en pause à réexaminer | 3 | Comparer les PR et les patches ; suppression ciblée si preuve |
| Discord / site — conserver tant que la reprise n’est pas prouvée | 8 | Conserver puis rapprocher les composants du code actuel |
| Maintenance / cas isolés — vérifier puis clôturer | 4 | Comparer les PR et les patches ; suppression ciblée si preuve |

## Détail des 51 branches

| Branche | Commits propres face à dev | Famille |
| --- | ---: | --- |
| \`main\` | — | Socle et archives |
| \`dev\` | — | Socle et archives |
| \`archive/dev-communautes-2026-09-24\` | 0 | Socle et archives |
| \`suite-modules\` | 1 | PR ouvertes — conserver |
| \`claude/project-thread-ogkwfr\` | 1 | PR ouvertes — conserver |
| \`bandeau-15-min\` | 2 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/corrections-pc\` | 5 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/installation-facile\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/plugin-2-1-0\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/plugin-2-2-0-release\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/plugin-2-2-0\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/plugin-pilote-simple\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/retrait-preparation-chatgpt\` | 5 | SimHub / synchronisation LMU — conserver pour examen |
| \`maj-plugin-fermeture\` | 2 | SimHub / synchronisation LMU — conserver pour examen |
| \`overlay-dash\` | 5 | SimHub / synchronisation LMU — conserver pour examen |
| \`overlay-essais\` | 2 | SimHub / synchronisation LMU — conserver pour examen |
| \`plugin-1-3-0\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`plugin-1-6-0\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`plugin-installation-facile\` | 4 | SimHub / synchronisation LMU — conserver pour examen |
| \`feature/endurance-preparation\` | 1 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/preparation-equipage\` | 6 | SimHub / synchronisation LMU — conserver pour examen |
| \`claude/entrainement-suite\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-cadres-devise\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-dates-y0ayxy\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-maquette\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-partage\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-pneus\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-pneus-relais\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-retours\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`claude/memo-retours-2\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`feature/preparation-guide-endurance\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`fix/preparation-ergonomie\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`fix/preparation-onglets-tableaux\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`fix/preparation-simplicite\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`fix/remove-memo-v2\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`fix/remove-training-memo\` | 1 | Mémo / entraînement / préparation — anciens essais à vérifier |
| \`carte-fluide\` | 1 | Pitwall / anciennes fiches — en pause à réexaminer |
| \`claude/mur-carte-session-hz41w9\` | 1 | Pitwall / anciennes fiches — en pause à réexaminer |
| \`fiche-pilote\` | 3 | Pitwall / anciennes fiches — en pause à réexaminer |
| \`claude/infos-course-priorite\` | 1 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`claude/project-thread-at8rnd\` | 43 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`claude/project-thread-ngamf6\` | 1 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`feature/discord-course-spaces\` | 1 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`feature/official-discord-setup\` | 1 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`fix/discord-shared-round-details\` | 1 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`hotfix/discord-voices-weekly\` | 1 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`fix/desktop-departure-actions-row\` | 3 | Discord / site — conserver tant que la reprise n’est pas prouvée |
| \`claude/project-thread-gplawv\` | 1 | Maintenance / cas isolés — vérifier puis clôturer |
| \`claude/project-thread-p5tm5e\` | 3 | Maintenance / cas isolés — vérifier puis clôturer |
| \`fix/safe-historical-branch-cleanup-20261030\` | 1 | Maintenance / cas isolés — vérifier puis clôturer |
| \`release/pilot-count-main\` | 1 | Maintenance / cas isolés — vérifier puis clôturer |

## Observations issues des PR et des fichiers

- **Deux PR encore ouvertes** : #431 (`suite-modules`) et #569 (`claude/project-thread-ogkwfr`). Ne pas supprimer ces branches.
- **`claude/project-thread-at8rnd` : 43 commits propres**, modifications de `server/discord-weekly-format.mjs`, `server/recap-discord.mjs` et des tests. Plusieurs PR fusionnées utilisent cette tête, dont #548 : une vérification du dernier SHA et du contenu actuel est requise.
- **`overlay-dash` : cinq commits propres**, fichiers C# du plugin SimHub. PR #429 fusionnée, mais conserver une référence tant que les sources livrées et la branche n'ont pas été comparées.
- **`claude/corrections-pc` et `claude/preparation-equipage` : cinq et six commits propres**, dont un module de synchronisation LMU en Go. À préserver pour le projet de collecte de données.
- **`feature/discord-course-spaces` et `feature/official-discord-setup` : chacune un commit propre**, migrations et modules Discord ; PR #263 et #264 retrouvées. Ne pas éliminer sans confirmation des migrations et du déploiement.
- **Mémo / préparation** : anciennes PR identifiées (#194–#221, #397, #400, #432), y compris le retrait du Mémo. Le projet Mémo ayant été arrêté, les branches historiques sont des candidates sérieuses **après vérification du dernier SHA et de l'existence d'un PR fusionné**.
- **Pitwall** : `carte-fluide` et `claude/mur-carte-session-hz41w9` présentent des patches propres. Le Pitwall est en pause, pas un travail à détruire sans sauvegarde.
- **`fix/safe-historical-branch-cleanup-20261030`** : ancienne branche de maintenance, déjà remplacée par les workflows fusionnés sur `main`; candidate prioritaire à la clôture avec contrôle du SHA et de la PR.
- **`claude/project-thread-p5tm5e`** : trois commits propres, la comparaison retournait une liste de fichiers vide ; résultat à vérifier plutôt que présumer son contenu.

## Règles pour la prochaine suppression

1. Garder `main`, `dev`, `archive/*`, toutes les branches ayant une PR ouverte et les branches de projets actifs/en pause indiquées ci-dessus.
2. Pour chaque branche candidate : vérifier le SHA actuel, l'état **merged** et le **head_sha** exact de la PR ; si la tête a bougé, exclure.
3. Consulter les diff de PR des branches historiques de Mémo et les relier aux modules actuels avant de retirer les sauvegardes importantes.
4. Exécuter un nettoyage manuel en `preview`, puis avec confirmation, et contrôler ensuite GitHub ; ne jamais relancer une suppression en masse basée sur l'âge ou le seul nom.

**Conclusion :** 51 branches est un reliquat de projets, d'archives et d'anciennes PR squashées. La réduction peut continuer, mais l'étape importante est maintenant de vérifier les contenus plutôt que de supprimer une proportion arbitraire du nombre de branches.
