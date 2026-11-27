# Instructions GitHub Copilot — Endurance Manager

Lire `AGENTS.md` à la racine, puis `docs/README.md` et `docs/AI_WORKFLOW.md`. Ces documents constituent la base commune à tous les agents ; lire les références du module avant de proposer ou modifier du code.

- Répondre en français clair. Nathan ne code pas : prendre en charge les modifications et tests, proposer avant une refonte ou une fonctionnalité importante.
- Pour le site, partir de `dev` et viser `dev` dans une PR dédiée. Ne jamais publier en production sans accord explicite. Préserver les permissions par communauté, les modules optionnels, le relais du muret et le contrat SimHub.
- Utiliser Node 22.13.0, `npm ci`, puis `npm run check` ; pour les contrôles navigateur et visuels suivre `DEPLOYMENT.md`. Ne pas régénérer les références visuelles pour masquer une régression.
- En revue de PR, vérifier régressions, droits, intégrité des données, sécurité, contrats et tests. Signaler uniquement des problèmes concrets, avec leur impact, et distinguer les validations réellement exécutées.
- Ne pas demander ni utiliser de secrets de production ; ne pas attribuer automatiquement de tâches à d'autres IA. Mettre à jour la documentation utile et résumer les tests et limites dans la PR.
