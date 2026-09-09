# Endurance Manager — version partagée Cloudflare + Discord

Cette version remplace la sauvegarde locale des événements par une base Cloudflare D1. Elle est préparée pour l’hébergement Cloudflare existant. Elle n’a pas encore été configurée ni publiée sur votre compte.

**Ne remplacez pas seulement index.html : cette version nécessite l’ensemble des fichiers et la configuration ci-dessous.** Préparez la base et les variables avant de basculer le site, et conservez la version précédente dans GitHub.

## Fonctionnement

| Profil | Droits |
| --- | --- |
| Visiteur | Consulter les courses, s’inscrire sans compte, gérer ses inscriptions avec un lien personnel |
| Pilote connecté avec Discord | Retrouver, modifier et supprimer ses inscriptions Discord |
| Organisateur | Droits pilote, création et modification des événements, gestion de ses inscriptions créées |
| Administrateur principal | Tous les droits, suppression des événements, gestion des inscriptions et des organisateurs |

Les droits sont vérifiés côté serveur pour chaque action. Le pseudo ne donne aucun droit. Les administrateurs principaux sont définis explicitement dans Cloudflare par leurs identifiants Discord. Le premier visiteur connecté ne devient jamais administrateur automatiquement.

Les deux catégories LMP2 sont distinctes mais utilisent le même logo P2. GTE utilise un badge texte car le dépôt ne contient pas de logo GTE. Les pilotes peuvent indiquer une voiture LMU facultative lors de leur inscription ; le choix est contrôlé côté serveur selon la catégorie. Les horaires sont interprétés en heure de Paris, été comme hiver. Les inscriptions se verrouillent au départ. Un départ avec des inscrits ne peut pas être supprimé, ni une catégorie encore utilisée. Modifier un horaire n’envoie pas de notification : prévenez les pilotes.

Un pilote peut conserver une inscription par catégorie sur le même départ. Le bouton **Ajouter une catégorie** apparaît après la première inscription, y compris pour un organisateur qui inscrit son propre pseudo. Dès qu’un organisateur affecte une de ces inscriptions à un équipage, les autres catégories du même pilote sur ce départ sont automatiquement retirées.

La page de création d’événement est organisée en trois étapes lisibles (informations générales, catégories, départs) et utilise les logos GT3 et GTE fournis dans `images/GT3.webp` et `images/GTE.webp`.

## Configuration préparée pour votre Worker existant

Le fichier `wrangler.jsonc` est maintenant renseigné pour le Worker `app` et la base D1 déjà créée (identifiant repris de votre capture). Avec le sous-domaine de compte `endurance-manager`, l’adresse publique sera `https://app.endurance-manager.workers.dev`. Il déclare la liaison `DB` et le serveur. L’ajout de cette liaison par le formulaire Cloudflare n’est plus nécessaire : `wrangler deploy` appliquera cette configuration lors d’un déploiement réussi.

Les tables de base et les tables d’équipages existent déjà : **ne réexécutez pas la migration initiale**.

Cette configuration utilise la commande de déploiement `npx wrangler deploy`. Le script de compilation Workers est lancé par le fichier Wrangler. Vérifiez les commandes dans les paramètres du projet Cloudflare avant la mise à jour GitHub, en particulier la présence éventuelle d’un ancien argument `--assets` pointant vers la racine du dépôt. Ne servez jamais la racine du dépôt comme répertoire public ; seuls les fichiers du dossier généré `public` doivent être servis.

L’adresse du site est renseignée. Les trois valeurs Discord (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `ADMIN_DISCORD_IDS`) restent à configurer. Les variables déjà ajoutées via Cloudflare sont conservées grâce à `keep_vars`. Cette préparation ne publie rien et n’active pas Discord à elle seule. Ne remplacez pas ce fichier préparé par le fichier d’exemple.

## 1. Identifier le projet existant

Dans Cloudflare, ouvrez **Workers & Pages** puis votre projet. Notez son adresse HTTPS de production et s’il s’agit de **Pages** ou de **Workers**.

- Pages : suivez les sections 2 à 6.
- Workers : suivez les sections 2 à 4, puis la variante Workers plus bas.

Gardez l’adresse gratuite actuelle. Une seule adresse canonique est acceptée pour les appels au serveur. Les liens de prévisualisation ne doivent pas accéder à la base de production. Pour tester une prévisualisation, utilisez une base et une configuration séparées.

## 2. Créer la base D1

1. Dans Cloudflare, ouvrez **Storage & Databases → D1 SQL Database** et créez une base nommée `fmt-endurance` sur l’offre gratuite.
2. Ouvrez la console SQL de cette nouvelle base.
3. Exécutez le contenu de `migrations/0001_initial.sql`, une seule fois. Si la console ne prend qu’une instruction à la fois, exécutez les instructions dans leur ordre.
4. Vérifiez la présence des tables `users`, `sessions`, `oauth_states`, `events`, `registrations`, `rate_limits`, `crews` et `crew_members`.

