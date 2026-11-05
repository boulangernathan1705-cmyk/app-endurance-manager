# Endurance Manager

Application web de gestion de courses d’endurance simracing : événements, inscriptions pilotes, disponibilités heure par heure, préférences de voitures, équipages et rôles d’organisation.

## Accès et droits

Chaque communauté a son propre site (`<communauté>.endurance-manager.app`), réservé aux membres de son serveur Discord. Il n’y a pas d’inscription sans compte : on se connecte avec Discord, et les droits viennent des rôles Discord du membre, réglés par les administrateurs de la communauté dans l’administration du site.

| Droit | Ce qu’il permet |
| --- | --- |
| Accès Endurance Manager | Entrer sur le site de la communauté (sans lui, rien n’est visible) |
| Endurances | S’inscrire aux endurances, créer ou rejoindre un équipage |
| Events OPEN / Events SAFE | S’inscrire aux événements solo de chaque type |
| Équipages | Gérer tous les équipages et leurs pilotes |
| Fiches combo | Voir les fiches combo LMU et le mur des stands |
| Administrer | Tous les droits, plus les réglages, les rôles, les modules et Discord |

Les permissions sont toujours vérifiées côté serveur. Un pseudo seul ne donne aucun droit. Les gestionnaires de la plateforme (`ADMIN_DISCORD_IDS`) ont tous les droits partout.

## Architecture actuelle

- Frontend statique en JavaScript ES modules, sans bundler ; `npm run build:workers` rassemble les CSS dans `public/app.css`.
- API et pages sur Cloudflare Workers (`server/worker-with-migrations.mjs`), fichiers statiques servis par Workers Static Assets.
- Une base Cloudflare D1 par environnement : `endurance-manager-prod`, `endurance-manager-dev`, et `fmt-endurance` en local.
- Authentification Discord (OAuth, portée `identify`) ; bot Discord pour les fils, vocaux, récaps et annonces.
- Mur des stands en direct par un relais sur un second compte Cloudflare (voir `DEPLOYMENT.md`).
- Catalogue catégories, voitures et circuits partagé entre le front et le serveur.

Les horaires sont interprétés en heure de Paris. Les inscriptions se verrouillent au départ. Un pilote peut proposer plusieurs catégories sur le même départ ; lorsqu’il est affecté à un équipage, la catégorie de cet équipage devient celle retenue.

## Calendrier EVENT TDZ

La saison commune dure trois mois : janvier–mars, avril–juin, juillet–septembre ou octobre–décembre. Un organisateur disposant du droit de créer des courses choisit l’année et le trimestre dans « Définir la saison », puis « Enregistrer pour tous ». Sans réglage, le trimestre courant (heure de Paris) est affiché. Une fois enregistrée, la saison reste fixe jusqu’au prochain choix des organisateurs.

Les membres parcourent ses trois mois dans une grille de sept jours, sur ordinateur et téléphone, ou consultent toute la saison. Les courses passées restent visibles. Chaque carte indique le circuit, le simulateur, le type, l’heure et la durée de course ; le stream possède sa propre ligne violette. Toucher une carte ouvre la fiche et ses inscriptions. Le bouton « Plein écran » affiche le calendrier seul, sans modifier la bannière du site ; « Réduire » ou Échap revient à la page. Ce choix est mémorisé par membre et communauté dans le navigateur. Les horaires et durées sont regroupés sur les cartes pour réduire leur hauteur.

## Annonces de stream

Les organisateurs autorisés à créer un événement peuvent annoncer un stream dans le calendrier. Le nom du streamer, le simulateur/jeu/activité et la description sont libres et facultatifs. Une course peut préciser son heure de départ indépendamment du début du stream. Les anciens streams LMU et iRacing conservent leurs horaires et leur recherche d’équipage.

Le streamer peut importer, remplacer ou retirer un logo PNG, JPEG ou WebP de 5 Mo maximum. Le navigateur le redimensionne sans recadrage et le compresse ; le serveur vérifie le format et la taille avant de le conserver dans les détails de l’événement. Aucune nouvelle table ni migration n’est nécessaire. Les initiales remplacent un logo absent ; les anciens streams sans nom gardent leur micro. La carte native du calendrier sert aussi d’aperçu dans le formulaire.

## Développement et contrôles

```bash
npm install
npm test
npm run check
```

`npm run check` exécute les tests, le build Workers et l’audit strict du dépôt.

Le code CSS reste modulaire dans le dépôt, mais `npm run build:workers` rassemble les feuilles nécessaires au démarrage dans `public/app.css`. Les fonctions non essentielles au premier écran, comme l’aide, sont chargées à la demande.

## Déploiement

Cloudflare (Workers Builds) déploie tout seul : la branche `dev` sur https://dev.endurance-manager.app (`wrangler.dev.jsonc`), la branche `main` sur https://endurance-manager.app (`wrangler.prod.jsonc`). Chaque build applique d’abord les migrations D1 de sa propre base.

`wrangler.jsonc` est la configuration **locale** (`wrangler dev`). Aucune commande du dépôt ne déploie la production. À la main, seul le dev se déploie, avec sa configuration explicite :

```bash
npm run deploy:dev
```

Les variables Discord sont configurées dans Cloudflare. `DISCORD_CLIENT_SECRET` doit rester un secret Cloudflare et ne doit jamais être ajouté au dépôt.

Voir `DEPLOYMENT.md` pour le déploiement Cloudflare et les règles de maintenance.
