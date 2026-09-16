# Espaces : Teams privées et communautés ouvertes

Date de décision : 16 septembre 2026.

Ce document fixe l’organisation fonctionnelle retenue pour Endurance Manager afin que les prochaines évolutions restent cohérentes avec l’interface et le modèle de données.

## Objectif

Endurance Manager doit permettre à un même pilote d’utiliser plusieurs contextes d’organisation autour des mêmes endurances :

- **Général** : espace commun Endurance Manager.
- **Team** : espace privé réservé aux membres de l’équipe.
- **Communauté** : espace ouvert, visible et rejoignable librement par les pilotes connectés.

L’objectif est de ne pas dupliquer les événements. Une endurance reste un événement unique ; ce sont les disponibilités et les équipages qui sont partagés dans un ou plusieurs espaces.

## Organisation de l’interface

La navigation utilisateur expose un accès **Espaces**.

La page d’accueil des espaces présente :

1. la Team privée du pilote ;
2. les communautés qu’il a rejointes ;
3. un accès pour découvrir des communautés ;
4. un accès pour créer une Team ou une communauté.

### Team

Une Team est un espace privé.

- création par un utilisateur connecté ;
- accès par ajout/invitation d’un responsable ;
- rôles : créateur, responsable, membre ;
- disponibilités et équipages partagés avec la Team visibles uniquement par ses membres ;
- dans l’implémentation actuelle, un pilote ne peut appartenir qu’à une seule Team.

### Communauté

Une communauté est un espace ouvert.

- visible dans **Découvrir** ;
- rejoignable librement ;
- un pilote peut rejoindre plusieurs communautés ;
- les membres peuvent partager leurs disponibilités avec la communauté et former des équipages autour des mêmes événements officiels.

## Règles de partage

Une inscription reste une seule inscription en base.

Elle peut être partagée simultanément avec plusieurs audiences grâce à `registration_audiences`, par exemple :

- Général ;
- FMT ;
- LMU France ;
- Endurance Francophone.

L’interface filtre ensuite les participations visibles sans dupliquer les données.

Un équipage, en revanche, appartient à **un seul espace**. Un pilote ne peut être ajouté à cet équipage que si son inscription est partagée avec l’espace concerné.

## Modèle technique actuel

Le socle est constitué de :

- `organizations` avec `type = team | community` ;
- `organization_members` avec les rôles `owner | manager | member` ;
- `registration_audiences` pour le partage multi-espaces d’une disponibilité ;
- `crews.organization_id` pour rattacher un équipage à un espace précis ;
- `front/app/organization-context.mjs` pour le filtrage et les libellés ;
- `front/app/organizations-view.mjs` pour l’interface de gestion, création et découverte ;
- `server/organizations.mjs` pour les règles d’accès et les API ;
- `tests/organizations.test.mjs` pour les règles principales.

## Direction UX retenue

Le vocabulaire visible côté utilisateur doit privilégier **Espace / Espaces** plutôt que le terme générique « groupe ».

Exemples :

- `Mes espaces`
- `Créer un espace`
- `Découvrir des communautés`
- `Team privée`
- `Communauté ouverte`

L’implémentation interne peut conserver le nom `organization` afin de garder un modèle technique neutre.

## Évolution possible : Teams dans une communauté

Une évolution future pourra permettre à une Team d’être officiellement rattachée à une communauté, par exemple :

```text
LMU France
├── FMT
├── Team X
└── Team Y
```

Ce lien Team → Communauté n’est **pas nécessaire au fonctionnement actuel** : aujourd’hui, les pilotes peuvent déjà appartenir à leur Team et rejoindre en parallèle plusieurs communautés. Il devra être ajouté seulement si l’on veut afficher ou gérer des Teams comme entités membres d’une communauté.

## Principe de compatibilité

Les évolutions liées aux Espaces doivent préserver les événements, inscriptions et équipages historiques. Aucun événement ne doit être dupliqué ou déplacé uniquement pour introduire les Teams et communautés.
