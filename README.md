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
- Assets statiques servis par Cloudflare Workers Static Assets.
- Catalogue catégories, voitures et circuits partagé entre le front et le serveur.

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

Les variables Discord sont configurées dans Cloudflare. `DISCORD_CLIENT_SECRET` doit rester un secret Cloudflare et ne doit jamais être ajouté au dépôt.

Voir `docs/DEPLOYMENT.md` pour le déploiement Cloudflare et `docs/TECHNICAL_AUDIT.md` pour les règles de maintenance et d’optimisation.
