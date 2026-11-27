# Décisions et invariants produit

Répertoire concis des choix validés ; les règles détaillées restent dans leurs documents d'origine. Ajouter les nouvelles décisions réellement validées avec date, contexte et conséquences ; indiquer lorsqu'une décision en remplace une autre.

## Organisation (26 novembre 2026)

- Plusieurs IA peuvent aider le même projet, au choix de Nathan. Une documentation commune sur GitHub, sans dialogue automatique entre IA ni outil d'orchestration.
- Nathan exprime les besoins en français, échange par itérations, valide les choix et teste le résultat ; l'agent assume la réalisation technique. Maquettes ou propositions avant un changement important, en particulier graphique.
- Site : validation sur dev avant publication ; accord explicite pour la production. Le plugin suit son propre processus de release. Voir [AI_WORKFLOW.md](AI_WORKFLOW.md) et [DEPLOYMENT.md](../DEPLOYMENT.md).

## Invariants existants (références)

- Communautés distinctes : permissions vérifiées côté serveur, rôles Discord et séparation des données. Les modules optionnels restent soumis aux réglages et droits de la communauté ; une fiche mémo désactivée ne doit pas apparaître aux pilotes. Voir [README](../README.md) et [DISCORD_ROLES.md](DISCORD_ROLES.md).
- LMU et iRacing : préserver les spécificités de chaque simulateur, les inscriptions et les équipages existants. Voir [MULTI_GAME.md](MULTI_GAME.md) et [IRACING_SYNC.md](IRACING_SYNC.md).
- Interface : simplicité, textes courts, cohérence avec la charte ; conserver l'identité de la communauté et distinguer les simulateurs et les types d'événements. Vérifier mobile et ordinateur. Voir [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
- Site, plugin et relais : préserver leurs contrats partagés ; le relais est isolé sur un autre compte Cloudflare et le plugin a son propre dépôt. Voir [ARCHITECTURE.md](ARCHITECTURE.md) et [DEPLOYMENT.md](../DEPLOYMENT.md).

Ne pas inventer de comportement à partir de ce résumé : pour les détails d'un module, consulter sa documentation et le code actuel.
