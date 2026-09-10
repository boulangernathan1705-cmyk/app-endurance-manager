# Architecture multi-jeux

Endurance Manager utilise un seul moteur pour Le Mans Ultimate et iRacing.

## Navigation

- `/` : portail général avec les deux simulateurs et la prochaine endurance de chacun ;
- `/lmu/` : application historique filtrée sur LMU ;
- `/iracing/` : la même application filtrée sur iRacing.

`game.html` est l’unique gabarit de l’application. Le build le publie dans les deux répertoires afin d’éviter toute duplication du code fonctionnel.

## Catalogues

`shared/catalog.mjs` contient les catalogues propres à chaque simulateur. Le navigateur choisit le catalogue actif grâce à `front/game-context.js`, chargé avant les modules de l’application.

Les identifiants de circuits iRacing sont préfixés par `iracing-`. Ce namespace sert aussi de marqueur de jeu pour les événements et permet de conserver le schéma D1 actuel :

- tous les événements historiques sans préfixe restent LMU ;
- un événement iRacing conserve toujours un circuit `iracing-*` ;
- si le circuit n’est pas encore connu, `iracing-tbd` est utilisé ;
- aucun événement existant n’est migré ou réécrit.

Le serveur charge l’union des valeurs autorisées afin que l’API existante puisse valider les deux catalogues. Dans le navigateur, seule la liste du simulateur actif est présentée à l’utilisateur.

## Portail

`front/game-hub.mjs` lit la liste publique des événements, détermine le prochain départ actif ou à venir pour chaque jeu et affiche :

- le nom de l’endurance ;
- la date, l’heure, la durée et le circuit ;
- les équipages formés sur ce départ ;
- leur catégorie, voiture, pilotes affectés et état ouvert/complet.

## Ajouter un simulateur plus tard

Ajouter un troisième jeu doit se faire dans le catalogue et le routage du portail, sans copier `app.js`, les formulaires d’inscription ou les outils d’équipage. Un namespace de circuit propre au nouveau jeu doit être utilisé pour garder les événements séparés.