Ce script crée le schéma ; il ne contient pas d’utilisateurs, de courses de démonstration ou de secrets. Ne le réexécutez pas sur une base déjà initialisée. Conservez les migrations appliquées et utilisez une nouvelle migration pour les changements futurs. Vérifiez que les migrations `0002` à `0009` sont déjà appliquées ; une base déjà à jour jusqu’à `0008` doit recevoir `migrations/0009_registration_owner.sql`.

Pour activer les inscriptions dans plusieurs catégories, appliquez ensuite `migrations/0011_multi_category_registrations.sql` une seule fois. Cette migration conserve les inscriptions et les équipages existants. Elle ne renvoie aucun tableau de résultats dans la console D1 : c’est normal pour une migration SQL. Pour vérifier qu’elle est bien passée, exécutez `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_registration%';` et vérifiez la présence de `idx_registration_user_category`, `idx_registration_guest_category` et `idx_registration_name_category`.

## 3. Créer l’application Discord

1. Ouvrez le [portail développeur Discord](https://discord.com/developers/applications).
2. Créez une application nommée **FMT Endurance**.
3. Relevez son **Application ID / Client ID**.
4. Dans **OAuth2**, ajoutez cette URL de redirection, en remplaçant l’adresse :

   `https://ADRESSE-DU-SITE/api/auth/discord/callback`

5. Récupérez le **Client Secret** et saisissez-le directement comme secret dans Cloudflare (section suivante). Ne le mettez ni dans GitHub, ni dans un message, ni dans le HTML.

La connexion demande uniquement l’identité Discord (`identify`). Elle ne demande pas l’accès aux messages ni à l’adresse email. Aucun bot n’est nécessaire et aucun rôle de votre serveur Discord n’est modifié. Le site conserve son propre système de permissions.

## 4. Définir les administrateurs et les variables

Dans Discord, activez le **Mode développeur**, puis utilisez **Copier l’identifiant utilisateur** sur vos profils. Il faut vos identifiants numériques, pas vos pseudos et pas l’identifiant du serveur.

Dans la configuration de production du projet Cloudflare, ajoutez :

| Nom | Type | Valeur |
| --- | --- | --- |
| `APP_ORIGIN` | Variable | Adresse HTTPS exacte, sans `/` final, par exemple `https://fmt-endurance.pages.dev` |
| `DISCORD_CLIENT_ID` | Variable | Identifiant de l’application Discord |
| `DISCORD_CLIENT_SECRET` | Secret chiffré | Secret de l’application Discord |
| `ADMIN_DISCORD_IDS` | Variable | Vos deux identifiants utilisateur Discord, séparés par une virgule |

Exemple de forme : `123456789012345678,234567890123456789`. Ces nombres sont des exemples, pas des comptes préconfigurés.

Seules les personnes listées deviennent administrateurs principaux. Vous pourrez attribuer le rôle Organisateur aux autres depuis le site après leur première connexion. Pour ajouter ou retirer un administrateur principal, modifiez cette variable puis redéployez.

## 5. Configurer Cloudflare Pages

Dans votre projet Pages :

1. Dans **Settings → Bindings → Add → D1 database**, ajoutez une liaison nommée exactement `DB`, reliée à `fmt-endurance`.
2. Dans les variables et secrets de production, vérifiez les quatre valeurs de la section 4.
3. Dans les réglages de compilation :
   - Framework : **None**.
   - Commande : `npm run build`.
   - Répertoire de sortie : `public`.
   - Racine : la racine du dépôt contenant `package.json`.
   - Utilisez Node 22.13 ou plus récent ; Node 24 convient.
4. Remettez les fichiers du ZIP à la racine du dépôt GitHub existant. Le dossier extérieur du ZIP ne doit pas devenir un dossier supplémentaire dans le dépôt.
5. Lancez le déploiement via l’intégration GitHub du projet existant.

Le script de compilation copie uniquement les fichiers publics et le point d’entrée serveur Pages dans `public`. Le fichier spécial `_worker.js` est exécuté par Pages ; les requêtes `/api/*` passent par lui. Les images, HTML, CSS et JavaScript sont servis comme fichiers statiques. Le schéma SQL et les tests restent hors du répertoire public.

Un simple dépôt de l’ancien `index.html`, ou un hébergement purement statique sans le serveur, ne permet pas cette connexion et cette base partagée.

## 6. Première utilisation

1. Ouvrez l’adresse de production et cliquez sur **Se connecter avec Discord**.
2. Connectez-vous avec l’un des deux comptes administrateurs configurés.
3. Créez un événement test avec un départ futur.
4. Depuis une autre session de navigateur, vérifiez que l’événement apparaît aussi et inscrivez-vous sans compte.
5. Conservez le lien personnel affiché après l’inscription. Ouvrez-le sur un autre appareil pour retrouver l’inscription.
6. Demandez à un pilote de se connecter avec Discord. Il apparaîtra dans **Gestion des membres**. Attribuez-lui **Organisateur**, puis vérifiez qu’il peut créer et modifier une course.
7. Retirez ce rôle pour vérifier qu’il perd les droits de gestion. Les permissions sont relues côté serveur à chaque requête.

Sans compte, le lien personnel est le moyen de récupération des inscriptions de l’invité. Il donne accès à toutes les inscriptions associées à ce profil invité. Ne le partagez pas. Le même navigateur conserve aussi cet accès via un cookie protégé. Si le pilote se connecte ensuite avec Discord depuis ce navigateur, les inscriptions invitées de ce navigateur sont rattachées à son compte pour rester disponibles après reconnexion. Le bouton **Mon lien personnel** reste nécessaire pour récupérer une inscription depuis un autre appareil.

## Variante : projet Cloudflare Workers

Utilisez la même base, le même schéma et la même application Discord.

1. Utilisez le `wrangler.jsonc` déjà préparé pour votre projet. Le fichier d’exemple sert uniquement à une installation sur un autre Worker.
2. Remplacez le nom par celui du Worker existant ; ne créez pas un second projet par erreur.
3. Renseignez l’identifiant D1, l’adresse, le Client ID et les identifiants des administrateurs.
4. Ajoutez `DISCORD_CLIENT_SECRET` dans les secrets de ce Worker via Cloudflare. Ne l’écrivez pas dans la configuration Git.
5. Déployez avec le processus Git du Worker existant. Utilisez comme commande de déploiement `npm run deploy:workers` : elle applique d’abord les migrations D1 distantes, puis déploie le Worker. Le fichier de configuration sert `public` et utilise `server/worker.mjs` comme point d’entrée.
6. Si vous travaillez avec Wrangler en ligne de commande, l’équivalent est `npm run deploy:workers` une fois la configuration complétée et la base initialisée.

Pour Workers, ne faites pas servir une compilation Pages : utilisez bien `build:workers`. Le script de compilation Workers ne copie pas `_worker.js` dans les fichiers publics.

## Données de l’ancienne version

Les anciens événements étaient uniquement dans `localStorage` de chaque navigateur. Ils ne sont pas effacés par cette version, mais ne sont **pas automatiquement transférés dans D1**. La nouvelle base commence vide.

Avant la bascule, conservez une copie des événements/inscriptions déjà utilisés. Une importation doit être préparée séparément : l’ancien code ne prouvait pas l’identité des inscrits, et sa catégorie générique « LMP2 » ne permet pas de choisir automatiquement entre ELMS et WEC. Ne réattribuez pas des inscriptions à un compte uniquement sur la base du pseudo.

## Vérifications effectuées et limites

- Syntaxe JavaScript et compilation des fichiers publics vérifiées.
- Tests du serveur avec les véritables requêtes HTTP et SQLite local, via un adaptateur reproduisant les méthodes D1 utilisées.
- Réponses Discord simulées : validation de l’état OAuth à usage unique, session, déconnexion et expiration.
- Tests des inscriptions invitées, récupération, propriété des inscriptions, attribution/retrait des rôles, refus des actions non autorisées, conflits de modifications et suppression en cascade.
- Tests des dates en heure de Paris et des changements d’heure.

Les tests n’utilisent pas votre compte Cloudflare, une vraie base D1 distante ou une vraie application Discord. La connexion réelle et le parcours dans le navigateur restent à vérifier après configuration. Le site existant n’a pas été modifié à distance.

Le service impose un plafond de requêtes d’écriture par adresse IP pour freiner les abus de l’inscription libre. Il ne recharge pas la base toutes les secondes : seuls les comptes à rebours sont actualisés localement. Les nouveaux changements sont visibles après **Actualiser**, rechargement de la page ou enregistrement. Cette version vise une petite équipe ; la liste des membres affiche jusqu’à 200 comptes.

Restez sur les offres Free de Workers et D1. Aucun achat de domaine, stockage R2, email payant ou abonnement supplémentaire n’est nécessaire pour les fonctions présentes. Les quotas et conditions des fournisseurs peuvent évoluer.

## Commandes de vérification locale

```bash
npm test
npm run build
```

Les tests utilisent `node:sqlite`, disponible dans les versions Node indiquées. Aucune dépendance npm n’est nécessaire pour compiler ou exécuter les tests. La version de production utilise D1 et les API Web du runtime Cloudflare, pas `node:sqlite`.

## Documentation officielle

- [Cloudflare Pages : mode avancé](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Cloudflare Pages : liaisons et secrets](https://developers.cloudflare.com/pages/functions/bindings/)
- [Démarrer avec D1](https://developers.cloudflare.com/d1/get-started/)
- [Workers : fichiers statiques](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)
