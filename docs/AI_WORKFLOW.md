# Méthode de travail commune aux IA

Cette base est destinée à ChatGPT, Claude, GitHub Copilot et tout autre agent autorisé. GitHub est la référence commune ; les conversations privées ne sont pas partagées et aucune communication automatique entre IA n'est prévue.

## Avant toute intervention

1. Lire `AGENTS.md` et l'index documentaire ; ouvrir uniquement les sections utiles. Les fichiers propres à un outil ne remplacent pas les règles communes.
2. Vérifier la branche de référence, les PR ouvertes, les commits et les tests existants. Pour un chantier repris, lire le diff et les derniers commentaires ; conserver le travail utile. Ne pas modifier une branche qu'un autre agent utilise sans coordination explicite.
3. Distinguer les demandes d'audit (lecture seule), de proposition (pas de code avant validation) et de réalisation (modifications autorisées). Pour une nouvelle fonctionnalité importante ou une refonte visible, proposer d'abord un fonctionnement ou une maquette ; une petite correction clairement demandée peut être réalisée directement.
4. Les décisions validées et les contrats existants priment sur les suppositions. Si un document est ancien, vérifier le code de la branche de référence et les décisions ultérieures avant de conclure. Ne pas présenter un projet ou une hypothèse comme livré.

## Pendant le travail

- Nathan décide, échange par itérations et teste les résultats ; il ne code pas. Prendre en charge les commandes, la compilation, les corrections et les tests accessibles. Expliquer en français, avec des mots simples, les choix réellement nécessaires.
- Préférer une solution simple, cohérente, maintenable et proportionnée. Ne pas élargir le périmètre sans raison ni ajouter une dépendance, un service ou des coûts récurrents sans accord.
- Préserver les accès, les données, les contrats publics et les comportements validés. Ne jamais publier, exposer ou demander de copier des secrets dans une conversation, un commit ou une PR. Utiliser des données de test et les permissions minimales.
- Réaliser une modification autorisée sur une branche dédiée selon les règles du dépôt. Ne pas contourner les tests ni modifier les références de test uniquement pour obtenir un résultat vert.

## Avant de considérer le chantier terminé

- Vérifier le diff, exécuter les contrôles prévus par le dépôt ou consulter la CI ; distinguer les tests passés, échoués, non exécutés et les essais réels restant à faire. Ne jamais déclarer un succès non vérifié.
- Mettre à jour, dans la même PR, la documentation du module si le comportement, le contrat, la procédure ou une décision durable évolue. Noter les décisions validées avec date et contexte ; conserver l'historique si une décision est remplacée. Ne pas y copier les échanges complets.
- Dans la PR, indiquer : objectif, modifications, décisions validées pertinentes, contrôles et résultats, limites et prochaines étapes. Les problèmes non résolus restent dans la PR ou une issue GitHub liée, pas dans un journal redondant. Cette trace suffit à une reprise manuelle par une autre IA.
- Donner à Nathan un bilan concret et quelques vérifications simples à faire ; ne pas lui demander de lire le code ou d'exécuter des commandes si l'agent peut les faire. Si une action est inaccessible, le dire et proposer le chemin le plus simple.
- Respecter les règles de fusion et de publication du dépôt. Aucune mise en production sans accord explicite.

## Périmètre

Site : partir de `dev`, PR vers `dev`, puis validation sur les domaines de test et accord explicite avant `dev → main`. Le plugin SimHub est un dépôt distinct ; ses règles sont dans son propre `AGENTS.md`. Consulter [DEPLOYMENT.md](../DEPLOYMENT.md) avant toute opération sur les environnements, en particulier le relais du muret.

Aucun tableau obligatoire, bot, orchestration entre IA, tâche de fond ou abonnement supplémentaire n'est introduit par cette documentation.
