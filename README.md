# Endurance Manager

Application web de gestion de courses d’endurance simracing : événements, inscriptions pilotes, disponibilités heure par heure, préférences de voitures, équipages et rôles d’organisation.

## Profils et droits

| Profil | Principales possibilités |
| --- | --- |
| Visiteur | Consulter les courses, s’inscrire sans compte et récupérer ses inscriptions avec son lien personnel |
| Pilote Discord | Retrouver et gérer ses inscriptions personnelles |
| Organisateur | Gérer les événements, inscriptions et équipages |
| Administrateur | Droits organisateur + gestion des membres et actions réservées à l’administration |

Les permissions sont toujours vérifiées côté serveur. Un pseudo seul ne donne aucun droit.

## Architecture actuelle

- Frontend statique en JavaScript ES modules.
- API sur Cloudflare Workers.
- Base partagée Cloudflare D1 `fmt-endurance`.
- Authentification Discord.
- Communautés Endurance Manager facultatives, utilisées comme contexte principal avant le choix LMU / iRacing.
- Communauté par défaut par utilisateur et liens directs `?community=<id>` pour ouvrir immédiatement l’espace voulu.
- Personnalisation légère par communauté : logo, bannière et couleur d’accent, avec reprise automatique des visuels Discord quand ils existent.
- Liaison Discord facultative par communauté pour vérifier l’appartenance à un serveur et, si configuré, un rôle d’éligibilité aux endurances.
- Assets statiques servis par Cloudflare Workers Static Assets.
- Catalogue catégories, voitures et circuits partagé entre le front et le serveur.

Une endurance peut rester générale et n’appartenir à aucune communauté. Lorsqu’une communauté est active, le site affiche d’abord son identité et ses endurances, puis le simulateur choisi ; l’annuaire multi-communautés reste une fonction secondaire de gestion/découverte. Les communautés peuvent être ouvertes, sur demande, sur invitation ou vérifier l’appartenance à un serveur Discord. Les listes de membres sont chargées à la demande et paginées afin de rester adaptées aux grands serveurs.

Les horaires sont interprétés en heure de Paris. Les inscriptions se verrouillent au départ. Un pilote peut proposer plusieurs catégories sur le même départ ; lorsqu’il est affecté à un équipage, la catégorie de cet équipage devient celle retenue.

## Développement et contrôles

```bash
npm install
npm test
npm run check
```

`npm run check` exécute les tests, le build Workers et l’audit strict du dépôt.

Le code CSS reste modulaire dans le dépôt, mais `npm run build:workers` rassemble les feuilles nécessaires au démarrage dans `public/app.css`. Les fonctions non essentielles au premier écran, comme l’aide, sont chargées à la demande.

## Déploiement

La production utilise la branche `main`. La configuration Cloudflare se trouve dans `wrangler.jsonc`.

```bash
npm run deploy:workers
```

Cette commande applique les migrations D1 en attente puis déploie le Worker. La base D1 existante ne doit pas être recréée et les migrations déjà appliquées ne doivent pas être rejouées manuellement.

Les variables Discord sont configurées dans Cloudflare. `DISCORD_CLIENT_SECRET` et `DISCORD_BOT_TOKEN` doivent rester des secrets Cloudflare et ne doivent jamais être ajoutés au dépôt. Le bot est nécessaire uniquement pour les communautés qui activent la vérification d’un serveur ou d’un rôle Discord.

Voir `docs/DEPLOYMENT.md` pour le déploiement Cloudflare et `docs/TECHNICAL_AUDIT.md` pour les règles de maintenance et d’optimisation.
